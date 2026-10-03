import { enumValue, readBody, revisionValue, textValue } from '@empflowyee/hcm-runtime-contract'

export interface WorkflowActionCommand {
	expectedRevision: number
	expectedSourceRevision: number
	expectedSubjectRevision: number
	generation: number
	action: 'Approve' | 'Reject'
	reason: string
}
export interface WorkflowActionResult {
	attemptId: string
	taskId: string
	revision: number
	state: 'ActionPending'
	operationId: string
}
export type WorkflowDecisionOutcome = 'Accepted' | 'Denied' | 'Stale' | 'Conflict' | 'CaseClosed'
export interface WorkflowAttemptView {
	id: string
	taskId: string
	state: 'Pending' | 'Unknown' | WorkflowDecisionOutcome
	sourceReceiptId?: string
	sourceRevision?: number
	safeFailureCode?: string
}

/** Reject browser-supplied actor, authority and source slot fields; those are captured from current server state. */
export function parseWorkflowActionCommand(value: unknown): WorkflowActionCommand {
	const body = readBody(value, [
		'expectedRevision',
		'expectedSourceRevision',
		'expectedSubjectRevision',
		'generation',
		'action',
		'reason',
	])
	return {
		expectedRevision: revisionValue(body['expectedRevision']),
		expectedSourceRevision: revisionValue(body['expectedSourceRevision'], 'expectedSourceRevision'),
		expectedSubjectRevision: revisionValue(
			body['expectedSubjectRevision'],
			'expectedSubjectRevision',
		),
		generation: revisionValue(body['generation'], 'generation'),
		action: enumValue(body['action'], 'action', ['Approve', 'Reject']),
		reason: textValue(body['reason'], 'reason', 2000),
	}
}
