export interface WorkforceApprovalRouting {
	beneficiaryPersonId: string
	managerPersonId: string | null
	digest: string
}
export interface WorkforceApprovalRoutingPort {
	/** Resolve one employment's beneficiary and exact manager level as of the source-selected current business date; ambiguous or cyclic routing is unavailable. */
	read(
		employmentId: string,
		asOf: string,
		managerLevel: number | null,
	): Promise<WorkforceApprovalRouting | null>
}
export abstract class WorkforceApprovalRoutingBinder {
	/** Bind to the source-owned verified transaction without manufacturing a human actor. */
	abstract bind(transaction: unknown, tenantId: string): WorkforceApprovalRoutingPort
}
