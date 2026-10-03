import type { LeavePolicyDraft, LeavePolicyVersionView } from '@empflowyee/hcm-leave-contract'

export interface LeavePolicyVersionInsert {
	id: string
	policyId: string
	version: number
	supersedesId: string | null
	draft: LeavePolicyDraft
}
export interface LeavePolicyRepository {
	/** Read the exact version as a safe contract, never substituting a different policy. */
	read(policyId: string, versionId: string): Promise<LeavePolicyVersionView | null>
	/** Lock the selected version before rechecking revision and state. */
	lock(policyId: string, versionId: string): Promise<LeavePolicyVersionView | null>
	/** Create a stable policy/type/unit identity in the current authorized transaction. */
	createPolicy(id: string, draft: LeavePolicyDraft): Promise<void>
	/** Allocate an ordinal while holding the stable policy identity lock. */
	nextVersion(policyId: string): Promise<number>
	/** Store a draft with all typed rules atomically. */
	insertVersion(input: LeavePolicyVersionInsert): Promise<void>
	/** Replace a draft only at its current revision without changing its immutable identity. */
	replace(
		policyId: string,
		versionId: string,
		revision: number,
		draft: LeavePolicyDraft,
	): Promise<void>
}
