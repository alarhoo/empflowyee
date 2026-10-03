import { Temporal } from '@js-temporal/polyfill'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'
import {
	parseWorkAssignment,
	parseReviewedWorkAssignment,
	type WorkAssignmentReview,
	parseWorkAssignmentQuery,
	type WorkAssignmentFamily,
	type WorkAssignmentView,
	type WorkAssignmentResult,
	type ParsedWorkAssignment,
	type AttendanceScopeTarget,
	type AttendancePolicyVersionView,
	type ScheduleVersionView,
} from '@empflowyee/hcm-attendance-contract'
import { commandHash, type AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type { HolidayAssignmentWork } from './holiday-assignments'
import {
	prepareAttendanceAssignment,
	type AttendanceAssignmentPreparation,
} from './assignment-preparation'
import { AssignedWorkdayResolver, type AssignedWorkdayResult } from './assigned-workday'
import { resolveScheduleSegments, AttendanceTimeError } from '@empflowyee/hcm-api-attendance-domain'
import { workdayZone } from './workday-location'
import { replaySafe } from './schedule-commands'
import {
	leaveImpactProposal,
	type AttendanceLeaveImpactPort,
	type AttendanceLeaveImpact,
} from './leave-impact'

export interface WorkAssignmentWork
	extends
	AttendanceAssignmentPreparation,
	Pick<
		HolidayAssignmentWork,
			'inputs' | 'receipts' | 'audit' | 'requireRead' | 'requireNoTies' | 'enqueue'
	> {
	leaveImpact: AttendanceLeaveImpactPort
	/** Evaluate proposed writes in an always-rolled-back savepoint; previews never leave assignments or outbox rows. */
	simulate<T>(review: () => Promise<T>): Promise<T>
	/** Read the exact source from this selected family without changing its state. */
	source(versionId: string): Promise<AttendancePolicyVersionView | ScheduleVersionView | null>
	/** Find current or historical dated coverage for the exact authorized target. */
	current(target: AttendanceScopeTarget, date: string): Promise<WorkAssignmentView | null>
	/** Insert typed coverage; SQL rejects same-target collisions and unpublished sources. */
	insert(id: string, input: ParsedWorkAssignment): Promise<WorkAssignmentView>
}
export abstract class AttendanceWorkAssignmentUnit {
	/** Bind one family's scope operation to current authority and one tenant transaction. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		family: WorkAssignmentFamily,
		target: AttendanceScopeTarget,
		write: boolean | 'preview',
		work: (scope: WorkAssignmentWork) => Promise<T>,
	): Promise<T>
}

/** Enumerate the explicit production window and assignment boundaries without inventing an open-ended execution horizon. */
function executionDates(input: ParsedWorkAssignment): string[] {
	const dates = new Set([input.effectiveFrom])
	if (input.effectiveTo) dates.add(input.effectiveTo)
	for (
		let date = Temporal.PlainDate.from(input.resolutionFrom);
		Temporal.PlainDate.compare(date, input.resolutionTo) <= 0;
		date = date.add({ days: 1 })
	)
		dates.add(date.toString())
	return [...dates].sort()
}

/** Evaluate the actual proposed assignment with production SQL selection, periods and exact resolution; the caller controls rollback or commit. */
async function evaluateAssignment(
	work: WorkAssignmentWork,
	family: WorkAssignmentFamily,
	input: ParsedWorkAssignment,
	assignmentId: string,
) {
	const source = await work.source(input.versionId)
	if (!source) throw new HcmDomainError('not-found')
	if (source.revision !== input.expectedRevision) throw new HcmDomainError('revision-conflict')
	if (source.state !== 'Published' || ('isTemplate' in source && source.isTemplate))
		throw new HcmDomainError('invalid-state')
	if (
		input.effectiveFrom < source.effectiveFrom ||
		(source.effectiveTo && (!input.effectiveTo || input.effectiveTo > source.effectiveTo))
	)
		throw new HcmDomainError('effective-date-out-of-range')
	const contexts = await prepareAttendanceAssignment(work, input, executionDates(input))
	const result = await work.insert(assignmentId, input)
	const resolver = new AssignedWorkdayResolver(work.inputs, 366)
	const evidence = []
	const resolutions: { employmentId: string; workDate: string; result: AssignedWorkdayResult }[] =
		[]
	let queuedWorkdays = 0,
		unavailableWorkdays = 0
	for (const facts of contexts) {
		await work.requireNoTies(facts, input.target.kind)
		if ('days' in source) {
			const zone = workdayZone(source, facts, input.target)
			if (!zone) throw new HcmDomainError('record-incomplete')
			const weekday = Temporal.PlainDate.from(facts.workDate).dayOfWeek
			const day = source.days.find(
				/** Validate this assigned candidate even when another scope currently wins. */ (item) =>
					item.weekday === weekday,
			)
			if (!day) throw new HcmDomainError('record-incomplete')
			if (day.kind === 'Work') {
				try {
					resolveScheduleSegments(facts.workDate, zone, day.segments)
				} catch (error) {
					if (error instanceof AttendanceTimeError) throw new HcmDomainError('invalid-state')
					throw error
				}
			}
		}
		const inputs = await Promise.all(
			['Schedule', 'Policy', 'Holiday'].map(
				/** Include available dependencies even when another required family is missing. */ (
					family,
				) =>
					work.inputs.read(
						family as 'Schedule' | 'Policy' | 'Holiday',
						facts.employmentId,
						facts.workDate,
					),
			),
		)
		const period = await work.periods.fence(facts.workDate, facts.workDate)
		const resolved = await resolver.resolve(facts.employmentId, facts.workDate)
		evidence.push({ facts, inputs, period, resolved })
		if (resolved.state === 'Unavailable') {
			// Missing prerequisites remain explicitly unavailable; proven invalid time or rest
			// is a conflict and cannot be concealed by merely withholding work production.
			if (
				!['MissingConfiguration', 'ConfigurationUnavailable', 'LocationUnavailable'].includes(
					resolved.reason,
				)
			)
				throw new HcmDomainError('invalid-state')
			if (facts.workDate >= input.resolutionFrom && facts.workDate <= input.resolutionTo)
				unavailableWorkdays++
			continue
		}
		if (facts.workDate < input.resolutionFrom || facts.workDate > input.resolutionTo) continue
		resolutions.push({
			employmentId: facts.employmentId,
			workDate: facts.workDate,
			result: resolved,
		})
		queuedWorkdays++
	}
	const impacts: AttendanceLeaveImpact[] = []
	for (const employmentId of [
		...new Set(
			contexts.map(
				/** Review each request only once across its employment's candidate dates. */ (facts) =>
					facts.employmentId,
			),
		),
	].sort()) {
		impacts.push(
			await work.leaveImpact.review(
				leaveImpactProposal(
					employmentId,
					evidence
						.filter(
							/** Keep the exact authorized employment context. */ (day) =>
								day.facts.employmentId === employmentId,
						)
						.map(
							/** Supply both available and unavailable candidate dates. */ (day) => ({
								workDate: day.facts.workDate,
								result: day.resolved,
							}),
						),
				),
			),
		)
	}
	const leaveImpact = {
		digest: commandHash('AssignmentLeaveImpact:1', impacts),
		affectedRequestCount: impacts.reduce(
			/** Requests belong to one employment, so counts do not overlap. */ (total, impact) =>
				total + impact.affectedRequestCount,
			0,
		),
		changedRequestCount: impacts.reduce(
			/** Sum distinct changed requests across employments. */ (total, impact) =>
				total + impact.changedRequestCount,
			0,
		),
		unavailableRequestCount: impacts.reduce(
			/** Preserve every unavailable downstream calculation. */ (total, impact) =>
				total + impact.unavailableRequestCount,
			0,
		),
	}
	return {
		source,
		result,
		resolutions,
		leaveImpact,
		digest: commandHash('WorkAssignmentImpact', { family, source, input, evidence, leaveImpact }),
		queuedWorkdays,
		unavailableWorkdays,
		affectedEmploymentCount: new Set(
			contexts.map(/** Count distinct authorized employments. */ (item) => item.employmentId),
		).size,
		affectedWorkdayCount: contexts.length,
	}
}

/** Assign published schedules and policies through the maintained scope checks and actual dated workday resolver. */
export class AttendanceWorkAssignments {
	/** Consume owning transaction ports without importing database or transport implementation. */
	constructor(private readonly unit: AttendanceWorkAssignmentUnit) {}
	/** Read only; inspecting current assignment never creates durable work. */
	find(
		context: AuthenticatedHcmContext,
		family: WorkAssignmentFamily,
		params: URLSearchParams,
	): Promise<WorkAssignmentView | null> {
		const query = parseWorkAssignmentQuery(params)
		return this.unit.execute(
			context,
			family,
			query.target,
			false,
			/** Keep exact target lookup inside fresh read authorization. */ (work) =>
				work.current(query.target, query.asOf),
		)
	}
	/** Persist actor-bound bounded impact evidence while rolling back every proposed assignment change. */
	preview(
		context: AuthenticatedHcmContext,
		family: WorkAssignmentFamily,
		key: string,
		value: unknown,
	): Promise<WorkAssignmentReview> {
		const input = parseWorkAssignment(value)
		return this.unit.execute(
			context,
			family,
			input.target,
			'preview',
			/** Review permissions and the complete dated target are checked before evidence is disclosed. */ (
				work,
			) =>
				replaySafe(
					work,
					family + '.assignment-review',
					key,
					input.versionId,
					input,
					/** A stable proposed assignment ID makes preview and commit digests comparable. */ async () => {
						const previewId = key.toLowerCase()
						const result = await work.simulate(
							/** Evaluate without persisting the candidate. */ () =>
								evaluateAssignment(work, family, input, previewId),
						)
						work.receipts.setEvidence({
							owner: family,
							versionId: input.versionId,
							revision: input.expectedRevision,
							reason: input.reason,
						})
						await work.audit.append({
							action: 'attendance.configuration-previewed',
							category: 'business',
							targetType: 'attendance-configuration-version',
							targetId: input.versionId,
							requestId: key,
							summary: {
								reason: null,
								changedFields: ['assignmentReview'],
								fromState: null,
								toState: 'Reviewed',
							},
						})
						return {
							previewId,
							digest: result.digest,
							expiresAt: new Date(Date.now() + 900000).toISOString(),
							affectedEmploymentCount: result.affectedEmploymentCount,
							affectedWorkdayCount: result.affectedWorkdayCount,
							queuedWorkdays: result.queuedWorkdays,
							unavailableWorkdays: result.unavailableWorkdays,
							leaveImpact: result.leaveImpact,
						}
					},
				),
		)
	}
	/** Atomically validate coverage, scope, precedence and dated inputs before admitting work to the existing worker. */
	assign(
		context: AuthenticatedHcmContext,
		family: WorkAssignmentFamily,
		key: string,
		value: unknown,
	): Promise<WorkAssignmentResult> {
		const { input, previewId, digest } = parseReviewedWorkAssignment(value)
		return this.unit.execute(
			context,
			family,
			input.target,
			true,
			/** Require current operation and replay authority before inspecting source content. */ (
				work,
			) =>
				replaySafe(
					work,
					family + '.assign',
					key,
					input.versionId,
					input,
					/** Any conflict rolls back predecessor changes, new coverage, audit and durable intents together. */ async () => {
						const reviewed = await work.receipts.get(family + '.assignment-review', previewId)
						if (!reviewed || reviewed.requestHash !== commandHash(input.versionId, input))
							throw new HcmDomainError('preview-stale')
						const review = reviewed.response as WorkAssignmentReview
						if (review.digest !== digest || Date.parse(review.expiresAt) <= Date.now())
							throw new HcmDomainError('preview-stale')
						const evaluated = await evaluateAssignment(work, family, input, previewId)
						if (evaluated.digest !== digest) throw new HcmDomainError('preview-stale')
						if (evaluated.leaveImpact.unavailableRequestCount)
							throw new HcmDomainError('record-incomplete')
						const { source, result, queuedWorkdays, unavailableWorkdays } = evaluated
						for (const day of evaluated.resolutions) {
							if (day.result.state === 'Available')
								await work.enqueue(day.employmentId, day.workDate, day.result.inputDigest)
						}
						work.receipts.setEvidence({
							owner: family,
							versionId: source.versionId,
							revision: source.revision,
							reason: input.reason,
						})
						await work.audit.append({
							action: 'attendance.configuration-assigned',
							category: 'business',
							targetType:
								family === 'Schedule'
									? 'attendance-schedule-assignment'
									: 'attendance-policy-assignment',
							targetId: result.id,
							requestId: key,
							summary: {
								reason: null,
								changedFields: ['assignment'],
								fromState: null,
								toState: 'Assigned',
							},
						})
						return {
							...result,
							resolutionFrom: input.resolutionFrom,
							resolutionTo: input.resolutionTo,
							leaveImpact: evaluated.leaveImpact,
							queuedWorkdays,
							unavailableWorkdays,
						}
					},
				),
		)
	}
}
