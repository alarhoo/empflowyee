import type {
	AuthenticatedHcmContext,
	HcmWorkloadContext,
} from '@empflowyee/hcm-api-runtime-application'
import type {
	WorkflowSource,
	WorkflowActionCommand,
	WorkflowActionResult,
	WorkflowAttemptView,
	WorkflowDecisionOutcome,
} from '@empflowyee/hcm-workflow-contract'

/** Private source intent; encrypted at rest and never projected into task lists, audit or outbox payloads. */
export interface WorkflowSourceActionIntent {
	dispatchKey: string
	intentDigest: string
	source: WorkflowSource
	caseId: string
	slotId: string
	actorAccountId: string
	expectedCaseRevision: number
	expectedSlotRevision: number
	expectedSubjectRevision: number
	generation: number
	action: 'Approve' | 'Reject'
	reason: string
}
/** Source-owned immutable receipt, bound to the exact original intent rather than a task's claimed status. */
export interface WorkflowSourceActionReceipt {
	id: string
	dispatchKey: string
	intentDigest: string
	caseId: string
	slotId: string
	actorAccountId: string
	generation: number
	outcome: WorkflowDecisionOutcome
	caseRevision: number
	subjectRevision: number
	decisionId: string | null
	safeFailureCode: string | null
}
export interface WorkflowSourceActionPort {
	/** Recheck source-owned read visibility for recovered attempts, including already decided source cases. */
	authorizeRead(context: AuthenticatedHcmContext, caseId: string): Promise<void>
	/** Recheck current source visibility/action permission, whole-grant scope and candidate before online intent admission. */
	authorize(
		context: AuthenticatedHcmContext,
		caseId: string,
		slotId: string,
	): Promise<{ permission: string; scopeReference: string }>
	/** Query an already committed result by its original key before retry, without extending the requesting human's expiry. */
	query(
		context: HcmWorkloadContext,
		intent: WorkflowSourceActionIntent,
	): Promise<WorkflowSourceActionReceipt | null>
	/** Apply the source's own rules, rechecking current human authority and writing its immutable receipt atomically. */
	decide(
		context: HcmWorkloadContext,
		authorityReference: string,
		intent: WorkflowSourceActionIntent,
	): Promise<WorkflowSourceActionReceipt>
}
export abstract class WorkflowSourceActionBinder {
	/** Select an explicitly registered source adapter in the existing verified transaction. */
	abstract bind(
		transaction: unknown,
		tenantId: string,
		source: WorkflowSource,
	): WorkflowSourceActionPort
}
export interface WorkflowActionPort {
	/** Admit an owning app's source-slot action without exposing Workflow persistence or accepting a browser task identity. */
	submitSlot(
		context: AuthenticatedHcmContext,
		source: WorkflowSource,
		caseId: string,
		slotId: string,
		key: string,
		input: Omit<WorkflowActionCommand, 'expectedRevision'>,
	): Promise<WorkflowActionResult>
	/** Recover this actor's attempt by the original source-app command key under fresh source visibility. */
	readKey(
		context: AuthenticatedHcmContext,
		source: WorkflowSource,
		key: string,
	): Promise<{ caseId: string; attempt: WorkflowAttemptView }>
	/** Admit a source-authorized action and durable dispatch; this result never claims the source has approved. */
	submit(
		context: AuthenticatedHcmContext,
		taskId: string,
		key: string,
		input: WorkflowActionCommand,
	): Promise<WorkflowActionResult>
	/** Recover a safe attempt only after fresh source-owned authorization. */
	read(context: AuthenticatedHcmContext, attemptId: string): Promise<WorkflowAttemptView>
}
export abstract class WorkflowActionBinder {
	/** Reuse the source app's already authorized transaction, never manufacture an online session for a worker. */
	abstract bind(transaction: unknown, tenantId: string): WorkflowActionPort
}
