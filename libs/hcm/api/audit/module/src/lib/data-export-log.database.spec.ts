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
import type { ExportPage, AuditPage } from '@empflowyee/hcm-audit-contract'
import { HcmAuditModule } from './hcm-api-audit-module'

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
				`${origin}/api/v1/${path}`,
				{
					method,
					headers: {
						host: 'acme.localhost',
						'x-hcm-development-persona': 'david',
						origin: browserOrigin,
						'sec-fetch-site': 'same-origin',
						'content-type': 'application/json',
						'content-length': String(
							Buffer.byteLength(body === undefined ? '' : JSON.stringify(body)),
						),
						'idempotency-key': randomUUID(),
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
		const module = await Test.createTestingModule({ imports: [HcmAuditModule] })
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

it('TEST-DATA-EXPORT-LOG-001/003 queries actual storage but rejects unregistered export evidence', /** An empty registry must not relabel business history or accept arbitrary inserted export payloads. */ async () => {
	const initial = await send<ExportPage>('GET', 'audit/exports')
	expect(initial.status).toBe(200)
	expect(initial.cache).toBe('no-store')
	expect(initial.body).toEqual({ items: [], nextCursor: null })
	expect(
		(
			await send('POST', 'access-control/roles', {
				label: 'Export regression role',
				permissionCodes: [],
				reason: 'Actual command, not an export',
			})
		).status,
	).toBe(201)
	await admin.query(
		"INSERT INTO hcm.audit_event(tenant_id,id,actor_account_id,action,target_type,target_id,outcome,request_id,category,safe_summary) VALUES($1,'unregistered-export','dunder-mifflin/account/david','unreviewed.export','access-role','private-target','Succeeded','private-request','export',$2)",
		[tenant, { secret: 'Never project arbitrary payloads' }],
	)
	expect((await send<ExportPage>('GET', 'audit/exports')).body).toEqual({
		items: [],
		nextCursor: null,
	})
	expect((await send<AuditPage>('GET', 'audit/events')).body.items).toHaveLength(1)
})
it('TEST-DATA-EXPORT-LOG-002 rejects invented selectors and invalid continuation', /** Date and query validation apply even when no export producers are approved. */ async () => {
	for (const query of [
		'q=raw',
		'tenantId=foreign',
		'action=role.created',
		'action=unreviewed.export',
		'outcome=Succeeded',
		'from=2040-02-30T00:00:00Z',
		'from=2040-01-01',
		'from=2040-01-01T00:00:00.123457Z&to=2040-01-01T00:00:00.123456Z',
		'cursor=bad',
		'limit=101',
		'sort=label:asc',
		'sort=occurredAt:asc&sort=occurredAt:desc',
	])
		expect((await send('GET', 'audit/exports?' + query)).status).toBe(400)
	for (const sort of ['occurredAt:desc', 'occurredAt:asc']) {
		const result = await send<ExportPage>(
			'GET',
			'audit/exports?from=2040-01-01T00:00:00.123456Z&to=2040-01-01T00:00:00.123456Z&actorAccountId=dunder-mifflin/account/david&limit=1&sort=' +
				sort,
		)
		expect(result.status).toBe(200)
		expect(result.body).toEqual({ items: [], nextCursor: null })
	}
})
it('TEST-DATA-EXPORT-LOG-004 independently requires export-log authority and tenant scope', /** Discovery, other audit permissions and foreign rows cannot confer access. */ async () => {
	expect(
		(await send('GET', 'audit/exports', undefined, { 'x-hcm-development-persona': 'jim' })).status,
	).toBe(403)
	await admin.query(
		"UPDATE hcm.user_account SET enabled=false WHERE id='dunder-mifflin/account/david'",
	)
	try {
		expect((await send('GET', 'audit/exports')).status).toBe(401)
	} finally {
		await admin.query(
			"UPDATE hcm.user_account SET enabled=true WHERE id='dunder-mifflin/account/david'",
		)
	}
	await admin.query("UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.audit'")
	try {
		expect((await send('GET', 'audit/exports')).status).toBe(403)
	} finally {
		await admin.query("UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.audit'")
	}
	const grants = (
		await admin.query(
			"DELETE FROM hcm.role_permission WHERE permission_code='hcm.audit.exports.read' RETURNING tenant_id,role_id,permission_code",
		)
	).rows
	try {
		expect((await send('GET', 'audit/exports')).status).toBe(403)
		expect((await send('GET', 'audit/events')).status).toBe(200)
	} finally {
		for (const grant of grants)
			await admin.query(
				'INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,$2,$3)',
				[grant.tenant_id, grant.role_id, grant.permission_code],
			)
	}
	await admin.query("SELECT set_config('hcm.tenant_id','export-foreign',false)")
	try {
		await admin.query(
			"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES('export-foreign','export-foreign','Foreign','active')",
		)
		await admin.query(
			"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES('export-foreign','person','Foreign','Person','Foreign person')",
		)
		await admin.query(
			"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES('export-foreign','foreign-account','person','foreign@example.test')",
		)
		await admin.query(
			"INSERT INTO hcm.audit_event(tenant_id,id,actor_account_id,action,target_type,target_id,outcome,request_id,category,safe_summary) VALUES('export-foreign','foreign-event','foreign-account','unreviewed.export','access-role','foreign-role','Succeeded','foreign-request','export','{}')",
		)
	} finally {
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	}
	expect(
		(await send<ExportPage>('GET', 'audit/exports?actorAccountId=foreign-account')).body.items,
	).toEqual([])
})
it('TEST-DATA-EXPORT-LOG-006 distinguishes database outage from empty data and cannot export', /** The query reaches actual PostgreSQL and does not mutate the append-only source. */ async () => {
	await admin.query('ALTER TABLE hcm.audit_event RENAME TO audit_event_unavailable')
	try {
		expect((await send('GET', 'audit/exports')).status).toBe(503)
	} finally {
		await admin.query('ALTER TABLE hcm.audit_event_unavailable RENAME TO audit_event')
	}
	const before = (await admin.query('SELECT count(*)::int AS count FROM hcm.audit_event')).rows[0]
		.count
	expect((await send('GET', 'audit/exports')).status).toBe(200)
	for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
		expect((await send(method, 'audit/exports', {})).status).toBe(404)
	expect((await send('GET', 'audit/exports/download')).status).toBe(404)
	expect(
		(await admin.query('SELECT count(*)::int AS count FROM hcm.audit_event')).rows[0].count,
	).toBe(before)
})
