import {
	HcmDomainError,
	readListQuery,
	type HcmListQuery,
	type HcmPage,
} from '@empflowyee/hcm-runtime-contract'

/** Product-maintained reference item such as a country. */
export interface ReferenceItemDto {
	code: string
	name: string
	active: boolean
	sortOrder: number
}

/**
 * One product identification type. The raw validation expression stays server-side; only its
 * product-authored description is serialized, and no person's identifier value is ever included.
 */
export interface IdentificationTypeDto {
	code: string
	name: string
	countryCode: string | null
	validationDescription: string
	uniquePerPerson: boolean
	requiresMasking: boolean
	requiredForPayroll: boolean
	active: boolean
}

export interface IdentificationTypeList {
	items: IdentificationTypeDto[]
}

/** Maximum product catalogue size served in client mode. */
export const IDENTIFICATION_TYPE_LIMIT = 500

/** The catalogue read takes no query; filtering is client-side over the bounded list. */
export function parseIdentificationTypeQuery(params: URLSearchParams): void {
	for (const key of params.keys())
		throw new HcmDomainError('invalid-request', [{ field: key, code: 'unknown' }])
}

/** Parse the issuing-country option query. */
export function parseIdentificationCountryQuery(params: URLSearchParams): HcmListQuery {
	const query = readListQuery(params, ['name:asc'])
	return {
		q: query.q,
		limit: query.limit,
		sort: query.sort,
		...(query.cursor ? { cursor: query.cursor } : {}),
	}
}

export type ReferenceItemPage = HcmPage<ReferenceItemDto>
