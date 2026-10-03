import type { WorkforceTimeContext, WorkforceTimeUnavailableReason } from './workforce-time-context'

/** Minimal private Leave eligibility basis; gender is never added to general schedule or calendar projections. */
export interface WorkforceLeaveEligibilityContext {
	workforce: WorkforceTimeContext
	personRevision: number
	genderCode: string | null
	inputDigest: string
}
export type WorkforceLeaveEligibilityResult =
	| { state: 'Available'; context: WorkforceLeaveEligibilityContext }
	| { state: 'Unavailable'; reason: WorkforceTimeUnavailableReason }
export interface WorkforceLeaveEligibilityPort {
	/** Read source facts only for the consumer's already-authorized employment/date; no names, documents or other person fields are returned. */
	read(employmentId: string, workDate: string): Promise<WorkforceLeaveEligibilityResult>
}
export abstract class WorkforceLeaveEligibilityBinder {
	/** Bind the current tenant transaction; Leave owns current human/workload authorization and encrypted evidence retention. */
	abstract bind(transaction: unknown, tenantId: string): WorkforceLeaveEligibilityPort
}
