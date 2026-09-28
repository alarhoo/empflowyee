import type { EmploymentStatus, EmploymentType } from './workforce-ports'

/** Dated scope facts, kept per assignment so no consumer combines two employments or unrelated scope grants. */
export interface WorkforceTimeAssignment {
	id: string
	revision: number
	isPrimary: boolean
	effectiveFrom: string
	effectiveTo: string | null
	orgUnitId: string
	orgUnitRevision: number
	departmentId: string | null
	departmentRevision: number | null
	locationId: string
	locationRevision: number
	timezone: string
	countryCode: string
	region: string
}

/** Minimal versioned workforce basis for attendance and leave; no personal names, reason narratives or worker-wide employment merge. */
export interface WorkforceTimeContext {
	employmentId: string
	employmentRevision: number
	workerId: string
	workerRevision: number
	workerTypeId: string
	workerTypeRevision: number
	legalEntityId: string
	legalEntityRevision: number
	employmentType: EmploymentType
	employmentStatus: EmploymentStatus
	hireDate: string
	employmentEndDate: string | null
	continuousServiceStartDate: string | null
	workDate: string
	assignments: readonly WorkforceTimeAssignment[]
	inputDigest: string
}

export type WorkforceTimeUnavailableReason =
	| 'employment-unavailable'
	| 'incomplete-facts'
	| 'outside-employment'
	| 'assignment-unavailable'
	| 'timezone-unavailable'

export type WorkforceTimeContextResult =
	| { state: 'Available'; context: WorkforceTimeContext }
	| { state: 'Unavailable'; reason: WorkforceTimeUnavailableReason }

export interface WorkforceTimeContextPort {
	/** Read one employment's authoritative facts for a real local work date in the caller's already authorized tenant transaction. */
	read(employmentId: string, workDate: string): Promise<WorkforceTimeContextResult>
}

/** Read-only binding shared by human commands and approved workloads; this port never creates authority or a fake account. */
export abstract class WorkforceTimeContextBinder {
	/** Bind the caller's live tenant transaction; the consuming source owns its human permission/scope or workload checks. */
	abstract bind(transaction: unknown, tenantId: string): WorkforceTimeContextPort
}
