export interface DocumentType {
	id: string
	code: string
	label: string
	description: string
	enabled: boolean
	revision: number
}
export interface DocumentTypePage {
	items: DocumentType[]
	nextCursor: string | null
}
export interface DocumentTypeQuery {
	q: string
	enabled?: boolean
	sort: 'label:asc' | 'label:desc'
	limit: number
	cursor?: string
}
export interface DocumentTypeCreate {
	code: string
	label: string
	description?: string
	reason: string
}
export interface DocumentTypeUpdate {
	label: string
	description: string
	enabled: boolean
	expectedRevision: number
	reason: string
}
export type DocumentErrorCode =
	| 'invalid-request'
	| 'not-found'
	| 'revision-conflict'
	| 'idempotency-conflict'
	| 'duplicate-code'
	| 'type-disabled'
export class DocumentError extends Error {
	/** Preserve safe classification without leaking a persistence diagnostic. */
	constructor(readonly code: DocumentErrorCode) {
		super(code)
	}
}
/** Validate exact bounded opaque identities without interpreting them as paths. */
export function documentId(value: string): string {
	if (typeof value !== 'string' || !value || value.length > 200 || /\p{Cc}/u.test(value))
		throw new DocumentError('invalid-request')
	return value
}
/** Bound plain-text form values and preserve explicit optional emptiness. */
export function documentText(value: unknown, max: number, required = true): string {
	if (
		typeof value !== 'string' ||
		value.length > max ||
		(required && !value.trim()) ||
		/\p{Cc}/u.test(value)
	)
		throw new DocumentError('invalid-request')
	return value.trim()
}
/** Require an object with no hidden tenant, code-change or subject selectors. */
function bodyFields(
	body: unknown,
	required: string[],
	optional: string[] = [],
): Record<string, unknown> {
	if (!body || typeof body !== 'object' || Array.isArray(body))
		throw new DocumentError('invalid-request')
	const value = body as Record<string, unknown>
	if (
		required.some(
			/** Ensure every command invariant has an explicit input. */ (key) => !(key in value),
		) ||
		Object.keys(value).some(
			/** Reject unlisted payload extensions. */ (key) => ![...required, ...optional].includes(key),
		)
	)
		throw new DocumentError('invalid-request')
	return value
}
/** Parse a classification create with immutable code and no caller-defined state. */
export function parseDocumentTypeCreate(body: unknown): DocumentTypeCreate {
	const value = bodyFields(body, ['code', 'label', 'reason'], ['description'])
	if (typeof value['code'] !== 'string' || !/^[A-Z0-9_]{1,50}$/.test(value['code']))
		throw new DocumentError('invalid-request')
	return {
		code: value['code'],
		label: documentText(value['label'], 100),
		description:
			value['description'] === undefined ? '' : documentText(value['description'], 500, false),
		reason: documentText(value['reason'], 500),
	}
}
/** Parse one revisioned classification edit; immutable codes cannot be changed. */
export function parseDocumentTypeUpdate(body: unknown): DocumentTypeUpdate {
	const value = bodyFields(body, ['label', 'description', 'enabled', 'expectedRevision', 'reason'])
	if (
		typeof value['enabled'] !== 'boolean' ||
		!Number.isSafeInteger(value['expectedRevision']) ||
		Number(value['expectedRevision']) < 1
	)
		throw new DocumentError('invalid-request')
	return {
		label: documentText(value['label'], 100),
		description: documentText(value['description'], 500, false),
		enabled: value['enabled'],
		expectedRevision: Number(value['expectedRevision']),
		reason: documentText(value['reason'], 500),
	}
}
/** Parse server-owned classification filtering, sorting and bounded cursor pagination. */
export function parseDocumentTypeQuery(params: URLSearchParams): DocumentTypeQuery {
	const allowed = ['q', 'enabled', 'sort', 'limit', 'cursor']
	for (const key of params.keys())
		if (!allowed.includes(key) || params.getAll(key).length !== 1)
			throw new DocumentError('invalid-request')
	const q = params.get('q') ?? '',
		enabled = params.get('enabled'),
		sort = params.get('sort') ?? 'label:asc',
		limit = params.get('limit') ?? '25',
		cursor = params.get('cursor') ?? undefined
	if (
		q.length > 200 ||
		!['label:asc', 'label:desc'].includes(sort) ||
		!/^([1-9][0-9]{0,2})$/.test(limit) ||
		Number(limit) > 100 ||
		(enabled !== null && !['true', 'false'].includes(enabled)) ||
		(cursor !== undefined && (!cursor || cursor.length > 2048))
	)
		throw new DocumentError('invalid-request')
	return {
		q: q.trim(),
		...(enabled !== null ? { enabled: enabled === 'true' } : {}),
		sort: sort as DocumentTypeQuery['sort'],
		limit: Number(limit),
		cursor,
	}
}
