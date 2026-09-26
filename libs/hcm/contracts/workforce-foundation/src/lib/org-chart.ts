import {
	HcmDomainError,
	idValue,
	readListQuery,
	type HcmPage,
} from '@empflowyee/hcm-runtime-contract'

/**
 * One assignment in the reporting hierarchy. Person fields are present only when their effective
 * visibility is Organization for that worker; an absent field is omitted, never null.
 */
export interface OrgChartNodeDto {
	assignmentId: string
	workerId: string
	/** Omitted when the tenant keeps display names from the whole organisation. */
	displayName?: string
	designation?: string
	organisationUnit?: string
	location?: string
	directReportCount: number
	/** Present only when the worker has several current assignments. */
	concurrentContextLabel: string | null
}
export type OrgChartPage = HcmPage<OrgChartNodeDto>

/** The manager of a node, as a link target. */
export interface OrgChartManagerDto {
	assignmentId: string
	displayName?: string
}

/** A node with the organisation-visible details permitted by the field policy. */
export interface OrgChartPersonDto extends OrgChartNodeDto {
	workerNumber?: string
	department?: string
	workEmail?: string
	manager?: OrgChartManagerDto | null
}

export interface OrgChartQuery {
	limit: number
	cursor?: string
}
export interface OrgChartSearchQuery extends OrgChartQuery {
	q: string
}

export const ORG_CHART_CHILD_PAGE = 50
export const ORG_CHART_SEARCH_PAGE = 25

/** Parse a roots or reports page: cursor and limit only, default 50. */
export function parseOrgChartQuery(params: URLSearchParams): OrgChartQuery {
	const query = readListQuery(params, ['displayName:asc'])
	if (query.q) throw new HcmDomainError('invalid-request', [{ field: 'q', code: 'unknown' }])
	const limit = params.has('limit') ? query.limit : ORG_CHART_CHILD_PAGE
	return { limit, ...(query.cursor ? { cursor: query.cursor } : {}) }
}

/** Parse a search: q of 2–200 characters over names and worker number prefix. */
export function parseOrgChartSearch(params: URLSearchParams): OrgChartSearchQuery {
	const query = readListQuery(params, ['displayName:asc'])
	const q = query.q.trim()
	if (q.length < 2 || q.length > 200)
		throw new HcmDomainError('invalid-request', [{ field: 'q', code: 'length' }])
	const limit = params.has('limit') ? query.limit : ORG_CHART_SEARCH_PAGE
	return { q, limit, ...(query.cursor ? { cursor: query.cursor } : {}) }
}

/** Parse an assignment path segment. */
export function parseAssignmentId(value: string): string {
	return idValue(value, 'assignmentId')
}
