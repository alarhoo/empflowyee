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
	type SelfDocument,
	type DocumentPage,
	type DocumentVersion,
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
		home = await mkdtemp(join(tmpdir(), 'hcm-self-files-'))
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
const ownHeaders = { 'x-hcm-development-persona': 'jim' }
let shared: WorkerUploadResult, hidden: WorkerUploadResult, other: WorkerUploadResult
let type: DocumentType
let jim: string
it('projects only own aggregates with visible Ready versions and no worker or revision metadata', /** Data is authored through HR APIs and read through the real employee session. */ async () => {
	type = (
		await send<DocumentType>('POST', 'types', {
			code: 'SELF_DOCUMENT',
			label: 'Shared policy',
			reason: 'Classify',
		})
	).body
	const workers = (await send<{ items: { id: string; displayName: string }[] }>('GET', 'workers'))
		.body.items
	jim = workers.find(
		/** Select the seeded verified worker. */ (w) => w.displayName === 'Jim Halpert',
	)!.id
	const michael = workers.find(
		/** Create a different same-tenant subject. */ (w) => w.displayName === 'Michael Scott',
	)!.id
	shared = (
		await upload({
			workerId: jim,
			typeId: type.id,
			label: 'Shared document',
			employeeVisible: true,
			reason: 'Share',
		})
	).body
	hidden = (
		await upload({
			workerId: jim,
			typeId: type.id,
			label: 'Hidden only',
			employeeVisible: false,
			reason: 'Private',
		})
	).body
	other = (
		await upload({
			workerId: michael,
			typeId: type.id,
			label: 'Other worker',
			employeeVisible: true,
			reason: 'Other subject',
		})
	).body
	expect(
		(
			await upload(
				{ employeeVisible: false, expectedRevision: 1, reason: 'New private version' },
				shared.document.id,
			)
		).status,
	).toBe(200)
	const result = await send<DocumentPage<SelfDocument>>(
		'GET',
		'me/documents',
		undefined,
		ownHeaders,
	)
	expect(result.status).toBe(200)
	expect(result.body.items).toEqual([
		{ id: shared.document.id, typeId: type.id, label: 'Shared document' },
	])
	expect(result.body.nextCursor).toBeNull()
	const versions = await send<DocumentPage<DocumentVersion>>(
		'GET',
		`me/documents/${shared.document.id}/versions?limit=1`,
		undefined,
		ownHeaders,
	)
	expect(versions.body.items).toEqual([
		expect.objectContaining({ id: shared.version.id, versionNumber: 1 }),
	])
	expect(versions.body.nextCursor).toBeNull()
	expect(Object.keys(versions.body.items[0]).sort()).toEqual([
		'byteLength',
		'createdAt',
		'filename',
		'id',
		'mediaType',
		'versionNumber',
	])
	expect(
		(await send('GET', 'me/documents/' + shared.document.id, undefined, ownHeaders)).body,
	).toEqual(result.body.items[0])
})
it('conceals other workers and hidden objects from every self route with no team or HR expansion', /** Self authorization derives the account linkage rather than caller-controlled IDs. */ async () => {
	for (const object of [hidden, other]) {
		expect(
			(await send('GET', 'me/documents/' + object.document.id, undefined, ownHeaders)).status,
		).toBe(404)
		expect(
			(await send('GET', `me/documents/${object.document.id}/versions`, undefined, ownHeaders))
				.status,
		).toBe(404)
		expect(
			(
				await send(
					'GET',
					`me/documents/${object.document.id}/versions/${object.version.id}/download`,
					undefined,
					ownHeaders,
				)
			).status,
		).toBe(404)
	}
	expect(
		(await send('GET', 'me/documents?workerId=' + other.document.workerId, undefined, ownHeaders))
			.status,
	).toBe(400)
	for (const persona of ['toby', 'david'])
		expect(
			(
				await send<DocumentPage<SelfDocument>>('GET', 'me/documents', undefined, {
					'x-hcm-development-persona': persona,
				})
			).body.items,
		).toEqual([])
	expect((await send('POST', 'me/documents', { workerId: jim }, ownHeaders)).status).toBe(404)
	const privateVersion = (
		await send<DocumentPage<DocumentVersion>>(
			'GET',
			'worker-documents/' + shared.document.id + '/versions',
		)
	).body.items[0]
	expect(
		(
			await send(
				'GET',
				`me/documents/${shared.document.id}/versions/${privateVersion.id}/download`,
				undefined,
				ownHeaders,
			)
		).status,
	).toBe(404)
})
it('audits successful self downloads and rechecks sharing after earlier list results', /** A stale UI cannot authorize bytes after HR hides that exact version. */ async () => {
	const path = `me/documents/${shared.document.id}/versions/${shared.version.id}/download`
	const download = await send('GET', path, undefined, ownHeaders)
	expect(download.status).toBe(200)
	expect(download.bytes).toEqual(pdf)
	expect(download.headers['x-content-type-options']).toBe('nosniff')
	expect(
		(
			await admin.query(
				"SELECT id FROM hcm.audit_event WHERE tenant_id=$1 AND action='document.download-authorized' AND target_id=$2",
				[tenant, shared.version.id],
			)
		).rows,
	).toHaveLength(1)
	expect(
		(
			await send(
				'PUT',
				`worker-documents/${shared.document.id}/versions/${shared.version.id}/visibility`,
				{ employeeVisible: false, expectedRevision: 1, reason: 'Revoke sharing' },
			)
		).status,
	).toBe(200)
	expect((await send('GET', path, undefined, ownHeaders)).status).toBe(404)
	expect(
		(await send<DocumentPage<SelfDocument>>('GET', 'me/documents', undefined, ownHeaders)).body
			.items,
	).toEqual([])
	expect(
		(
			await admin.query(
				"SELECT id FROM hcm.audit_event WHERE tenant_id=$1 AND action='document.download-authorized' AND target_id=$2",
				[tenant, shared.version.id],
			)
		).rows,
	).toHaveLength(1)
})
it('returns safe unavailability without releasing bytes when sensitive-read audit cannot commit', /** Download success requires both current sharing and committed access evidence. */ async () => {
	await send(
		'PUT',
		`worker-documents/${shared.document.id}/versions/${shared.version.id}/visibility`,
		{ employeeVisible: true, expectedRevision: 2, reason: 'Share again' },
	)
	await admin.query(
		"CREATE FUNCTION hcm.fail_self_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='document.download-authorized' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$",
	)
	await admin.query(
		'CREATE TRIGGER fail_self_audit BEFORE INSERT ON hcm.audit_event FOR EACH ROW EXECUTE FUNCTION hcm.fail_self_audit()',
	)
	try {
		const result = await send(
			'GET',
			`me/documents/${shared.document.id}/versions/${shared.version.id}/download`,
			undefined,
			ownHeaders,
		)
		expect(result.status).toBe(503)
		expect(result.bytes.equals(pdf)).toBe(false)
	} finally {
		await admin.query('DROP TRIGGER fail_self_audit ON hcm.audit_event')
		await admin.query('DROP FUNCTION hcm.fail_self_audit()')
	}
})
