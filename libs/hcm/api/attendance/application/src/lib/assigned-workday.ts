import { Temporal } from '@js-temporal/polyfill'
import {
	AttendanceTimeError,
	HolidayCollisionError,
	evaluateAttendanceRest,
	resolveDatedWorkday,
	resolveScheduleSegments,
	type AttendanceRestOutcome,
	type AttendanceRestRule,
	type DatedWorkdayIntervals,
} from '@empflowyee/hcm-api-attendance-domain'
import { commandHash } from '@empflowyee/hcm-api-runtime-application'
import { dateValue, idValue } from '@empflowyee/hcm-runtime-contract'
import type {
	AttendanceConfigurationInput,
	AttendanceConfigurationInputPort,
} from './configuration-inputs'
import { workdayLocation, workdayZone } from './workday-location'
import type { AttendanceResolvedPattern, WorkdaySourceReferences } from './dated-pattern'

export interface ResolutionDependency {
	family: 'Schedule' | 'Policy' | 'Holiday' | 'Roster' | 'Override'
	date: string
	digest: string
	versionId: string
	versionRevision: number
	assignmentId: string
	assignmentRevision: number
	workforceDigest: string
}

/** Retain exact selected source identities and revisions alongside the digest of all eligible assignments and Workforce facts. */
function dependency(
	input:
		| AttendanceResolvedPattern
		| Extract<
			AttendanceConfigurationInput<'Schedule' | 'Policy' | 'Holiday'>,
			{ state: 'Available' }
		>,
	date: string,
): ResolutionDependency {
	return {
		family: input.family,
		date,
		digest: input.digest,
		versionId: input.version.versionId,
		versionRevision: input.version.revision,
		assignmentId: input.assignment.id,
		assignmentRevision: input.assignment.revision,
		workforceDigest: input.workforce.inputDigest,
	}
}
export type WorkdayRestEvidence =
	| { state: 'NotRequired' | 'NoPriorEmploymentWork'; rules: AttendanceRestRule[] }
	| {
		state: 'Compared'
		previousWorkDate: string
		previousEnd: string
		currentStart: string
		outcomes: AttendanceRestOutcome[]
	}
export type AssignedWorkdayResult =
	| {
		state: 'Available'
		employmentId: string
		scheduleVersionId: string | null
		datedSources?: WorkdaySourceReferences
		policyVersionId: string
		holidayCalendarVersionIds: string[]
		inputDigest: string
		resolution: DatedWorkdayIntervals
		rest: WorkdayRestEvidence
		dependencies: ResolutionDependency[]
	}
	| {
		state: 'Unavailable'
		reason: string
		dependency?: { family: string; date: string }
		rest?: WorkdayRestEvidence
	}

type ScheduleInput = AttendanceResolvedPattern

/** Resolve the currently assigned path from source-owned dated inputs; this class neither grants authority nor writes successful-looking fallback workdays. */
export class AssignedWorkdayResolver {
	/** The caller owns tenant authorization, transaction stability and a positive bounded history-read budget. */
	constructor(
		private readonly inputs: AttendanceConfigurationInputPort,
		private readonly historyBudget: number,
	) {
		if (!Number.isSafeInteger(historyBudget) || historyBudget < 1 || historyBudget > 3660)
			throw new Error('Invalid workday history budget')
	}
	/** Prefer exact approved dated sources while retaining a distinct ordinary-assignment fallback. */
	private async pattern(
		employmentId: string,
		workDate: string,
	): Promise<
		| AttendanceResolvedPattern
		| Extract<AttendanceConfigurationInput<'Schedule'>, { state: 'Unavailable' }>
	> {
		const dated = await this.inputs.datedPattern?.(employmentId, workDate)
		if (dated && dated.state !== 'Absent') return dated
		const input = await this.inputs.read('Schedule', employmentId, workDate)
		if (input.state === 'Unavailable') return input
		return {
			...input,
			sources: {
				scheduleVersionId: input.version.versionId,
				shiftVersionId: null,
				rosterEntryId: null,
				overrideId: null,
			},
		}
	}

	/** Return explicit expected resolution conflicts; unexpected adapter failures escape for durable retry rather than becoming false business outcomes. */
	async resolve(employmentId: string, workDate: string): Promise<AssignedWorkdayResult> {
		idValue(employmentId, 'employmentId')
		dateValue(workDate, 'workDate')
		try {
			return await this.resolveInputs(employmentId, workDate)
		} catch (error) {
			if (error instanceof AttendanceTimeError) return { state: 'Unavailable', reason: error.code }
			if (error instanceof HolidayCollisionError)
				return { state: 'Unavailable', reason: 'HolidayPriorityCollision' }
			throw error
		}
	}

	/** Select exact current sources, preserve both civil dates of overnight work and bind all dependencies into the result digest. */
	private async resolveInputs(
		employmentId: string,
		workDate: string,
	): Promise<AssignedWorkdayResult> {
		const schedule = await this.pattern(employmentId, workDate)
		if (schedule.state === 'Unavailable')
			return {
				state: 'Unavailable',
				reason: schedule.reason,
				dependency: { family: 'Schedule', date: workDate },
			}
		const policy = await this.inputs.read('Policy', employmentId, workDate)
		if (policy.state === 'Unavailable')
			return {
				state: 'Unavailable',
				reason: policy.reason,
				dependency: { family: 'Policy', date: workDate },
			}
		if (schedule.workforce.inputDigest !== policy.workforce.inputDigest)
			return { state: 'Unavailable', reason: 'InputChanged' }
		const zone = workdayZone(schedule.version, schedule.workforce, schedule.assignment.target)
		const location = workdayLocation(
			schedule.workforce,
			schedule.version.timezoneMode,
			schedule.assignment.target,
		)
		if (!zone || !location) return { state: 'Unavailable', reason: 'LocationUnavailable' }
		const date = Temporal.PlainDate.from(workDate)
		const day = schedule.version.days.find(
			/** Select the actual ISO weekday, independent of display week-start preference. */ (item) =>
				item.weekday === date.dayOfWeek,
		)
		if (!day) return { state: 'Unavailable', reason: 'ConfigurationUnavailable' }
		const dates = [workDate]
		if (
			day.segments.some(
				/** A next-date endpoint requires the next civil date's selected calendar. */ (segment) =>
					segment.endDayOffset === 1,
			)
		) {
			if (workDate === '9999-12-31') return { state: 'Unavailable', reason: 'DateRangeUnavailable' }
			dates.push(date.add({ days: 1 }).toString())
		}
		const dependencies: ResolutionDependency[] = [
			dependency(schedule, workDate),
			dependency(policy, workDate),
		]
		const holidays = [] as Extract<
			AttendanceConfigurationInput<'Holiday'>,
			{ state: 'Available' }
		>['version']['entries']
		const calendarIds = new Set<string>()
		for (const observedDate of dates) {
			const calendar = await this.inputs.holidayForWorkforce(schedule.workforce, observedDate)
			if (calendar.state === 'Unavailable')
				return {
					state: 'Unavailable',
					reason: calendar.reason,
					dependency: { family: 'Holiday', date: observedDate },
				}
			dependencies.push(dependency(calendar, observedDate))
			calendarIds.add(calendar.version.versionId)
			holidays.push(
				...calendar.version.entries.filter(
					/** Use entries only on the date for which this exact calendar was selected. */ (entry) =>
						entry.observedDate === observedDate,
				),
			)
		}
		const resolution = resolveDatedWorkday(
			workDate,
			zone,
			day,
			{ locationId: location.locationId, regionCode: location.region },
			holidays,
		)
		const scheduleRule = {
			source: 'Schedule' as const,
			versionId: schedule.restSourceVersionId ?? schedule.version.versionId,
			minutes: schedule.version.minimumRestMinutes ?? null,
			...(schedule.version.minimumRestMode ? { mode: schedule.version.minimumRestMode } : {}),
		}
		const policyRule = {
			source: 'Policy' as const,
			versionId: policy.version.versionId,
			minutes: policy.version.minimumRestMinutes ?? null,
			...(policy.version.minimumRestMode ? { mode: policy.version.minimumRestMode } : {}),
		}
		const rest = await this.rest(schedule, resolution, scheduleRule, policyRule, dependencies)
		if ('reason' in rest) return rest
		if (
			rest.state === 'Compared' &&
			rest.outcomes.some(
				/** Retain warnings alongside every independent blocking outcome. */ (item) =>
					item.result.state === 'Block',
			)
		)
			return { state: 'Unavailable', reason: 'MinimumRestBlocked', rest }
		const holidayCalendarVersionIds = [...calendarIds].sort()
		const inputDigest = commandHash('AssignedWorkday', {
			employmentId,
			workDate,
			dependencies,
			location,
			resolution,
			rest,
		})
		return {
			state: 'Available',
			employmentId,
			scheduleVersionId: schedule.sources.scheduleVersionId,
			...(schedule.family === 'Schedule' ? {} : { datedSources: schedule.sources }),
			policyVersionId: policy.version.versionId,
			holidayCalendarVersionIds,
			inputDigest,
			resolution,
			rest,
			dependencies,
		}
	}

	/** Find the previous configured shift without assuming missing history is rest or applying an unconfigured universal threshold. */
	private async rest(
		schedule: ScheduleInput,
		resolution: DatedWorkdayIntervals,
		scheduleRule: AttendanceRestRule & { source: 'Schedule' },
		policyRule: AttendanceRestRule & { source: 'Policy' },
		dependencies: ResolutionDependency[],
	): Promise<WorkdayRestEvidence | Extract<AssignedWorkdayResult, { state: 'Unavailable' }>> {
		const rules = [scheduleRule, policyRule]
		if (
			resolution.scheduleKind === 'Rest' ||
			(scheduleRule.minutes === null && policyRule.minutes === null)
		)
			return { state: 'NotRequired', rules }
		let date = Temporal.PlainDate.from(resolution.workDate)
		for (let reads = 0; reads < this.historyBudget; reads++) {
			if (date.toString() <= schedule.workforce.hireDate)
				return { state: 'NoPriorEmploymentWork', rules }
			date = date.subtract({ days: 1 })
			const previous = await this.pattern(schedule.workforce.employmentId, date.toString())
			if (previous.state === 'Unavailable')
				return {
					state: 'Unavailable',
					reason: previous.reason,
					dependency: { family: 'Schedule', date: date.toString() },
				}
			dependencies.push(dependency(previous, date.toString()))
			const day = previous.version.days.find(
				/** Follow each dated published pattern instead of assuming Saturday/Sunday rest. */ (
					item,
				) => item.weekday === date.dayOfWeek,
			)
			if (!day) return { state: 'Unavailable', reason: 'ConfigurationUnavailable' }
			if (day.kind === 'Rest') continue
			const zone = workdayZone(previous.version, previous.workforce, previous.assignment.target)
			if (!zone) return { state: 'Unavailable', reason: 'LocationUnavailable' }
			const segments = resolveScheduleSegments(date.toString(), zone, day.segments)
			const last = segments.at(-1),
				first = resolution.scheduledSegments[0]
			if (!last || !first) return { state: 'Unavailable', reason: 'ConfigurationUnavailable' }
			return {
				state: 'Compared',
				previousWorkDate: date.toString(),
				previousEnd: last.endInstant,
				currentStart: first.startInstant,
				outcomes: evaluateAttendanceRest(
					last.endMilliseconds,
					first.startMilliseconds,
					scheduleRule,
					policyRule,
				).outcomes,
			}
		}
		if (date.toString() <= schedule.workforce.hireDate)
			return { state: 'NoPriorEmploymentWork', rules }
		return { state: 'Unavailable', reason: 'ResolutionBudgetExceeded' }
	}
}
