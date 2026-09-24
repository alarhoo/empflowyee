import { createHash } from 'node:crypto'
import { DocumentError, type DocumentPage } from '@empflowyee/hcm-documents-contract'
import type { AuthorizedAccessWork } from '@empflowyee/hcm-api-access-control-infrastructure'
/** Scope continuations to actor, tenant, endpoint target and every query control. */
export function queryKey(scope: AuthorizedAccessWork, query: object, target = 'list'): string {
	const filters = { ...query, cursor: undefined }
	return createHash('sha256')
		.update(JSON.stringify([scope.actor.tenantId, scope.actor.accountId, target, filters]))
		.digest('hex')
}
/** Decode only bounded exact tuple cursors; never trust a cursor as authority. */
export function after(
	value: string | undefined,
	binding: string,
): { position: string | number; id: string } | null {
	if (!value) return null
	try {
		if (value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('cursor')
		const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
		if (
			Object.keys(parsed).sort().join(',') !== 'binding,id,position' ||
			parsed.binding !== binding ||
			typeof parsed.id !== 'string' ||
			!parsed.id ||
			parsed.id.length > 200 ||
			!(
				(typeof parsed.position === 'string' && parsed.position.length <= 200) ||
				(Number.isSafeInteger(parsed.position) && parsed.position > 0)
			)
		)
			throw new Error('cursor')
		return parsed
	} catch {
		throw new DocumentError('invalid-request')
	}
}
/** Build a continuation only when an extra server row proves another page exists. */
export function page<T extends { id: string }>(
	rows: T[],
	limit: number,
	binding: string,
	position: (row: T) => string | number,
): DocumentPage<T> {
	const items = rows.slice(0, limit),
		last = items.at(-1)
	let nextCursor: string | null = null
	if (rows.length > limit && last)
		nextCursor = Buffer.from(
			JSON.stringify({ binding, id: last.id, position: position(last) }),
		).toString('base64url')
	return { items, nextCursor }
}
