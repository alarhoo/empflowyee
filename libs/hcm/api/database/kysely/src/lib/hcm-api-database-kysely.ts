import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely'
import { Pool } from 'pg'
import {
	requireAuthenticatedTenant,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'

export interface HcmDatabaseOptions {
	connectionString: string
	maxConnections?: number
}

/** Own a restricted runtime pool; domain code receives only a verified tenant transaction. */
export class HcmTenantDatabase<Database> {
	private readonly database: Kysely<Database>

	/** Build a lazy bounded pool without connecting or migrating during API bootstrap. */
	constructor(options: HcmDatabaseOptions) {
		const max = options.maxConnections ?? 10
		if (!Number.isInteger(max) || max < 1 || max > 100)
			throw new Error('Invalid database pool size')
		const pool = new Pool({
			connectionString: options.connectionString,
			max,
			connectionTimeoutMillis: 10000,
			idleTimeoutMillis: 30000,
			statement_timeout: 30000,
			application_name: 'hcm-runtime',
		})
		pool.on('error', ignoreIdleDiagnostic)
		this.database = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) })
	}

	/** Revalidate session and role before installing transaction-local context and executing domain queries. */
	async transaction<Result>(
		context: AuthenticatedHcmContext,
		query: (transaction: Transaction<Database>) => Promise<Result>,
	): Promise<Result> {
		requireAuthenticatedTenant(context)
		return this.database.transaction().execute(
			/** Check the checked-out connection before it can carry tenant data. */ async (
				transaction,
			) => {
				const tenantId = requireAuthenticatedTenant(context)
				const identity = await sql<{ valid: boolean }>`
					SELECT current_database() = 'hcm_db' AND current_user = 'hcm_runtime'
					AND session_user = current_user AND NOT rolsuper AND NOT rolbypassrls
					AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication
					AND NOT has_database_privilege(current_user, current_database(), 'CREATE')
					AND NOT has_schema_privilege(current_user, 'hcm', 'CREATE')
					AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid)
					AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relowner = r.oid)
					AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proowner = r.oid)
					AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typowner = r.oid)
					AND NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = r.oid) AS valid
					FROM pg_roles r WHERE rolname = current_user
				`.execute(transaction)
				if (!identity.rows[0]?.valid) throw new Error('Unsafe HCM runtime database role')
				await sql`SELECT set_config('hcm.tenant_id', ${tenantId}, true)`.execute(transaction)
				return query(transaction)
			},
		)
	}

	/** Drain connections when an owning module or standalone consumer shuts down. */
	destroy(): Promise<void> {
		return this.database.destroy()
	}

	/** Integrate pool cleanup with Nest without importing framework types into the adapter. */
	onApplicationShutdown(): Promise<void> {
		return this.destroy()
	}
}

/** Avoid emitting credentials from idle pool errors; pg discards the failed client. */
function ignoreIdleDiagnostic(): void {
	// The next awaited transaction reports availability failure to its application boundary.
}
