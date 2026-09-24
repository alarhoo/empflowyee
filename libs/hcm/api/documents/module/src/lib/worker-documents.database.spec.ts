import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	DocumentFiles,
	TemplateFileUnitOfWork,
	type DocumentFile,
} from '@empflowyee/hcm-api-documents-application'
import {
	LocalDocumentFiles,
	KyselyTemplateFileUnit,
	provisionDocumentRoot,
} from '@empflowyee/hcm-api-documents-infrastructure'
import 'reflect-metadata'
import { beforeAll, afterAll, it, expect } from 'vitest'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { request } from 'node:http'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { Client } from 'pg'
import { migrateHcmDatabase, loadSqlMigrations } from '@empflowyee/hcm-api-database-migrations'
import { runDevelopmentSeeds } from '@empflowyee/hcm-api-database-seed'
import { HcmSessionReader, TenantDirectory } from '@empflowyee/hcm-api-runtime-application'
import {
	HcmRuntimeStore,
	createTenantDirectory,
	createSessionReader,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import { HCM_ROLE_WRITE_ORIGIN } from '@empflowyee/hcm-api-access-control-transport'
import {
	DocumentError,
	type DocumentType,
	type WorkerUploadResult,
} from '@empflowyee/hcm-documents-contract'
import { HcmDocumentsModule } from './hcm-api-documents-module'

let home: string
let files: LocalDocumentFiles
let publishEffect: (() => Promise<void>) | undefined
let failurePhase: 'before' | 'after' | null = null
let app: INestApplication
let admin: Client
let origin: string
const tenant = 'local-dunder-mifflin'
const browserOrigin = 'http://acme.localhost:4302'
const env = {
	APP_ENVIRONMENT: 'local',
	NODE_ENV: 'test',
	HCM_LOCAL_TENANTS: 'true',
	HCM_LOCAL_SESSION: 'true',
}
interface Reply<T> {
	status: number
	body: T
	cache: string | undefined
	bytes: Buffer
	headers: Record<string, string | string[] | undefined>
}

/** Exercise actual Nest routing with persisted personas and browser-like write headers. */
function send<T = Record<string, unknown>>(
	method: string,
	path: string,
	body?: unknown,
	headers: Record<string, string> = {},
): Promise<Reply<T>> {
	return new Promise(
		/** Collect real responses without bypassing authentication or persistence. */ (
			resolveReply,
			reject,
		) => {
			const call = request(
				`${origin}/api/v1/documents/${path}`,
				{
					method,
					headers: {
						host: 'acme.localhost',
						'x-hcm-development-persona': 'toby',
						origin: browserOrigin,
						'sec-fetch-site': 'same-origin',
						'content-type': 'application/json',
						'idempotency-key': randomUUID(),
						'content-length': String(
							Buffer.isBuffer(body)
								? body.length
								: Buffer.byteLength(body === undefined ? '' : JSON.stringify(body)),
						),
						...headers,
					},
				},
				/** Decode the actual API output. */ (response) => {
					const chunks: Buffer[] = []
					response.on(
						'data',
						/** Collect bounded test JSON. */ (chunk) => {
							chunks.push(Buffer.from(chunk))
						},
					)
					response.on(
						'end',
						/** Preserve status and cache policy alongside the DTO. */ () =>
							resolveReply({
								status: response.statusCode ?? 0,
								body: response.headers['content-type']?.includes('application/json')
									? JSON.parse(Buffer.concat(chunks).toString())
									: ({} as T),
								bytes: Buffer.concat(chunks),
								headers: response.headers,
								cache: response.headers['cache-control'],
							}),
					)
				},
			)
			call.on('error', reject)
			let payload: Buffer | string | undefined
			if (Buffer.isBuffer(body)) payload = body
			else if (body !== undefined) payload = JSON.stringify(body)
			call.end(payload)
		},
	)
}
beforeAll(
	/** Start the real module over migrated and seeded harness-owned PostgreSQL. */ async () => {
		const migrator = process.env['HCM_TEST_MIGRATOR'],
			runtime = process.env['HCM_TEST_RUNTIME']
		if (!migrator || !runtime) throw new Error('Disposable database required')
		admin = new Client({ connectionString: migrator })
		await admin.connect()
		await admin.query('DROP SCHEMA IF EXISTS hcm CASCADE')
		const inventory = resolve('libs/hcm/api/database/migrations/sql')
		await migrateHcmDatabase(migrator, inventory)
		await runDevelopmentSeeds({
			env: { ...env, HCM_SEED_TARGET: tenant, HCM_SEED_DATABASE_URL: migrator },
			manifestDirectory: resolve('libs/hcm/api/database/seed/manifest'),
			migrations: await loadSqlMigrations(inventory),
		})
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		home = await mkdtemp(join(tmpdir(), 'hcm-worker-files-'))
		await provisionDocumentRoot(join(home, 'private'))
		files = new LocalDocumentFiles(join(home, 'private'))
		const database = new HcmAccessDatabase(runtime)
		const unit = new KyselyTemplateFileUnit(database, runtime)
		const store = new HcmRuntimeStore(runtime)
		const module = await Test.createTestingModule({ imports: [HcmDocumentsModule] })
			.overrideProvider(HcmRuntimeStore)
			.useValue(store)
			.overrideProvider(TenantDirectory)
			.useValue(createTenantDirectory(env, store))
			.overrideProvider(HcmSessionReader)
			.useValue(createSessionReader(env, store))
			.overrideProvider(HcmAccessDatabase)
			.useValue(database)
			.overrideProvider(TemplateFileUnitOfWork)
			.useValue(unit)
			.overrideProvider(DocumentFiles)
			.useValue({
				stage: files.stage.bind(files),
				open: files.open.bind(files),
				publish: /** Inject a storage boundary failure. */ async (file: DocumentFile) => {
					if (failurePhase === 'before') {
						failurePhase = null
						throw new DocumentError('storage-unavailable')
					}
					await files.publish(file)
					if (publishEffect) {
						const effect = publishEffect
						publishEffect = undefined
						await effect()
					}
					if (failurePhase === 'after') {
						failurePhase = null
						throw new DocumentError('storage-unavailable')
					}
				},
			})
			.overrideProvider(HCM_ROLE_WRITE_ORIGIN)
			.useValue(browserOrigin)
			.compile()
		app = module.createNestApplication({ logger: false })
		app.setGlobalPrefix('api')
		await app.listen(0, '127.0.0.1')
		origin = await app.getUrl()
	},
)
afterAll(
	/** Drain real providers before disposable database teardown. */ async () => {
		await app?.close()
		await admin?.end()
		if (home && resolve(home).startsWith(resolve(tmpdir())))
			await rm(home, { recursive: true, force: true })
	},
)

const pdf = Buffer.from('%PDF-1.7\nPersistent reference\n%%EOF')
/** Build exactly the transport's documented metadata/file protocol over real HTTP. */
async function upload(
	metadata: unknown,
	target = '',
	key = randomUUID(),
	bytes = pdf,
	headers: Record<string, string> = {},
	extra = '',
) {
	const boundary = 'hcm-' + randomUUID()
	const body = Buffer.concat([
		Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="reference.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
		),
		bytes,
		Buffer.from(
			`\r\n${extra ? `--${boundary}\r\nContent-Disposition: form-data; name="extra"\r\n\r\n${extra}\r\n` : ''}--${boundary}--\r\n`,
		),
	])
	return send<WorkerUploadResult>(
		'POST',
		target ? `worker-documents/${target}/versions` : 'worker-documents',
		body,
		{
			'content-type': 'multipart/form-data; boundary=' + boundary,
			'idempotency-key': key,
			...headers,
		},
	)
}
let type: DocumentType
let workerId: string
let created: WorkerUploadResult
it('uses actual workforce identity including workers without login accounts', /** Picker queries are real and never provision accounts. */ async () => {
	type = (
		await send<DocumentType>('POST', 'types', {
			code: 'WORKER_ATTACHMENT',
			label: 'Worker attachment',
			reason: 'Classify',
		})
	).body
	const rows = await send<{ items: { id: string; displayName: string; workerCode: string }[] }>(
		'GET',
		'workers?q=Jim',
	)
	expect(rows.status).toBe(200)
	workerId = rows.body.items[0].id
	expect(rows.body.items[0].displayName).toBe('Jim Halpert')
	await admin.query(
		"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES($1,'no-account-person','No','Account','No Account')",
		[tenant],
	)
	await admin.query(
		"INSERT INTO hcm.worker(tenant_id,id,person_id,worker_code) VALUES($1,'no-account-worker','no-account-person','NOLOGIN')",
		[tenant],
	)
	const result = await upload({
		workerId: 'no-account-worker',
		typeId: type.id,
		label: 'Offline worker',
		employeeVisible: false,
		reason: 'Worker without login',
	})
	expect(result.status).toBe(201)
	expect(
		(
			await admin.query(
				"SELECT id FROM hcm.user_account WHERE tenant_id=$1 AND person_id='no-account-person'",
				[tenant],
			)
		).rows,
	).toHaveLength(0)
	expect((await send('GET', 'workers?workerId=guessed')).status).toBe(400)
})
it('keeps content HR-only and rejects forged workers before writing bytes', /** Admin and managers receive no implied worker-wide content capability. */ async () => {
	for (const persona of ['jim', 'michael', 'david']) {
		expect(
			(await send('GET', 'worker-documents', undefined, { 'x-hcm-development-persona': persona }))
				.status,
		).toBe(403)
		expect(
			(
				await upload(
					{ workerId, typeId: type.id, label: 'Denied', employeeVisible: false, reason: 'Reject' },
					'',
					randomUUID(),
					pdf,
					{ 'x-hcm-development-persona': persona },
				)
			).status,
		).toBe(403)
	}
	expect(
		(
			await upload({
				workerId: 'foreign-worker',
				typeId: type.id,
				label: 'Forged',
				employeeVisible: false,
				reason: 'Reject',
			})
		).status,
	).toBe(404)
	expect(
		(
			await upload({
				workerId,
				typeId: type.id,
				label: 'Wrong boolean',
				employeeVisible: 'false',
				reason: 'Reject',
			})
		).status,
	).toBe(400)
})
it('publishes immutable bytes and independent per-version sharing with replay protection', /** Sharing revisions do not mutate file identity or other versions. */ async () => {
	const metadata = {
			workerId,
			typeId: type.id,
			label: 'Worker policy',
			employeeVisible: false,
			reason: 'Record',
		},
		key = randomUUID()
	const result = await upload(metadata, '', key)
	expect(result.status).toBe(201)
	created = result.body
	expect(created.document).toMatchObject({ workerId, revision: 1 })
	expect(created.version).toMatchObject({ employeeVisible: false, revision: 1, versionNumber: 1 })
	expect((await upload(metadata, '', key)).body).toEqual(created)
	expect((await upload({ ...metadata, employeeVisible: true }, '', key)).status).toBe(409)
	const second = await upload(
		{ employeeVisible: true, expectedRevision: 1, reason: 'Second' },
		created.document.id,
	)
	expect(second.status).toBe(200)
	const share = { employeeVisible: true, expectedRevision: 1, reason: 'Share first' },
		shareKey = randomUUID(),
		path = `worker-documents/${created.document.id}/versions/${created.version.id}/visibility`
	expect((await send('PUT', path, share, { 'idempotency-key': shareKey })).body).toMatchObject({
		employeeVisible: true,
		revision: 2,
	})
	expect((await send('PUT', path, share, { 'idempotency-key': shareKey })).status).toBe(200)
	expect((await send('PUT', path, share)).status).toBe(409)
	expect(
		(await send('PUT', path, { ...share, expectedRevision: 2, employeeVisible: false })).status,
	).toBe(200)
	const versions = await send<{ items: { employeeVisible: boolean; versionNumber: number }[] }>(
		'GET',
		`worker-documents/${created.document.id}/versions`,
	)
	expect(
		versions.body.items.map(
			/** Verify every version's explicit flag. */ (row) => [
				row.versionNumber,
				row.employeeVisible,
			],
		),
	).toEqual([
		[2, true],
		[1, false],
	])
	expect((await send('GET', `worker-documents/${created.document.id}`)).body).toMatchObject({
		revision: 2,
	})
	const attachment = await send(
		'GET',
		`worker-documents/${created.document.id}/versions/${created.version.id}/download`,
	)
	expect(attachment.status).toBe(200)
	expect(attachment.bytes).toEqual(pdf)
	expect(attachment.headers['content-disposition']).toContain('attachment')
	expect(JSON.stringify(result.body)).not.toMatch(/storageKey|storage_key|sha256/)
	expect(
		(
			await admin.query(
				"SELECT id FROM hcm.audit_event WHERE tenant_id=$1 AND action='document.download-authorized' AND target_id=$2",
				[tenant, created.version.id],
			)
		).rows,
	).toHaveLength(1)
})
it('binds worker filters and cursors to the exact subject query', /** HR pagination cannot silently cross subjects or leak another collection. */ async () => {
	const first = await send<{ items: unknown[]; nextCursor: string }>(
		'GET',
		'worker-documents?limit=1',
	)
	expect(first.body.items).toHaveLength(1)
	expect(first.body.nextCursor).toBeTruthy()
	expect(
		(
			await send(
				'GET',
				'worker-documents?limit=1&workerId=' + workerId + '&cursor=' + first.body.nextCursor,
			)
		).status,
	).toBe(400)
	expect(
		(await send<{ items: unknown[] }>('GET', 'worker-documents?workerId=no-such-worker')).body
			.items,
	).toHaveLength(0)
})
it('preserves old versions after type disable and rejects stale concurrent appends', /** Type policy gates new aggregates only and final publication rechecks revision. */ async () => {
	expect(
		(
			await send('PUT', 'types/' + type.id, {
				label: type.label,
				description: '',
				enabled: false,
				expectedRevision: 1,
				reason: 'Disable',
			})
		).status,
	).toBe(200)
	expect(
		(
			await upload({
				workerId,
				typeId: type.id,
				label: 'New blocked',
				employeeVisible: false,
				reason: 'Disabled',
			})
		).status,
	).toBe(409)
	const attempts = await Promise.all([
		upload(
			{ employeeVisible: false, expectedRevision: 2, reason: 'Append A' },
			created.document.id,
		),
		upload(
			{ employeeVisible: false, expectedRevision: 2, reason: 'Append B' },
			created.document.id,
		),
	])
	expect(
		attempts.map(/** Exactly one final revision wins. */ (result) => result.status).sort(),
	).toEqual([200, 409])
})
it('resumes private publication failures and rolls back version/audit as one unit', /** Crash boundaries must not expose Staged bytes or duplicate versions on retry. */ async () => {
	const target = created.document.id,
		body = { employeeVisible: false, expectedRevision: 3, reason: 'Resume' },
		key = randomUUID()
	failurePhase = 'after'
	expect((await upload(body, target, key)).status).toBe(503)
	expect((await send('GET', 'worker-documents/' + target)).body).toMatchObject({ revision: 3 })
	const retry = await upload(body, target, key)
	expect(retry.status).toBe(200)
	expect(retry.body.document.revision).toBe(4)
	expect((await upload(body, target, key)).body).toEqual(retry.body)
	publishEffect =
		/** Invalidate the aggregate between private publication and final metadata commit. */ async () => {
			await admin.query(
				'UPDATE hcm.employee_document SET revision=revision+1 WHERE tenant_id=$1 AND id=$2',
				[tenant, target],
			)
		}
	expect(
		(await upload({ employeeVisible: false, expectedRevision: 4, reason: 'Race' }, target)).status,
	).toBe(409)
	expect(
		(
			await admin.query(
				"SELECT id FROM hcm.document_upload_attempt WHERE tenant_id=$1 AND operation='worker-append' AND state='Failed'",
				[tenant],
			)
		).rows.length,
	).toBeGreaterThan(0)
})
it('enforces tenant references, RLS and immutable blob columns under runtime SQL', /** Negative tests use actual foreign records and the restricted runtime role. */ async () => {
	await admin.query("SELECT set_config('hcm.tenant_id','foreign-doc-tenant',false)")
	await admin.query(
		"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES('foreign-doc-tenant','foreign-doc-tenant','Foreign','active')",
	)
	await admin.query("SELECT set_config('hcm.tenant_id','foreign-doc-tenant',false)")
	await admin.query(
		"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES('foreign-doc-tenant','foreign-person','Foreign','Worker','Foreign Worker')",
	)
	await admin.query(
		"INSERT INTO hcm.worker(tenant_id,id,person_id,worker_code) VALUES('foreign-doc-tenant','real-foreign-worker','foreign-person','FOREIGN')",
	)
	await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	expect(
		(
			await upload({
				workerId: 'real-foreign-worker',
				typeId: type.id,
				label: 'Foreign',
				employeeVisible: false,
				reason: 'Reject',
			})
		).status,
	).toBe(404)
	const runtime = new Client({ connectionString: process.env['HCM_TEST_RUNTIME'] })
	await runtime.connect()
	try {
		await runtime.query("SELECT set_config('hcm.tenant_id','foreign-doc-tenant',false)")
		expect((await runtime.query('SELECT id FROM hcm.employee_document')).rows).toHaveLength(0)
		await runtime.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		await expect(
			runtime.query(
				'UPDATE hcm.employee_document_version SET blob_id=$1 WHERE tenant_id=$2 AND id=$3',
				[randomUUID(), tenant, created.version.id],
			),
		).rejects.toMatchObject({ code: '42501' })
		await expect(
			runtime.query('DELETE FROM hcm.employee_document WHERE tenant_id=$1', [tenant]),
		).rejects.toMatchObject({ code: '42501' })
	} finally {
		await runtime.end()
	}
})
