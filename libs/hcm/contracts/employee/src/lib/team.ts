import { enumValue, idValue, readListQuery, type HcmPage } from '@empflowyee/hcm-runtime-contract'
import type { DirectoryAssignmentDto } from './directory'

export const PROBATION_STATUSES = [
	'NotApplicable',
	'InProgress',
	'Confirmed',
	'Extended',
	'Failed',
] as const
export type ProbationStatusKey = (typeof PROBATION_STATUSES)[number]

/**
 * A team member in a manager's list. Fields are present only when their effective visibility
 * includes Manager for that worker; personal and sensitive data never is.
 */
export interface TeamMemberSummaryDto {
	workerId: string
	displayName?: string
	preferredName?: string
	designation?: string
	location?: string
	employmentStatus?: string
	probationStatus?: ProbationStatusKey
}
export type TeamPage = HcmPage<TeamMemberSummaryDto>

/** A team member with the placement, employment and probation facts a manager may see. */
export interface TeamMemberDto extends TeamMemberSummaryDto {
	workerNumber?: string
	workEmail?: string
	department?: string
	organisationUnit?: string
	legalEntity?: string
	workerType?: string
	employmentType?: string
	hireDate?: string
	continuousServiceStartDate?: string
	probationEndDate?: string
	noticePeriodDays?: number
	workMode?: string
	fullTimeEquivalent?: number
	standardHoursPerWeek?: number
	costCentre?: string
	assignments: DirectoryAssignmentDto[]
}

export interface TeamQuery {
	q: string
	limit: number
	cursor?: string
	locationId?: string
	probationStatus?: ProbationStatusKey
}

/** Parse a team list query: q on names, location and probation filters. */
export function parseTeamQuery(params: URLSearchParams): TeamQuery {
	const query = readListQuery(params, ['name:asc'], ['locationId', 'probationStatus'])
	const location = query.filters['locationId']
	const probation = query.filters['probationStatus']
	return {
		q: query.q,
		limit: query.limit,
		...(query.cursor ? { cursor: query.cursor } : {}),
		...(location !== undefined ? { locationId: idValue(location, 'locationId') } : {}),
		...(probation !== undefined
			? { probationStatus: enumValue(probation, 'probationStatus', PROBATION_STATUSES) }
			: {}),
	}
}
