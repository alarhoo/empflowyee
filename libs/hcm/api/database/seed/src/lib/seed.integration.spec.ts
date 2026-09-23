import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from 'vitest'
import { Client } from 'pg'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { loadSqlMigrations, migrateHcmDatabase } from '@empflowyee/hcm-api-database-migrations'
import { runDevelopmentSeeds, type SeedOptions } from './hcm-api-database-seed'
import { loadSeedManifest, developmentSeedId, type SeedModule } from './seed-manifest'
import { seedConnection } from './seed-target'

const inventory = resolve('libs/hcm/api/database/migrations/sql')
const canonical = resolve('libs/hcm/api/database/seed/manifest')
let client: Client
let directory: string
let options: SeedOptions
let env: Record<string, string>

/** Build test-only manifest entries; this fixture does not register a business seed module. */
function module(id: string, dependsOn: string[] = [], version = 1): SeedModule {
	return {
		id,
		domain: 'testing',
		version,
		dependsOn,
		requiresMigrations: ['000002_development_seed_history.sql'],
		apply: `${id}.${version}.apply.sql`,
		reset: `${id}.${version}.reset.sql`,
	}
}

/** Write a test manifest with an intentionally declared source order. */
async function manifest(modules: SeedModule[]): Promise<void> {
	await writeFile(
		join(directory, 'manifest.json'),
		JSON.stringify({ formatVersion: 1, dataset: 'dunder-mifflin', modules }),
	)
}

/** Allocate reviewed SQL fixtures using the same stable-ID tokens as future seed modules. */
async function scripts(entry: SeedModule, apply: string, reset: string): Promise<void> {
	await writeFile(join(directory, entry.apply), `${apply}\n`)
	await writeFile(join(directory, entry.reset), `${reset}\n`)
}

/** Create a parent-child fixture whose FK forces both correct apply and correct reverse reset order. */
async function pair(childSuffix = '', parentResetPrefix = ''): Promise<void> {
	const parent = module('z-parent')
	const child = module('a-child', ['z-parent@1'])
	await manifest([child, parent])
	await scripts(
		parent,
		"INSERT INTO hcm.seed_probe VALUES ({{id:testing:record:parent}}, NULL, 'parent');",
		`${parentResetPrefix} DELETE FROM hcm.seed_probe WHERE id = {{id:testing:record:parent}};`,
	)
	await scripts(
		child,
		`INSERT INTO hcm.seed_probe VALUES ({{id:testing:record:child}}, {{id:testing:record:parent}}, 'child'); ${childSuffix}`,
		'DELETE FROM hcm.seed_probe WHERE id = {{id:testing:record:child}};',
	)
}

/** Inspect only fixture rows with no SQL/provider diagnostics exposed through the CLI. */
async function records(): Promise<{ id: string; value: string }[]> {
	return (
		await client.query<{ id: string; value: string }>(
			'SELECT id, value FROM hcm.seed_probe ORDER BY id',
		)
	).rows
}

beforeAll(
	/** Provision the foundation and isolated probes in the harness-owned disposable database. */ async () => {
		const connection = process.env['HCM_TEST_MIGRATOR']
		if (!connection) throw new Error('Disposable PostgreSQL harness is required')
		env = {
			APP_ENVIRONMENT: 'local',
			NODE_ENV: 'test',
			HCM_SEED_TARGET: 'local-dunder-mifflin',
			HCM_SEED_DATABASE_URL: connection,
		}
		client = new Client({ connectionString: connection })
		await client.connect()
		await client.query('DROP SCHEMA IF EXISTS hcm CASCADE')
		await migrateHcmDatabase(connection, inventory)
		await client.query(`CREATE TABLE hcm.seed_probe (id text PRIMARY KEY, parent_id text REFERENCES hcm.seed_probe(id), value text NOT NULL);
		ALTER TABLE hcm.seed_probe ENABLE ROW LEVEL SECURITY;
		ALTER TABLE hcm.seed_probe FORCE ROW LEVEL SECURITY;
		CREATE POLICY seed_fixture ON hcm.seed_probe TO hcm_migrator
		USING (id LIKE 'dunder-mifflin/%') WITH CHECK (id LIKE 'dunder-mifflin/%');
		CREATE TABLE hcm.seed_control (flag text PRIMARY KEY);`)
	},
)

beforeEach(
	/** Reset only disposable fixture state and allocate a fresh manifest for each scenario. */ async () => {
		await client.query(
			'DELETE FROM hcm.seed_probe; DELETE FROM hcm.seed_control; DELETE FROM hcm.development_seed_history',
		)
		directory = await mkdtemp(join(tmpdir(), 'hcm-seed-test-'))
		options = { env, manifestDirectory: directory, migrations: await loadSqlMigrations(inventory) }
	},
)

afterEach(
	/** Remove only the absolute temporary directory allocated by this suite. */ async () => {
		if (directory && directory.startsWith(join(tmpdir(), 'hcm-seed-test-')))
			await rm(directory, { recursive: true, force: true })
	},
)

afterAll(
	/** Close the suite client before the harness removes its container. */ async () => {
		await client?.end()
	},
)

it('supports an empty canonical dataset and explicit CLI without inventing business data', /** Seed and reset empty manifests safely and reject malformed CLI options without leaking the URI. */ async () => {
	expect(await runDevelopmentSeeds({ ...options, manifestDirectory: canonical })).toEqual([])
	expect(
		await runDevelopmentSeeds({
			...options,
			manifestDirectory: canonical,
			mode: 'reset',
			resetConfirmation: 'local-dunder-mifflin',
		}),
	).toEqual([])
	const result = spawnSync(process.execPath, ['tools/hcm-database/seed.mts'], {
		env: { ...process.env, ...env },
		encoding: 'utf8',
		windowsHide: true,
	})
	expect(result.status).toBe(0)
	expect(result.stdout).toContain('0 module versions changed')
	const reset = spawnSync(
		process.execPath,
		['tools/hcm-database/seed.mts', '--reset', '--confirm=local-dunder-mifflin'],
		{ env: { ...process.env, ...env }, encoding: 'utf8', windowsHide: true },
	)
	expect(reset.status).toBe(0)
	expect(reset.stdout).toContain('seed reset complete: 0')
	const rejected = spawnSync(process.execPath, ['tools/hcm-database/seed.mts', '--reset'], {
		env: { ...process.env, ...env },
		encoding: 'utf8',
		windowsHide: true,
	})
	expect(rejected.status).toBe(1)
	expect(rejected.stderr).not.toContain(env['HCM_SEED_DATABASE_URL'])
	expect(await records()).toEqual([])
})

it('uses stable IDs and dependency order regardless of manifest order, then reruns as a no-op', /** FK relationships expose incorrect order while row and ledger counts prove repeatability. */ async () => {
	await pair()
	expect(developmentSeedId('testing', 'record', 'parent')).toBe(
		'dunder-mifflin/testing/record/parent',
	)
	expect(await runDevelopmentSeeds(options)).toEqual(['z-parent@1', 'a-child@1'])
	const original = await records()
	expect(original).toHaveLength(2)
	expect(await runDevelopmentSeeds(options)).toEqual([])
	expect(await records()).toEqual(original)
	expect(
		(await client.query('SELECT count(*)::int AS count FROM hcm.development_seed_history')).rows[0]
			.count,
	).toBe(2)
})

it('checks versions, missing dependencies and cycles before opening a connection', /** Reject ambiguous inventories and accept an explicit immutable version upgrade after its predecessor. */ async () => {
	const first = module('upgrade')
	const second = module('upgrade', [], 2)
	await scripts(
		first,
		"INSERT INTO hcm.seed_probe VALUES ({{id:testing:record:versioned}}, NULL, 'v1');",
		'DELETE FROM hcm.seed_probe WHERE id = {{id:testing:record:versioned}};',
	)
	await scripts(
		second,
		"UPDATE hcm.seed_probe SET value='v2' WHERE id = {{id:testing:record:versioned}};",
		"UPDATE hcm.seed_probe SET value='v1' WHERE id = {{id:testing:record:versioned}};",
	)
	await manifest([second])
	// Unregistered source rejection also prevents dropping older module files from the manifest.
	await expect(loadSeedManifest(directory)).rejects.toThrow()
	await manifest([{ ...first, dependsOn: ['upgrade@2'] }, second])
	await expect(loadSeedManifest(directory)).rejects.toThrow('cycle')
	await manifest([{ ...first, dependsOn: ['absent@1'] }, second])
	await expect(loadSeedManifest(directory)).rejects.toThrow('Missing')
	await manifest([second, first])
	expect(await runDevelopmentSeeds(options)).toEqual(['upgrade@1', 'upgrade@2'])
	expect((await records())[0].value).toBe('v2')
})

it('rejects edited applied scripts and deleted history definitions while normalizing CRLF', /** Semantically unchanged line endings are safe; content and reset SQL remain immutable. */ async () => {
	await pair()
	await runDevelopmentSeeds(options)
	const path = join(directory, 'a-child.1.apply.sql')
	const original = await readFile(path, 'utf8')
	expect(original).toContain('\n')
	await writeFile(path, original.replaceAll('\n', '\r\n'))
	expect(await runDevelopmentSeeds(options)).toEqual([])
	await writeFile(path, `${original}\n-- changed`)
	await expect(runDevelopmentSeeds(options)).rejects.toThrow('immutable')
	await writeFile(path, original)
	await writeFile(join(directory, 'a-child.1.reset.sql'), 'PERFORM 1;')
	await expect(runDevelopmentSeeds(options)).rejects.toThrow('immutable')
	await expect(runDevelopmentSeeds({ ...options, manifestDirectory: canonical })).rejects.toThrow(
		'immutable',
	)
})

it('rejects missing or changed migrations before seed DML', /** A stale schema or declared missing prerequisite cannot produce partial business records. */ async () => {
	await pair()
	await manifest([
		module('z-parent'),
		{ ...module('a-child', ['z-parent@1']), requiresMigrations: ['000003_not_applied.sql'] },
	])
	await expect(runDevelopmentSeeds(options)).rejects.toThrow('prerequisite')
	await expect(
		runDevelopmentSeeds({ ...options, migrations: options.migrations.slice(0, 1) }),
	).rejects.toThrow('migrations')
	const changed = structuredClone(options.migrations)
	await expect(
		runDevelopmentSeeds({
			...options,
			migrations: [{ ...changed[0], checksum: '0'.repeat(64) }, changed[1]],
		}),
	).rejects.toThrow('checksums')
	expect(await records()).toEqual([])
})

it('preserves earlier commits and retries a failed module without editing its checksum', /** An external readiness prerequisite fails after INSERT, then succeeds on a second run with the same SQL. */ async () => {
	await pair(
		"IF NOT EXISTS (SELECT 1 FROM hcm.seed_control WHERE flag='ready') THEN RAISE EXCEPTION 'fixture prerequisite'; END IF;",
	)
	await expect(runDevelopmentSeeds(options)).rejects.toThrow('fixture prerequisite')
	expect(await records()).toEqual([
		{ id: developmentSeedId('testing', 'record', 'parent'), value: 'parent' },
	])
	await client.query("INSERT INTO hcm.seed_control VALUES ('ready')")
	expect(await runDevelopmentSeeds(options)).toEqual(['a-child@1'])
	expect(await records()).toHaveLength(2)
})

it('rejects transaction escape without committing data or history', /** Seed SQL cannot COMMIT independently of the protected ledger transaction. */ async () => {
	await pair('COMMIT;')
	await expect(runDevelopmentSeeds(options)).rejects.toMatchObject({ code: '2D000' })
	expect(await records()).toHaveLength(1)
	expect(
		(await client.query('SELECT module_id AS id FROM hcm.development_seed_history')).rows,
	).toEqual([{ id: 'z-parent' }])
})

it('serializes concurrent seed runners and cooperates with the migration advisory lock', /** Two runners racing on unique fixture rows must apply each version exactly once. */ async () => {
	await pair()
	await client.query('SELECT pg_advisory_lock(18419, 2)')
	const pending = runDevelopmentSeeds(options)
	// Observe the blocked runner via pg_stat_activity instead of assuming scheduler timing.
	try {
		let waiting = false
		for (let attempt = 0; attempt < 50; attempt++) {
			const result = await client.query(
				"SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name='hcm-development-seed' AND wait_event='advisory'",
			)
			if (result.rows[0].count > 0) {
				waiting = true
				break
			}
			await client.query('SELECT pg_sleep(0.02)')
		}
		expect(waiting).toBe(true)
	} finally {
		await client.query('SELECT pg_advisory_unlock(18419, 2)')
	}
	const results = await Promise.all([pending, runDevelopmentSeeds(options)])
	expect(results.flat()).toEqual(['z-parent@1', 'a-child@1'])
	expect(await records()).toHaveLength(2)
})

it('resets in reverse order, preserves other records and recreates identical IDs', /** Explicit reset removes only declared records and leaves unrelated local work untouched. */ async () => {
	await pair()
	await runDevelopmentSeeds(options)
	const original = await records()
	await client.query(
		"INSERT INTO hcm.seed_probe VALUES ('dunder-mifflin/testing/record/unmanaged', NULL, 'keep')",
	)
	await expect(runDevelopmentSeeds({ ...options, mode: 'reset' })).rejects.toThrow('confirmation')
	expect(
		await runDevelopmentSeeds({
			...options,
			mode: 'reset',
			resetConfirmation: 'local-dunder-mifflin',
		}),
	).toEqual(['a-child@1', 'z-parent@1'])
	expect(await records()).toEqual([
		{ id: 'dunder-mifflin/testing/record/unmanaged', value: 'keep' },
	])
	await runDevelopmentSeeds(options)
	expect(
		(await records()).filter(
			/** Compare only the reconstituted managed fixture identities. */ (row) =>
				row.value !== 'keep',
		),
	).toEqual(original)
})

it('rolls back the entire reset when a later reverse step fails', /** A parent reset failure restores the already-deleted child and all history entries. */ async () => {
	await pair(
		'',
		"IF EXISTS (SELECT 1 FROM hcm.seed_control WHERE flag='block-reset') THEN RAISE EXCEPTION 'reset blocked'; END IF;",
	)
	await runDevelopmentSeeds(options)
	const original = await records()
	await client.query("INSERT INTO hcm.seed_control VALUES ('block-reset')")
	const reset = { ...options, mode: 'reset' as const, resetConfirmation: 'local-dunder-mifflin' }
	await expect(runDevelopmentSeeds(reset)).rejects.toThrow('reset blocked')
	expect(await records()).toEqual(original)
	expect(
		(await client.query('SELECT count(*)::int AS count FROM hcm.development_seed_history')).rows[0]
			.count,
	).toBe(2)
	await client.query('DELETE FROM hcm.seed_control')
	expect(await runDevelopmentSeeds(reset)).toEqual(['a-child@1', 'z-parent@1'])
})

it('denies unknown, production, cloud and redirected targets before connecting', /** Exercise independent activation gates, including URI query parameters that could override pg routing. */ () => {
	for (const override of [
		{ APP_ENVIRONMENT: 'production' },
		{ APP_ENVIRONMENT: 'qa' },
		{ APP_ENVIRONMENT: '' },
		{ NODE_ENV: 'production' },
		{ NODE_ENV: '' },
		{ HCM_SEED_TARGET: 'production' },
		{ K_SERVICE: 'deployed' },
		{ CLOUD_RUN_JOB: 'deployed' },
		{ HCM_SEED_DATABASE_URL: env['HCM_SEED_DATABASE_URL'] + '?host=production.example' },
		{ HCM_SEED_DATABASE_URL: env['HCM_SEED_DATABASE_URL'].replace('127.0.0.1', 'localhost') },
		{ HCM_SEED_DATABASE_URL: env['HCM_SEED_DATABASE_URL'].replace('hcm_db', 'postgres') },
		{ HCM_SEED_DATABASE_URL: env['HCM_SEED_DATABASE_URL'].replace('hcm_migrator', 'postgres') },
		{ HCM_SEED_DATABASE_URL: '' },
	])
		expect(
			/** Validate unsafe configuration without invoking any database code. */ () =>
				seedConnection({ ...env, ...override }),
		).toThrow()
	expect(seedConnection(env)).toBe(env['HCM_SEED_DATABASE_URL'])
})

it('requires the database-side local marker and denies runtime ledger access', /** Removing the independent marker blocks seeding even with correct local environment flags. */ async () => {
	await pair()
	await client.query('COMMENT ON DATABASE hcm_db IS NULL')
	try {
		await expect(runDevelopmentSeeds(options)).rejects.toThrow('approved local seed target')
	} finally {
		await client.query(
			"COMMENT ON DATABASE hcm_db IS 'empflowyee:local-development:dunder-mifflin'",
		)
	}
	const runtime = new Client({ connectionString: process.env['HCM_TEST_RUNTIME'] })
	await runtime.connect()
	try {
		await expect(runtime.query('SELECT * FROM hcm.development_seed_history')).rejects.toMatchObject(
			{ code: '42501' },
		)
	} finally {
		await runtime.end()
	}
	expect(await records()).toEqual([])
})

it('rejects traversal, duplicate versions, unknown fields and invalid stable-ID tokens', /** Invalid manifest structures cannot reach SQL execution or reference files outside their source directory. */ async () => {
	await pair()
	await manifest([module('z-parent'), module('z-parent')])
	await expect(loadSeedManifest(directory)).rejects.toThrow('Duplicate')
	await manifest([
		{ ...module('z-parent'), apply: '../outside.sql' },
		module('a-child', ['z-parent@1']),
	])
	await expect(loadSeedManifest(directory)).rejects.toThrow('Unsafe')
	await writeFile(
		join(directory, 'manifest.json'),
		JSON.stringify({ formatVersion: 1, dataset: 'dunder-mifflin', modules: [], unexpected: true }),
	)
	await expect(loadSeedManifest(directory)).rejects.toThrow('fields')
	await pair()
	await writeFile(join(directory, 'z-parent.1.apply.sql'), 'PERFORM {{id:testing:record:bad/key}};')
	await expect(loadSeedManifest(directory)).rejects.toThrow('stable seed ID')
	expect(
		/** Reject seed keys containing SQL text or separators. */ () =>
			developmentSeedId('testing', 'record', "a'); DROP TABLE hcm.seed_probe; --"),
	).toThrow()
})
