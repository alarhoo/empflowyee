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
import type { DocumentType, DocumentTypePage } from '@empflowyee/hcm-documents-contract'
import { requireEnabledDocumentType } from '@empflowyee/hcm-api-documents-domain'
import { HcmDocumentsModule } from './hcm-api-documents-module'

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
							Buffer.byteLength(body === undefined ? '' : JSON.stringify(body)),
						),
						...headers,
					},
				},
				/** Decode the actual API output. */ (response) => {
					let text = ''
					response.on(
						'data',
						/** Collect bounded test JSON. */ (chunk) => {
							text += String(chunk)
						},
					)
					response.on(
						'end',
						/** Preserve status and cache policy alongside the DTO. */ () =>
							resolveReply({
								status: response.statusCode ?? 0,
								body: JSON.parse(text),
								cache: response.headers['cache-control'],
							}),
					)
				},
			)
			call.on('error', reject)
			call.end(body === undefined ? undefined : JSON.stringify(body))
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
		const store = new HcmRuntimeStore(runtime)
		const module = await Test.createTestingModule({ imports: [HcmDocumentsModule] })
			.overrideProvider(HcmRuntimeStore)
			.useValue(store)
			.overrideProvider(TenantDirectory)
			.useValue(createTenantDirectory(env, store))
			.overrideProvider(HcmSessionReader)
			.useValue(createSessionReader(env, store))
			.overrideProvider(HcmAccessDatabase)
			.useValue(new HcmAccessDatabase(runtime))
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
	},
)

let saved: DocumentType
/** Read the real classification list with bounded optional query controls. */
async function list(query = ''): Promise<DocumentTypePage> {
	const result = await send<DocumentTypePage>('GET', 'types' + query)
	expect(result.status).toBe(200)
	return result.body
}
it('starts without fake classifications and authorizes HR independently of administrator discovery', /** Verify the persisted authority matrix and real empty state. */ async () => {
	expect(await list()).toEqual({ items: [], nextCursor: null })
	for (const persona of ['jim', 'michael', 'david'])
		expect(
			(await send('GET', 'types', undefined, { 'x-hcm-development-persona': persona })).status,
		).toBe(403)
	expect(
		(
			await admin.query(
				"SELECT * FROM hcm.role_permission WHERE role_id='hr-specialist' AND permission_code='hcm.catalogue.DOCUMENT_TYPES.discover'",
			)
		).rows,
	).toHaveLength(1)
})
it('creates unique immutable codes with atomic audit and successful retry receipts', /** Creation returns only the public DTO and cannot replay with a changed payload. */ async () => {
	const body = {
			code: 'TEST_REFERENCE',
			label: 'Reference',
			description: 'Bounded classification',
			reason: 'Create classification',
		},
		key = randomUUID()
	const result = await send<DocumentType>('POST', 'types', body, { 'idempotency-key': key })
	expect(result.status).toBe(201)
	saved = result.body
	expect(Object.keys(saved).sort()).toEqual([
		'code',
		'description',
		'enabled',
		'id',
		'label',
		'revision',
	])
	expect(saved).toMatchObject({ code: body.code, label: body.label, enabled: true, revision: 1 })
	expect((await send('POST', 'types', body, { 'idempotency-key': key })).body).toEqual(saved)
	expect(
		(await send('POST', 'types', { ...body, label: 'Changed' }, { 'idempotency-key': key })).status,
	).toBe(409)
	expect((await send('POST', 'types', body)).body).toMatchObject({ code: 'duplicate-code' })
	const audit = (
		await admin.query(
			"SELECT safe_summary AS summary,target_type AS target FROM hcm.audit_event WHERE action='document.type-created'",
		)
	).rows
	expect(audit).toEqual([
		{
			summary: {
				reason: 'Create classification',
				changedFields: ['code', 'label', 'description', 'enabled'],
			},
			target: 'document-type',
		},
	])
})
it('paginates and searches literal labels with filter-bound tenant cursors', /** Stable tie-breakers avoid duplicate equal-label rows and LIKE wildcard expansion. */ async () => {
	for (const [code, label] of [
		['SECOND', 'Reference'],
		['LITERAL', '100%_literal'],
		['THIRD', 'Zed'],
	])
		expect(
			(await send('POST', 'types', { code, label, reason: 'Query verification' })).status,
		).toBe(201)
	expect(
		(await list('?q=' + encodeURIComponent('%_'))).items.map(
			/** Compare only the intended literal search match. */ (item) => item.code,
		),
	).toEqual(['LITERAL'])
	const first = await list('?limit=1')
	expect(first.nextCursor).toBeTypeOf('string')
	const next = await list('?limit=1&cursor=' + first.nextCursor)
	expect(next.items[0].id).not.toBe(first.items[0].id)
	expect((await send('GET', 'types?limit=2&cursor=' + first.nextCursor)).status).toBe(400)
	expect((await send('GET', 'types?limit=1&enabled=false&cursor=' + first.nextCursor)).status).toBe(
		400,
	)
	const descending = await list('?sort=label:desc')
	expect(descending.items[0].label).toBe('Zed')
	for (const query of [
		'?q=a&q=b',
		'?limit=101',
		'?cursor=bad',
		'?enabled=yes',
		'?accountId=other',
		'?sort=id:asc',
	])
		expect((await send('GET', 'types' + query)).status).toBe(400)
})
it('edits mutable metadata and disables new use without deleting historical classifications', /** Exact revisions govern competing changes and codes remain immutable. */ async () => {
	const body = {
			label: 'Updated reference',
			description: 'Preserved classification',
			enabled: false,
			expectedRevision: saved.revision,
			reason: 'Disable new use',
		},
		key = randomUUID()
	const result = await send<DocumentType>('PUT', 'types/' + saved.id, body, {
		'idempotency-key': key,
	})
	expect(result.status).toBe(200)
	expect(result.body.code).toBe(saved.code)
	expect(result.body.revision).toBe(2)
	expect((await send('PUT', 'types/' + saved.id, body, { 'idempotency-key': key })).body).toEqual(
		result.body,
	)
	expect((await send('PUT', 'types/' + saved.id, { ...body, code: 'REPLACED' })).status).toBe(400)
	expect((await send('PUT', 'types/' + saved.id, body)).status).toBe(409)
	expect((await list('?enabled=false')).items).toContainEqual(result.body)
	expect(
		/** Disabled types reject new aggregate creation through the shared owning policy. */ () =>
			requireEnabledDocumentType(result.body),
	).toThrow('type-disabled')
	const racing = await Promise.all([
		send('PUT', 'types/' + saved.id, { ...body, expectedRevision: 2 }),
		send('PUT', 'types/' + saved.id, { ...body, enabled: true, expectedRevision: 2 }),
	])
	expect(
		racing
			.map(/** Ignore which request acquired the transaction lock first. */ (value) => value.status)
			.sort(),
	).toEqual([200, 409])
	expect((await send('DELETE', 'types/' + saved.id)).status).toBe(404)
	saved =
		(await list()).items.find(/** Load the winning revision. */ (item) => item.id === saved.id) ??
		saved
})
it('rejects invalid input, disabled authority and revoked permissions even for receipt replay', /** Discovery and prior success never grant content-administration authority. */ async () => {
	const body = {
			code: 'AUTHORITY',
			label: 'Authority check',
			reason: 'Verify persisted authorization',
		},
		key = randomUUID()
	expect((await send('POST', 'types', body, { 'idempotency-key': key })).status).toBe(201)
	for (const invalid of [
		{ ...body, code: 'lower-case' },
		{ ...body, label: '' },
		{ ...body, description: 'x'.repeat(501) },
		{ ...body, reason: '' },
		{ ...body, enabled: false },
		{ ...body, tenantId: 'foreign' },
	])
		expect((await send('POST', 'types', invalid)).status).toBe(400)
	expect((await send('POST', 'types', body, { origin: 'https://foreign.invalid' })).status).toBe(
		403,
	)
	expect((await send('POST', 'types', body, { 'content-type': 'text/plain' })).status).toBe(415)
	await admin.query(
		"DELETE FROM hcm.role_permission WHERE role_id='hr-specialist' AND permission_code='hcm.documents.types.manage'",
	)
	try {
		expect((await send('POST', 'types', body, { 'idempotency-key': key })).status).toBe(403)
		expect((await send('GET', 'types')).status).toBe(200)
	} finally {
		await admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'hr-specialist','hcm.documents.types.manage')",
			[tenant],
		)
	}
	await admin.query(
		"UPDATE hcm.user_account SET enabled=false WHERE id='dunder-mifflin/account/toby'",
	)
	try {
		expect((await send('GET', 'types')).status).toBe(401)
	} finally {
		await admin.query(
			"UPDATE hcm.user_account SET enabled=true WHERE id='dunder-mifflin/account/toby'",
		)
	}
	await admin.query("UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.documents'")
	try {
		expect((await send('GET', 'types')).status).toBe(403)
	} finally {
		await admin.query("UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.documents'")
	}
})
it('rolls back type and receipt on an audit failure', /** A failed business transaction cannot leave a success projection. */ async () => {
	const key = randomUUID()
	await admin.query(
		"CREATE FUNCTION hcm.fail_type_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$",
	)
	await admin.query(
		'CREATE TRIGGER fail_type_audit BEFORE INSERT ON hcm.audit_event FOR EACH ROW EXECUTE FUNCTION hcm.fail_type_audit()',
	)
	try {
		expect(
			(
				await send(
					'POST',
					'types',
					{ code: 'ROLLBACK', label: 'Rollback', reason: 'Verify atomicity' },
					{ 'idempotency-key': key },
				)
			).status,
		).toBe(503)
		expect(
			(await admin.query("SELECT * FROM hcm.document_type WHERE code='ROLLBACK'")).rows,
		).toEqual([])
		expect(
			(
				await admin.query('SELECT * FROM hcm.document_command_receipt WHERE idempotency_key=$1', [
					key,
				])
			).rows,
		).toEqual([])
	} finally {
		await admin.query('DROP TRIGGER fail_type_audit ON hcm.audit_event')
		await admin.query('DROP FUNCTION hcm.fail_type_audit()')
	}
})
it('conceals actual foreign records and forbids ownership/code mutation or deletion in runtime SQL', /** RLS and constrained privileges remain effective outside the API. */ async () => {
	await admin.query("SELECT set_config('hcm.tenant_id','foreign-documents',false)")
	try {
		await admin.query(
			"INSERT INTO hcm.tenant(id,slug,display_name,status,defaults) VALUES('foreign-documents','foreign-documents','Foreign','active','{}')",
		)
		await admin.query(
			"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES('foreign-documents','foreign-person','Foreign','Person','Foreign Person')",
		)
		await admin.query(
			"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES('foreign-documents','foreign-account','foreign-person','foreign@example.com')",
		)
		await admin.query(
			"INSERT INTO hcm.document_type(tenant_id,id,code,label,created_by,updated_by) VALUES('foreign-documents','foreign-type','FOREIGN','Foreign type','foreign-account','foreign-account')",
		)
	} finally {
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	}
	expect(
		(
			await send('PUT', 'types/foreign-type', {
				label: 'Changed',
				description: '',
				enabled: false,
				expectedRevision: 1,
				reason: 'Attempt foreign change',
			})
		).status,
	).toBe(404)
	expect(JSON.stringify(await list())).not.toContain('Foreign type')
	const runtime = new Client({ connectionString: process.env['HCM_TEST_RUNTIME'] })
	await runtime.connect()
	try {
		await runtime.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		expect(
			(await runtime.query("SELECT * FROM hcm.document_type WHERE tenant_id='foreign-documents'"))
				.rows,
		).toEqual([])
		expect(
			(await runtime.query("UPDATE hcm.document_type SET label='Changed' WHERE id='foreign-type'"))
				.rowCount,
		).toBe(0)
		for (const statement of [
			"UPDATE hcm.document_type SET tenant_id='foreign-documents'",
			"UPDATE hcm.document_type SET code='ALTERED'",
			'DELETE FROM hcm.document_type',
			'DELETE FROM hcm.document_command_receipt',
			"INSERT INTO hcm.document_type(tenant_id,id,code,label,created_by,updated_by) VALUES('foreign-documents','forged','FORGED','Forged','foreign-account','foreign-account')",
		])
			await expect(runtime.query(statement)).rejects.toMatchObject({ code: '42501' })
	} finally {
		await runtime.end()
	}
})
