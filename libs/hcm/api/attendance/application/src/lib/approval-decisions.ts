import {
	parseAttendanceDecision,
	type AttendanceDecisionCommand,
	type AttendanceApprovalCaseView,
} from '@empflowyee/hcm-attendance-contract'
import type { WorkflowActionResult, WorkflowAttemptView } from '@empflowyee/hcm-workflow-contract'
import {
	requireIdempotencyKey,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import { idValue } from '@empflowyee/hcm-runtime-contract'

export abstract class AttendanceApprovalPort {
	/** Read the current source graph after its independent dated read grant. */
	abstract read(
		context: AuthenticatedHcmContext,
		caseId: string,
	): Promise<AttendanceApprovalCaseView>
	/** Admit a durable Workflow intent; this response does not claim a source decision. */
	abstract decide(
		context: AuthenticatedHcmContext,
		caseId: string,
		slotId: string,
		key: string,
		input: AttendanceDecisionCommand,
	): Promise<WorkflowActionResult>
	/** Recover the original actor's safe attempt under fresh source read authority. */
	abstract receipt(context: AuthenticatedHcmContext, key: string): Promise<WorkflowAttemptView>
}

/** Keep source route validation separate from owner persistence and coordination adapters. */
export class AttendanceApprovalDecisions {
	/** Bind the existing source transaction port without importing HTTP or SQL. */
	constructor(private readonly port: AttendanceApprovalPort) {}
	/** Validate exact source identity before its scoped projection. */
	read(context: AuthenticatedHcmContext, caseId: string) {
		return this.port.read(context, idValue(caseId, 'caseId'))
	}
	/** Retain the original actor key and source revisions across uncertain submissions. */
	decide(
		context: AuthenticatedHcmContext,
		caseId: string,
		slotId: string,
		key: string,
		value: unknown,
	) {
		idValue(caseId, 'caseId')
		idValue(slotId, 'slotId')
		requireIdempotencyKey(key)
		return this.port.decide(context, caseId, slotId, key, parseAttendanceDecision(value))
	}
	/** A read never creates or retries a new decision. */
	receipt(context: AuthenticatedHcmContext, key: string) {
		requireIdempotencyKey(key)
		return this.port.receipt(context, key)
	}
}
