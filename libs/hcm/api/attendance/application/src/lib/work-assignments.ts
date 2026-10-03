import { randomUUID } from 'node:crypto'
import { Temporal } from '@js-temporal/polyfill'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'
import {
	parseWorkAssignment,
	parseWorkAssignmentQuery,
	type WorkAssignmentFamily,
	type WorkAssignmentView,
	type WorkAssignmentResult,
	type ParsedWorkAssignment,
	type AttendanceScopeTarget,
	type AttendancePolicyVersionView,
	type ScheduleVersionView,
} from '@empflowyee/hcm-attendance-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type { HolidayAssignmentWork } from './holiday-assignments'
import {
	prepareAttendanceAssignment,
	type AttendanceAssignmentPreparation,
} from './assignment-preparation'
import { AssignedWorkdayResolver } from './assigned-workday'
import { resolveScheduleSegments, AttendanceTimeError } from '@empflowyee/hcm-api-attendance-domain'
import { workdayZone } from './workday-location'
import { replaySafe } from './schedule-commands'

export interface WorkAssignmentWork
	extends
	AttendanceAssignmentPreparation,
	Pick<
		HolidayAssignmentWork,
			'inputs' | 'receipts' | 'audit' | 'requireRead' | 'requireNoTies' | 'enqueue'
	> {
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
		write: boolean,
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
	/** Atomically validate coverage, scope, precedence and dated inputs before admitting work to the existing worker. */
	assign(
		context: AuthenticatedHcmContext,
		family: WorkAssignmentFamily,
		key: string,
		value: unknown,
	): Promise<WorkAssignmentResult> {
		const input = parseWorkAssignment(value)
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
						const source = await work.source(input.versionId)
						if (!source) throw new HcmDomainError('not-found')
						if (source.revision !== input.expectedRevision)
							throw new HcmDomainError('revision-conflict')
						if (source.state !== 'Published' || ('isTemplate' in source && source.isTemplate))
							throw new HcmDomainError('invalid-state')
						if (
							input.effectiveFrom < source.effectiveFrom ||
							(source.effectiveTo && (!input.effectiveTo || input.effectiveTo > source.effectiveTo))
						)
							throw new HcmDomainError('effective-date-out-of-range')
						const contexts = await prepareAttendanceAssignment(work, input, executionDates(input))
						const result = await work.insert(randomUUID(), input)
						const resolver = new AssignedWorkdayResolver(work.inputs, 366)
						let queuedWorkdays = 0,
							unavailableWorkdays = 0
						for (const facts of contexts) {
							await work.requireNoTies(facts, input.target.kind)
							if ('days' in source) {
								const zone = workdayZone(source, facts, input.target)
								if (!zone) throw new HcmDomainError('record-incomplete')
								const weekday = Temporal.PlainDate.from(facts.workDate).dayOfWeek
								const day = source.days.find(
									/** Validate this assigned candidate even when another scope currently wins. */ (
										item,
									) => item.weekday === weekday,
								)
								if (!day) throw new HcmDomainError('record-incomplete')
								if (day.kind === 'Work') {
									try {
										resolveScheduleSegments(facts.workDate, zone, day.segments)
									} catch (error) {
										if (error instanceof AttendanceTimeError)
											throw new HcmDomainError('invalid-state')
										throw error
									}
								}
							}
							const resolved = await resolver.resolve(facts.employmentId, facts.workDate)
							if (resolved.state === 'Unavailable') {
								// Missing prerequisites remain explicitly unavailable; proven invalid time or rest
								// is a conflict and cannot be concealed by merely withholding work production.
								if (
									![
										'MissingConfiguration',
										'ConfigurationUnavailable',
										'LocationUnavailable',
									].includes(resolved.reason)
								)
									throw new HcmDomainError('invalid-state')
								if (facts.workDate >= input.resolutionFrom && facts.workDate <= input.resolutionTo)
									unavailableWorkdays++
								continue
							}
							if (facts.workDate < input.resolutionFrom || facts.workDate > input.resolutionTo)
								continue
							await work.enqueue(facts.employmentId, facts.workDate, resolved.inputDigest)
							queuedWorkdays++
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
							queuedWorkdays,
							unavailableWorkdays,
						}
					},
				),
		)
	}
}
