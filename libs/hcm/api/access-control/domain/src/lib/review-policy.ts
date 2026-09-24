import {
	ReviewError,
	type ReviewSummary,
	type ReviewItem,
} from '@empflowyee/hcm-access-control-contract'
/** Closed reviews are immutable; optimistic revisions are compared at the entity being changed. */
export function requireOpenReview(review: ReviewSummary): void {
	if (review.status !== 'Open') throw new ReviewError('closed-review')
}
/** Reject stale browser commands before deciding or replacing any snapshot. */
export function requireReviewRevision(current: number, expected: number): void {
	if (current !== expected) throw new ReviewError('revision-conflict')
}
/** Only current pending evidence can receive a retain/revoke decision. */
export function requireReviewDecision(item: ReviewItem): void {
	if (item.decision !== 'Pending') throw new ReviewError('already-decided')
	if (item.stale) throw new ReviewError('stale-snapshot')
}
/** Refresh outdated unresolved/retained evidence without reopening terminal revocations. */
export function requireReviewRefresh(item: ReviewItem): void {
	if (!['Pending', 'Retain'].includes(item.decision)) throw new ReviewError('already-decided')
	if (!item.stale) throw new ReviewError('revision-conflict')
}
/** Closing never implies certification of assignments created outside this snapshot. */
export function requireReviewClosure(pending: number, staleRetained: number): void {
	if (pending) throw new ReviewError('pending-items')
	if (staleRetained) throw new ReviewError('stale-snapshot')
}
