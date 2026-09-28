import type {
	AttendancePolicyVersionView,
	HolidayVersionView,
	ScheduleVersionView,
} from '@empflowyee/hcm-attendance-contract'
import {
	selectAttendanceConfiguration,
	type AttendanceEmploymentScope,
	type DatedConfigurationAssignment,
} from '@empflowyee/hcm-api-attendance-domain'
import { commandHash } from '@empflowyee/hcm-api-runtime-application'
import { dateValue, idValue } from '@empflowyee/hcm-runtime-contract'
import type {
	WorkforceTimeContext,
	WorkforceTimeContextPort,
	WorkforceTimeUnavailableReason,
} from '@empflowyee/hcm-api-workforce-foundation-application'

export interface AttendanceConfigurationVersions {
	Schedule: ScheduleVersionView
	Policy: AttendancePolicyVersionView
	Holiday: HolidayVersionView
}
export type AttendanceConfigurationFamily = keyof AttendanceConfigurationVersions

export interface AttendanceConfigurationInputRepository {
	/** Read only the selected employment's matching published assignments; preserve ties for domain rejection. */
	matching(
		family: AttendanceConfigurationFamily,
		workDate: string,
		scope: AttendanceEmploymentScope,
	): Promise<DatedConfigurationAssignment[]>
	/** Project an exact version within the bound tenant; never substitute the latest root version. */
	version<Family extends AttendanceConfigurationFamily>(
		family: Family,
		versionId: string,
	): Promise<AttendanceConfigurationVersions[Family] | null>
}

export type AttendanceConfigurationInput<Family extends AttendanceConfigurationFamily> =
	| {
		state: 'Available'
		family: Family
		workforce: WorkforceTimeContext
		assignment: DatedConfigurationAssignment
		version: AttendanceConfigurationVersions[Family]
		digest: string
	}
	| {
		state: 'Unavailable'
		family: Family
		reason:
				| WorkforceTimeUnavailableReason
				| 'MissingConfiguration'
				| 'EqualPrecedenceConflict'
				| 'ConfigurationUnavailable'
	}

export interface AttendanceConfigurationInputPort {
	/** Load one family for one employment/date under caller-owned current human/workload authority. This is input evidence, not a published workday. */
	read<Family extends AttendanceConfigurationFamily>(
		family: Family,
		employmentId: string,
		workDate: string,
	): Promise<AttendanceConfigurationInput<Family>>
}
export abstract class AttendanceConfigurationInputBinder {
	/** Bind to the caller's verified tenant transaction and lock boundary; this port never creates authority. */
	abstract bind(transaction: unknown, tenantId: string): AttendanceConfigurationInputPort
}

/** Compose Workforce facts and Attendance selection without introducing persistence or HTTP into application behavior. */
export class AttendanceConfigurationInputs implements AttendanceConfigurationInputPort {
	/** The composition root binds both owner ports to the same already authorized transaction. */
	constructor(
		private readonly tenantId: string,
		private readonly workforce: WorkforceTimeContextPort,
		private readonly configurations: AttendanceConfigurationInputRepository,
	) {}

	/** Preserve explicit missing/conflicting inputs and hash every eligible assignment plus the exact selected source. */
	async read<Family extends AttendanceConfigurationFamily>(
		family: Family,
		employmentId: string,
		workDate: string,
	): Promise<AttendanceConfigurationInput<Family>> {
		idValue(employmentId, 'employmentId')
		dateValue(workDate, 'workDate')
		if (!['Schedule', 'Policy', 'Holiday'].includes(family))
			throw new Error('Unsupported attendance configuration family')
		const facts = await this.workforce.read(employmentId, workDate)
		if (facts.state === 'Unavailable') return { state: 'Unavailable', family, reason: facts.reason }
		const workforce = facts.context
		const assignments = await this.configurations.matching(family, workDate, workforce)
		const selected = selectAttendanceConfiguration(workDate, workforce, assignments)
		if (selected.state === 'Unavailable')
			return { state: 'Unavailable', family, reason: selected.reason }
		const version = await this.configurations.version(family, selected.assignment.versionId)
		if (
			!version ||
			version.state !== 'Published' ||
			version.effectiveFrom > workDate ||
			(version.effectiveTo !== undefined && version.effectiveTo < workDate) ||
			('isTemplate' in version && version.isTemplate)
		)
			return { state: 'Unavailable', family, reason: 'ConfigurationUnavailable' }
		const ordered = [...assignments].sort(
			/** Make dependency evidence independent of adapter row order. */ (left, right) => {
				if (left.id === right.id) return 0
				return left.id < right.id ? -1 : 1
			},
		)
		const digest = commandHash('AttendanceConfigurationInput', {
			tenantId: this.tenantId,
			family,
			workforceDigest: workforce.inputDigest,
			assignments: ordered,
			version,
		})
		return {
			state: 'Available',
			family,
			workforce,
			assignment: selected.assignment,
			version,
			digest,
		}
	}
}
