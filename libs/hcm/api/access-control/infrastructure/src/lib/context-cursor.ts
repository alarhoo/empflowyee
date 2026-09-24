import { createHash } from 'node:crypto'
import { RoleError } from '@empflowyee/hcm-access-control-contract'

/** Bind a contextual cursor to its fixed sort, selected role and page size. */
function fingerprint(kind: string, roleId: string, limit: number): string {
	return createHash('sha256')
		.update(JSON.stringify([kind, roleId, limit]))
		.digest('hex')
}
/** Encode the stable sort tuple without making the cursor an authorization credential. */
export function contextCursor(
	kind: string,
	roleId: string,
	limit: number,
	position: string[],
): string {
	return Buffer.from(
		JSON.stringify({
			version: 1,
			sort: kind,
			fingerprint: fingerprint(kind, roleId, limit),
			position,
		}),
	).toString('base64url')
}
/** Validate exact shape, binding and bounded tuple values before parameterized SQL sees them. */
export function readContextCursor(
	cursor: string | undefined,
	kind: string,
	roleId: string,
	limit: number,
	length: number,
): string[] | undefined {
	if (!cursor) return undefined
	try {
		if (cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('cursor')
		const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
		if (
			Object.keys(value).sort().join(',') !== 'fingerprint,position,sort,version' ||
			value.version !== 1 ||
			value.sort !== kind ||
			value.fingerprint !== fingerprint(kind, roleId, limit) ||
			!Array.isArray(value.position) ||
			value.position.length !== length ||
			value.position.some(
				/** Reject nested or oversized cursor selectors. */ (item: unknown) =>
					typeof item !== 'string' || !item.length || item.length > 200,
			)
		)
			throw new Error('cursor')
		return value.position
	} catch {
		throw new RoleError('invalid-request')
	}
}
