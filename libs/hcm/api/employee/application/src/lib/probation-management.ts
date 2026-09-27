import {
	DUE_SOON_DAYS,
	PROBATION_OPTION_KINDS,
	parseAssignReviewer,
	parseCancelReview,
	parseCaseQuery,
	parseDecision,
	parseProbationOptionQuery,
	parseReviewQuery,
	parseScheduleReview,
	type ProbationCaseDto,
	type ProbationCasePage,
	type ProbationDecisionDto,
	type ProbationOptionPage,
	type ProbationReviewDto,
	type ProbationReviewPage,
	type ProbationReviewSummaryDto,
} from '@empflowyee/hcm-employee-contract'
import { HcmDomainError, idValue, invalidField } from '@empflowyee/hcm-runtime-contract'
import {
	commandHash,
	runIdempotent,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import {
	addDays,
	decisionEvent,
	decisionFacts,
	extensionProblem,
	finalReview,
	maxExtendedEnd,
	reviewState,
	undecided,
} from '@empflowyee/hcm-api-employee-domain'
import type { EmployeeUnitOfWork, EmployeeWork } from './employee-unit'
import type {
	ProbationCaseRow,
	ProbationEmploymentRow,
	ProbationReviewRow,
} from './probation-repository'

const READ = 'probation.read'
const MANAGE = 'probation.manage'
const IN_PROBATION = ['InProgress', 'Extended']

/**
 * Probation Management use cases (Probation Management TDD#API, DEC-HCM2-003): HR tracks cases,
 * schedules reviews, assigns an explicit reviewer and records a decision that updates employment
 * probation facts through WorkforceFactsPort. Decisions never end employment.
 */
export class ProbationManagement {
	/** Compose the probation use cases on the employee unit of work. */
	constructor(private readonly unit: EmployeeUnitOfWork) {}

	/** A page of employments in probation for a view. */
	cases(context: AuthenticatedHcmContext, params: URLSearchParams): Promise<ProbationCasePage> {
		const query = parseCaseQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Page cases. */ async (w) => {
				const page = await w.probation.cases(query, w.today, addDays(w.today, DUE_SOON_DAYS))
				return {
					items: page.items.map(/** Case. */ (row) => this.caseDto(w, row)),
					nextCursor: page.nextCursor,
				}
			},
		)
	}

	/** A case for display, with its next review's read-time state. */
	private caseDto(w: EmployeeWork, row: ProbationCaseRow): ProbationCaseDto {
		const { nextReview, revision, employmentStatus, ...rest } = row
		void revision
		void employmentStatus
		if (!nextReview) return { ...rest, nextReview: null, overdue: false }
		const state = reviewState(nextReview.status, nextReview.dueDate, w.today)
		return {
			...rest,
			nextReview: {
				id: nextReview.id,
				reviewType: nextReview.reviewType,
				dueDate: nextReview.dueDate,
				state,
			},
			overdue: state === 'Overdue' || state === 'Escalated',
		}
	}

	/** A page of reviews, due first. */
	reviews(context: AuthenticatedHcmContext, params: URLSearchParams): Promise<ProbationReviewPage> {
		const query = parseReviewQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Page reviews. */ async (w) => {
				const page = await w.probation.reviews(query)
				return {
					items: page.items.map(/** Review. */ (row) => this.summary(w, row)),
					nextCursor: page.nextCursor,
				}
			},
		)
	}

	/** One review with its context, assessments, decision and history. */
	review(context: AuthenticatedHcmContext, id: string): Promise<ProbationReviewDto> {
		idValue(id, 'id')
		return this.unit.execute(context, READ, false, /** Read. */ (w) => this.detail(w, id))
	}

	/** Options for scheduling: employments in probation, or accounts that can review. */
	options(
		context: AuthenticatedHcmContext,
		kind: string,
		params: URLSearchParams,
	): Promise<ProbationOptionPage> {
		if (!(PROBATION_OPTION_KINDS as readonly string[]).includes(kind))
			throw new HcmDomainError('not-found')
		const query = parseProbationOptionQuery(params)
		return this.unit.execute(
			context,
			MANAGE,
			false,
			/** Page options. */ (w) => w.probation.options(kind as 'employments' | 'reviewers', query),
		)
	}

	/** Schedule a review of an employment in probation. */
	schedule(
		context: AuthenticatedHcmContext,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ProbationReviewDto> {
		const command = parseScheduleReview(body)
		return this.command(
			context,
			'schedule',
			command,
			key,
			/** Schedule. */ async (w) => {
				const employment = await this.inProbation(w, command.employmentId, 'employmentId')
				if (command.periodStart < employment.hireDate) invalidField('periodStart', 'before-hire')
				if (command.dueDate < command.periodStart) invalidField('dueDate', 'before-start')
				if (
					command.reviewType === 'Final' &&
					(await w.probation.openFinalReview(employment.employmentId))
				)
					invalidField('reviewType', 'duplicate')
				if (command.reviewerAccountId) await this.requireReviewer(w, command.reviewerAccountId)
				const id = await w.probation.insertReview({
					employmentId: employment.employmentId,
					reviewType: command.reviewType,
					periodStart: command.periodStart,
					periodEnd: command.periodEnd,
					probationEndDate: employment.probationEndDate as string,
					dueDate: command.dueDate,
					reviewerAccountId: command.reviewerAccountId,
					reason: command.reason,
				})
				await this.audit(
					w,
					'employee.probation-review-scheduled',
					id,
					requestId,
					command.reason,
					null,
					'Scheduled',
					['reviewType', 'dueDate'],
				)
				return this.detail(w, id)
			},
		)
	}

	/** Assign or replace the explicit reviewer; the previous reviewer loses access at once. */
	assignReviewer(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ProbationReviewDto> {
		idValue(id, 'id')
		const command = parseAssignReviewer(body)
		return this.command(
			context,
			'reviewer',
			{ id, command },
			key,
			/** Assign. */ async (w) => {
				const review = await this.lockUndecided(w, id, command.expectedRevision)
				await this.requireReviewer(w, command.reviewerAccountId)
				if (review.reviewer?.accountId === command.reviewerAccountId)
					invalidField('reviewerAccountId', 'unchanged')
				await w.probation.updateReview(id, { reviewerAccountId: command.reviewerAccountId })
				await this.audit(
					w,
					'employee.probation-reviewer-assigned',
					id,
					requestId,
					command.reason,
					review.status,
					review.status,
					['reviewer'],
				)
				return this.detail(w, id)
			},
		)
	}

	/** Cancel an undecided review. */
	cancel(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ProbationReviewDto> {
		idValue(id, 'id')
		const command = parseCancelReview(body)
		return this.command(
			context,
			'cancel',
			{ id, command },
			key,
			/** Cancel. */ async (w) => {
				const review = await this.lockUndecided(w, id, command.expectedRevision)
				await w.probation.updateReview(id, { status: 'Cancelled', cancelReason: command.reason })
				await this.audit(
					w,
					'employee.probation-review-cancelled',
					id,
					requestId,
					command.reason,
					review.status,
					'Cancelled',
					[],
				)
				return this.detail(w, id)
			},
		)
	}

	/**
	 * Record the HR decision. Confirm and Extend update employment probation facts, Fail marks the
	 * probation failed without ending employment, and Extend schedules the next Final review; the
	 * prior decision stays in history.
	 */
	decide(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ProbationReviewDto> {
		idValue(id, 'id')
		const command = parseDecision(body)
		return this.command(
			context,
			'decide',
			{ id, command },
			key,
			/** Decide. */ async (w) => {
				const review = await this.lockUndecided(w, id, command.expectedRevision)
				const employment = await this.inProbation(w, review.employmentId, 'outcome')
				if (command.effectiveDate < employment.hireDate)
					invalidField('effectiveDate', 'before-hire')
				const currentEnd = employment.probationEndDate as string
				const decisions = await w.probation.decisions(review.employmentId)
				const extensions = decisions.filter(/** Extensions. */ (item) => item.outcome === 'Extend')
				const originalEnd = extensions[0]?.previousProbationEndDate ?? currentEnd
				if (command.outcome === 'Extend') {
					const problem = extensionProblem(
						currentEnd,
						originalEnd,
						extensions.length,
						command.extendedProbationEndDate as string,
					)
					if (problem) invalidField('extendedProbationEndDate', problem)
				}
				const [current] = (await w.probation.assessments(id)).filter(
					/** Current. */ (item) => item.current,
				)
				await w.probation.updateReview(id, { status: 'Decided', decided: true })
				await w.probation.insertDecision({
					reviewId: id,
					employmentId: review.employmentId,
					outcome: command.outcome,
					effectiveDate: command.effectiveDate,
					previousProbationEndDate: currentEnd,
					extendedProbationEndDate: command.extendedProbationEndDate,
					assessmentId: current?.id ?? null,
					reason: command.reason,
					evidenceReference: command.evidenceReference,
				})
				const facts = decisionFacts(
					command.outcome,
					command.effectiveDate,
					command.extendedProbationEndDate,
				)
				if (Object.keys(facts).length)
					await w.facts.applyEmploymentFacts(review.employmentId, {
						expectedRevision: employment.revision,
						...facts,
					})
				const event = decisionEvent(command.outcome)
				if (event)
					await w.facts.recordWorkerEvent({
						workerId: employment.workerId,
						employmentId: review.employmentId,
						assignmentId: null,
						eventTypeCode: event,
						effectiveDate: command.effectiveDate,
						reason: command.reason,
						previousValueSummary: `Probation ends ${currentEnd}`,
						newValueSummary: command.extendedProbationEndDate
							? `Probation ends ${command.extendedProbationEndDate}`
							: '',
						approvedByAccountId: w.accountId,
						approvedOn: w.today,
					})
				if (command.outcome === 'Extend') {
					// Business rule 21: the extension creates the next review obligation.
					await w.probation.insertReview({
						employmentId: review.employmentId,
						reviewType: 'Final',
						...finalReview(review.periodStart, command.extendedProbationEndDate as string),
						reviewerAccountId: review.reviewer?.accountId ?? null,
						reason: 'Scheduled by the probation extension.',
					})
				}
				await this.audit(
					w,
					'employee.probation-decided',
					id,
					requestId,
					command.reason,
					review.status,
					'Decided',
					['outcome'],
				)
				return this.detail(w, id)
			},
		)
	}

	/** Run one idempotent command in a business transaction. */
	private command<T>(
		context: AuthenticatedHcmContext,
		operation: string,
		payload: unknown,
		key: string,
		work: (w: EmployeeWork) => Promise<T>,
	): Promise<T> {
		const hash = commandHash(operation, payload)
		return this.unit.execute(
			context,
			MANAGE,
			true,
			/** Keep receipts in the business transaction. */ (w) =>
				runIdempotent(
					w.receipts,
					`probation.${operation}`,
					key,
					hash,
					/** Run once. */ () => work(w),
				),
		)
	}

	/** An employment still in probation. */
	private async inProbation(
		w: EmployeeWork,
		employmentId: string,
		field: string,
	): Promise<ProbationEmploymentRow> {
		const employment = await w.probation.employment(employmentId)
		if (!employment) throw new HcmDomainError('not-found')
		if (!IN_PROBATION.includes(employment.probationStatus) || !employment.probationEndDate)
			throw new HcmDomainError('invalid-state', [{ field, code: 'not-in-probation' }])
		return employment
	}

	/** Lock an undecided review at the expected revision. */
	private async lockUndecided(
		w: EmployeeWork,
		id: string,
		expected: number,
	): Promise<ProbationReviewRow> {
		const review = await w.probation.review(id, { lock: true })
		if (!review) throw new HcmDomainError('not-found')
		if (review.revision !== expected) throw new HcmDomainError('revision-conflict')
		if (!undecided(review.status)) throw new HcmDomainError('invalid-state')
		return review
	}

	/** Require an enabled account holding the reviewer grant. */
	private async requireReviewer(w: EmployeeWork, accountId: string): Promise<void> {
		if (!(await w.probation.canReview(accountId))) invalidField('reviewerAccountId', 'not-reviewer')
	}

	/** A review for a list. */
	private summary(w: EmployeeWork, row: ProbationReviewRow): ProbationReviewSummaryDto {
		return {
			id: row.id,
			employmentId: row.employmentId,
			workerName: row.workerName,
			workerNumber: row.workerNumber,
			sequenceNumber: row.sequenceNumber,
			reviewType: row.reviewType,
			dueDate: row.dueDate,
			status: row.status,
			state: reviewState(row.status, row.dueDate, w.today),
			reviewer: row.reviewer,
		}
	}

	/** One review with everything HR needs to decide it. */
	private async detail(w: EmployeeWork, id: string): Promise<ProbationReviewDto> {
		const review = await w.probation.review(id)
		if (!review) throw new HcmDomainError('not-found')
		const [employment, assessments, decisions, reviews, manage, suggested] = await Promise.all([
			w.probation.employment(review.employmentId),
			w.probation.assessments(id),
			w.probation.decisions(review.employmentId),
			w.probation.employmentReviews(review.employmentId),
			w.holds(MANAGE),
			w.probation.managerReviewer(review.employmentId, w.today),
		])
		if (!employment) throw new HcmDomainError('not-found')
		const byReview = new Map<string, ProbationDecisionDto>(
			decisions.map(/** Entry. */ (item) => [item.reviewId, item]),
		)
		const extensions = decisions.filter(/** Extensions. */ (item) => item.outcome === 'Extend')
		const originalEnd = extensions[0]?.previousProbationEndDate ?? employment.probationEndDate
		const open = undecided(review.status)
		return {
			...this.summary(w, review),
			context: {
				workerName: employment.workerName,
				workerNumber: employment.workerNumber,
				designation: employment.designation,
				unit: employment.unit,
				hireDate: employment.hireDate,
				probationEndDate: employment.probationEndDate,
				probationStatus: employment.probationStatus,
			},
			periodStart: review.periodStart,
			periodEnd: review.periodEnd,
			probationEndDate: review.probationEndDate,
			scheduleReason: review.scheduleReason,
			cancelReason: review.cancelReason,
			owner: review.owner,
			suggestedReviewer: suggested,
			assessments,
			decision: byReview.get(id) ?? null,
			history: reviews.map(
				/** Review with decision. */ (row) => ({
					...this.summary(w, row),
					decision: byReview.get(row.id) ?? null,
				}),
			),
			maxExtendedEndDate: originalEnd ? maxExtendedEnd(originalEnd, extensions.length) : null,
			actions: {
				assignReviewer: manage && open,
				cancel: manage && open,
				decide: manage && open && IN_PROBATION.includes(employment.probationStatus),
			},
			revision: review.revision,
		}
	}

	/** Append one audit event naming states and fields only. */
	private async audit(
		w: EmployeeWork,
		action: string,
		id: string,
		requestId: string,
		reason: string | null,
		fromState: string | null,
		toState: string,
		changedFields: string[],
	): Promise<void> {
		await w.audit.append({
			action,
			category: 'business',
			targetType: 'probation-review',
			targetId: id,
			requestId,
			summary: { reason, changedFields, fromState, toState },
		})
	}
}
