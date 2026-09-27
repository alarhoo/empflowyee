import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client, Pool } from 'pg'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { migrateHcmDatabase, loadSqlMigrations } from '@empflowyee/hcm-api-database-migrations'
import { runDevelopmentSeeds } from '@empflowyee/hcm-api-database-seed'
import {
	ImportSourceError,
	type ImportSourceStore,
} from '@empflowyee/hcm-api-documents-application'
import {
	KyselyDocumentStoragePort,
	LocalDocumentFiles,
	provisionDocumentRoot,
} from '@empflowyee/hcm-api-documents-infrastructure'

const TENANT = 'local-dunder-mifflin'
const TOBY = 'dunder-mifflin/account/toby'
let admin: Client
let runtime: Kysely<unknown>
let home = ''
let port: KyselyDocumentStoragePort

/** Rolled back on purpose unless a case commits. */
class Rollback extends Error {}

/** Run a store in one tenant transaction as the runtime role. */
async function withStore<T>(
	work: (store: ImportSourceStore) => Promise<T>,
	options: { tenant?: string; commit?: boolean } = {},
): Promise<T> {
	let result: T | undefined
	try {
		await runtime.transaction().execute(
			/** Tenant context, then the case. */ async (trx) => {
				const tenant = options.tenant ?? TENANT
				await sql`SELECT set_config('hcm.tenant_id', ${tenant}, true)`.execute(trx)
				result = await work(port.bind(trx, { tenantId: tenant, accountId: TOBY }))
				if (!options.commit) throw new Rollback()
			},
		)
	} catch (error) {
		if (!(error instanceof Rollback)) throw error
	}
	return result as T
}

/** Run statements as runtime in one rolled-back transaction and return the SQLSTATE, or 'ok'. */
async function sqlState(statements: ReturnType<typeof sql>[]): Promise<string> {
	try {
		await runtime.transaction().execute(
			/** Tenant context, then the statements. */ async (trx) => {
				await sql`SELECT set_config('hcm.tenant_id', ${TENANT}, true)`.execute(trx)
				for (const statement of statements) await statement.execute(trx)
				throw new Rollback()
			},
		)
		return 'ok'
	} catch (error) {
		if (error instanceof Rollback) return 'ok'
		return (error as { code?: string }).code ?? 'error'
	}
}

beforeAll(
	/** Migrate and seed the disposable database and provision a private file root. */ async () => {
		const migrator = process.env['HCM_TEST_MIGRATOR']
		const runtimeUrl = process.env['HCM_TEST_RUNTIME']
		if (!migrator || !runtimeUrl) throw new Error('Disposable database required')
		admin = new Client({ connectionString: migrator })
		await admin.connect()
		await admin.query('DROP SCHEMA IF EXISTS hcm CASCADE')
		const inventory = resolve('libs/hcm/api/database/migrations/sql')
		await migrateHcmDatabase(migrator, inventory)
		await runDevelopmentSeeds({
			env: {
				APP_ENVIRONMENT: 'local',
				NODE_ENV: 'test',
				HCM_SEED_TARGET: TENANT,
				HCM_SEED_DATABASE_URL: migrator,
			},
			manifestDirectory: resolve('libs/hcm/api/database/seed/manifest'),
			migrations: await loadSqlMigrations(inventory),
		})
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [TENANT])
		runtime = new Kysely({
			dialect: new PostgresDialect({ pool: new Pool({ connectionString: runtimeUrl, max: 2 }) }),
		})
		home = await mkdtemp(join(tmpdir(), 'hcm-import-sources-'))
		await provisionDocumentRoot(join(home, 'private'))
		port = new KyselyDocumentStoragePort(new LocalDocumentFiles(join(home, 'private')))
	},
)
afterAll(
	/** Release connections and the private root. */ async () => {
		await runtime?.destroy()
		await admin?.end()
		if (home) await rm(home, { recursive: true, force: true })
	},
)

describe('import source files', /** Documents IMPORT-SOURCE-FILES. */ () => {
	it('stages a CSV as a Ready import-source blob and reads it back in the same tenant only', /** CONTRACT. */ async () => {
		const bytes = Buffer.from('given,family\nJim,Halpert\n')
		const staged = await withStore(
			/** Stage and commit. */ (store) =>
				store.stageImportSource({ runId: 'run-1', fileName: 'people.csv', bytes }),
			{ commit: true },
		)
		expect(staged).toMatchObject({ contentType: 'text/csv', sizeBytes: bytes.length })
		const row = await admin.query(
			'SELECT purpose,state,media_type AS "mediaType" FROM hcm.document_blob WHERE id=$1',
			[staged.blobId],
		)
		expect(row.rows).toEqual([{ purpose: 'import-source', state: 'Ready', mediaType: 'text/csv' }])
		const read = await withStore(/** Read back. */ (store) => store.openImportSource(staged.blobId))
		expect(read.bytes.equals(bytes)).toBe(true)
		await expect(
			withStore(
				/** Another tenant sees nothing. */ (store) => store.openImportSource(staged.blobId),
				{
					tenant: 'local-other',
				},
			),
		).rejects.toMatchObject({ code: 'not-found' })
	})

	it('refuses spoofed files before any row is written', /** TEST. */ async () => {
		const before = await admin.query('SELECT count(*)::int AS n FROM hcm.document_blob')
		await expect(
			withStore(
				/** A CSV named as a workbook. */ (store) =>
					store.stageImportSource({
						runId: 'run-2',
						fileName: 'people.xlsx',
						bytes: Buffer.from('a,b\n'),
					}),
				{ commit: true },
			),
		).rejects.toBeInstanceOf(ImportSourceError)
		expect((await admin.query('SELECT count(*)::int AS n FROM hcm.document_blob')).rows).toEqual(
			before.rows,
		)
	})

	it('keeps import sources out of documents and documents out of import sources', /** DATA. */ async () => {
		/** A blob insert of a purpose, media type and size. */
		const blob = (purpose: string, media: string, size = 10) =>
			sql`INSERT INTO hcm.document_blob(tenant_id,id,storage_key,sha256,byte_length,media_type,safe_filename,state,created_by_account_id,purpose)
				VALUES(${TENANT},'00000000-0000-4000-8000-000000000001'::uuid,gen_random_uuid(),repeat('a',64),${size},${media},'x','Ready',${TOBY},${purpose})`
		expect(await sqlState([blob('import-source', 'text/csv')])).toBe('ok')
		expect(await sqlState([blob('document', 'text/csv')])).toBe('23514')
		expect(await sqlState([blob('import-source', 'application/pdf')])).toBe('23514')
		expect(await sqlState([blob('import-source', 'text/csv', 5 * 1024 * 1024 + 1)])).toBe('23514')
		// An import source never becomes an upload attempt, and so never a document version.
		expect(
			await sqlState([
				blob('import-source', 'text/csv'),
				sql`INSERT INTO hcm.document_upload_attempt(tenant_id,id,actor_account_id,operation,idempotency_key,payload_hash,blob_id,aggregate_id,safe_intent,state)
					VALUES(${TENANT},gen_random_uuid(),${TOBY},'worker-add',gen_random_uuid(),repeat('b',64),'00000000-0000-4000-8000-000000000001'::uuid,'doc','{}'::jsonb,'Staged')`,
			]),
		).toBe('23514')
	})
})
