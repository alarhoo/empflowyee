import type { HcmScopeSubject } from './grant-scope'

/** Current discovery requirements supplied by a source owner, never by an unauthenticated browser. */
export interface ApprovalCandidateQuery {
	permission: string
	entitlement: string
	subjects: readonly HcmScopeSubject[]
	accountIds?: readonly string[]
	personIds?: readonly string[]
	excludedAccountIds: readonly string[]
}
export interface ApprovalCandidateResult {
	accountIds: string[]
	digest: string
}
export interface ApprovalCandidatePort {
	/** Discover enabled accounts with one complete current grant across every subject; this does not issue action authority. */
	discover(query: ApprovalCandidateQuery): Promise<ApprovalCandidateResult>
	/** Resolve all linked accounts for beneficiary exclusion, including disabled accounts, without exposing personal fields. */
	accountsForPerson(personId: string): Promise<string[]>
}
export abstract class ApprovalCandidateBinder {
	/** Reuse the source's live tenant transaction; no synthetic authenticated actor is created. */
	abstract bind(transaction: unknown, tenantId: string): ApprovalCandidatePort
}
