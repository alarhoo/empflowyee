import { createHash } from 'node:crypto'
import { sql } from 'kysely'
import {
	IdentityError,
	type AccountSummary,
	type IdentityQuery,
	type IdentityPage,
	type PersonOption,
	type CreateAccount,
} from '@empflowyee/hcm-identity-access-contract'
import {
	IdentityUnitOfWork,
	type IdentityWork,
	type IdentityRepository,
	type IdentityPeople,
	type IdentityReceipt,
} from '@empflowyee/hcm-api-identity-access-application'
import {
	HcmAccessDatabase,
	type AuthorizedAccessWork,
} from '@empflowyee/hcm-api-access-control-infrastructure'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
/** Bind every keyset cursor to its query and resource kind, without treating it as authority. */
function binding(query: IdentityQuery, kind: string): string {
	return createHash('sha256')
		.update(JSON.stringify([kind, query.q, query.enabled ?? null, query.sort, query.limit]))
		.digest('hex')
}
/** Reject malformed or reused cursors before interpolating strictly parameterized selectors. */
function position(query: IdentityQuery, kind: string): string[] | undefined {
	if (!query.cursor) return undefined
	try {
		if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw new Error('cursor')
		const value = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'))
		if (
			Object.keys(value).sort().join(',') !== 'binding,position,version' ||
			value.version !== 1 ||
			value.binding !== binding(query, kind) ||
			!Array.isArray(value.position) ||
			value.position.length !== 2 ||
			value.position.some(
				/** Reject oversized or structured sort selectors. */ (item: unknown) =>
					typeof item !== 'string' || !item.length || item.length > 254,
			)
		)
			throw new Error('cursor')
		return value.position
	} catch {
		throw new IdentityError('invalid-request')
	}
}
/** Return only the requested page, using the look-ahead row to expose continuation. */
function page<T extends { id: string; displayName: string }>(
	rows: T[],
	query: IdentityQuery,
	kind: string,
): IdentityPage<T> {
	const items = rows.slice(0, query.limit),
		last = items.at(-1)
	let nextCursor: string | null = null
	if (rows.length > query.limit && last)
		nextCursor = Buffer.from(
			JSON.stringify({
				version: 1,
				binding: binding(query, kind),
				position: [last.displayName, last.id],
			}),
		).toString('base64url')
	return { items, nextCursor }
}
/** Treat percent and underscore as literal user search text. */
function search(value: string): string {
	return `%${value.replace(/[\\%_]/g, '\\$&')}%`
}
const fields = sql`a.id,a.person_id AS "personId",p.display_name AS "displayName",a.email,a.enabled,a.revision,to_char(a.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"`
export class KyselyIdentityAccounts implements IdentityRepository {
	/** Bind queries to the already authorized tenant transaction. */
	constructor(private readonly scope: AuthorizedAccessWork) {}
	/** Project explicit contract fields and optionally lock account revision. */
	async get(id: string, lock = false): Promise<AccountSummary> {
		const row = (
			await sql<AccountSummary>`SELECT ${fields} FROM hcm.user_account a JOIN hcm.person p ON p.tenant_id=a.tenant_id AND p.id=a.person_id WHERE a.tenant_id=${this.scope.actor.tenantId} AND a.id=${id} ${lock ? sql`FOR UPDATE OF a` : sql``}`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (!row) throw new IdentityError('not-found')
		return row
	}
	/** Apply stable name/ID ordering, enablement and literal search on the server. */
	async list(query: IdentityQuery): Promise<IdentityPage<AccountSummary>> {
		const cursor = position(query, 'accounts'),
			direction = query.sort === 'displayName:asc' ? sql`ASC` : sql`DESC`,
			compare = query.sort === 'displayName:asc' ? sql`>` : sql`<`
		const rows = (
			await sql<AccountSummary>`SELECT ${fields} FROM hcm.user_account a JOIN hcm.person p ON p.tenant_id=a.tenant_id AND p.id=a.person_id WHERE a.tenant_id=${this.scope.actor.tenantId}
   ${query.q ? sql`AND (p.display_name ILIKE ${search(query.q)} OR a.email ILIKE ${search(query.q)})` : sql``}
   ${query.enabled === undefined ? sql`` : sql`AND a.enabled=${query.enabled}`}
   ${cursor ? sql`AND (p.display_name,a.id) ${compare} (${cursor[0]},${cursor[1]})` : sql``}
   ORDER BY p.display_name ${direction},a.id ${direction} LIMIT ${query.limit + 1}`.execute(
				this.scope.transaction,
			)
		).rows
		return page(rows, query, 'accounts')
	}
	/** Preserve the database's case-insensitive unique email authority. */
	async create(id: string, body: CreateAccount): Promise<void> {
		try {
			await sql`INSERT INTO hcm.user_account(tenant_id,id,person_id,email,enabled,created_by_account_id,updated_by_account_id) VALUES (${this.scope.actor.tenantId},${id},${body.personId},${body.email},true,${this.scope.actor.accountId},${this.scope.actor.accountId})`.execute(
				this.scope.transaction,
			)
		} catch (error) {
			if (
				(error as { code?: string; constraint?: string }).code === '23505' &&
				(error as { constraint?: string }).constraint === 'user_account_email'
			)
				throw new IdentityError('duplicate-email')
			throw error
		}
	}
	/** Update the permitted lifecycle columns while preserving grants and workforce data. */
	async setEnabled(id: string, enabled: boolean, revision: number): Promise<void> {
		const result =
			await sql`UPDATE hcm.user_account SET enabled=${enabled},revision=revision+1,updated_at=now(),updated_by_account_id=${this.scope.actor.accountId} WHERE tenant_id=${this.scope.actor.tenantId} AND id=${id} AND revision=${revision}`.execute(
				this.scope.transaction,
			)
		if (result.numAffectedRows !== 1n) throw new IdentityError('revision-conflict')
	}
	/** Read only an actor-scoped receipt after fresh authorization. */
	async receipt(operation: string, key: string): Promise<IdentityReceipt | null> {
		return (
			(
				await sql<IdentityReceipt>`SELECT request_hash AS "requestHash",response FROM hcm.identity_command_receipt WHERE tenant_id=${this.scope.actor.tenantId} AND actor_account_id=${this.scope.actor.accountId} AND operation=${operation} AND idempotency_key=${key}::uuid`.execute(
					this.scope.transaction,
				)
			).rows[0] ?? null
		)
	}
	/** Save immutable success evidence in the identical account transaction. */
	async save(operation: string, key: string, value: IdentityReceipt): Promise<void> {
		await sql`INSERT INTO hcm.identity_command_receipt(tenant_id,actor_account_id,operation,idempotency_key,request_hash,response) VALUES (${this.scope.actor.tenantId},${this.scope.actor.accountId},${operation},${key}::uuid,${value.requestHash},${JSON.stringify(value.response)}::jsonb)`.execute(
			this.scope.transaction,
		)
	}
}
export class KyselyIdentityPeople implements IdentityPeople {
	/** Bind the consumer-owned read port without importing workforce implementation. */
	constructor(private readonly scope: AuthorizedAccessWork) {}
	/** Require a real person inside the verified tenant; do not infer employment rules. */
	async requirePerson(id: string): Promise<void> {
		const row = (
			await sql<{
				id: string
			}>`SELECT id FROM hcm.person WHERE tenant_id=${this.scope.actor.tenantId} AND id=${id}`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (!row) throw new IdentityError('not-found')
	}
	/** Return only bounded opaque ID/display-name options. */
	async listPeople(query: IdentityQuery): Promise<IdentityPage<PersonOption>> {
		const cursor = position(query, 'people')
		const rows = (
			await sql<PersonOption>`SELECT id,display_name AS "displayName" FROM hcm.person WHERE tenant_id=${this.scope.actor.tenantId}
   ${query.q ? sql`AND display_name ILIKE ${search(query.q)}` : sql``}
   ${cursor ? sql`AND (display_name,id)>(${cursor[0]},${cursor[1]})` : sql``}
   ORDER BY display_name,id LIMIT ${query.limit + 1}`.execute(this.scope.transaction)
		).rows
		return page(rows, query, 'people')
	}
}
export class KyselyIdentityUnitOfWork extends IdentityUnitOfWork {
	/** Reuse the approved common authorization, audit and access invariant boundary. */
	constructor(private readonly database: HcmAccessDatabase | null) {
		super()
	}
	/** Share the tenant advisory lock with grants/revokes and check the final enabled administrator state. */
	async execute<T>(
		context: AuthenticatedHcmContext,
		manage: boolean,
		write: boolean,
		work: (scope: IdentityWork) => Promise<T>,
	): Promise<T> {
		if (!this.database) throw new Error('Business runtime unavailable')
		return this.database.execute(
			context,
			{
				permission: `hcm.identity-access.accounts.${manage ? 'manage' : 'read'}`,
				entitlement: 'hcm.identity-access',
			},
			write,
			/** Bind domain-owned adapters to the same transaction. */ (scope) => {
				const accounts = new KyselyIdentityAccounts(scope)
				return work({
					accounts,
					people: new KyselyIdentityPeople(scope),
					audit: scope.audit,
					receipts: { get: accounts.receipt.bind(accounts), save: accounts.save.bind(accounts) },
				})
			},
		)
	}
}
