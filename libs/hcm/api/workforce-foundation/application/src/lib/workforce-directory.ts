import type { HcmPage } from '@empflowyee/hcm-runtime-contract'

/** One current assignment of a directory entry. */
export interface DirectoryAssignmentRow {
	assignmentId: string
	isPrimary: boolean
	designation: string | null
	organisationUnit: string | null
	department: string | null
	location: string | null
	legalEntity: string | null
}

/** One engaged worker with a current assignment, before any field policy is applied. */
export interface DirectoryRow {
	workerId: string
	displayName: string
	preferredName: string
	workerCode: string
	workEmail: string | null
	/** Placement of the primary (or first) current assignment. */
	designation: string | null
	organisationUnit: string | null
	department: string | null
	location: string | null
	managerWorkerId: string | null
	managerDisplayName: string | null
	directReportCount: number
	assignments: DirectoryAssignmentRow[]
}

export type DirectoryOptionKind = 'units' | 'departments' | 'locations' | 'designations'

export interface DirectoryOptionRow {
	id: string
	name: string
}

/** Which fields a search may match; built from the caller's allowlist. */
export interface DirectorySearch {
	text: string
	names: boolean
	workEmail: boolean
	workerNumber: boolean
}

export interface DirectoryFilter {
	search?: DirectorySearch
	unitId?: string
	departmentId?: string
	locationId?: string
	designationId?: string
	/** Restrict to these workers, for team views. */
	workerIds?: readonly string[]
	/** Workers whose primary solid line points to one of this worker's current assignments. */
	reportsOf?: string
}

export interface DirectoryPageQuery {
	limit: number
	cursor?: string
	descending: boolean
}

/**
 * Current-workforce projections for the employee directories. Only Active, OnNotice and Suspended
 * employments with an assignment effective on the date are included; Pending and Ended never are.
 */
export interface WorkforceDirectoryPort {
	/** One page of entries sorted by display name then worker id. */
	entries(
		filter: DirectoryFilter,
		asOf: string,
		page: DirectoryPageQuery,
	): Promise<HcmPage<DirectoryRow>>
	/** One entry, or undefined when the worker is not in the current workforce. */
	entry(workerId: string, asOf: string): Promise<DirectoryRow | undefined>
	/** One page of structure options that current workforce placements use. */
	options(
		kind: DirectoryOptionKind,
		q: string,
		asOf: string,
		page: { limit: number; cursor?: string },
	): Promise<HcmPage<DirectoryOptionRow>>
}
