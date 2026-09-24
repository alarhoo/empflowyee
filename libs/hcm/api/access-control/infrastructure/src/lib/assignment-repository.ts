import { sql } from 'kysely'
import {
	AssignmentError,
	type AssignmentAccount,
	type AssignmentQuery,
	type AssignmentRole,
	type AssignmentRoleOption,
	type AssignmentOptionsQuery,
	type AssignmentPageQuery,
	type Page,
} from '@empflowyee/hcm-access-control-contract'
import {
	AssignmentUnitOfWork,
	type AssignmentAccounts,
	type AssignmentRepository,
	type AssignmentWork,
	type AssignmentReceipt,
} from '@empflowyee/hcm-api-access-control-application'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	HcmAccessDatabase,
	type AuthorizedAccessWork,
} from './hcm-api-access-control-infrastructure'
import { contextCursor, readContextCursor } from './context-cursor'

/** Derive cursor context from every query control; cursors never confer account authority. */
function accountBinding(query: AssignmentQuery): string {
	return JSON.stringify([query.q, query.enabled ?? null])
}
/** Escape user text for literal substring search rather than SQL wildcard behavior. */
function search(value: string): string {
	return `%${value.replace(/[\\%_]/g, '\\$&')}%`
}
/** Build a bounded stable page without exposing the extra look-ahead row. */
function page<T>(rows: T[], limit: number, cursor: (row: T) => string): Page<T> {
	const items = rows.slice(0, limit),
		last = items.at(-1)
	return { items, nextCursor: rows.length > limit && last ? cursor(last) : null }
}
export class KyselyAssignmentAccounts implements AssignmentAccounts {
	/** Bind the consumer-owned identity projection to the existing authorized transaction. */
	constructor(private readonly scope: AuthorizedAccessWork) {}
	/** Project only account identity and revision, keeping identity edits outside this repository. */
	async get(id: string, lock = false): Promise<AssignmentAccount> {
		const row = (
			await sql<AssignmentAccount>`SELECT a.id AS "accountId",coalesce(p.display_name,a.email) AS "displayName",a.email,a.enabled,a.revision FROM hcm.user_account a LEFT JOIN hcm.person p ON p.tenant_id=a.tenant_id AND p.id=a.person_id WHERE a.tenant_id=${this.scope.actor.tenantId} AND a.id=${id} ${lock ? sql`FOR UPDATE OF a` : sql``}`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (!row) throw new AssignmentError('not-found')
		return row
	}
	/** Query literal account name/email filters with stable name/ID keyset pagination. */
	async list(query: AssignmentQuery): Promise<Page<AssignmentAccount>> {
		const binding = accountBinding(query),
			position = readContextCursor(query.cursor, query.sort, binding, query.limit, 2)
		const direction = query.sort === 'displayName:asc' ? sql`ASC` : sql`DESC`
		const compare = query.sort === 'displayName:asc' ? sql`>` : sql`<`
		const rows = (
			await sql<AssignmentAccount>`SELECT a.id AS "accountId",coalesce(p.display_name,a.email) AS "displayName",a.email,a.enabled,a.revision
      FROM hcm.user_account a LEFT JOIN hcm.person p ON p.tenant_id=a.tenant_id AND p.id=a.person_id
      WHERE a.tenant_id=${this.scope.actor.tenantId}
      ${query.q ? sql`AND (coalesce(p.display_name,a.email) ILIKE ${search(query.q)} OR a.email ILIKE ${search(query.q)})` : sql``}
      ${query.enabled === undefined ? sql`` : sql`AND a.enabled=${query.enabled}`}
      ${position ? sql`AND (coalesce(p.display_name,a.email),a.id) ${compare} (${position[0]},${position[1]})` : sql``}
      ORDER BY coalesce(p.display_name,a.email) ${direction},a.id ${direction} LIMIT ${query.limit + 1}`.execute(
				this.scope.transaction,
			)
		).rows
		return page(
			rows,
			query.limit,
			/** Preserve the complete account query binding in its continuation. */ (row) =>
				contextCursor(query.sort, binding, query.limit, [row.displayName, row.accountId]),
		)
	}
	/** Advance only identity's shared revision under an expected-version predicate. */
	async advance(id: string, revision: number): Promise<void> {
		const result =
			await sql`UPDATE hcm.user_account SET revision=revision+1 WHERE tenant_id=${this.scope.actor.tenantId} AND id=${id} AND revision=${revision}`.execute(
				this.scope.transaction,
			)
		if (result.numAffectedRows !== 1n) throw new AssignmentError('revision-conflict')
	}
}
export class KyselyAssignments implements AssignmentRepository {
	/** Bind assignment SQL to the same scope as account revision, audit and receipts. */
	constructor(private readonly scope: AuthorizedAccessWork) {}
	/** Return a bounded role-ID ordered collection of current occurrence identities. */
	async roles(accountId: string, query: AssignmentPageQuery): Promise<Page<AssignmentRole>> {
		const after =
			readContextCursor(query.cursor, 'assignment-role:asc', accountId, query.limit, 1)?.[0] ?? ''
		const rows = (
			await sql<AssignmentRole>`SELECT r.id,r.label,g.grant_id AS "grantId" FROM hcm.account_role g JOIN hcm.access_role r ON r.tenant_id=g.tenant_id AND r.id=g.role_id WHERE g.tenant_id=${this.scope.actor.tenantId} AND g.account_id=${accountId} AND r.id>${after} ORDER BY r.id LIMIT ${query.limit + 1}`.execute(
				this.scope.transaction,
			)
		).rows
		return page(
			rows,
			query.limit,
			/** Bind continuation to this account and fixed role sort. */ (row) =>
				contextCursor('assignment-role:asc', accountId, query.limit, [row.id]),
		)
	}
	/** Search persisted tenant role labels for the assignment picker. */
	async options(query: AssignmentOptionsQuery): Promise<Page<AssignmentRoleOption>> {
		const position = readContextCursor(
			query.cursor,
			'assignment-option:asc',
			query.q,
			query.limit,
			2,
		)
		const rows = (
			await sql<AssignmentRoleOption>`SELECT id,label,system_role AS "systemRole" FROM hcm.access_role WHERE tenant_id=${this.scope.actor.tenantId} ${query.q ? sql`AND label ILIKE ${search(query.q)}` : sql``} ${position ? sql`AND (label,id)>(${position[0]},${position[1]})` : sql``} ORDER BY label,id LIMIT ${query.limit + 1}`.execute(
				this.scope.transaction,
			)
		).rows
		return page(
			rows,
			query.limit,
			/** Keep label search stable across explicit growing requests. */ (row) =>
				contextCursor('assignment-option:asc', query.q, query.limit, [row.label, row.id]),
		)
	}
	/** Foreign and absent roles share the same safe not-found response. */
	async requireRole(roleId: string): Promise<void> {
		const role = await this.scope.transaction
			.selectFrom('hcm.access_role')
			.select('id')
			.where('tenant_id', '=', this.scope.actor.tenantId)
			.where('id', '=', roleId)
			.executeTakeFirst()
		if (!role) throw new AssignmentError('not-found')
	}
	/** Resolve the live occurrence after taking the tenant administration lock. */
	async occurrence(accountId: string, roleId: string): Promise<string | null> {
		return (
			(
				await sql<{
					id: string
				}>`SELECT grant_id AS id FROM hcm.account_role WHERE tenant_id=${this.scope.actor.tenantId} AND account_id=${accountId} AND role_id=${roleId}`.execute(
					this.scope.transaction,
				)
			).rows[0]?.id ?? null
		)
	}
	/** Insert only one approved role association with a fresh immutable occurrence and real actor. */
	async grant(accountId: string, roleId: string, grantId: string): Promise<void> {
		await sql`INSERT INTO hcm.account_role(tenant_id,account_id,role_id,grant_id,granted_by_account_id) VALUES (${this.scope.actor.tenantId},${accountId},${roleId},${grantId},${this.scope.actor.accountId})`.execute(
			this.scope.transaction,
		)
	}
	/** Recheck the occurrence in SQL so replacement grants cannot be removed by a stale request. */
	async revoke(accountId: string, roleId: string, grantId: string): Promise<void> {
		const result =
			await sql`DELETE FROM hcm.account_role WHERE tenant_id=${this.scope.actor.tenantId} AND account_id=${accountId} AND role_id=${roleId} AND grant_id=${grantId}`.execute(
				this.scope.transaction,
			)
		if (result.numAffectedRows !== 1n) throw new AssignmentError('grant-conflict')
	}
	/** Read only the current tenant/actor's immutable receipt. */
	async receipt(operation: string, key: string): Promise<AssignmentReceipt | null> {
		return (
			(
				await sql<AssignmentReceipt>`SELECT request_hash AS "requestHash",response FROM hcm.access_command_receipt WHERE tenant_id=${this.scope.actor.tenantId} AND actor_account_id=${this.scope.actor.accountId} AND operation=${operation} AND idempotency_key=${key}::uuid`.execute(
					this.scope.transaction,
				)
			).rows[0] ?? null
		)
	}
	/** Commit the successful response within the grant transaction. */
	async save(operation: string, key: string, value: AssignmentReceipt): Promise<void> {
		await sql`INSERT INTO hcm.access_command_receipt(tenant_id,actor_account_id,operation,idempotency_key,request_hash,response) VALUES (${this.scope.actor.tenantId},${this.scope.actor.accountId},${operation},${key}::uuid,${value.requestHash},${JSON.stringify(value.response)}::jsonb)`.execute(
			this.scope.transaction,
		)
	}
}
export class KyselyAssignmentUnitOfWork extends AssignmentUnitOfWork {
	/** Share the existing tenant lock and post-write protected-administrator invariant. */
	constructor(private readonly database: HcmAccessDatabase | null) {
		super()
	}
	/** Reauthorize the required operation and bind ports without exposing SQL to the application layer. */
	async execute<T>(
		context: AuthenticatedHcmContext,
		manage: boolean,
		write: boolean,
		work: (scope: AssignmentWork) => Promise<T>,
	): Promise<T> {
		if (!this.database) throw new Error('Business runtime unavailable')
		return this.database.execute(
			context,
			{
				permission: `hcm.access-control.assignments.${manage ? 'manage' : 'read'}`,
				entitlement: 'hcm.access-control',
			},
			write,
			/** Bind all side effects to exactly this transaction. */ (scope) => {
				const assignments = new KyselyAssignments(scope)
				return work({
					accounts: new KyselyAssignmentAccounts(scope),
					assignments,
					audit: scope.audit,
					receipts: {
						get: assignments.receipt.bind(assignments),
						save: assignments.save.bind(assignments),
					},
				})
			},
		)
	}
}
