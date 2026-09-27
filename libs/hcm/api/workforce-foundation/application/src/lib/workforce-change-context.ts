import type { EmploymentStatus, EmploymentType, WorkMode } from './workforce-ports'

/**
 * Current employment and assignment facts of one worker for Employment Changes (TDD#READ), with
 * the revisions a change request records so execution can detect drift. Incomplete rows are
 * included and marked, because a Correction may establish them.
 */
export interface ChangeReference {
	id: string
	name: string
}

export interface ChangeContextEmployment {
	employmentId: string
	revision: number
	primary: boolean
	sequence: number | null
	legalEntity: ChangeReference | null
	employmentType: EmploymentType | null
	employmentStatus: EmploymentStatus | null
	hireDate: string | null
	endDate: string | null
	continuousServiceStartDate: string | null
	probationEndDate: string | null
	noticePeriodDays: number | null
	eligibleForRehire: boolean | null
	/** Whether the employment has its established facts. */
	established: boolean
}

export interface ChangeContextAssignment {
	assignmentId: string
	employmentId: string
	revision: number
	primary: boolean
	/** Null for an incomplete assignment that has no period yet. */
	effectiveFrom: string | null
	effectiveTo: string | null
	unit: ChangeReference | null
	department: ChangeReference | null
	designation: ChangeReference | null
	location: ChangeReference | null
	position: ChangeReference | null
	jobTitle: string
	workMode: WorkMode | null
	fullTimeEquivalent: number | null
	standardHoursPerWeek: number | null
	costCenterCode: string
	/** The primary solid manager on the date, by the manager's assignment. */
	manager: (ChangeReference & { assignmentId: string }) | null
}

export interface WorkerChangeContext {
	workerId: string
	personId: string
	displayName: string
	workerNumber: string
	workerType: ChangeReference | null
	employments: ChangeContextEmployment[]
	/** Assignments open on or after the date, and incomplete ones, oldest first. */
	assignments: ChangeContextAssignment[]
}

/** A locked assignment; `open` means neither closed nor superseded. */
export interface AssignmentLock {
	employmentId: string
	revision: number
	established: boolean
	open: boolean
}

/** Reads the facts a change request is based on, inside the caller's transaction. */
export interface WorkforceChangeContextPort {
	/** A worker's current facts on a date; merged-away workers are not returned. */
	context(workerId: string, asOf: string): Promise<WorkerChangeContext | undefined>
	/** Lock an employment and return its revision and worker. */
	lockEmployment(
		employmentId: string,
	): Promise<{ workerId: string; revision: number; established: boolean } | undefined>
	/** Lock an assignment and return its revision, employment and whether it is still open. */
	lockAssignment(assignmentId: string): Promise<AssignmentLock | undefined>
	/** The primary assignment of a worker effective on a date, for a manager line. */
	primaryAssignment(workerId: string, asOf: string): Promise<string | undefined>
	/** The worker holding an assignment. */
	assignmentWorker(assignmentId: string): Promise<string | undefined>
}
