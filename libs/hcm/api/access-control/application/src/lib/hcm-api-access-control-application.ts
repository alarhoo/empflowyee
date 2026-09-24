/** Stable failures transported as safe codes, never database diagnostics. */
export class HcmAccessError extends Error {
	/** Preserve a reviewed failure classification for the transport boundary. */
	constructor(
		readonly code: 'unauthenticated' | 'forbidden' | 'tenant-suspended' | 'protected-access',
	) {
		super(code)
	}
}
export interface HcmAccessRequirement {
	permission: string
	entitlement: string
}
export interface HcmBusinessActor {
	readonly tenantId: string
	readonly accountId: string
	readonly personId: string | null
}
export interface AccessPolicy {
	/** Require the current persisted grant and independent entitlement in the caller's transaction. */
	require(requirement: HcmAccessRequirement): Promise<HcmBusinessActor>
}
export interface AccountAccessInvariant {
	/** Reject a mutation which would leave no enabled protected administrator. */
	requireProtectedAdministrator(): Promise<void>
}
