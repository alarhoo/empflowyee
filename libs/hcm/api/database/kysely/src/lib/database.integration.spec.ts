import { beforeAll, afterAll, it, expect, vi } from 'vitest'
import { Client } from 'pg'
import { sql, type Transaction } from 'kysely'
import { resolve, join } from 'node:path'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { migrateHcmDatabase, loadSqlMigrations } from '@empflowyee/hcm-api-database-migrations'
import {
	HcmRuntimeApplication,
	type AuthenticatedHcmContext,
	type TenantRecord,
} from '@empflowyee/hcm-api-runtime-application'
import { HcmTenantDatabase } from './hcm-api-database-kysely'

interface TestDatabase {
	'hcm.isolation_probe': { tenant_id: string; id: number; value: string }
}

const inventory = resolve('libs/hcm/api/database/migrations/sql')
let directory: string
let migrator: Client
let runtime: Client
let database: HcmTenantDatabase<TestDatabase>
let tenantA: AuthenticatedHcmContext
let tenantB: AuthenticatedHcmContext

/** Require the test harness's isolated connection instead of accepting developer/production databases. */
function connection(role: 'MIGRATOR' | 'RUNTIME' | 'ADMIN'): string {
	const value = process.env[`HCM_TEST_${role}`]
	if (!value) throw new Error('Disposable PostgreSQL harness is required')
	return value
}

/** Obtain a context through the real runtime application using test-only verified session ports. */
async function scope(
	tenantId: string,
	expiresAt = '2099-01-01T00:00:00Z',
	memberTenant = tenantId,
): Promise<AuthenticatedHcmContext> {
	const record: TenantRecord = {
		id: tenantId,
		discovery: {
			tenant: {
				slug: 'test',
				displayName: 'Test tenant',
				status: 'active',
				allowUserTheme: true,
				defaults: {},
			},
			authentication: { strategies: [] },
		},
	}
	const application = new HcmRuntimeApplication(
		{ findByHost: /** Resolve a deterministic test authority. */ async () => record },
		{
			read: /** Simulate an already verified session, never a browser credential parser. */ async () => ({
				tenantId: memberTenant,
				expiresAt,
				user: { id: 'test-user', displayName: 'Test User' },
				access: { roles: [], permissions: [], entitlements: [], featureFlags: [] },
				preferences: {},
				version: 'test',
			}),
		},
	)
	return application.authenticate(await application.resolveTenant('test.localhost'))
}

/** Read the fixture without an explicit WHERE so PostgreSQL itself must enforce isolation. */
async function rows(transaction: Transaction<TestDatabase>) {
	return transaction.selectFrom('hcm.isolation_probe').selectAll().orderBy('id').execute()
}

beforeAll(
	/** Prepare clients and a private temporary SQL inventory owned by this test. */ async () => {
		directory = await mkdtemp(join(tmpdir(), 'hcm-database-test-'))
		for (const migration of await loadSqlMigrations(inventory))
			await writeFile(join(directory, migration.name), migration.sql)
		migrator = new Client({ connectionString: connection('MIGRATOR') })
		runtime = new Client({ connectionString: connection('RUNTIME') })
		await migrator.connect()
		await runtime.connect()
		// Suites run serially against a uniquely allocated disposable database, never a developer target.
		await migrator.query('DROP SCHEMA IF EXISTS hcm CASCADE')
		database = new HcmTenantDatabase({ connectionString: connection('RUNTIME'), maxConnections: 1 })
		tenantA = await scope('tenant-a')
		tenantB = await scope('tenant-b')
	},
)

afterAll(
	/** Release pool, clients and only the temporary inventory allocated by this suite. */ async () => {
		await database?.destroy()
		await migrator?.end()
		await runtime?.end()
		if (directory && directory.startsWith(join(tmpdir(), 'hcm-database-test-')))
			await rm(directory, { recursive: true, force: true })
	},
)

it('serializes concurrent runners, applies once and exposes only foundation objects', /** Race two sessions and verify the protected history plus no business tables. */ async () => {
	const results = await Promise.all([
		migrateHcmDatabase(connection('MIGRATOR'), inventory),
		migrateHcmDatabase(connection('MIGRATOR'), inventory),
	])
	expect(results.flat()).toEqual(
		(await loadSqlMigrations(inventory)).map(
			/** Compare exactly the approved ordered inventory. */ (migration) => migration.name,
		),
	)
	expect(await migrateHcmDatabase(connection('MIGRATOR'), inventory)).toEqual([])
	expect(
		(
			await migrator.query(
				"SELECT tablename FROM pg_tables WHERE schemaname='hcm' ORDER BY tablename",
			)
		).rows,
	).toEqual(
		[
			'access_permission',
			'access_role',
			'account_role',
			'assignment',
			'development_persona',
			'development_seed_history',
			'employment',
			'entitlement_definition',
			'location',
			'organisation',
			'person',
			'role_permission',
			'schema_migrations',
			'tenant',
			'tenant_entitlement',
			'tenant_feature_flag',
			'tenant_hostname',
			'user_account',
			'worker',
		].map(
			/** Match the approved spine and bookkeeping tables without inventing business applications. */ (
				tablename,
			) => ({ tablename }),
		),
	)
	await expect(runtime.query('SELECT * FROM hcm.schema_migrations')).rejects.toMatchObject({
		code: '42501',
	})
	await expect(migrateHcmDatabase(connection('RUNTIME'), inventory)).rejects.toThrow(
		'restricted hcm_migrator',
	)
})

it('rejects historical edits and sequence gaps before changing the database', /** Ensure checksums survive CRLF checkout but detect substantive historical changes. */ async () => {
	const original = await readFile(join(directory, '000001_database_foundation.sql'), 'utf8')
	await writeFile(
		join(directory, '000001_database_foundation.sql'),
		original.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'),
	)
	expect(await migrateHcmDatabase(connection('MIGRATOR'), directory)).toEqual([])
	await writeFile(join(directory, '000001_database_foundation.sql'), `${original}\n-- edited`)
	await expect(migrateHcmDatabase(connection('MIGRATOR'), directory)).rejects.toThrow('immutable')
	await writeFile(join(directory, '000001_database_foundation.sql'), original)
	await writeFile(join(directory, '000007_gap.sql'), 'SELECT 1;')
	await expect(loadSqlMigrations(directory)).rejects.toThrow('gap')
	await rm(join(directory, '000007_gap.sql'))
	await writeFile(join(directory, '000006_bad_encoding.sql'), Buffer.from([0xc3, 0x28]))
	await expect(loadSqlMigrations(directory)).rejects.toThrow()
	await rm(join(directory, '000006_bad_encoding.sql'))
})

it('rolls back failed DDL and prevents SQL from committing outside the history transaction', /** Failed and transaction-ending scripts leave neither objects nor history, then allow a corrected unapplied retry. */ async () => {
	const file = join(directory, '000006_transaction_probe.sql')
	await writeFile(file, 'CREATE TABLE hcm.transaction_probe (id integer); SELECT 1 / 0;')
	await expect(migrateHcmDatabase(connection('MIGRATOR'), directory)).rejects.toBeDefined()
	expect(
		(await migrator.query("SELECT to_regclass('hcm.transaction_probe') AS object")).rows[0].object,
	).toBeNull()
	await writeFile(file, 'CREATE TABLE hcm.transaction_probe (id integer); COMMIT;')
	await expect(migrateHcmDatabase(connection('MIGRATOR'), directory)).rejects.toMatchObject({
		code: '2D000',
	})
	expect(
		(await migrator.query("SELECT to_regclass('hcm.transaction_probe') AS object")).rows[0].object,
	).toBeNull()
	await writeFile(file, 'CREATE TABLE hcm.transaction_probe (id integer);')
	await writeFile(
		join(directory, '000007_order_probe.sql'),
		'ALTER TABLE hcm.transaction_probe ADD COLUMN verified boolean;',
	)
	expect(await migrateHcmDatabase(connection('MIGRATOR'), directory)).toEqual([
		'000006_transaction_probe.sql',
		'000007_order_probe.sql',
	])
	expect(await migrateHcmDatabase(connection('MIGRATOR'), directory)).toEqual([])
	await expect(migrateHcmDatabase(connection('MIGRATOR'), inventory)).rejects.toThrow('immutable')
	await migrator.query(
		"DROP TABLE hcm.transaction_probe; DELETE FROM hcm.schema_migrations WHERE name > '000005_identity_access_spine.sql'",
	)
})

it('runs the explicit CLI without exposing credentials and does not migrate on pool creation', /** Exercise Node 24 TypeScript execution and verify idle pool construction is side-effect free. */ async () => {
	const output = execFileSync(process.execPath, ['tools/hcm-database/migrate.mts'], {
		env: { ...process.env, HCM_MIGRATION_DATABASE_URL: connection('MIGRATOR') },
		encoding: 'utf8',
		windowsHide: true,
	})
	expect(output).toContain('0 applied')
	expect(output).not.toContain(connection('MIGRATOR'))
	expect(
		(
			await migrator.query(
				"SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = 'hcm-runtime'",
			)
		).rows[0].count,
	).toBe(0)
})

it('requires real session provenance and rejects mismatched or expired membership', /** Forged copies, missing context and expired sessions cannot reach a database callback. */ async () => {
	const query = vi.fn(rows)
	await expect(database.transaction({ ...tenantA }, query)).rejects.toThrow('unauthenticated')
	await expect(
		database.transaction(undefined as unknown as AuthenticatedHcmContext, query),
	).rejects.toThrow('unauthenticated')
	await expect(scope('tenant-a', '2000-01-01T00:00:00Z')).rejects.toThrow('unauthenticated')
	await expect(scope('tenant-a', undefined, 'tenant-b')).rejects.toThrow('forbidden')
	const soonExpired = await scope('tenant-a', new Date(Date.now() + 10000).toISOString())
	vi.useFakeTimers()
	try {
		vi.setSystemTime(Date.now() + 20000)
		await expect(database.transaction(soonExpired, query)).rejects.toThrow('unauthenticated')
	} finally {
		vi.useRealTimers()
	}
	expect(query).not.toHaveBeenCalled()
})

it('enforces RLS for all operations and prevents cross-tenant ownership changes', /** Use a fixture-only tenant table; test unfiltered reads and adversarial writes with the restricted role. */ async () => {
	await migrator.query(`CREATE TABLE hcm.isolation_probe (tenant_id text NOT NULL, id integer NOT NULL, value text NOT NULL, PRIMARY KEY (tenant_id, id));
		ALTER TABLE hcm.isolation_probe ENABLE ROW LEVEL SECURITY;
		ALTER TABLE hcm.isolation_probe FORCE ROW LEVEL SECURITY;
		CREATE POLICY tenant_isolation ON hcm.isolation_probe TO hcm_runtime
		USING (tenant_id = hcm.current_tenant_id()) WITH CHECK (tenant_id = hcm.current_tenant_id());
		GRANT SELECT, INSERT, UPDATE, DELETE ON hcm.isolation_probe TO hcm_runtime;`)
	await database.transaction(
		tenantA,
		/** Insert an allowed tenant A fixture through the production adapter. */ async (tx) => {
			await tx
				.insertInto('hcm.isolation_probe')
				.values({ tenant_id: 'tenant-a', id: 1, value: 'A' })
				.execute()
		},
	)
	await database.transaction(
		tenantB,
		/** Insert an independent tenant B fixture. */ async (tx) => {
			await tx
				.insertInto('hcm.isolation_probe')
				.values({ tenant_id: 'tenant-b', id: 1, value: 'B' })
				.execute()
		},
	)
	expect(await database.transaction(tenantA, rows)).toEqual([
		{ tenant_id: 'tenant-a', id: 1, value: 'A' },
	])
	expect(await database.transaction(tenantB, rows)).toEqual([
		{ tenant_id: 'tenant-b', id: 1, value: 'B' },
	])
	await expect(
		database.transaction(
			tenantA,
			/** Attempt insertion into another tenant. */ async (tx) =>
				tx
					.insertInto('hcm.isolation_probe')
					.values({ tenant_id: 'tenant-b', id: 2, value: 'hostile' })
					.execute(),
		),
	).rejects.toMatchObject({ code: '42501' })
	await expect(
		database.transaction(
			tenantA,
			/** Attempt to reassign a visible row to another tenant. */ async (tx) =>
				tx.updateTable('hcm.isolation_probe').set({ tenant_id: 'tenant-b' }).execute(),
		),
	).rejects.toMatchObject({ code: '42501' })
	const updated = await database.transaction(
		tenantA,
		/** Try to update a hidden tenant B row. */ async (tx) =>
			tx
				.updateTable('hcm.isolation_probe')
				.set({ value: 'hostile' })
				.where('tenant_id', '=', 'tenant-b')
				.executeTakeFirst(),
	)
	expect(updated.numUpdatedRows).toBe(0n)
	const deleted = await database.transaction(
		tenantA,
		/** Try to delete hidden tenant B rows. */ async (tx) =>
			tx.deleteFrom('hcm.isolation_probe').where('tenant_id', '=', 'tenant-b').executeTakeFirst(),
	)
	expect(deleted.numDeletedRows).toBe(0n)
	expect((await runtime.query('SELECT * FROM hcm.isolation_probe')).rows).toEqual([])
	await expect(
		runtime.query("INSERT INTO hcm.isolation_probe VALUES ('tenant-a', 3, 'missing context')"),
	).rejects.toMatchObject({ code: '42501' })
	await expect(
		runtime.query('ALTER TABLE hcm.isolation_probe DISABLE ROW LEVEL SECURITY'),
	).rejects.toMatchObject({ code: '42501' })
	await expect(runtime.query('SET ROLE hcm_migrator')).rejects.toMatchObject({ code: '42501' })
})

it('clears tenant settings after commit and rollback on the same pooled connection', /** Reuse a one-connection pool, inspect its setting after rollback and check concurrent callers remain separate. */ async () => {
	const first = await database.transaction(
		tenantA,
		/** Identify the physical backend in the committed transaction. */ async (tx) =>
			(await sql<{ pid: number }>`SELECT pg_backend_pid() AS pid`.execute(tx)).rows[0].pid,
	)
	await expect(
		database.transaction(
			tenantA,
			/** Roll back both a data change and the tenant setting. */ async (tx) => {
				await tx.updateTable('hcm.isolation_probe').set({ value: 'rolled back' }).execute()
				throw new Error('intentional rollback')
			},
		),
	).rejects.toThrow('intentional rollback')
	await database.transaction(
		tenantB,
		/** Assert pool reuse, then RESET LOCAL exposes no leftover tenant state from the prior transaction. */ async (
			tx,
		) => {
			expect(
				(await sql<{ pid: number }>`SELECT pg_backend_pid() AS pid`.execute(tx)).rows[0].pid,
			).toBe(first)
			await sql`RESET hcm.tenant_id`.execute(tx)
			expect(
				(await sql<{ tenant: string | null }>`SELECT hcm.current_tenant_id() AS tenant`.execute(tx))
					.rows[0].tenant,
			).toBeNull()
			expect(await rows(tx)).toEqual([])
		},
	)
	const [a, b] = await Promise.all([
		database.transaction(tenantA, rows),
		database.transaction(tenantB, rows),
	])
	expect(a[0].value).toBe('A')
	expect(b[0].value).toBe('B')
})

it('rechecks expiry after a request waits for a pooled connection', /** Hold the only connection until a queued session expires and ensure its query never executes. */ async () => {
	let release!: () => void
	let entered!: () => void
	const gate = new Promise<void>(
		/** Hold a checked-out transaction until the test releases it. */ (resolveGate) => {
			release = resolveGate
		},
	)
	const started = new Promise<void>(
		/** Signal that the pool has no available connections. */ (resolveStarted) => {
			entered = resolveStarted
		},
	)
	const holding = database.transaction(
		tenantA,
		/** Occupy the sole pool connection. */ async () => {
			entered()
			await gate
		},
	)
	await started
	const expiring = await scope('tenant-a', new Date(Date.now() + 10000).toISOString())
	const query = vi.fn(rows)
	const queued = database.transaction(expiring, query)
	const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 20000)
	try {
		release()
		await holding
		await expect(queued).rejects.toThrow('unauthenticated')
		expect(query).not.toHaveBeenCalled()
	} finally {
		clock.mockRestore()
		release()
	}
})

it('fails closed if an operator accidentally elevates the runtime role', /** Verify real catalog inspection blocks BYPASSRLS even for an otherwise valid verified session. */ async () => {
	const admin = new Client({ connectionString: connection('ADMIN') })
	await admin.connect()
	const query = vi.fn(rows)
	try {
		await admin.query('ALTER ROLE hcm_runtime BYPASSRLS')
		await expect(database.transaction(tenantA, query)).rejects.toThrow('Unsafe HCM runtime')
		expect(query).not.toHaveBeenCalled()
	} finally {
		await admin.query('ALTER ROLE hcm_runtime NOBYPASSRLS')
		await admin.end()
	}
})

it('rejects elevated connections and drains the runtime pool on shutdown', /** A valid tenant never legitimizes a migrator connection; destruction closes physical runtime sessions. */ async () => {
	const unsafe = new HcmTenantDatabase<TestDatabase>({ connectionString: connection('MIGRATOR') })
	try {
		await expect(unsafe.transaction(tenantA, rows)).rejects.toThrow('Unsafe HCM runtime')
	} finally {
		await unsafe.destroy()
	}
	await database.onApplicationShutdown()
	expect(
		(
			await migrator.query(
				"SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = 'hcm-runtime'",
			)
		).rows[0].count,
	).toBe(0)
	await expect(database.transaction(tenantA, rows)).rejects.toThrow()
})
