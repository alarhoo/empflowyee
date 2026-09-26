import { createHash } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { HcmDomainError, type HcmPage } from '@empflowyee/hcm-runtime-contract'
import type { CommandReceipt, CommandReceiptStore } from '@empflowyee/hcm-api-runtime-application'

export type CursorValue = string | number | null

/** Bind a cursor to the verified actor, tenant and exact query so it can never be replayed elsewhere. */
export function cursorBinding(parts: readonly unknown[]): string {
	return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32)
}

/** Encode the last sort tuple of a page as an opaque URL-safe cursor. */
export function encodeCursor(binding: string, values: readonly CursorValue[]): string {
	return Buffer.from(JSON.stringify({ v: 1, b: binding, k: values })).toString('base64url')
}

/** Decode and validate a cursor; any mismatch is a client error, never an authority. */
export function decodeCursor(
	value: string | undefined,
	binding: string,
	arity: number,
): CursorValue[] | null {
	if (value === undefined) return null
	try {
		if (!/^[A-Za-z0-9_-]{1,2048}$/.test(value)) throw new Error('shape')
		const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
		if (
			!decoded ||
			decoded.v !== 1 ||
			decoded.b !== binding ||
			!Array.isArray(decoded.k) ||
			decoded.k.length !== arity ||
			!decoded.k.every(
				/** Allow only scalar tuple members. */ (item: unknown) =>
					item === null ||
					typeof item === 'number' ||
					(typeof item === 'string' && item.length <= 400),
			)
		)
			throw new Error('shape')
		return decoded.k
	} catch {
		throw new HcmDomainError('invalid-request', [{ field: 'cursor', code: 'invalid' }])
	}
}

/** Cut a limit+1 result into a page and derive the continuation from the last visible row. */
export function keysetPage<T>(
	rows: T[],
	limit: number,
	binding: string,
	key: (row: T) => CursorValue[],
): HcmPage<T> {
	const items = rows.slice(0, limit)
	const last = items.at(-1)
	return {
		items,
		nextCursor: rows.length > limit && last ? encodeCursor(binding, key(last)) : null,
	}
}

/** Escape a literal substring for ILIKE matching. */
export function likePattern(q: string): string {
	return '%' + q.replace(/[\\%_]/g, '\\$&') + '%'
}

/** Escape a literal prefix for ILIKE matching. */
export function prefixPattern(q: string): string {
	return q.replace(/[\\%_]/g, '\\$&') + '%'
}

/** Receipt persistence for any domain receipt table with the shared HCM receipt shape. */
export class SqlCommandReceipts implements CommandReceiptStore {
	/** Bind receipts to a transaction, verified tenant and actor. */
	constructor(
		private readonly executor: Kysely<unknown>,
		private readonly table: string,
		private readonly tenantId: string,
		private readonly accountId: string,
	) {}
	/** Load only this actor's receipt for the operation and key. */
	async get(operation: string, key: string): Promise<CommandReceipt | null> {
		return (
			(
				await sql<CommandReceipt>`SELECT request_hash AS "requestHash",response FROM ${sql.table(this.table)} WHERE tenant_id=${this.tenantId} AND actor_account_id=${this.accountId} AND operation=${operation} AND idempotency_key=${key}::uuid`.execute(
					this.executor,
				)
			).rows[0] ?? null
		)
	}
	/** Store a committed safe response alongside the business change. */
	async save(operation: string, key: string, receipt: CommandReceipt): Promise<void> {
		await sql`INSERT INTO ${sql.table(this.table)}(tenant_id,actor_account_id,operation,idempotency_key,request_hash,response) VALUES(${this.tenantId},${this.accountId},${operation},${key}::uuid,${receipt.requestHash},${JSON.stringify(receipt.response)}::jsonb)`.execute(
			this.executor,
		)
	}
}

/**
 * Translate PostgreSQL integrity violations into safe domain codes. Any other failure is rethrown
 * unchanged so it stays a 503-class technical error rather than empty business data.
 */
export function classifyConstraint(error: unknown): never {
	const code = (error as { code?: unknown } | null)?.code
	if (code === '23505') throw new HcmDomainError('duplicate-code')
	if (code === '23P01') throw new HcmDomainError('overlapping-effective-period')
	if (code === '23503' || code === '23514' || code === '22007' || code === '22008')
		throw new HcmDomainError('invalid-request')
	throw error
}
