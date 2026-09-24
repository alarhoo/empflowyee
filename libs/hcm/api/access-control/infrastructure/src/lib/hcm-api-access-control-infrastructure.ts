import { sql, type Transaction, type Generated, type Kysely } from 'kysely'
import { HcmTenantDatabase } from '@empflowyee/hcm-api-database-kysely'
import {
	HcmAccessError,
	type AccessPolicy,
	type AccountAccessInvariant,
	type HcmAccessRequirement,
	type HcmBusinessActor,
} from '@empflowyee/hcm-api-access-control-application'
import {
	requireAuthenticatedTenant,
	requireAuthenticatedAccount,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import { TransactionalAudit, type AuditTables } from '@empflowyee/hcm-api-audit-infrastructure'
import type { AppendAudit } from '@empflowyee/hcm-api-audit-application'

export interface AccessTables extends AuditTables {
	'hcm.tenant': { id: string; status: string }
	'hcm.user_account': {
		tenant_id: string
		id: string
		enabled: boolean
		person_id: string | null
		revision: number
	}
	'hcm.access_role': {
		tenant_id: string
		id: string
		label: string
		system_role: Generated<boolean>
		protected_admin: Generated<boolean>
		revision: number
	}
	'hcm.account_role': { tenant_id: string; account_id: string; role_id: string }
	'hcm.role_permission': { tenant_id: string; role_id: string; permission_code: string }
	'hcm.access_permission': { tenant_id: string; code: string; kind: string; description: string }
	'hcm.tenant_entitlement': { tenant_id: string; code: string; enabled: boolean }
}
/** Infrastructure binding shared by domain-owned use-case repositories in one transaction. */
export interface AuthorizedAccessWork {
	transaction: Transaction<AccessTables>
	actor: HcmBusinessActor
	audit: AppendAudit
	invariant: AccountAccessInvariant
}
export class TransactionalAccessPolicy implements AccessPolicy, AccountAccessInvariant {
	/** Bind verified authority to tenant-scoped SQL; no browser claims are accepted as grants. */
	constructor(
		private readonly transaction: Transaction<AccessTables>,
		private readonly context: AuthenticatedHcmContext,
	) {}
	/** Reload account, tenant, grants and entitlement; stale public session claims cannot authorize work. */
	async require(requirement: HcmAccessRequirement): Promise<HcmBusinessActor> {
		const tenantId = requireAuthenticatedTenant(this.context)
		const accountId = requireAuthenticatedAccount(this.context)
		const tenant = await this.transaction
			.selectFrom('hcm.tenant')
			.select('status')
			.where('id', '=', tenantId)
			.executeTakeFirst()
		if (!tenant || !['active', 'trial', 'grace'].includes(tenant.status))
			throw new HcmAccessError('tenant-suspended')
		const account = await this.transaction
			.selectFrom('hcm.user_account')
			.select(['id', 'enabled', 'person_id'])
			.where('id', '=', accountId)
			.executeTakeFirst()
		if (!account?.enabled) throw new HcmAccessError('unauthenticated')
		const permission = await this.transaction
			.selectFrom('hcm.account_role as a')
			.innerJoin(
				'hcm.role_permission as p',
				/** Join only grants in the same tenant. */ (join) =>
					join.onRef('a.tenant_id', '=', 'p.tenant_id').onRef('a.role_id', '=', 'p.role_id'),
			)
			.innerJoin(
				'hcm.access_permission as d',
				/** Discovery codes never substitute for business authority. */ (join) =>
					join.onRef('d.tenant_id', '=', 'p.tenant_id').onRef('d.code', '=', 'p.permission_code'),
			)
			.select('p.permission_code')
			.where('a.account_id', '=', accountId)
			.where('p.permission_code', '=', requirement.permission)
			.where('d.kind', '=', 'business-operation')
			.executeTakeFirst()
		const entitlement = await this.transaction
			.selectFrom('hcm.tenant_entitlement')
			.select('code')
			.where('code', '=', requirement.entitlement)
			.where('enabled', '=', true)
			.executeTakeFirst()
		if (!permission || !entitlement) throw new HcmAccessError('forbidden')
		return Object.freeze({ tenantId, accountId, personId: account.person_id })
	}
	/** Inspect the post-mutation state under the shared tenant lock before committing access changes. */
	async requireProtectedAdministrator(): Promise<void> {
		const remaining = await this.transaction
			.selectFrom('hcm.account_role as g')
			.innerJoin(
				'hcm.user_account as a',
				/** Count enabled accounts with tenant-composite grants only. */ (join) =>
					join.onRef('a.tenant_id', '=', 'g.tenant_id').onRef('a.id', '=', 'g.account_id'),
			)
			.innerJoin(
				'hcm.access_role as r',
				/** Protected flags are persisted, never inferred from labels. */ (join) =>
					join.onRef('r.tenant_id', '=', 'g.tenant_id').onRef('r.id', '=', 'g.role_id'),
			)
			.select('a.id')
			.where('a.enabled', '=', true)
			.where('r.protected_admin', '=', true)
			.executeTakeFirst()
		if (!remaining) throw new HcmAccessError('protected-access')
	}
}
export class HcmAccessDatabase {
	private readonly database: HcmTenantDatabase<AccessTables>
	/** Reuse the verified database boundary with a small bounded runtime pool. */
	constructor(connectionString: string) {
		this.database = new HcmTenantDatabase({ connectionString, maxConnections: 5 })
	}
	/** Run a domain repository callback with authorization and audit bound to the identical transaction. */
	async execute<Result>(
		context: AuthenticatedHcmContext,
		requirement: HcmAccessRequirement,
		administrative: boolean,
		work: (scope: AuthorizedAccessWork) => Promise<Result>,
	): Promise<Result> {
		return this.database.transaction(
			context,
			/** Reauthorize only after any administration lock wait completes. */ async (transaction) => {
				if (administrative)
					await sql`SELECT pg_advisory_xact_lock(hashtextextended(${requireAuthenticatedTenant(context)},0))`.execute(
						transaction,
					)
				const policy = new TransactionalAccessPolicy(transaction, context)
				const actor = await policy.require(requirement)
				const result = await work({
					transaction,
					actor,
					audit: new TransactionalAudit(
						// Narrow only the known schema projection; this remains the identical transaction executor.
						transaction as unknown as Kysely<AuditTables>,
						context,
					),
					invariant: policy,
				})
				if (administrative) await policy.requireProtectedAdministrator()
				return result
			},
		)
	}
	/** Drain the pool during module or test shutdown. */
	onApplicationShutdown(): Promise<void> {
		return this.database.destroy()
	}
}
