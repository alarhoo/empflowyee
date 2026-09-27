import {
	parseAssessment,
	parseReviewerQuery,
	type ReviewerReviewDto,
	type ReviewerReviewPage,
} from '@empflowyee/hcm-employee-contract'
import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'
import {
	commandHash,
	runIdempotent,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import { reviewState, undecided } from '@empflowyee/hcm-api-employee-domain'
import type { EmployeeUnitOfWork, EmployeeWork } from './employee-unit'

const REVIEW = 'probation.review'

/**
 * Probation Review use cases (Probation Review TDD#API): the stored reviewer lists and reads only
 * their own reviews and submits assessments until HR decides. Every query carries the account
 * predicate, so a review outside that set is not found; reporting lines grant nothing.
 */
export class ProbationReview {
	/** Compose the reviewer use cases on the employee unit of work. */
	constructor(private readonly unit: EmployeeUnitOfWork) {}

	/** A page of the actor's assigned reviews, due first. */
	list(context: AuthenticatedHcmContext, params: URLSearchParams): Promise<ReviewerReviewPage> {
		const query = parseReviewerQuery(params)
		return this.unit.execute(
			context,
			REVIEW,
			false,
			/** Page own reviews. */ async (w) => {
				const page = await w.probation.reviews({ ...query, reviewerAccountId: w.accountId })
				return {
					items: page.items.map(
						/** Summary. */ (row) => ({
							id: row.id,
							workerName: row.workerName,
							reviewType: row.reviewType,
							dueDate: row.dueDate,
							status: row.status,
							state: reviewState(row.status, row.dueDate, w.today),
						}),
					),
					nextCursor: page.nextCursor,
				}
			},
		)
	}

	/** One assigned review with minimal context. */
	read(context: AuthenticatedHcmContext, id: string): Promise<ReviewerReviewDto> {
		idValue(id, 'id')
		return this.unit.execute(context, REVIEW, false, /** Read. */ (w) => this.detail(w, id))
	}

	/** Submit an assessment; a new one supersedes the current until HR decides. */
	assess(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ReviewerReviewDto> {
		idValue(id, 'id')
		const command = parseAssessment(body)
		const hash = commandHash('probation.assess', { id, command })
		return this.unit.execute(
			context,
			REVIEW,
			true,
			/** Keep receipts in the business transaction. */ (w) =>
				runIdempotent(
					w.receipts,
					'probation.assess',
					key,
					hash,
					/** Assess once. */ async () => {
						const review = await w.probation.review(id, {
							lock: true,
							reviewerAccountId: w.accountId,
						})
						if (!review) throw new HcmDomainError('not-found')
						if (review.revision !== command.expectedRevision)
							throw new HcmDomainError('revision-conflict')
						if (!undecided(review.status)) throw new HcmDomainError('invalid-state')
						await w.probation.insertAssessment({
							reviewId: id,
							recommendation: command.recommendation,
							overallRating: command.overallRating,
							strengths: command.strengths,
							concerns: command.concerns,
							recommendationReason: command.recommendationReason,
						})
						await w.probation.updateReview(id, { status: 'AssessmentSubmitted' })
						await w.audit.append({
							action: 'employee.probation-assessment-submitted',
							category: 'business',
							targetType: 'probation-review',
							targetId: id,
							requestId,
							summary: {
								reason: null,
								changedFields: ['recommendation', 'overallRating'],
								fromState: review.status,
								toState: 'AssessmentSubmitted',
							},
						})
						return this.detail(w, id)
					},
				),
		)
	}

	/** The reviewer's view: context without personal data, assessments and earlier decisions. */
	private async detail(w: EmployeeWork, id: string): Promise<ReviewerReviewDto> {
		const review = await w.probation.review(id, { reviewerAccountId: w.accountId })
		if (!review) throw new HcmDomainError('not-found')
		const [employment, assessments, decisions] = await Promise.all([
			w.probation.employment(review.employmentId),
			w.probation.assessments(id),
			w.probation.decisions(review.employmentId),
		])
		if (!employment) throw new HcmDomainError('not-found')
		return {
			id: review.id,
			reviewType: review.reviewType,
			dueDate: review.dueDate,
			status: review.status,
			state: reviewState(review.status, review.dueDate, w.today),
			periodStart: review.periodStart,
			periodEnd: review.periodEnd,
			context: {
				workerName: employment.workerName,
				workerNumber: employment.workerNumber,
				designation: employment.designation,
				unit: employment.unit,
				hireDate: employment.hireDate,
				probationEndDate: employment.probationEndDate,
				probationStatus: employment.probationStatus,
			},
			assessments,
			previousDecisions: decisions.map(
				/** Outcome only; HR reasons stay with HR. */ (item) => ({
					outcome: item.outcome,
					effectiveDate: item.effectiveDate,
					decidedAt: item.decidedAt,
				}),
			),
			actions: { assess: undecided(review.status) },
			revision: review.revision,
		}
	}
}
