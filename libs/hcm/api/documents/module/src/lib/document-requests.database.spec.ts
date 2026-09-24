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
	type DocumentRequest,
	type SelfDocumentRequest,
	type DocumentPage,
	type DocumentVersion,
	type DocumentType,
	type RequestView,
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
		home = await mkdtemp(join(tmpdir(), 'hcm-request-files-'))
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
	return send<SelfDocumentRequest>('POST', `me/requests/${target}/submit`, body, {
		'content-type': 'multipart/form-data; boundary=' + boundary,
		'idempotency-key': key,
		...headers,
	})
}

const ownHeaders = { 'x-hcm-development-persona': 'jim' }
let type: DocumentType, jim: string, michael: string
/** Create a real request through the HR endpoint for the requested worker. */ async function create(
	workerId = jim,
) {
	const response = await send<DocumentRequest>('POST', 'requests', {
		workerId,
		typeId: type.id,
		instructions: 'Supply a readable PDF',
		dueDate: '2026-10-15',
		reason: 'Verify record',
	})
	expect(response.status).toBe(201)
	return response.body
}
it('creates real requests, restricts endpoint scopes and returns distinct DTOs', /** Real seeded identities determine HR and addressed employee visibility. */ async () => {
	type = (
		await send<DocumentType>('POST', 'types', {
			code: 'REQUESTED_FILE',
			label: 'Requested record',
			reason: 'Classify',
		})
	).body
	const workers = (
		await send<{ items: { id: string; displayName: string }[] }>('GET', 'request-worker-options')
	).body.items
	jim = workers.find(
		/** Match the persisted development subject. */ (w) => w.displayName === 'Jim Halpert',
	)?.id ?? ''
	michael = workers.find(
		/** Resolve another same-tenant worker. */ (w) => w.displayName === 'Michael Scott',
	)?.id ?? ''
	const item = await create(),
		other = await create(michael)
	expect((await send('GET', 'requests', undefined, ownHeaders)).status).toBe(403)
	const own = await send<SelfDocumentRequest>(
		'GET',
		'me/requests/' + item.id,
		undefined,
		ownHeaders,
	)
	expect(own.status).toBe(200)
	expect(own.body.requesterDisplayName).toBe('Toby Flenderson')
	expect(own.body).not.toHaveProperty('workerId')
	expect(own.body).not.toHaveProperty('requestedByAccountId')
	expect((await send('GET', 'me/requests/' + other.id, undefined, ownHeaders)).status).toBe(404)
	expect((await send('GET', 'me/requests?workerId=' + jim, undefined, ownHeaders)).status).toBe(400)
	expect(
		(
			await send('POST', 'requests', {
				workerId: jim,
				typeId: type.id,
				dueDate: '2026-02-30',
				reason: 'Invalid date',
			})
		).status,
	).toBe(400)
	const list = await send<DocumentPage<RequestView>>(
		'GET',
		'me/requests?limit=1',
		undefined,
		ownHeaders,
	)
	expect(list.body.items).toHaveLength(1)
	const intents = await admin.query(
		'SELECT recipient_account_id AS "recipientAccountId",outcome FROM hcm.notification_intent WHERE source_request_id=$1',
		[item.id],
	)
	expect(intents.rows).toEqual([
		{ recipientAccountId: 'dunder-mifflin/account/jim', outcome: 'Delivered' },
	])
})
it('preserves immutable submissions across replacement and accepts only the latest cycle', /** Persisted revisions, actor receipts and current-cycle constraints guard every transition. */ async () => {
	const item = await create(),
		key = randomUUID()
	const first = await upload({ expectedRevision: 1 }, item.id, key, pdf, ownHeaders)
	expect(first.status).toBe(200)
	expect(first.body.status).toBe('Submitted')
	expect((await upload({ expectedRevision: 1 }, item.id, key, pdf, ownHeaders)).body).toEqual(
		first.body,
	)
	expect((await upload({ expectedRevision: 2 }, item.id, key, pdf, ownHeaders)).status).toBe(409)
	const versions = (
		await send<DocumentPage<DocumentVersion>>('GET', `requests/${item.id}/submissions`)
	).body.items
	expect(versions).toHaveLength(1)
	expect(
		(
			await send('POST', `requests/${item.id}/replacement`, {
				expectedRevision: 2,
				reason: 'Unreadable first page',
			})
		).status,
	).toBe(200)
	expect(
		(
			await upload(
				{ expectedRevision: 3 },
				item.id,
				randomUUID(),
				Buffer.from('%PDF-1.7\nReplacement\n%%EOF'),
				ownHeaders,
			)
		).status,
	).toBe(200)
	const current = (
		await send<DocumentPage<DocumentVersion>>('GET', `requests/${item.id}/submissions`)
	).body.items
	expect(
		current.map(/** Preserve immutable sequential submission numbers. */ (v) => v.versionNumber),
	).toEqual([2, 1])
	expect(
		(
			await send('POST', `requests/${item.id}/accept`, {
				expectedRevision: 4,
				submissionId: versions[0].id,
				reason: 'Stale submission',
			})
		).status,
	).toBe(409)
	const accepted = await send<DocumentRequest>('POST', `requests/${item.id}/accept`, {
		expectedRevision: 4,
		submissionId: current[0].id,
		reason: 'Verified',
	})
	expect(accepted.body.status).toBe('Completed')
	expect(accepted.body.acceptedVersionId).toBe(current[0].id)
	expect(
		(
			await send('POST', `requests/${item.id}/replacement`, {
				expectedRevision: 5,
				reason: 'Reopen forbidden',
			})
		).status,
	).toBe(409)
	const attachment = await send(
		'GET',
		`me/requests/${item.id}/submissions/${versions[0].id}/download`,
		undefined,
		ownHeaders,
	)
	expect(attachment.status).toBe(200)
	expect(attachment.bytes).toEqual(pdf)
	expect(
		(
			await send(
				'GET',
				`me/requests/${item.id}/submissions/${versions[0].id}/download`,
				undefined,
				{ 'x-hcm-development-persona': 'michael' },
			)
		).status,
	).toBe(404)
	const events = await admin.query(
		'SELECT event_type,recipient_account_id FROM hcm.notification_intent WHERE source_request_id=$1 ORDER BY created_at,id',
		[item.id],
	)
	expect(events.rows).toHaveLength(4)
	expect(
		events.rows
			.filter(
				/** Submission notices go to the requesting HR account. */ (e) =>
					e.event_type === 'document.submitted',
			)
			.every(
				/** Never send the submitter their own submission notice. */ (e) =>
					e.recipient_account_id === 'dunder-mifflin/account/toby',
			),
	).toBe(true)
})
it('serializes two submissions and blocks a cancellation that wins during file publication', /** Competing writes never publish two versions or report partial business success. */ async () => {
	const race = await create()
	const results = await Promise.all([
		upload({ expectedRevision: 1 }, race.id, randomUUID(), pdf, ownHeaders),
		upload({ expectedRevision: 1 }, race.id, randomUUID(), pdf, ownHeaders),
	])
	expect(results.map(/** Compare both concurrent outcomes. */ (r) => r.status).sort()).toEqual([
		200, 409,
	])
	expect(
		(await send<DocumentPage<DocumentVersion>>('GET', `requests/${race.id}/submissions`)).body
			.items,
	).toHaveLength(1)
	const cancelled = await create()
	publishEffect =
		/** Cancel after storage publish but before the request's final transaction. */ async () => {
			expect(
				(
					await send('POST', `requests/${cancelled.id}/cancel`, {
						expectedRevision: 1,
						reason: 'No longer required',
					})
				).status,
			).toBe(200)
		}
	expect(
		(await upload({ expectedRevision: 1 }, cancelled.id, randomUUID(), pdf, ownHeaders)).status,
	).toBe(409)
	expect(
		(await send<DocumentPage<DocumentVersion>>('GET', `requests/${cancelled.id}/submissions`)).body
			.items,
	).toEqual([])
	expect((await send<DocumentRequest>('GET', 'requests/' + cancelled.id)).body.status).toBe(
		'Cancelled',
	)
})
it('rolls back file and request success when notification persistence fails and safely retries availability failures', /** Request state, immutable version, audit and notification share one commit. */ async () => {
	const item = await create(),
		key = randomUUID()
	failurePhase = 'after'
	expect((await upload({ expectedRevision: 1 }, item.id, key, pdf, ownHeaders)).status).toBe(503)
	expect((await send<DocumentRequest>('GET', 'requests/' + item.id)).body.status).toBe('Open')
	expect((await upload({ expectedRevision: 1 }, item.id, key, pdf, ownHeaders)).status).toBe(200)
	const blocked = await create(),
		retry = randomUUID()
	await admin.query(
		"CREATE FUNCTION hcm.reject_request_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='document.submitted' THEN RAISE EXCEPTION 'test notice failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_request_notice BEFORE INSERT ON hcm.notification_intent FOR EACH ROW EXECUTE FUNCTION hcm.reject_request_notice()",
	)
	try {
		expect((await upload({ expectedRevision: 1 }, blocked.id, retry, pdf, ownHeaders)).status).toBe(
			503,
		)
		expect((await send<DocumentRequest>('GET', 'requests/' + blocked.id)).body.status).toBe('Open')
		expect(
			(await send<DocumentPage<DocumentVersion>>('GET', `requests/${blocked.id}/submissions`)).body
				.items,
		).toEqual([])
	} finally {
		await admin.query(
			'DROP TRIGGER reject_request_notice ON hcm.notification_intent; DROP FUNCTION hcm.reject_request_notice()',
		)
	}
	expect((await upload({ expectedRevision: 1 }, blocked.id, retry, pdf, ownHeaders)).status).toBe(
		200,
	)
})
it('supports no-account workers, existing disabled classifications and rejects invalid or unauthorized writes', /** No account is created for notification delivery and disabling a type never strands an existing request. */ async () => {
	const noAccount = 'request-worker-no-account',
		person = 'request-person-no-account'
	await admin.query(
		"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES($1,$2,'Temporary','Worker','Temporary Worker')",
		[tenant, person],
	)
	await admin.query(
		"INSERT INTO hcm.worker(tenant_id,id,person_id,worker_code) VALUES($1,$2,$3,'REQUEST-NO-ACCOUNT')",
		[tenant, noAccount, person],
	)
	const missing = await create(noAccount)
	expect(
		(
			await admin.query('SELECT outcome FROM hcm.notification_intent WHERE source_request_id=$1', [
				missing.id,
			])
		).rows,
	).toEqual([{ outcome: 'Undeliverable' }])
	const item = await create()
	expect(
		(
			await send('PUT', 'types/' + type.id, {
				label: type.label,
				description: '',
				enabled: false,
				expectedRevision: type.revision,
				reason: 'Retire classification',
			})
		).status,
	).toBe(200)
	expect(
		(await upload({ expectedRevision: 1 }, item.id, randomUUID(), pdf, ownHeaders)).status,
	).toBe(200)
	expect(
		(
			await send('POST', 'requests', {
				workerId: jim,
				typeId: type.id,
				reason: 'Disabled classification',
			})
		).status,
	).toBe(409)
	expect(
		(await upload({ expectedRevision: 1, workerId: jim }, item.id, randomUUID(), pdf, ownHeaders))
			.status,
	).toBe(400)
	expect(
		(await upload({ expectedRevision: 1 }, missing.id, randomUUID(), pdf, ownHeaders)).status,
	).toBe(404)
})

it('enforces request RLS, tenant-qualified references and current submission cycle constraints', /** Runtime SQL and API negatives prove isolation independently from navigation. */ async () => {
	await admin.query('UPDATE hcm.document_type SET enabled=true WHERE tenant_id=$1 AND id=$2', [
		tenant,
		type.id,
	])
	const item = await create()
	await upload({ expectedRevision: 1 }, item.id, randomUUID(), pdf, ownHeaders)
	await admin.query("SELECT set_config('hcm.tenant_id','foreign-request-tenant',false)")
	await admin.query(
		"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES('foreign-request-tenant','foreign-request-tenant','Foreign','active')",
	)
	await admin.query(
		"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES('foreign-request-tenant','foreign-person','Foreign','Person','Foreign Person'); INSERT INTO hcm.worker(tenant_id,id,person_id,worker_code) VALUES('foreign-request-tenant','foreign-request-worker','foreign-person','FOREIGN')",
	)
	await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	expect(
		(
			await send('POST', 'requests', {
				workerId: 'foreign-request-worker',
				typeId: type.id,
				reason: 'Foreign subject',
			})
		).status,
	).toBe(404)
	const runtime = new Client({ connectionString: process.env['HCM_TEST_RUNTIME'] })
	await runtime.connect()
	try {
		await runtime.query("SELECT set_config('hcm.tenant_id','foreign-request-tenant',false)")
		expect((await runtime.query('SELECT id FROM hcm.document_request')).rows).toHaveLength(0)
		expect(
			(await runtime.query('SELECT id FROM hcm.document_request_submission')).rows,
		).toHaveLength(0)
		await runtime.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		await expect(
			runtime.query('UPDATE hcm.document_request SET worker_id=$1 WHERE id=$2', [michael, item.id]),
		).rejects.toMatchObject({ code: '42501' })
		await expect(
			runtime.query('DELETE FROM hcm.document_request_submission'),
		).rejects.toMatchObject({ code: '42501' })
		await expect(
			runtime.query('UPDATE hcm.document_request SET revision=99 WHERE id=$1', [item.id]),
		).rejects.toMatchObject({ code: '23514' })
		await expect(
			runtime.query(
				"INSERT INTO hcm.document_request(tenant_id,id,worker_id,type_id,requested_by_account_id,status,revision) VALUES($1,$2,'foreign-request-worker',$3,'dunder-mifflin/account/toby','Open',1)",
				[tenant, randomUUID(), type.id],
			),
		).rejects.toMatchObject({ code: '23503' })
	} finally {
		await runtime.end()
	}
})
it('serializes acceptance against replacement and reauthorizes after publication', /** State races and revoked grants cannot finalize a stale employee submission. */ async () => {
	const item = await create()
	await upload({ expectedRevision: 1 }, item.id, randomUUID(), pdf, ownHeaders)
	const version = (
		await send<DocumentPage<DocumentVersion>>('GET', `requests/${item.id}/submissions`)
	).body.items[0]
	const outcomes = await Promise.all([
		send('POST', `requests/${item.id}/accept`, {
			expectedRevision: 2,
			submissionId: version.id,
			reason: 'Accept',
		}),
		send('POST', `requests/${item.id}/replacement`, { expectedRevision: 2, reason: 'Replace' }),
	])
	expect(
		outcomes.map(/** Only one reviewed revision may transition. */ (r) => r.status).sort(),
	).toEqual([200, 409])
	const revoked = await create()
	publishEffect =
		/** Revoke the real persisted submit grant after bytes are published. */ async () => {
			await admin.query(
				"DELETE FROM hcm.role_permission WHERE tenant_id=$1 AND role_id='employee' AND permission_code='hcm.documents.requests.self.submit'",
				[tenant],
			)
		}
	try {
		expect(
			(await upload({ expectedRevision: 1 }, revoked.id, randomUUID(), pdf, ownHeaders)).status,
		).toBe(403)
		expect((await send<DocumentRequest>('GET', 'requests/' + revoked.id)).body.status).toBe('Open')
		expect(
			(await send<DocumentPage<DocumentVersion>>('GET', `requests/${revoked.id}/submissions`)).body
				.items,
		).toEqual([])
	} finally {
		await admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'employee','hcm.documents.requests.self.submit') ON CONFLICT DO NOTHING",
			[tenant],
		)
	}
})

it('binds pagination and replay evidence to the exact scope, actor and original command', /** Query changes and malformed cursor tuples cannot widen authority or produce ambiguous retries. */ async () => {
	const key = randomUUID(),
		body = { workerId: jim, typeId: type.id, reason: 'Verify command replay' }
	const first = await send<DocumentRequest>('POST', 'requests', body, { 'idempotency-key': key })
	expect(first.status).toBe(201)
	expect(
		(await send<DocumentRequest>('POST', 'requests', body, { 'idempotency-key': key })).body,
	).toEqual(first.body)
	expect(
		(
			await send(
				'POST',
				'requests',
				{ ...body, reason: 'Changed command' },
				{ 'idempotency-key': key },
			)
		).status,
	).toBe(409)
	const listed = (await send<DocumentPage<RequestView>>('GET', 'requests?limit=1')).body
	expect(listed.nextCursor).toBeTruthy()
	const next = (
		await send<DocumentPage<RequestView>>('GET', 'requests?limit=1&cursor=' + listed.nextCursor)
	).body
	expect(next.items[0].id).not.toBe(listed.items[0].id)
	expect(
		(await send('GET', 'requests?limit=1&status=Open&cursor=' + listed.nextCursor)).status,
	).toBe(400)
	expect(
		(await send('GET', 'me/requests?limit=1&cursor=' + listed.nextCursor, undefined, ownHeaders))
			.status,
	).toBe(400)
	const cursor = JSON.parse(Buffer.from(listed.nextCursor ?? '', 'base64url').toString())
	cursor.position = '2026-99-99T99:99:99.000000Z'
	expect(
		(
			await send(
				'GET',
				'requests?limit=1&cursor=' + Buffer.from(JSON.stringify(cursor)).toString('base64url'),
			)
		).status,
	).toBe(400)
})
