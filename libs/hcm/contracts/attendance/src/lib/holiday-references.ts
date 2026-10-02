import { dateValue, invalidField } from '@empflowyee/hcm-runtime-contract'

export interface HolidayReferenceOption {
	id: string
	code: string
	name: string
}
export interface HolidayReferenceOptions {
	items: HolidayReferenceOption[]
	hasMore: boolean
}
export interface HolidayEmploymentOptions {
	employments: { employmentId: string; legalEntityName: string | null }[]
}
export type HolidayReferenceKind =
	'workers' | 'locations' | 'legal-entities' | 'units' | 'departments'
export interface HolidayAssignmentOptions extends HolidayEmploymentOptions {
	assignments: { id: string; employmentId: string; name: string }[]
}

/** Validate a bounded reference search; narrowing replaces pagination and never reveals an owner cursor. */
export function parseHolidayReferenceQuery(params: URLSearchParams): { q: string; asOf: string } {
	for (const key of params.keys()) {
		if (!['q', 'asOf'].includes(key)) invalidField(key, 'unknown')
		if (params.getAll(key).length !== 1) invalidField(key, 'duplicate')
	}
	const q = params.get('q') ?? ''
	if (q.length > 120) invalidField('q')
	return { q, asOf: dateValue(params.get('asOf'), 'asOf') }
}
