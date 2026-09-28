import { attendanceZone, type ScheduleVersionView } from '@empflowyee/hcm-attendance-contract'
import type { DatedConfigurationAssignment } from '@empflowyee/hcm-api-attendance-domain'
import type {
	WorkforceTimeAssignment,
	WorkforceTimeContext,
} from '@empflowyee/hcm-api-workforce-foundation-application'

export type AttendanceLocation = Pick<
	WorkforceTimeAssignment,
	'locationId' | 'locationRevision' | 'timezone' | 'region'
>

/** Select only the approved explicit location/assignment or unique primary location; repeated references to one location must have identical facts. */
export function workdayLocation(
	workforce: WorkforceTimeContext,
	mode: ScheduleVersionView['timezoneMode'],
	target: DatedConfigurationAssignment['target'],
): AttendanceLocation | null {
	let matches: readonly WorkforceTimeAssignment[]
	if (mode === 'Location' && target.kind === 'Assignment') {
		matches = workforce.assignments.filter(
			/** Select the exact effective assignment, never an unrelated primary. */ (item) =>
				item.id === target.id,
		)
		if (matches.length !== 1) return null
	} else if (mode === 'Location' && target.kind === 'Location') {
		matches = workforce.assignments.filter(
			/** Several assignments may refer to the same explicit location facts. */ (item) =>
				item.locationId === target.id,
		)
	} else {
		matches = workforce.assignments.filter(
			/** Primary identity must be unique even if two primary assignments share a location. */ (
				item,
			) => item.isPrimary,
		)
		if (matches.length !== 1) return null
	}
	const first = matches[0]
	if (
		!first ||
		matches.some(
			/** Conflicting location revisions or attributes cannot be silently resolved by input order. */ (
				item,
			) =>
				item.locationId !== first.locationId ||
				item.locationRevision !== first.locationRevision ||
				item.timezone !== first.timezone ||
				item.region !== first.region,
		)
	)
		return null
	return {
		locationId: first.locationId,
		locationRevision: first.locationRevision,
		timezone: first.timezone,
		region: first.region,
	}
}

/** Apply DEC-HCM3-023 without consulting user preferences, server timezone or another employment. */
export function workdayZone(
	schedule: Pick<ScheduleVersionView, 'timezoneMode' | 'fixedZone'>,
	workforce: WorkforceTimeContext,
	target: DatedConfigurationAssignment['target'],
): string | null {
	const zone =
		schedule.timezoneMode === 'Fixed'
			? schedule.fixedZone
			: workdayLocation(workforce, schedule.timezoneMode, target)?.timezone
	if (!zone) return null
	return attendanceZone(zone)
}
