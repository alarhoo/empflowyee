import { randomUUID } from 'node:crypto'
import { Temporal } from '@js-temporal/polyfill'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'
import {
	parseHolidayAssignment,
	parseHolidayAssignmentQuery,
	type ParsedHolidayAssignment,
	type HolidayVersionView,
	type HolidayAssignmentView,
	type HolidayAssignmentResult,
	type AttendanceScopeTarget,
} from '@empflowyee/hcm-attendance-contract'
import {
	resolveHolidays,
	AttendanceTimeError,
	HolidayCollisionError,
} from '@empflowyee/hcm-api-attendance-domain'
import type { HcmScopeSubject } from '@empflowyee/hcm-api-access-control-application'
import { prepareAttendanceAssignment } from './assignment-preparation'
export { attendanceTargetSubject as holidayTargetSubject } from './assignment-preparation'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type {
	WorkforceTimeContext,
	WorkforceTimeContextPort,
	WorkforceTimeSubjectsPort,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import type { AppendAudit } from '@empflowyee/hcm-api-audit-application'
import type { AttendanceCommandReceiptStore } from './configuration-evidence'
import type { AttendanceConfigurationInputPort } from './configuration-inputs'
import type { AttendancePeriodFencePort } from './period-fences'
import { AssignedWorkdayResolver } from './assigned-workday'
import { workdayLocation, workdayZone } from './workday-location'
import { replaySafe } from './schedule-commands'

export interface HolidayAssignmentWork {
	workforce: WorkforceTimeContextPort
	subjects: WorkforceTimeSubjectsPort
	inputs: AttendanceConfigurationInputPort
	periods: AttendancePeriodFencePort
	receipts: AttendanceCommandReceiptStore
	audit: AppendAudit
	/** Load the exact published source under the command lock. */
	source(versionId: string): Promise<HolidayVersionView | null>
	/** Read an exact assignment without changing its dated coverage. */
	read(id: string): Promise<HolidayAssignmentView | null>
	/** Find the at-most-one assignment covering the exact authorized scope/date. */
	current(target: AttendanceScopeTarget, asOf: string): Promise<HolidayAssignmentView | null>
	/** End only the expected predecessor revision. */
	end(id: string, revision: number, through: string): Promise<void>
	/** Insert the new assignment; SQL enforces typed tenant ownership and same-target exclusions. */
	insert(id: string, input: ParsedHolidayAssignment): Promise<HolidayAssignmentView>
	/** Reject matching assignments of the same precedence even when a narrower rule currently wins. */
	requireNoTies(facts: WorkforceTimeContext, kind: AttendanceScopeTarget['kind']): Promise<void>
	/** Reject closing or locked periods anywhere in the changed assignment interval. */
	guardPeriods(from: string, to?: string): Promise<void>
	/** Require one current grant covering every dated source subject. */
	authorize(subjects: readonly HcmScopeSubject[]): Promise<void>
	/** Recheck current source read permission before recovering a receipt. */
	requireRead(): Promise<void>
	/** Enqueue the exact accepted digest in the same transaction as the assignment. */
	enqueue(employmentId: string, workDate: string, digest: string): Promise<void>
}
export abstract class AttendanceHolidayAssignmentUnit {
	/** Authorize the explicit target before looking up source details and bind all effects to one transaction. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		target: AttendanceScopeTarget,
		write: boolean,
		work: (scope: HolidayAssignmentWork) => Promise<T>,
	): Promise<T>
}

/** Select explicit execution dates plus declared holidays without inventing an open-ended materialization horizon. */
export function holidayAssignmentDates(
	source: HolidayVersionView,
	input: ParsedHolidayAssignment,
): string[] {
	const dates = new Set<string>([input.effectiveFrom])
	if (input.effectiveTo) dates.add(input.effectiveTo)
	for (const entry of source.entries)
		if (
			entry.observedDate >= input.effectiveFrom &&
			(!input.effectiveTo || entry.observedDate <= input.effectiveTo)
		)
			dates.add(entry.observedDate)
	for (
		let date = Temporal.PlainDate.from(input.resolutionFrom);
		Temporal.PlainDate.compare(date, input.resolutionTo) <= 0;
		date = date.add({ days: 1 })
	)
		dates.add(date.toString())
	return [...dates].sort()
}

/** Assign real published calendars and explicitly supersede dated coverage with atomic durable resolution intents. */
export class AttendanceHolidayAssignments {
	/** Reuse owner transaction ports without coupling application behavior to SQL or HTTP. */
	constructor(private readonly unit: AttendanceHolidayAssignmentUnit) {}
	/** Read current or historical assignment coverage without creating work or changing configuration. */
	find(
		context: AuthenticatedHcmContext,
		params: URLSearchParams,
	): Promise<HolidayAssignmentView | null> {
		const query = parseHolidayAssignmentQuery(params)
		return this.unit.execute(
			context,
			query.target,
			false,
			/** Read after current scope and operation authorization. */ (work) =>
				work.current(query.target, query.asOf),
		)
	}
	/** Validate complete dated impact before committing any assignment, receipt or work intent. */
	assign(
		context: AuthenticatedHcmContext,
		key: string,
		value: unknown,
	): Promise<HolidayAssignmentResult> {
		const input = parseHolidayAssignment(value)
		return this.unit.execute(
			context,
			input.target,
			true,
			/** Replay still passes current operation and read authorization. */ (work) =>
				replaySafe(
					work,
					'Holidays.assign',
					key,
					input.versionId,
					input,
					/** All rejected validation rolls back predecessor changes and successor inserts. */ async () => {
						const source = await work.source(input.versionId)
						if (!source) throw new HcmDomainError('not-found')
						if (source.revision !== input.expectedRevision)
							throw new HcmDomainError('revision-conflict')
						if (source.state !== 'Published') throw new HcmDomainError('invalid-state')
						if (
							input.effectiveFrom < source.effectiveFrom ||
							(source.effectiveTo && (!input.effectiveTo || input.effectiveTo > source.effectiveTo))
						)
							throw new HcmDomainError('effective-date-out-of-range')
						const contexts = await prepareAttendanceAssignment(
							work,
							input,
							holidayAssignmentDates(source, input),
						)
						const result = await work.insert(randomUUID(), input)
						const resolver = new AssignedWorkdayResolver(work.inputs, 366)
						let queuedWorkdays = 0,
							unavailableWorkdays = 0
						for (const facts of contexts) {
							await work.requireNoTies(facts, input.target.kind)
							const calendar = await work.inputs.read('Holiday', facts.employmentId, facts.workDate)
							if (calendar.state !== 'Available')
								throw new HcmDomainError('overlapping-effective-period')
							const schedule = await work.inputs.read(
								'Schedule',
								facts.employmentId,
								facts.workDate,
							)
							const location =
								schedule.state === 'Available'
									? workdayLocation(
										facts,
										schedule.version.timezoneMode,
										schedule.assignment.target,
									)
									: workdayLocation(facts, 'Employment', {
										kind: 'Employment',
										id: facts.employmentId,
									})
							const zone =
								schedule.state === 'Available'
									? workdayZone(schedule.version, facts, schedule.assignment.target)
									: location?.timezone
							if (!location || !zone) throw new HcmDomainError('record-incomplete')
							try {
								resolveHolidays(
									facts.workDate,
									zone,
									{ locationId: location.locationId, regionCode: location.region },
									calendar.version.entries,
								)
								resolveHolidays(
									facts.workDate,
									zone,
									{ locationId: location.locationId, regionCode: location.region },
									source.entries.map(
										/** Validate this candidate even when a more-specific calendar currently wins. */ (
											entry,
											index,
										) => ({ ...entry, id: String(index), versionId: source.versionId }),
									),
								)
							} catch (error) {
								if (error instanceof AttendanceTimeError || error instanceof HolidayCollisionError)
									throw new HcmDomainError('invalid-state')
								throw error
							}
							if (facts.workDate < input.resolutionFrom || facts.workDate > input.resolutionTo)
								continue
							const resolved = await resolver.resolve(facts.employmentId, facts.workDate)
							if (resolved.state === 'Available') {
								await work.enqueue(facts.employmentId, facts.workDate, resolved.inputDigest)
								queuedWorkdays++
							} else unavailableWorkdays++
						}
						work.receipts.setEvidence({
							owner: 'Holiday',
							versionId: source.versionId,
							revision: source.revision,
							reason: input.reason,
						})
						await work.audit.append({
							action: 'attendance.configuration-assigned',
							category: 'business',
							targetType: 'attendance-holiday-calendar-assignment',
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
