import type { ScheduleVersionView } from '@empflowyee/hcm-attendance-contract'
import type { DatedConfigurationAssignment } from '@empflowyee/hcm-api-attendance-domain'
import type { WorkforceTimeContext } from '@empflowyee/hcm-api-workforce-foundation-application'
import type { AttendanceConfigurationInput } from './configuration-inputs'

/** Exact typed source references accompany normalized intervals; normalization never manufactures a schedule version row. */
export interface WorkdaySourceReferences {
	scheduleVersionId: string | null
	shiftVersionId: string | null
	rosterEntryId: string | null
	overrideId: string | null
}

/** Private resolver projection shared by weekly patterns and one-date sources, never serialized as a public configuration DTO. */
export interface AttendanceResolvedPattern {
	state: 'Available'
	family: 'Schedule' | 'Roster' | 'Override'
	workforce: WorkforceTimeContext
	digest: string
	assignment: Pick<DatedConfigurationAssignment, 'id' | 'revision' | 'target'>
	version: Pick<
		ScheduleVersionView,
		| 'versionId'
		| 'revision'
		| 'timezoneMode'
		| 'fixedZone'
		| 'minimumRestMinutes'
		| 'minimumRestMode'
		| 'days'
	>
	restSourceVersionId?: string
	sources: WorkdaySourceReferences
}
export type AttendanceDatedPatternResult =
	| { state: 'Absent' }
	| AttendanceResolvedPattern
	| Extract<AttendanceConfigurationInput<'Schedule'>, { state: 'Unavailable' }>

export interface AttendanceDatedPatternPort {
	/** Read approved override or published roster for one employment/date; Absent delegates to ordinary scoped assignment selection. */
	read(employmentId: string, workDate: string): Promise<AttendanceDatedPatternResult>
}

/** A private review target overlays one exact Draft revision without changing source lifecycle or approval obligations. */
export interface AttendanceOverrideProposal {
	id: string
	revision: number
	employmentId: string
	workDate: string
}
