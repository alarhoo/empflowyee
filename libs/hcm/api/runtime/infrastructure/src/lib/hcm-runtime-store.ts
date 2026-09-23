import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely'
import { Pool } from 'pg'
import { assertHcmRuntimeRole } from '@empflowyee/hcm-api-database-kysely'
import type { HcmPreferences, TenantLifecycleStatus } from '@empflowyee/hcm-runtime-contract'
import type { TenantRecord, VerifiedHcmSession } from '@empflowyee/hcm-api-runtime-domain'

// Runtime read projections only. SQL/domain documents own the physical schema and business model.
interface RuntimeTables {
	'hcm.tenant_hostname': { hostname: string; tenant_id: string }
	'hcm.tenant': {
		id: string
		slug: string
		display_name: string
		status: TenantLifecycleStatus
		allow_user_theme: boolean
		defaults: HcmPreferences
		logo_url: string | null
		primary_color: string | null
	}
	'hcm.user_account': {
		tenant_id: string
		id: string
		person_id: string
		email: string
		enabled: boolean
		preferences: HcmPreferences
		revision: number
	}
	'hcm.person': { tenant_id: string; id: string; display_name: string }
	'hcm.worker': { tenant_id: string; id: string; person_id: string }
	'hcm.development_persona': {
		tenant_id: string
		persona_key: string
		account_id: string
		role_label: string
		sort_order: number
		is_default: boolean
	}
	'hcm.account_role': { tenant_id: string; account_id: string; role_id: string }
	'hcm.role_permission': { tenant_id: string; role_id: string; permission_code: string }
	'hcm.tenant_entitlement': { tenant_id: string; code: string; enabled: boolean }
	'hcm.tenant_feature_flag': { tenant_id: string; code: string; enabled: boolean }
}

export class HcmRuntimeStore {
	private readonly database: Kysely<RuntimeTables>
	/** Own one bounded runtime-only pool; construction never provisions, migrates or seeds. */
	constructor(connectionString: string) {
		const url = new URL(connectionString)
		if (
			!['postgres:', 'postgresql:'].includes(url.protocol) ||
			!['127.0.0.1', '[::1]'].includes(url.hostname) ||
			url.username !== 'hcm_runtime' ||
			url.pathname !== '/hcm_db' ||
			!url.password ||
			url.search ||
			url.hash
		)
			throw new Error('Local runtime requires the loopback hcm_db runtime role')
		const pool = new Pool({
			connectionString,
			max: 5,
			connectionTimeoutMillis: 10000,
			idleTimeoutMillis: 30000,
			statement_timeout: 30000,
			application_name: 'hcm-runtime-bootstrap',
		})
		pool.on('error', ignoreIdleFailure)
		this.database = new Kysely({ dialect: new PostgresDialect({ pool }) })
	}

	/** Read the global routing projection by exact Host, then restrict all presentation reads to that tenant. */
	async tenant(host: string): Promise<TenantRecord | null> {
		return this.read(
			/** Resolve only safe discovery fields after installing the matched tenant's context. */ async function resolveTenant(
				transaction,
			) {
				const route = await transaction
					.selectFrom('hcm.tenant_hostname')
					.select('tenant_id')
					.where('hostname', '=', host)
					.executeTakeFirst()
				if (!route) return null
				await sql`SELECT set_config('hcm.tenant_id', ${route.tenant_id}, true)`.execute(transaction)
				const tenant = await transaction
					.selectFrom('hcm.tenant')
					.selectAll()
					.where('id', '=', route.tenant_id)
					.executeTakeFirst()
				if (!tenant) return null
				return {
					id: tenant.id,
					discovery: {
						tenant: {
							slug: tenant.slug,
							displayName: tenant.display_name,
							status: tenant.status,
							allowUserTheme: tenant.allow_user_theme,
							defaults: tenant.defaults,
							...(tenant.logo_url ? { logoUrl: tenant.logo_url } : {}),
							...(tenant.primary_color ? { primaryColor: tenant.primary_color } : {}),
						},
						authentication: { strategies: [] },
					},
				}
			},
		)
	}

	/** Resolve a persisted development selector within the application-provided tenant; every capability comes from SQL. */
	async session(tenantId: string, persona?: string): Promise<VerifiedHcmSession | null> {
		return this.read(
			/** Keep identity and grants in one repeatable-read tenant transaction. */ async (
				transaction,
			) => {
				await sql`SELECT set_config('hcm.tenant_id', ${tenantId}, true)`.execute(transaction)
				const activeTenant = await transaction
					.selectFrom('hcm.tenant')
					.select('id')
					.where('status', 'in', ['active', 'trial', 'grace'])
					.executeTakeFirst()
				if (!activeTenant) return null
				const candidates = await transaction
					.selectFrom('hcm.development_persona as d')
					.innerJoin(
						'hcm.user_account as a',
						/** Require tenant-composite account membership. */ (join) =>
							join.onRef('a.tenant_id', '=', 'd.tenant_id').onRef('a.id', '=', 'd.account_id'),
					)
					.innerJoin(
						'hcm.person as p',
						/** Resolve the account's persisted human identity. */ (join) =>
							join.onRef('p.tenant_id', '=', 'a.tenant_id').onRef('p.id', '=', 'a.person_id'),
					)
					.leftJoin(
						'hcm.worker as w',
						/** Workforce identity is optional for an enabled account. */ (join) =>
							join.onRef('w.tenant_id', '=', 'p.tenant_id').onRef('w.person_id', '=', 'p.id'),
					)
					.select([
						'd.persona_key',
						'd.role_label',
						'd.is_default',
						'a.id',
						'a.email',
						'a.preferences',
						'a.revision',
						'p.display_name',
						'w.id as worker_id',
					])
					.where('a.enabled', '=', true)
					.orderBy('d.sort_order')
					.execute()
				const selected = candidates.find(
					/** Accept only persisted enabled selectors, using the stored default on initial bootstrap. */ (
						entry,
					) => (persona ? entry.persona_key === persona : entry.is_default),
				)
				if (!selected) return null
				const roles = await transaction
					.selectFrom('hcm.account_role')
					.select('role_id')
					.where('account_id', '=', selected.id)
					.orderBy('role_id')
					.execute()
				const permissions = await transaction
					.selectFrom('hcm.role_permission as p')
					.innerJoin(
						'hcm.account_role as r',
						/** Intersect permission grants with this account's tenant-scoped roles. */ (join) =>
							join.onRef('r.tenant_id', '=', 'p.tenant_id').onRef('r.role_id', '=', 'p.role_id'),
					)
					.select('p.permission_code')
					.where('r.account_id', '=', selected.id)
					.distinct()
					.orderBy('p.permission_code')
					.execute()
				const entitlements = await transaction
					.selectFrom('hcm.tenant_entitlement')
					.select('code')
					.where('enabled', '=', true)
					.orderBy('code')
					.execute()
				const flags = await transaction
					.selectFrom('hcm.tenant_feature_flag')
					.select('code')
					.where('enabled', '=', true)
					.orderBy('code')
					.execute()
				return {
					tenantId,
					user: {
						id: selected.id,
						displayName: selected.display_name,
						email: selected.email,
						...(selected.worker_id ? { employeeId: selected.worker_id } : {}),
					},
					access: {
						roles: roles.map(/** Project only persisted role identities. */ (row) => row.role_id),
						permissions: permissions.map(
							/** Project persisted discovery permissions, not inferred business capabilities. */ (
								row,
							) => row.permission_code,
						),
						entitlements: entitlements.map(
							/** Project enabled commercial entitlement replicas. */ (row) => row.code,
						),
						featureFlags: flags.map(
							/** Project enabled feature configuration. */ (row) => row.code,
						),
					},
					preferences: selected.preferences,
					version: `development-${selected.id}-${selected.revision}`,
					expiresAt: new Date(Date.now() + 3600000).toISOString(),
					development: {
						personaId: selected.persona_key,
						catalogueInspection: true,
						personas: candidates.map(
							/** Return safe selector labels, without exposing grants or account internals. */ (
								entry,
							) => ({
								id: entry.persona_key,
								displayName: entry.display_name,
								roleLabel: entry.role_label,
							}),
						),
					},
				}
			},
		)
	}

	/** Keep bootstrap reads private, bounded and restricted to a marked local database and safe runtime role. */
	private async read<Result>(
		query: (transaction: Transaction<RuntimeTables>) => Promise<Result>,
	): Promise<Result> {
		return this.database
			.transaction()
			.setIsolationLevel('repeatable read')
			.execute(
				/** Check the connected role and local target before any tenant data can be read. */ async (
					transaction,
				) => {
					await assertHcmRuntimeRole<RuntimeTables>(transaction)
					const marker = await sql<{
						valid: boolean
					}>`SELECT shobj_description(oid,'pg_database') = 'empflowyee:local-development:dunder-mifflin' AS valid FROM pg_database WHERE datname=current_database()`.execute(
						transaction,
					)
					if (!marker.rows[0]?.valid)
						throw new Error('Runtime database is not an approved local target')
					return query(transaction)
				},
			)
	}

	/** Drain the singleton pool when Nest or an integration harness shuts down. */
	onApplicationShutdown(): Promise<void> {
		return this.database.destroy()
	}
}

/** Let the next awaited query report an idle disconnect without logging provider secrets. */
function ignoreIdleFailure(): void {
	/* pg discards the failed idle client. */
}
