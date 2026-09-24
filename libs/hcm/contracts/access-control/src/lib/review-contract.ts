export type ReviewStatus = 'Open' | 'Closed'
export type ReviewDecision = 'Pending' | 'Retain' | 'Revoke' | 'Removed'
export interface ReviewSummary {
	id: string
	label: string
	status: ReviewStatus
	revision: number
	createdAt: string
	closedAt: string | null
}
export interface ReviewItem {
	id: string
	accountId: string
	roleId: string
	grantId: string
	accountLabel: string
	roleLabel: string
	decision: ReviewDecision
	reason: string | null
	revision: number
	stale: boolean
}
export interface ReviewQuery {
	q: string
	status?: ReviewStatus
	sort: 'createdAt:asc' | 'createdAt:desc'
	limit: number
	cursor?: string
}
export interface ReviewItemsQuery {
	decision?: ReviewDecision
	limit: number
	cursor?: string
}
export interface ReviewCreate {
	label: string
	reason: string
}
export interface ReviewCommand {
	expectedRevision: number
	reason: string
	decision?: 'Retain' | 'Revoke'
}
export class ReviewError extends Error {
	/** Carry a safe public failure code without embedding record contents. */
	constructor(
		readonly code:
			| 'invalid-request'
			| 'not-found'
			| 'revision-conflict'
			| 'idempotency-conflict'
			| 'closed-review'
			| 'stale-snapshot'
			| 'pending-items'
			| 'already-decided',
	) {
		super(code)
	}
}
/** Accept bounded opaque review/item identifiers without route or control characters. */
export function reviewId(value: string): string {
	if (!/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw new ReviewError('invalid-request')
	return value
}
/** Reject arrays, unknown fields and ambiguous command shapes before receipt hashing. */
function object(body: unknown, keys: string): Record<string, unknown> {
	if (
		!body ||
		typeof body !== 'object' ||
		Array.isArray(body) ||
		Object.keys(body).sort().join(',') !== keys
	)
		throw new ReviewError('invalid-request')
	return body as Record<string, unknown>
}
/** Normalize required bounded text while keeping the exact justification semantics. */
function text(value: unknown, max: number): string {
	if (typeof value !== 'string' || !value.trim() || value.length > max)
		throw new ReviewError('invalid-request')
	return value.trim()
}
/** Parse the focused label/reason review creation form. */
export function parseReviewCreate(body: unknown): ReviewCreate {
	const value = object(body, 'label,reason')
	return { label: text(value['label'], 100), reason: text(value['reason'], 500) }
}
/** Require a positive optimistic revision and an explicit bounded justification. */
export function parseReviewCommand(
	body: unknown,
	operation: 'decide' | 'refresh' | 'close',
): ReviewCommand {
	const value = object(
		body,
		operation === 'decide' ? 'decision,expectedRevision,reason' : 'expectedRevision,reason',
	)
	if (
		!Number.isSafeInteger(value['expectedRevision']) ||
		Number(value['expectedRevision']) < 1 ||
		(operation === 'decide' && !['Retain', 'Revoke'].includes(String(value['decision'])))
	)
		throw new ReviewError('invalid-request')
	const result: ReviewCommand = {
		expectedRevision: Number(value['expectedRevision']),
		reason: text(value['reason'], 500),
	}
	if (operation === 'decide') result.decision = value['decision'] as 'Retain' | 'Revoke'
	return result
}
/** Validate strict list keys, bounded cursor strings and positive page sizes. */
function page(params: URLSearchParams, allowed: string[]): { limit: number; cursor?: string } {
	for (const key of params.keys())
		if (!allowed.includes(key) || params.getAll(key).length !== 1)
			throw new ReviewError('invalid-request')
	const size = params.get('limit') ?? '25',
		cursor = params.get('cursor') ?? undefined
	if (
		!/^[1-9][0-9]{0,2}$/.test(size) ||
		Number(size) > 100 ||
		(cursor !== undefined && (!cursor || cursor.length > 2048))
	)
		throw new ReviewError('invalid-request')
	return { limit: Number(size), cursor }
}
/** Declare server-owned literal label filtering and created-time ordering. */
export function parseReviewQuery(params: URLSearchParams): ReviewQuery {
	const base = page(params, ['q', 'status', 'sort', 'limit', 'cursor']),
		q = params.get('q') ?? '',
		status = params.get('status') ?? undefined,
		sort = params.get('sort') ?? 'createdAt:desc'
	if (
		q.length > 100 ||
		(status !== undefined && !['Open', 'Closed'].includes(status)) ||
		!['createdAt:asc', 'createdAt:desc'].includes(sort)
	)
		throw new ReviewError('invalid-request')
	return {
		...base,
		q: q.trim(),
		status: status as ReviewStatus | undefined,
		sort: sort as ReviewQuery['sort'],
	}
}
/** Keep item ordering fixed by ID and reject unsupported selectors. */
export function parseReviewItemsQuery(params: URLSearchParams): ReviewItemsQuery {
	const base = page(params, ['decision', 'limit', 'cursor']),
		decision = params.get('decision') ?? undefined
	if (decision !== undefined && !['Pending', 'Retain', 'Revoke', 'Removed'].includes(decision))
		throw new ReviewError('invalid-request')
	return { ...base, decision: decision as ReviewDecision | undefined }
}
