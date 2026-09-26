import {
	enumValue,
	idValue,
	invalidField,
	readListQuery,
	type HcmPage,
} from '@empflowyee/hcm-runtime-contract'

/**
 * A directory entry. Every field is present only when the viewer's relation may see it for that
 * worker after tenant policy and allowed preferences; an absent field is omitted, never null.
 */
export interface DirectoryEntryDto {
	workerId: string
	displayName?: string
	preferredName?: string
	designation?: string
	department?: string
	location?: string
	workEmail?: string
}
export type DirectoryPage = HcmPage<DirectoryEntryDto>

/** A link to another directory entry. */
export interface DirectoryLinkDto {
	workerId: string
	displayName?: string
}

/** One current assignment; concurrent assignments are listed explicitly. */
export interface DirectoryAssignmentDto {
	assignmentId: string
	primary: boolean
	designation?: string
	organisationUnit?: string
	department?: string
	location?: string
	legalEntity?: string
}

/** A colleague with the details and reporting context the viewer may see. */
export interface DirectoryPersonDto extends DirectoryEntryDto {
	workerNumber?: string
	organisationUnit?: string
	manager?: DirectoryLinkDto | null
	directReportCount: number
	assignments: DirectoryAssignmentDto[]
}

export interface DirectoryOptionDto {
	id: string
	name: string
}
export type DirectoryOptionPage = HcmPage<DirectoryOptionDto>

export const DIRECTORY_OPTION_KINDS = ['units', 'departments', 'locations', 'designations'] as const
export type DirectoryOptionKindKey = (typeof DIRECTORY_OPTION_KINDS)[number]

export interface DirectoryQuery {
	q: string
	limit: number
	cursor?: string
	descending: boolean
	unitId?: string
	departmentId?: string
	locationId?: string
	designationId?: string
}

/** Parse a directory search: q, name sort and structure filters. */
export function parseDirectoryQuery(params: URLSearchParams): DirectoryQuery {
	const query = readListQuery(
		params,
		['name:asc', 'name:desc'],
		['unitId', 'departmentId', 'locationId', 'designationId'],
	)
	const filters: Partial<DirectoryQuery> = {}
	for (const key of ['unitId', 'departmentId', 'locationId', 'designationId'] as const) {
		const value = query.filters[key]
		if (value !== undefined) filters[key] = idValue(value, key)
	}
	return {
		q: query.q,
		limit: query.limit,
		descending: query.sort === 'name:desc',
		...(query.cursor ? { cursor: query.cursor } : {}),
		...filters,
	}
}

/** Parse a reports page: cursor and limit only. */
export function parseDirectoryReportsQuery(params: URLSearchParams): DirectoryQuery {
	const query = readListQuery(params, ['name:asc'])
	if (query.q) invalidField('q', 'unknown')
	return {
		q: '',
		limit: query.limit,
		descending: false,
		...(query.cursor ? { cursor: query.cursor } : {}),
	}
}

/** Parse an option kind path segment. */
export function parseDirectoryOptionKind(value: string): DirectoryOptionKindKey {
	return enumValue(value, 'kind', DIRECTORY_OPTION_KINDS)
}

/** Parse an option lookup: q, limit and cursor. */
export function parseDirectoryOptionQuery(params: URLSearchParams): {
	q: string
	limit: number
	cursor?: string
} {
	const query = readListQuery(params, ['name:asc'])
	return { q: query.q, limit: query.limit, ...(query.cursor ? { cursor: query.cursor } : {}) }
}

/** Parse a worker path segment. */
export function parseWorkerId(value: string): string {
	return idValue(value, 'workerId')
}
