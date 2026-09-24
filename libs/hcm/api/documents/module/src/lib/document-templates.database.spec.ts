import { mkdtemp, rm, unlink } from 'node:fs/promises'
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
	type TemplateUploadResult,
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
		home = await mkdtemp(join(tmpdir(), 'hcm-template-files-'))
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
	return send<TemplateUploadResult>(
		'POST',
		target ? `templates/${target}/versions` : 'templates',
		body,
		{
			'content-type': 'multipart/form-data; boundary=' + boundary,
			'idempotency-key': key,
			...headers,
		},
	)
}
let type: DocumentType
let created: TemplateUploadResult
it('rejects unsupported, oversized and malformed multipart input without metadata success', /** Real transport bounds supplement filesystem validation and do not fabricate failure audit. */ async () => {
	const classification = (
		await send<DocumentType>('POST', 'types', {
			code: 'UPLOAD_LIMITS',
			label: 'Upload limits',
			reason: 'Test upload boundary',
		})
	).body
	const metadata = {
		typeId: classification.id,
		label: 'Invalid upload',
		reason: 'Reject invalid bytes',
	}
	expect(
		(
			await send('POST', 'templates', Buffer.from('broken'), {
				'content-type': 'multipart/form-data; boundary=',
			})
		).status,
	).toBe(400)
	expect((await upload(metadata, '', randomUUID(), Buffer.from('unrecognized'))).status).toBe(415)
	const oversized = Buffer.alloc(10485761, 32)
	pdf.copy(oversized)
	expect((await upload(metadata, '', randomUUID(), oversized)).status).toBe(413)
	expect((await upload({ ...metadata, tenantId: 'foreign' })).status).toBe(400)
	expect((await send('GET', 'templates?workerId=foreign')).status).toBe(400)
	expect((await send('GET', 'template-type-options?enabled=false')).status).toBe(400)
	expect((await admin.query('SELECT * FROM hcm.document_template')).rows).toHaveLength(0)
})
it('authorizes before accepting bytes and never grants administrator template content', /** Business permissions remain independent from discovery and malformed file claims. */ async () => {
	type = (
		await send<DocumentType>('POST', 'types', {
			code: 'REFERENCE',
			label: 'Reference',
			reason: 'Classify reference',
		})
	).body
	for (const persona of ['jim', 'michael', 'david']) {
		expect(
			(await send('GET', 'templates', undefined, { 'x-hcm-development-persona': persona })).status,
		).toBe(403)
		expect(
			(
				await upload(
					{ typeId: type.id, label: 'Unauthorized', reason: 'Must reject' },
					'',
					randomUUID(),
					pdf,
					{ 'x-hcm-development-persona': persona },
				)
			).status,
		).toBe(403)
	}
	expect(await files.inventory()).toEqual({ staged: 0, published: 0 })
	expect(
		(
			await upload({ typeId: type.id, label: 'Forged', reason: 'Reject' }, '', randomUUID(), pdf, {
				origin: 'http://foreign.invalid',
			})
		).status,
	).toBe(403)
	expect(
		(
			await upload(
				{ typeId: type.id, label: 'Extra', reason: 'Reject' },
				'',
				randomUUID(),
				pdf,
				{},
				'unexpected',
			)
		).status,
	).toBe(400)
	expect((await admin.query('SELECT * FROM hcm.document_template')).rows).toHaveLength(0)
	expect((await admin.query('SELECT * FROM hcm.document_upload_attempt')).rows).toHaveLength(0)
})
it('commits real files, immutable metadata, safe audit and exactly-once receipts', /** HTTP success requires Ready bytes and real tenant-owned business rows. */ async () => {
	const metadata = { typeId: type.id, label: 'HR reference', reason: 'Publish reference' },
		key = randomUUID()
	const reply = await upload(metadata, '', key)
	expect(reply.status).toBe(201)
	created = reply.body
	expect(created.template).toMatchObject({ typeId: type.id, label: 'HR reference', revision: 1 })
	expect(created.version).toMatchObject({
		filename: 'reference.pdf',
		byteLength: pdf.length,
		versionNumber: 1,
		mediaType: 'application/pdf',
	})
	expect(JSON.stringify(created)).not.toMatch(/storage_key|storageKey|sha256|private/)
	expect((await upload(metadata, '', key)).body).toEqual(created)
	expect((await upload({ ...metadata, label: 'Changed' }, '', key)).status).toBe(409)
	expect((await upload(metadata, '', key, Buffer.from('%PDF-other'))).status).toBe(409)
	expect((await admin.query('SELECT * FROM hcm.document_template_version')).rows).toHaveLength(1)
	const audit = (
		await admin.query(
			"SELECT * FROM hcm.audit_event WHERE action='document.template-version-added'",
		)
	).rows
	expect(audit).toHaveLength(1)
	expect(audit[0].safe_summary).toEqual({ reason: 'Publish reference', changedFields: ['version'] })
	expect((await send('GET', 'templates/' + created.template.id)).body).toEqual(created.template)
})
it('downloads verified private bytes with authorization and observable completion evidence', /** No employee or guessed foreign version gains a public attachment URL. */ async () => {
	const path = `templates/${created.template.id}/versions/${created.version.id}/download`
	const result = await send('GET', path)
	expect(result.status).toBe(200)
	expect(result.bytes).toEqual(pdf)
	expect(result.headers['content-disposition']).toContain('attachment;')
	expect(result.headers['x-content-type-options']).toBe('nosniff')
	expect(result.cache).toBe('no-store')
	await expect
		.poll(
			/** Wait for the server finish event's separate authenticated transaction. */ async () =>
				(
					await admin.query(
						"SELECT action FROM hcm.audit_event WHERE category='sensitive-access' ORDER BY occurred_at,id",
					)
				).rows.map(/** Inspect safe action names only. */ (row) => row.action),
		)
		.toEqual(['document.download-authorized', 'document.download-completed'])
	const rows = (
		await admin.query(
			"SELECT id,related_event_id,target_type FROM hcm.audit_event WHERE category='sensitive-access' ORDER BY occurred_at,id",
		)
	).rows
	expect(rows[1].related_event_id).toBe(rows[0].id)
	expect(rows[0].target_type).toBe('document-template-version')
	for (const persona of ['jim', 'david'])
		expect(
			(await send('GET', path, undefined, { 'x-hcm-development-persona': persona })).status,
		).toBe(403)
	expect(
		(await send('GET', `templates/foreign/versions/${created.version.id}/download`)).status,
	).toBe(404)
	const blob = (
		await admin.query('SELECT storage_key FROM hcm.document_blob WHERE state=$1', ['Ready'])
	).rows[0]
	await unlink(join(home, 'private', 'blobs', blob.storage_key))
	expect((await send('GET', path)).status).toBe(503)
})
it('recovers before and after rename without exposing partial business versions', /** Real reservations survive failure and the authenticated retry completes each once. */ async () => {
	for (const phase of ['before', 'after'] as const) {
		const key = randomUUID(),
			metadata = { typeId: type.id, label: 'Recovery ' + phase, reason: 'Recover reserved upload' }
		failurePhase = phase
		expect((await upload(metadata, '', key)).status).toBe(503)
		expect(
			(await admin.query('SELECT * FROM hcm.document_template WHERE label=$1', [metadata.label]))
				.rows,
		).toHaveLength(0)
		expect(
			(
				await admin.query(
					'SELECT state FROM hcm.document_upload_attempt WHERE idempotency_key=$1',
					[key],
				)
			).rows[0].state,
		).toBe('Staged')
		const result = await upload(metadata, '', key)
		expect(result.status).toBe(201)
		expect(
			(await admin.query('SELECT * FROM hcm.document_template WHERE label=$1', [metadata.label]))
				.rows,
		).toHaveLength(1)
		expect(
			(
				await admin.query(
					'SELECT state FROM hcm.document_upload_attempt WHERE idempotency_key=$1',
					[key],
				)
			).rows[0].state,
		).toBe('Ready')
	}
})
it('serializes concurrent append and preserves disabled-type existing templates', /** Two writers at one revision cannot publish two versions or overwrite immutable bytes. */ async () => {
	const results = await Promise.all([
		upload({ expectedRevision: 1, reason: 'Append A' }, created.template.id),
		upload({ expectedRevision: 1, reason: 'Append B' }, created.template.id),
	])
	expect(
		results.map(/** Compare only committed HTTP outcomes. */ (result) => result.status).sort(),
	).toEqual([200, 409])
	await send('PUT', 'types/' + type.id, {
		label: type.label,
		description: '',
		enabled: false,
		expectedRevision: 1,
		reason: 'Disable new uses',
	})
	expect((await upload({ typeId: type.id, label: 'Blocked new', reason: 'Blocked' })).status).toBe(
		409,
	)
	expect(
		(
			await upload(
				{ expectedRevision: 2, reason: 'Existing reference remains versionable' },
				created.template.id,
			)
		).status,
	).toBe(200)
	const first = await send<{ items: unknown[]; nextCursor: string }>(
		'GET',
		`templates/${created.template.id}/versions?limit=1`,
	)
	expect(first.body.items).toHaveLength(1)
	expect(first.body.nextCursor).toBeTruthy()
	expect(
		(
			await send(
				'GET',
				`templates/${created.template.id}/versions?limit=2&cursor=${first.body.nextCursor}`,
			)
		).status,
	).toBe(400)
	const second = await send<{ items: unknown[] }>(
		'GET',
		`templates/${created.template.id}/versions?limit=1&cursor=${first.body.nextCursor}`,
	)
	expect(second.status).toBe(200)
	expect(second.body.items).toHaveLength(1)
})
it('rolls back finalization on audit failure and resumes the original reservation', /** Filesystem publication cannot manufacture successful metadata when the final transaction fails. */ async () => {
	const key = randomUUID(),
		target = created.template.id,
		metadata = { expectedRevision: 3, reason: 'Recover audit failure' }
	await admin.query(
		"CREATE FUNCTION hcm.reject_template_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='document.template-version-added' THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_template_audit BEFORE INSERT ON hcm.audit_event FOR EACH ROW EXECUTE FUNCTION hcm.reject_template_audit()",
	)
	try {
		expect((await upload(metadata, target, key)).status).toBe(503)
	} finally {
		await admin.query(
			'DROP TRIGGER reject_template_audit ON hcm.audit_event; DROP FUNCTION hcm.reject_template_audit()',
		)
	}
	expect((await send<{ revision: number }>('GET', 'templates/' + target)).body.revision).toBe(3)
	expect(
		(
			await admin.query('SELECT state FROM hcm.document_upload_attempt WHERE idempotency_key=$1', [
				key,
			])
		).rows[0].state,
	).toBe('Staged')
	expect((await upload(metadata, target, key)).status).toBe(200)
})
it('marks only the reserved attempt failed if persisted authority changes before final commit', /** Revoked HR authority leaves aggregate revision and audit unchanged. */ async () => {
	const key = randomUUID(),
		permission = 'hcm.documents.templates.manage'
	publishEffect = /** Revoke after actual bytes reach the immutable root. */ async () => {
		await admin.query('DELETE FROM hcm.role_permission WHERE role_id=$1 AND permission_code=$2', [
			'hr-specialist',
			permission,
		])
	}
	try {
		expect(
			(
				await upload(
					{ expectedRevision: 4, reason: 'Reauthorize final commit' },
					created.template.id,
					key,
				)
			).status,
		).toBe(403)
	} finally {
		await admin.query(
			'INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,$2,$3)',
			[tenant, 'hr-specialist', permission],
		)
	}
	expect(
		(
			await admin.query('SELECT state FROM hcm.document_upload_attempt WHERE idempotency_key=$1', [
				key,
			])
		).rows[0].state,
	).toBe('Failed')
	expect(
		(await send<{ revision: number }>('GET', 'templates/' + created.template.id)).body.revision,
	).toBe(4)
	expect(
		(
			await upload(
				{ expectedRevision: 4, reason: 'Reauthorize final commit' },
				created.template.id,
				key,
			)
		).status,
	).toBe(409)
})

it('conceals real foreign templates and enforces immutable tenant-composite file/version references', /** Direct runtime SQL remains constrained independently of the Nest authorization layer. */ async () => {
	const foreign = 'foreign-files',
		blobId = randomUUID(),
		storageKey = randomUUID()
	await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [foreign])
	try {
		await admin.query(
			"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES($1,$1,'Foreign','active')",
			[foreign],
		)
		await admin.query(
			"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES($1,'person','Foreign','Person','Foreign Person')",
			[foreign],
		)
		await admin.query(
			"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES($1,'account','person','foreign@example.com')",
			[foreign],
		)
		await admin.query(
			"INSERT INTO hcm.document_type(tenant_id,id,code,label,created_by,updated_by) VALUES($1,'type','FOREIGN','Foreign','account','account')",
			[foreign],
		)
		await admin.query(
			"INSERT INTO hcm.document_template(tenant_id,id,type_id,label,revision,created_by_account_id) VALUES($1,'foreign-template','type','Foreign template',1,'account')",
			[foreign],
		)
		await admin.query(
			"INSERT INTO hcm.document_blob(tenant_id,id,storage_key,sha256,byte_length,media_type,safe_filename,state,created_by_account_id) VALUES($1,$2,$3,$4,5,'application/pdf','foreign.pdf','Ready','account')",
			[foreign, blobId, storageKey, 'a'.repeat(64)],
		)
		await admin.query(
			"INSERT INTO hcm.document_template_version(tenant_id,id,template_id,version_number,blob_id,created_by_account_id) VALUES($1,'foreign-version','foreign-template',1,$2,'account')",
			[foreign, blobId],
		)
	} finally {
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	}
	for (const path of [
		'templates/foreign-template',
		'templates/foreign-template/versions',
		'templates/foreign-template/versions/foreign-version/download',
	])
		expect((await send('GET', path)).status).toBe(404)
	expect(JSON.stringify((await send('GET', 'templates')).body)).not.toContain('Foreign template')
	const runtime = new Client({ connectionString: process.env['HCM_TEST_RUNTIME'] })
	await runtime.connect()
	try {
		await runtime.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		for (const table of [
			'document_template',
			'document_template_version',
			'document_blob',
			'document_upload_attempt',
		])
			expect(
				(await runtime.query(`SELECT * FROM hcm.${table} WHERE tenant_id=$1`, [foreign])).rows,
			).toEqual([])
		for (const statement of [
			'UPDATE hcm.document_blob SET storage_key=gen_random_uuid()',
			'DELETE FROM hcm.document_blob',
			"UPDATE hcm.document_template SET label='Tampered'",
			'DELETE FROM hcm.document_template_version',
			'UPDATE hcm.document_template_version SET version_number=999',
		])
			await expect(runtime.query(statement)).rejects.toMatchObject({ code: '42501' })
		await expect(
			runtime.query("UPDATE hcm.document_blob SET state='Failed' WHERE state='Ready'"),
		).rejects.toMatchObject({ code: '23514' })
		await expect(
			runtime.query(
				"INSERT INTO hcm.document_template_version(tenant_id,id,template_id,version_number,blob_id,created_by_account_id) VALUES($1,'wrong-tenant-blob',$2,99,$3,'dunder-mifflin/account/toby')",
				[tenant, created.template.id, blobId],
			),
		).rejects.toMatchObject({ code: '23503' })
	} finally {
		await runtime.end()
	}
})
