import { sql, type Transaction, type Generated, type Kysely } from 'kysely'
import { HcmTenantDatabase } from '@empflowyee/hcm-api-database-kysely'
import {
	HcmAccessError,
	grantCoversSubject,
	type HcmGrantScope,
	type AccessPolicy,
	type AccountAccessInvariant,
	type HcmAccessRequirement,
	type HcmBusinessActor,
	type HcmScopeSubject,
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
	'hcm.account_role': {
		tenant_id: string
		account_id: string
		role_id: string
		grant_id: Generated<string>
	}
	'hcm.account_role_scope': {
		tenant_id: string
		id: string
		grant_id: string
		scope_kind:
			'Tenant' | 'LegalEntity' | 'OrgUnit' | 'Department' | 'Location' | 'Assignment' | 'Employment'
		legal_entity_id: string | null
		org_unit_id: string | null
		department_id: string | null
		location_id: string | null
		assignment_id: string | null
		employment_id: string | null
	}
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
	async require(
		requirement: HcmAccessRequirement,
		resolveSubjects?: () => Promise<readonly Readonly<HcmScopeSubject>[]>,
	): Promise<HcmBusinessActor> {
		if (requirement.subject && requirement.subjects) throw new HcmAccessError('forbidden')
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
		const permissions = await this.transaction
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
			.select('a.grant_id')
			.where('a.account_id', '=', accountId)
			.where('p.permission_code', '=', requirement.permission)
			.where('d.kind', '=', 'business-operation')
			.orderBy('a.grant_id')
			.execute()
		const entitlement = await this.transaction
			.selectFrom('hcm.tenant_entitlement')
			.select('code')
			.where('code', '=', requirement.entitlement)
			.where('enabled', '=', true)
			.executeTakeFirst()
		if (!permissions.length || !entitlement) throw new HcmAccessError('forbidden')
		const scopes = await this.transaction
			.selectFrom('hcm.account_role_scope')
			.selectAll()
			.where(
				'grant_id',
				'in',
				permissions.map(
					/** Scope rows belong only to grants satisfying this exact operation. */ (grant) =>
						grant.grant_id,
				),
			)
			.execute()
		// Source reads run only after current account, operation and entitlement checks.
		// A resolver must return unresolved subjects rather than expose lookup errors.
		const resolvedSubjects = resolveSubjects ? await resolveSubjects() : requirement.subjects
		const subjects = resolvedSubjects?.length ? resolvedSubjects : [requirement.subject]
		for (const permission of permissions) {
			const grantScopes: HcmGrantScope[] = []
			for (const scope of scopes) {
				if (scope.grant_id !== permission.grant_id) continue
				switch (scope.scope_kind) {
					case 'Tenant':
						grantScopes.push({ dimension: 'tenant', targetId: tenantId })
						break
					case 'LegalEntity':
						grantScopes.push({ dimension: 'legalEntityId', targetId: scope.legal_entity_id ?? '' })
						break
					case 'OrgUnit':
						grantScopes.push({ dimension: 'orgUnitId', targetId: scope.org_unit_id ?? '' })
						break
					case 'Department':
						grantScopes.push({ dimension: 'departmentId', targetId: scope.department_id ?? '' })
						break
					case 'Location':
						grantScopes.push({ dimension: 'locationId', targetId: scope.location_id ?? '' })
						break
					case 'Assignment':
						grantScopes.push({ dimension: 'assignmentId', targetId: scope.assignment_id ?? '' })
						break
					case 'Employment':
						grantScopes.push({ dimension: 'employmentId', targetId: scope.employment_id ?? '' })
						break
					default:
						throw new HcmAccessError('forbidden')
				}
			}
			if (
				subjects.every(
					/** Never combine separate grants to authorize different members of one operation. */ (
						subject,
					) => grantCoversSubject(grantScopes, tenantId, subject),
				)
			)
				return Object.freeze({
					tenantId,
					accountId,
					personId: account.person_id,
					grantId: permission.grant_id,
				})
		}
		throw new HcmAccessError('forbidden')
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
			.where(
				sql<boolean>`NOT EXISTS (SELECT 1 FROM hcm.account_role_scope s
				WHERE s.tenant_id=g.tenant_id AND s.grant_id=g.grant_id)`,
			)
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
		resolveSubjects?: (
			transaction: Transaction<AccessTables>,
		) => Promise<readonly Readonly<HcmScopeSubject>[]>,
	): Promise<Result> {
		return this.database.transaction(
			context,
			/** Reauthorize only after any administration lock wait completes. */ async (transaction) => {
				if (administrative)
					await sql`SELECT pg_advisory_xact_lock(hashtextextended(${requireAuthenticatedTenant(context)},0))`.execute(
						transaction,
					)
				else
					await sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${requireAuthenticatedTenant(context)},0))`.execute(
						transaction,
					)
				const policy = new TransactionalAccessPolicy(transaction, context)
				const actor = await policy.require(
					requirement,
					resolveSubjects
						? /** Resolve source-owned scope facts only after checking the operation. */ () =>
							resolveSubjects(transaction)
						: undefined,
				)
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
