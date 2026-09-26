/** Stable HCM-2 business error codes shared by workforce, job architecture and employee contracts. */
export type HcmDomainErrorCode =
	| 'invalid-request'
	| 'not-found'
	| 'forbidden'
	| 'revision-conflict'
	| 'idempotency-conflict'
	| 'duplicate-code'
	| 'invalid-state'
	| 'record-incomplete'
	| 'effective-date-out-of-range'
	| 'overlapping-effective-period'
	| 'approval-required'
	| 'self-approval-forbidden'
	| 'capacity-exceeded'
	| 'occupancy-unknown'
	| 'version-published'
	| 'preview-stale'
	| 'field-not-editable'
	| 'visibility-ceiling-exceeded'
	| 'duplicate-candidate'
	| 'structure-in-use'
	| 'set-not-editable'
	| 'merge-requires-correction'
	| 'file-too-large'
	| 'unsupported-file'
	| 'storage-unavailable'

export interface HcmFieldError {
	field: string
	code: string
}

/** Safe classified failure; never carries submitted values, SQL or stack detail to clients. */
export class HcmDomainError extends Error {
	/** Keep the code and optional field identities for transport serialization. */
	constructor(
		readonly code: HcmDomainErrorCode,
		readonly fieldErrors: HcmFieldError[] = [],
	) {
		super(code)
	}
}

/** Reject one named field without echoing its value. */
export function invalidField(field: string, code = 'invalid'): never {
	throw new HcmDomainError('invalid-request', [{ field, code }])
}

/** Require a plain object with exactly the documented required and optional properties. */
export function readBody(
	body: unknown,
	required: readonly string[],
	optional: readonly string[] = [],
): Record<string, unknown> {
	if (!body || typeof body !== 'object' || Array.isArray(body))
		throw new HcmDomainError('invalid-request')
	const value = body as Record<string, unknown>
	const missing = required.filter(
		/** Every command input must be explicit. */ (key) => !(key in value),
	)
	const unknown = Object.keys(value).filter(
		/** Hidden tenant, subject or state selectors are never accepted. */ (key) =>
			!required.includes(key) && !optional.includes(key),
	)
	if (missing.length || unknown.length)
		throw new HcmDomainError('invalid-request', [
			...missing.map(/** Name each absent field. */ (field) => ({ field, code: 'required' })),
			...unknown.map(/** Name each unsupported field. */ (field) => ({ field, code: 'unknown' })),
		])
	return value
}

/** Parse bounded trimmed plain text; control characters are rejected. */
export function textValue(value: unknown, field: string, max: number, required = true): string {
	if (
		typeof value !== 'string' ||
		value.length > max ||
		/\p{Cc}/u.test(value.replace(/[\n\r\t]/g, ''))
	)
		invalidField(field)
	const trimmed = value.trim()
	if (required && !trimmed) invalidField(field, 'required')
	return trimmed
}

/** Parse optional text where omission and null both mean empty. */
export function optionalText(value: unknown, field: string, max: number): string {
	return value === undefined || value === null ? '' : textValue(value, field, max, false)
}

/** Parse an immutable uppercase business code. */
export function codeValue(
	value: unknown,
	field: string,
	pattern = /^[A-Z][A-Z0-9_]{1,39}$/,
): string {
	if (typeof value !== 'string' || !pattern.test(value)) invalidField(field)
	return value
}

/** Validate an opaque bounded identifier without interpreting its structure. */
export function idValue(value: unknown, field: string): string {
	if (typeof value !== 'string' || !value || value.length > 200 || /\p{Cc}/u.test(value))
		invalidField(field)
	return value
}

/** Parse an optional opaque identifier where null clears the reference. */
export function optionalId(value: unknown, field: string): string | null {
	return value === undefined || value === null ? null : idValue(value, field)
}

/** Parse an explicit boolean. */
export function boolValue(value: unknown, field: string): boolean {
	if (typeof value !== 'boolean') invalidField(field)
	return value
}

/** Parse a bounded safe integer. */
export function intValue(value: unknown, field: string, min: number, max: number): number {
	if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max)
		invalidField(field)
	return value as number
}

/** Parse an optional bounded integer where null clears the value. */
export function optionalInt(
	value: unknown,
	field: string,
	min: number,
	max: number,
): number | null {
	return value === undefined || value === null ? null : intValue(value, field, min, max)
}

/** Parse a finite decimal with a fixed maximum number of fraction digits. */
export function decimalValue(
	value: unknown,
	field: string,
	min: number,
	max: number,
	scale: number,
): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
		invalidField(field)
	if (Math.abs(Math.round(value * 10 ** scale) - value * 10 ** scale) > 1e-6) invalidField(field)
	return value
}

/** Parse a positive optimistic revision. */
export function revisionValue(value: unknown, field = 'expectedRevision'): number {
	return intValue(value, field, 1, 2_147_483_647)
}

/** Parse a timezone-free calendar date and reject impossible dates. */
export function dateValue(value: unknown, field: string): string {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalidField(field)
	const parsed = new Date(`${value}T00:00:00Z`)
	if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
		invalidField(field)
	return value
}

/** Parse an optional calendar date where null clears the value. */
export function optionalDate(value: unknown, field: string): string | null {
	return value === undefined || value === null ? null : dateValue(value, field)
}

/** Parse one member of a closed product enumeration. */
export function enumValue<T extends string>(
	value: unknown,
	field: string,
	allowed: readonly T[],
): T {
	if (typeof value !== 'string' || !allowed.includes(value as T)) invalidField(field)
	return value as T
}

/** Validate an IANA time zone through the runtime's own zone database. */
export function timeZoneValue(value: unknown, field: string): string {
	if (typeof value !== 'string' || value.length > 64) invalidField(field)
	try {
		new Intl.DateTimeFormat('en', { timeZone: value }).format(0)
	} catch {
		invalidField(field)
	}
	return value
}

export interface HcmListQuery {
	q: string
	limit: number
	cursor?: string
	sort: string
}

/** Parse the shared bounded list query and any listed string filters. */
export function readListQuery(
	params: URLSearchParams,
	sorts: readonly string[],
	filters: readonly string[] = [],
): HcmListQuery & { filters: Record<string, string> } {
	const allowed = ['q', 'limit', 'cursor', 'sort', ...filters]
	for (const key of params.keys())
		if (!allowed.includes(key) || params.getAll(key).length !== 1)
			throw new HcmDomainError('invalid-request', [{ field: key, code: 'unknown' }])
	const q = params.get('q') ?? ''
	const limit = params.get('limit') ?? '25'
	const sort = params.get('sort') ?? sorts[0]
	const cursor = params.get('cursor') ?? undefined
	if (q.length > 200) invalidField('q')
	if (!/^[1-9][0-9]{0,2}$/.test(limit) || Number(limit) > 100) invalidField('limit')
	if (!sorts.includes(sort)) invalidField('sort')
	if (cursor !== undefined && (!cursor || cursor.length > 2048)) invalidField('cursor')
	const values: Record<string, string> = {}
	for (const key of filters) {
		const value = params.get(key)
		if (value !== null) {
			if (!value || value.length > 200) invalidField(key)
			values[key] = value
		}
	}
	return { q: q.trim(), limit: Number(limit), sort, ...(cursor ? { cursor } : {}), filters: values }
}

export interface HcmPage<T> {
	items: T[]
	nextCursor: string | null
}
