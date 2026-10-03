import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'
import {
	parseHolidayReferenceQuery,
	type HolidayReferenceKind,
} from '@empflowyee/hcm-attendance-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import { WorkConfigurationUnitOfWork } from './work-configuration-drafts'

/** Minimal Workforce selectors retain Work Schedules authority independently of Holiday Calendars. */
export class AttendanceWorkReferences {
	/** Bind selectors to the source app's current-authority transaction. */
	constructor(private readonly unit: WorkConfigurationUnitOfWork) {}
	/** Search only admitted names and codes with a bounded dated query. */
	options(context: AuthenticatedHcmContext, kind: string, params: URLSearchParams) {
		if (!['workers', 'locations', 'legal-entities', 'units', 'departments'].includes(kind))
			throw new HcmDomainError('not-found')
		const query = parseHolidayReferenceQuery(params)
		return this.unit.execute(
			context,
			'Policy',
			'read',
			false,
			/** Authorize before enumerating any owned reference. */ async (work) => {
				if (!work.references) throw new HcmDomainError('record-incomplete')
				return work.references.options(kind as HolidayReferenceKind, query.q, query.asOf)
			},
		)
	}
	/** Return explicit employments and effective assignment labels for one selected worker. */
	context(context: AuthenticatedHcmContext, worker: string, params: URLSearchParams) {
		idValue(worker, 'workerId')
		const query = parseHolidayReferenceQuery(params)
		return this.unit.execute(
			context,
			'Policy',
			'read',
			false,
			/** Do not expose private Employee Changes payloads through this selector. */ async (
				work,
			) => {
				if (!work.references) throw new HcmDomainError('record-incomplete')
				return work.references.assignmentOptions(worker, query.asOf)
			},
		)
	}
}
