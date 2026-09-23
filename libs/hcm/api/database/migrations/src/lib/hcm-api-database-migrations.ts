import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Client } from 'pg'

export interface SqlMigration {
	readonly name: string
	readonly sql: string
	readonly checksum: string
}

/** Load ordered SQL, rejecting gaps, symlinks, empty files and ambiguous filenames. */
export async function loadSqlMigrations(directory: string): Promise<readonly SqlMigration[]> {
	const entries = await readdir(directory, { withFileTypes: true })
	const names: string[] = []
	for (const entry of entries) {
		if (!entry.isFile() || !/^\d{6}_[a-z][a-z0-9_]*\.sql$/.test(entry.name))
			throw new Error('Invalid migration inventory entry')
		names.push(entry.name)
	}
	names.sort()
	if (!names.length) throw new Error('Empty migration inventory')
	const migrations: SqlMigration[] = []
	for (const [index, name] of names.entries()) {
		if (Number(name.slice(0, 6)) !== index + 1)
			throw new Error('Migration sequence has a gap or duplicate')
		const sql = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
			.decode(await readFile(join(directory, name)))
			.replaceAll('\r\n', '\n')
		if (!sql.trim() || sql.includes('\u0000') || sql.startsWith('\uFEFF'))
			throw new Error('Invalid SQL encoding or empty migration')
		migrations.push({ name, sql, checksum: createHash('sha256').update(sql).digest('hex') })
	}
	return migrations
}

/** Apply immutable SQL under a dedicated advisory lock; always close the migrator connection. */
export async function migrateHcmDatabase(
	connectionString: string,
	directory: string,
): Promise<string[]> {
	const migrations = await loadSqlMigrations(directory)
	const client = new Client({
		connectionString,
		connectionTimeoutMillis: 10000,
		application_name: 'hcm-migrations',
	})
	client.on('error', ignoreConnectionDiagnostic)
	try {
		await client.connect()
		const identity = await client.query<{ valid: boolean }>(`
			SELECT current_database() = 'hcm_db' AND current_user = 'hcm_migrator'
			AND session_user = current_user AND NOT rolsuper AND NOT rolbypassrls
			AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication
			AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid) AS valid
			FROM pg_roles r WHERE rolname = current_user`)
		if (!identity.rows[0]?.valid)
			throw new Error('Migration connection must use the restricted hcm_migrator role in hcm_db')
		await client.query("SET statement_timeout = '60s'")
		await client.query("SET lock_timeout = '15s'")
		await client.query('SELECT pg_advisory_lock(18419, 2)')
		await client.query('BEGIN')
		await client.query(`
			CREATE SCHEMA IF NOT EXISTS hcm AUTHORIZATION hcm_migrator;
			REVOKE ALL ON SCHEMA hcm FROM PUBLIC;
			CREATE TABLE IF NOT EXISTS hcm.schema_migrations (
				name text PRIMARY KEY,
				checksum text NOT NULL CHECK (length(checksum) = 64),
				applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
			);
			REVOKE ALL ON hcm.schema_migrations FROM PUBLIC, hcm_runtime;
		`)
		await client.query('COMMIT')
		const history = await client.query<{ name: string; checksum: string }>(
			'SELECT name, checksum FROM hcm.schema_migrations ORDER BY name',
		)
		for (const [index, applied] of history.rows.entries()) {
			const expected = migrations[index]
			if (!expected || applied.name !== expected.name || applied.checksum !== expected.checksum)
				throw new Error('Applied migration history does not match the immutable SQL inventory')
		}
		const applied: string[] = []
		for (const migration of migrations.slice(history.rows.length)) {
			await client.query('BEGIN')
			// A nested anonymous block cannot commit/rollback the surrounding transaction.
			const delimiter = `$hcm_${randomUUID().replaceAll('-', '')}$`
			await client.query(`DO ${delimiter}\nBEGIN\n${migration.sql}\nEND\n${delimiter};`)
			await client.query('INSERT INTO hcm.schema_migrations (name, checksum) VALUES ($1, $2)', [
				migration.name,
				migration.checksum,
			])
			await client.query('COMMIT')
			applied.push(migration.name)
		}
		return applied
	} finally {
		// Closing rolls back an aborted transaction and releases the session advisory lock.
		await client.end()
	}
}

/** Leave asynchronous connection failures to awaited operations without leaking server diagnostics. */
function ignoreConnectionDiagnostic(): void {
	// pg requires an error listener to avoid an unhandled idle connection error.
}
