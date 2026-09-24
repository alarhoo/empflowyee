export interface AccountSummary {
	id: string
	personId: string | null
	displayName: string
	email: string
	enabled: boolean
	revision: number
	createdAt: string
}
export interface IdentityPage<T> {
	items: T[]
	nextCursor: string | null
}
export interface PersonOption {
	id: string
	displayName: string
}
export interface IdentityQuery {
	q: string
	enabled?: boolean
	sort: 'displayName:asc' | 'displayName:desc'
	limit: number
	cursor?: string
}
export interface CreateAccount {
	personId: string
	email: string
	reason: string
}
export interface SetAccountEnabled {
	enabled: boolean
	expectedRevision: number
	reason: string
}
export class IdentityError extends Error {
	/** Expose a safe transport-independent identity failure code. */
	constructor(
		readonly code:
			| 'invalid-request'
			| 'not-found'
			| 'revision-conflict'
			| 'duplicate-email'
			| 'idempotency-conflict',
	) {
		super(code)
	}
}
/** Accept existing opaque tenant account/person IDs, including seeded slash-separated IDs. */
export function identityId(value: unknown): string {
	if (
		typeof value !== 'string' ||
		!value.length ||
		value.length > 200 ||
		Array.from(value).some(
			/** Reject non-display control characters without restricting opaque IDs. */ (c) =>
				c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
		)
	)
		throw new IdentityError('invalid-request')
	return value
}
/** Require precisely the approved fields; objects cannot introduce persistence attributes. */
function object(value: unknown, keys: string[]): Record<string, unknown> {
	if (
		!value ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		Object.keys(value).sort().join(',') !== keys.sort().join(',')
	)
		throw new IdentityError('invalid-request')
	return value as Record<string, unknown>
}
/** Normalize a bounded attributable command reason. */
function reason(value: unknown): string {
	if (typeof value !== 'string' || !value.trim() || value.trim().length > 500)
		throw new IdentityError('invalid-request')
	return value.trim()
}
/** Validate local account creation without accepting credentials or role grants. */
export function parseCreateAccount(value: unknown): CreateAccount {
	const body = object(value, ['personId', 'email', 'reason'])
	if (typeof body['email'] !== 'string') throw new IdentityError('invalid-request')
	const email = body['email'].trim()
	if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
		throw new IdentityError('invalid-request')
	return { personId: identityId(body['personId']), email, reason: reason(body['reason']) }
}
/** Validate the sole account-update command and its shared optimistic revision. */
export function parseSetEnabled(value: unknown): SetAccountEnabled {
	const body = object(value, ['enabled', 'expectedRevision', 'reason'])
	if (
		typeof body['enabled'] !== 'boolean' ||
		typeof body['expectedRevision'] !== 'number' ||
		!Number.isSafeInteger(body['expectedRevision']) ||
		body['expectedRevision'] < 1
	)
		throw new IdentityError('invalid-request')
	return {
		enabled: body['enabled'],
		expectedRevision: body['expectedRevision'],
		reason: reason(body['reason']),
	}
}
/** Validate bounded account/person query controls before database execution. */
export function parseIdentityQuery(query: URLSearchParams, people = false): IdentityQuery {
	const allowed = people ? ['q', 'limit', 'cursor'] : ['q', 'enabled', 'sort', 'limit', 'cursor']
	for (const key of query.keys())
		if (!allowed.includes(key) || query.getAll(key).length !== 1)
			throw new IdentityError('invalid-request')
	const q = (query.get('q') ?? '').trim(),
		sort = query.get('sort') ?? 'displayName:asc',
		enabled = query.get('enabled'),
		cursor = query.get('cursor') ?? undefined,
		limitText = query.get('limit') ?? '25',
		limit = Number(limitText)
	if (
		q.length > 100 ||
		!/^[0-9]+$/.test(limitText) ||
		limit < 1 ||
		limit > 100 ||
		!['displayName:asc', 'displayName:desc'].includes(sort) ||
		(enabled !== null && !['true', 'false'].includes(enabled)) ||
		(cursor !== undefined && (!cursor || cursor.length > 4096))
	)
		throw new IdentityError('invalid-request')
	return {
		q,
		sort: sort as IdentityQuery['sort'],
		limit,
		...(enabled === null ? {} : { enabled: enabled === 'true' }),
		...(cursor ? { cursor } : {}),
	}
}
