import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'
import {
	parseHolidayReferenceQuery,
	type HolidayReferenceOptions,
	type HolidayEmploymentOptions,
	type HolidayReferenceKind,
	type HolidayAssignmentOptions,
} from '@empflowyee/hcm-attendance-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import { AttendanceHolidayUnitOfWork } from './holiday-commands'

export interface HolidayReferencePort {
	/** Return only names and codes required by this configuration picker. */
	options(kind: HolidayReferenceKind, q: string, asOf: string): Promise<HolidayReferenceOptions>
	/** Keep concurrent employments distinct without exposing unrelated HR facts. */
	employments(workerId: string, asOf: string): Promise<HolidayEmploymentOptions>
	/** Project only dated assignment selectors needed to choose one explicit scope. */
	assignmentOptions(workerId: string, asOf: string): Promise<HolidayAssignmentOptions>
}

/** Reference choices use the same operation authority as the calendar action that consumes them. */
export class AttendanceHolidayReferences {
	/** Keep Workforce persistence and HTTP outside application behavior. */
	constructor(private readonly unit: AttendanceHolidayUnitOfWork) {}
	/** Supply minimal structure references under independent calendar read authority. */
	assignmentReferences(context: AuthenticatedHcmContext, kind: string, params: URLSearchParams) {
		if (!['workers', 'locations', 'legal-entities', 'units', 'departments'].includes(kind))
			throw new HcmDomainError('not-found')
		const query = parseHolidayReferenceQuery(params)
		return this.unit.execute(
			context,
			'read',
			false,
			/** Authorize reference enumeration before source reads. */ (work) => {
				if (!work.references) throw new HcmDomainError('record-incomplete')
				return work.references.options(kind as HolidayReferenceKind, query.q, query.asOf)
			},
		)
	}
	/** Keep employment and effective assignment identity distinct during assignment selection. */
	assignmentContext(context: AuthenticatedHcmContext, workerId: string, params: URLSearchParams) {
		idValue(workerId, 'workerId')
		const query = parseHolidayReferenceQuery(params)
		return this.unit.execute(
			context,
			'read',
			false,
			/** Do not grant private Employee Changes access through a selector. */ (work) => {
				if (!work.references) throw new HcmDomainError('record-incomplete')
				return work.references.assignmentOptions(workerId, query.asOf)
			},
		)
	}
	/** Search at most 100 owned references; excess matches require a narrower search. */
	options(context: AuthenticatedHcmContext, kind: string, params: URLSearchParams) {
		if (kind !== 'workers' && kind !== 'locations') throw new HcmDomainError('not-found')
		const query = parseHolidayReferenceQuery(params)
		return this.unit.execute(
			context,
			kind === 'workers' ? 'preview' : 'draft',
			false,
			/** Authorize before resolving or counting reference rows. */ (work) => {
				if (!work.references) throw new HcmDomainError('record-incomplete')
				return work.references.options(kind, query.q, query.asOf)
			},
		)
	}
	/** Read only the selected worker's employment identities and legal-entity labels. */
	employments(context: AuthenticatedHcmContext, workerId: string, params: URLSearchParams) {
		idValue(workerId, 'workerId')
		const query = parseHolidayReferenceQuery(params)
		return this.unit.execute(
			context,
			'preview',
			false,
			/** The calendar permission grants no Employee Changes operation. */ (work) => {
				if (!work.references) throw new HcmDomainError('record-incomplete')
				return work.references.employments(workerId, query.asOf)
			},
		)
	}
}
