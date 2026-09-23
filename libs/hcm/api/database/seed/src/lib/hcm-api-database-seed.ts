import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { loadSeedManifest, seedDependencies, type LoadedSeedModule } from './seed-manifest.ts'
import { seedConnection } from './seed-target.ts'

export interface SeedOptions {
	env: Readonly<Record<string, string | undefined>>
	manifestDirectory: string
	/** The CLI supplies the complete canonical inventory from the HCM0-02 loader. */
	migrations: readonly { readonly name: string; readonly checksum: string }[]
	mode?: 'apply' | 'reset'
	resetConfirmation?: string
}

/** Apply or explicitly reset reviewed local seed modules, always closing the dedicated privileged connection. */
export async function runDevelopmentSeeds(options: SeedOptions): Promise<string[]> {
	const connectionString = seedConnection(options.env)
	const mode = options.mode ?? 'apply'
	if (
		!['apply', 'reset'].includes(mode) ||
		(mode === 'reset' && options.resetConfirmation !== 'local-dunder-mifflin')
	)
		throw new Error('Reset requires explicit local target confirmation')
	const modules = await loadSeedManifest(options.manifestDirectory)
	const client = new Client({
		connectionString,
		connectionTimeoutMillis: 10000,
		application_name: 'hcm-development-seed',
	})
	client.on('error', ignoreConnectionDiagnostic)
	try {
		await client.connect()
		await client.query("SET statement_timeout = '60s'")
		await client.query("SET lock_timeout = '15s'")
		// Same lock as HCM0-02: migrations, seed and reset cannot overlap.
		await client.query('SELECT pg_advisory_lock(18419, 2)')
		await verifyTarget(client)
		await verifyMigrations(client, options.migrations, modules)
		const history = await client.query<{ id: string; version: number; checksum: string }>(
			"SELECT module_id AS id, version, checksum FROM hcm.development_seed_history WHERE dataset = 'dunder-mifflin'",
		)
		const applied = new Set<string>()
		const available = new Map(
			modules.map(
				/** Index immutable definitions by exact version identity. */ (module) => [
					module.key,
					module,
				],
			),
		)
		for (const row of history.rows) {
			const key = `${row.id}@${row.version}`
			if (available.get(key)?.checksum !== row.checksum)
				throw new Error('Applied seed history does not match the immutable manifest')
			applied.add(key)
		}
		for (const module of modules) {
			if (
				applied.has(module.key) &&
				seedDependencies(module).some(
					/** Require recorded prerequisites for every historical module. */ (key) =>
						!applied.has(key),
				)
			)
				throw new Error('Seed history is missing a dependency')
		}
		const changed: string[] = []
		if (mode === 'reset') {
			await client.query('BEGIN')
			for (const module of [...modules].reverse()) {
				if (!applied.has(module.key)) continue
				await executeSql(client, module.resetSql)
				await client.query(
					"DELETE FROM hcm.development_seed_history WHERE dataset = 'dunder-mifflin' AND module_id = $1 AND version = $2",
					[module.id, module.version],
				)
				changed.push(module.key)
			}
			await client.query('COMMIT')
		} else {
			for (const module of modules) {
				if (applied.has(module.key)) continue
				await client.query('BEGIN')
				await executeSql(client, module.applySql)
				await client.query(
					"INSERT INTO hcm.development_seed_history (dataset, module_id, version, checksum) VALUES ('dunder-mifflin', $1, $2, $3)",
					[module.id, module.version, module.checksum],
				)
				await client.query('COMMIT')
				changed.push(module.key)
			}
		}
		return changed
	} finally {
		// Disconnect rolls back any failed transaction and releases the shared advisory lock.
		await client.end()
	}
}

/** Require an independently marked local database and a directly authenticated restricted migrator role. */
async function verifyTarget(client: Client): Promise<void> {
	const result = await client.query<{ valid: boolean }>(`
		SELECT current_database() = 'hcm_db' AND current_user = 'hcm_migrator'
		AND session_user = current_user AND NOT rolsuper AND NOT rolbypassrls
		AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication
		AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid)
		AND (SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname = current_database()) = 'empflowyee:local-development:dunder-mifflin' AS valid
		FROM pg_roles r WHERE rolname = current_user`)
	if (!result.rows[0]?.valid) throw new Error('Database is not an approved local seed target')
}

/** Require the complete unchanged SQL history and every module prerequisite before performing any writes. */
async function verifyMigrations(
	client: Client,
	expected: SeedOptions['migrations'],
	modules: readonly LoadedSeedModule[],
): Promise<void> {
	if (!expected.length) throw new Error('Canonical migrations are required')
	const history = await client.query<{ name: string; checksum: string }>(
		'SELECT name, checksum FROM hcm.schema_migrations ORDER BY name',
	)
	if (history.rows.length !== expected.length)
		throw new Error('Missing or unexpected database migrations')
	const names = new Set<string>()
	for (const [index, row] of history.rows.entries()) {
		if (expected[index].name !== row.name || expected[index].checksum !== row.checksum)
			throw new Error('Migration checksums do not match the canonical inventory')
		names.add(row.name)
	}
	for (const module of modules) {
		for (const migration of module.requiresMigrations)
			if (!names.has(migration)) throw new Error('Missing seed migration prerequisite')
	}
}

/** Prevent apply/reset scripts from committing outside their accompanying history transaction. */
async function executeSql(client: Client, sql: string): Promise<void> {
	const delimiter = `$seed_${randomUUID().replaceAll('-', '')}$`
	await client.query(`DO ${delimiter}\nBEGIN\n${sql}\nEND\n${delimiter};`)
}

/** Let awaited queries report availability failures without logging provider or credential details. */
function ignoreConnectionDiagnostic(): void {
	// pg requires an error listener on connections that can fail while idle.
}
