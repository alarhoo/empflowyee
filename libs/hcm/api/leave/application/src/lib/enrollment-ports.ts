import type {
	LeaveEnrollmentView,
	LeavePeriodView,
	LeaveTrackingMode,
	LeaveUnit,
} from '@empflowyee/hcm-leave-contract'

/** Immutable references to the owner's dated eligibility evaluation, encrypted at rest by infrastructure. */
export interface LeaveEnrollmentBasis {
	schemaVersion: 1
	policyRevision: number
	periodRevision: number
	workforceDates: readonly { workDate: string; inputDigest: string }[]
	matchingRuleIds: readonly string[]
}
export interface LeaveEnrollmentAdmission {
	id: string
	employmentId: string
	policyId: string
	policyVersionId: string
	periodId: string
	effectiveFrom: string
	effectiveTo: string
	trackingMode: LeaveTrackingMode
	unit: LeaveUnit
	basis: LeaveEnrollmentBasis
}
export interface LeaveEnrollmentRepository {
	/** Read the explicit configured period at the requested date; absence is never an implied open period. */
	periodAt(workDate: string): Promise<LeavePeriodView | null>
	/** Read one enrollment under the caller's current subject authorization. */
	read(id: string): Promise<LeaveEnrollmentView | null>
	/** Persist a fully authorized and revalidated admission with an empty account only for Balance tracking. */
	insert(input: LeaveEnrollmentAdmission): Promise<LeaveEnrollmentView>
}
