import type { HcmPage } from '@empflowyee/hcm-runtime-contract'
import type {
	ChangeListQuery,
	ChangeStatus,
	ChangeTargets,
	ChangeType,
	TargetField,
} from '@empflowyee/hcm-employee-contract'

/** A stored change request with its requester and worker names. */
export interface ChangeRequestRow {
	id: string
	workerId: string
	workerName: string
	workerNumber: string
	employmentId: string | null
	assignmentId: string | null
	changeType: ChangeType
	effectiveDate: string
	expectedEmploymentRevision: number | null
	expectedAssignmentRevision: number | null
	/** Stored targets; the manager is the manager's assignment, not their worker. */
	targets: Omit<ChangeTargets, 'managerWorkerId'> & { managerAssignmentId?: string | null }
	reasonCode: string
	reasonDetail: string
	evidenceReference: string
	status: ChangeStatus
	approvalPolicyCode: string | null
	approvalPolicyVersion: number | null
	requestedBy: string
	requestedByAccountId: string
	requestedAt: string
	submittedAt: string | null
	approvedAt: string | null
	completedAt: string | null
	cancelledAt: string | null
	cancelReason: string | null
	failureCode: string | null
	resultEmploymentId: string | null
	resultAssignmentId: string | null
	revision: number
}

export interface ChangeApprovalRow {
	slotCode: string
	decision: 'Approved' | 'Rejected'
	decidedBy: string
	decidedByAccountId: string
	reason: string
	decidedAt: string
}

export interface ChangeStepRow {
	stepCode: string
	sequence: number
	attempt: number
	status: 'Succeeded' | 'Failed' | 'Skipped'
	completedAt: string | null
	failureCode: string | null
}

/** A step to record for one execution attempt. */
export interface ChangeStepInput {
	stepCode: string
	status: 'Succeeded' | 'Failed' | 'Skipped'
	inputHash: string
	resultEntityType: 'employment' | 'assignment' | 'reporting_line' | 'worker_event' | null
	resultEntityId: string | null
	failureCode: string | null
}

/** Facts a new or edited request stores. */
export interface ChangeRequestInput {
	workerId: string
	employmentId: string | null
	assignmentId: string | null
	changeType: ChangeType
	effectiveDate: string
	expectedEmploymentRevision: number | null
	expectedAssignmentRevision: number | null
	targets: ChangeRequestRow['targets']
	cleared: TargetField[]
	reasonCode: string
	reasonDetail: string
	evidenceReference: string
	idempotencyKey: string
}

/** Status and timestamps a transition sets; omitted properties keep their value. */
export interface ChangeTransition {
	status: ChangeStatus
	approvalPolicy?: { code: string; version: number }
	submitted?: boolean
	approved?: boolean
	completed?: boolean
	cancelReason?: string
	failureCode?: string | null
	resultEmploymentId?: string
	resultAssignmentId?: string
}

/** Employee-owned change request persistence in the caller's transaction. */
export interface EmploymentChangeRepository {
	/** A page of requests for a view; `approver` enables the awaiting view. */
	list(
		query: ChangeListQuery,
		actorAccountId: string,
		approver: boolean,
	): Promise<HcmPage<ChangeRequestRow & { currentSlot: string | null }>>
	/** One request, optionally locked for a command. */
	get(id: string, lock?: boolean): Promise<ChangeRequestRow | undefined>
	approvals(id: string): Promise<ChangeApprovalRow[]>
	steps(id: string): Promise<ChangeStepRow[]>
	insert(input: ChangeRequestInput): Promise<string>
	/** Replace a draft's facts. */
	update(
		id: string,
		input: Omit<
			ChangeRequestInput,
			'workerId' | 'employmentId' | 'assignmentId' | 'changeType' | 'idempotencyKey'
		>,
	): Promise<void>
	transition(id: string, change: ChangeTransition): Promise<void>
	insertApproval(
		id: string,
		approval: {
			slotCode: string
			decision: 'Approved' | 'Rejected'
			authorityCode: string
			reason: string
		},
	): Promise<void>
	/** Record the steps of one execution attempt and return the attempt number. */
	insertSteps(id: string, steps: ChangeStepInput[]): Promise<number>
	/** The worker of a manager assignment and their name. */
	managerOf(assignmentId: string): Promise<{ workerId: string; name: string } | undefined>
	/** Display names of referenced structure rows, by table. */
	names(refs: { table: string; id: string }[]): Promise<Map<string, string>>
	/** Workers for the request wizard, by name or number. */
	workers(
		q: string,
		page: { limit: number; cursor?: string },
	): Promise<HcmPage<{ id: string; code: string; name: string }>>
	/** Positions that are Open on a date, by code or name. */
	positions(
		q: string,
		asOf: string,
		page: { limit: number; cursor?: string },
	): Promise<HcmPage<{ id: string; code: string; name: string }>>
}
