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
import type { SensitiveAccessPage } from '@empflowyee/hcm-audit-contract'
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

/** Insert explicitly fictional stream evidence only inside this disposable test database. */
async function stream(
	id: string,
	action: string,
	outcome: string,
	related: string | null,
	time = '2040-01-01T00:00:00.123456Z',
	actor = 'dunder-mifflin/account/david',
): Promise<void> {
	await admin.query(
		"INSERT INTO hcm.audit_event(tenant_id,id,occurred_at,actor_account_id,action,target_type,target_id,outcome,request_id,category,safe_summary,related_event_id) VALUES($1,$2,$3,$4,$5,'document','opaque-document',$6,'safe-correlation','sensitive-access',$7,$8)",
		[
			tenant,
			id,
			time,
			actor,
			action,
			outcome,
			{ filename: 'secret-file.pdf', body: 'Secret body', reason: 'Private reason' },
			related,
		],
	)
}
it('TEST-SENSITIVE-ACCESS-LOG-001/003 separates authorization, observed completion and unknown completion', /** No fictional local history is seeded; isolated test rows exercise each approved stream phase. */ async () => {
	const empty = await send<SensitiveAccessPage>('GET', 'audit/sensitive-access')
	expect(empty.status).toBe(200)
	expect(empty.cache).toBe('no-store')
	expect(empty.body.items).toEqual([])
	await stream('authorization-unknown', 'document.download-authorized', 'Authorized', null)
	await stream('authorization-completed', 'document.download-authorized', 'Authorized', null)
	await stream(
		'stream-completed',
		'document.download-completed',
		'Completed',
		'authorization-completed',
	)
	await stream('authorization-failed', 'document.download-authorized', 'Authorized', null)
	await stream('stream-failed', 'document.download-failed', 'Failed', 'authorization-failed')
	const result = (await send<SensitiveAccessPage>('GET', 'audit/sensitive-access')).body
	expect(result.items).toHaveLength(5)
	const unknown = result.items.find(
		/** Locate authorization without a completion event. */ (item) =>
			item.id === 'authorization-unknown',
	)
	expect(unknown).toMatchObject({
		phase: 'authorization',
		outcome: 'Authorized',
		relatedEventId: null,
		summary: {},
	})
	expect(
		result.items.find(
			/** Locate observed server completion. */ (item) => item.id === 'stream-completed',
		),
	).toMatchObject({
		phase: 'stream-completion',
		outcome: 'Completed',
		relatedEventId: 'authorization-completed',
	})
	expect(
		result.items.find(
			/** Locate a failed stream distinct from failed authorization. */ (item) =>
				item.id === 'stream-failed',
		),
	).toMatchObject({
		phase: 'stream-completion',
		outcome: 'Failed',
		relatedEventId: 'authorization-failed',
	})
	expect(JSON.stringify(result)).not.toContain('secret-file')
	expect(JSON.stringify(result)).not.toContain('Secret body')
	expect(JSON.stringify(result)).not.toContain('Private reason')
	expect(Object.keys(result.items[0]).sort()).toEqual([
		'action',
		'actorAccountId',
		'id',
		'occurredAt',
		'outcome',
		'phase',
		'relatedEventId',
		'requestId',
		'summary',
		'targetId',
		'targetType',
	])
})
it('TEST-SENSITIVE-ACCESS-LOG-002 preserves equal-time cursors and exact filters', /** Cover stable bidirectional ordering and context-bound continuation over meaningful stream fixtures. */ async () => {
	await stream(
		'precision-newer',
		'document.download-authorized',
		'Authorized',
		null,
		'2040-01-01T00:00:00.123457Z',
	)
	for (const sort of ['occurredAt:asc', 'occurredAt:desc']) {
		const base = 'audit/sensitive-access?limit=2&sort=' + sort
		let result = await send<SensitiveAccessPage>('GET', base)
		const cursor = result.body.nextCursor
		const ids = result.body.items.map(/** Keep the first server page order. */ (item) => item.id)
		while (result.body.nextCursor) {
			result = await send<SensitiveAccessPage>('GET', base + '&cursor=' + result.body.nextCursor)
			expect(result.status).toBe(200)
			ids.push(
				...result.body.items.map(/** Append the next server page identities. */ (item) => item.id),
			)
		}
		expect(ids).toHaveLength(6)
		expect(new Set(ids).size).toBe(6)
		expect(sort === 'occurredAt:asc' ? ids.at(-1) : ids[0]).toBe('precision-newer')
		expect(
			(await send('GET', base + '&action=document.download-authorized&cursor=' + cursor)).status,
		).toBe(400)
		expect(
			(await send('GET', base.replace('limit=2', 'limit=3') + '&cursor=' + cursor)).status,
		).toBe(400)
		expect(
			(await send('GET', 'audit/me/activity?limit=2&sort=' + sort + '&cursor=' + cursor)).status,
		).toBe(400)
	}
	const exact = (
		await send<SensitiveAccessPage>(
			'GET',
			'audit/sensitive-access?from=2040-01-01T00:00:00.123456Z&to=2040-01-01T00:00:00.123456Z',
		)
	).body
	expect(exact.items).toHaveLength(5)
	expect(
		(
			await send<SensitiveAccessPage>(
				'GET',
				'audit/sensitive-access?action=document.download-completed&outcome=Completed',
			)
		).body.items,
	).toHaveLength(1)
	expect(
		(
			await send<SensitiveAccessPage>(
				'GET',
				'audit/sensitive-access?actorAccountId=dunder-mifflin/account/jim',
			)
		).body.items,
	).toEqual([])
	for (const query of [
		'q=raw',
		'tenantId=foreign',
		'action=role.created',
		'outcome=Succeeded',
		'action=document.download-completed&action=document.download-failed',
		'outcome=Completed&outcome=Failed',
		'cursor=bad',
		'limit=101',
		'from=2040-02-30T00:00:00Z',
		'from=2040-01-01T00:00:00.123457Z&to=2040-01-01T00:00:00.123456Z',
	])
		expect((await send('GET', 'audit/sensitive-access?' + query)).status).toBe(400)
})
it('TEST-SENSITIVE-ACCESS-LOG-004 enforces explicit authority and RLS', /** Another audit grant never substitutes for sensitive metadata permission, and a foreign actor reveals no rows. */ async () => {
	expect(
		(await send('GET', 'audit/sensitive-access', undefined, { 'x-hcm-development-persona': 'jim' }))
			.status,
	).toBe(403)
	await admin.query(
		"UPDATE hcm.user_account SET enabled=false WHERE id='dunder-mifflin/account/david'",
	)
	try {
		expect((await send('GET', 'audit/sensitive-access')).status).toBe(401)
	} finally {
		await admin.query(
			"UPDATE hcm.user_account SET enabled=true WHERE id='dunder-mifflin/account/david'",
		)
	}
	await admin.query("UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.audit'")
	try {
		expect((await send('GET', 'audit/sensitive-access')).status).toBe(403)
	} finally {
		await admin.query("UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.audit'")
	}
	const grants = (
		await admin.query(
			"DELETE FROM hcm.role_permission WHERE permission_code='hcm.audit.sensitive-access.read' RETURNING tenant_id,role_id,permission_code",
		)
	).rows
	try {
		expect((await send('GET', 'audit/sensitive-access')).status).toBe(403)
		expect((await send('GET', 'audit/events')).status).toBe(200)
	} finally {
		for (const grant of grants)
			await admin.query(
				'INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,$2,$3)',
				[grant.tenant_id, grant.role_id, grant.permission_code],
			)
	}
	await admin.query("SELECT set_config('hcm.tenant_id','sensitive-foreign',false)")
	try {
		await admin.query(
			"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES('sensitive-foreign','sensitive-foreign','Foreign','active')",
		)
		await admin.query(
			"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES('sensitive-foreign','person','Foreign','Person','Foreign person')",
		)
		await admin.query(
			"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES('sensitive-foreign','foreign-account','person','foreign@example.test')",
		)
		await admin.query(
			"INSERT INTO hcm.audit_event(tenant_id,id,actor_account_id,action,target_type,target_id,outcome,request_id,category,safe_summary) VALUES('sensitive-foreign','foreign-event','foreign-account','document.download-authorized','document','foreign-document','Authorized','foreign-request','sensitive-access','{}')",
		)
	} finally {
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	}
	expect(
		(
			await send<SensitiveAccessPage>(
				'GET',
				'audit/sensitive-access?actorAccountId=foreign-account',
			)
		).body.items,
	).toEqual([])
	expect(JSON.stringify((await send('GET', 'audit/sensitive-access')).body)).not.toContain(
		'foreign-document',
	)
})
it('TEST-SENSITIVE-ACCESS-LOG-006 rejects inconsistent stored phases and recovers from outages', /** Never turn malformed evidence or database failure into successful or empty stream results. */ async () => {
	await admin.query("UPDATE hcm.audit_event SET outcome='Authorized' WHERE id='stream-completed'")
	try {
		expect((await send('GET', 'audit/sensitive-access')).status).toBe(503)
	} finally {
		await admin.query("UPDATE hcm.audit_event SET outcome='Completed' WHERE id='stream-completed'")
	}
	await admin.query('ALTER TABLE hcm.audit_event RENAME TO audit_event_unavailable')
	try {
		expect((await send('GET', 'audit/sensitive-access')).status).toBe(503)
	} finally {
		await admin.query('ALTER TABLE hcm.audit_event_unavailable RENAME TO audit_event')
	}
	const before = (await admin.query('SELECT count(*)::int AS count FROM hcm.audit_event')).rows[0]
		.count
	expect((await send('GET', 'audit/sensitive-access')).status).toBe(200)
	for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
		expect((await send(method, 'audit/sensitive-access', {})).status).toBe(404)
	expect((await send('GET', 'audit/sensitive-access/download')).status).toBe(404)
	expect(
		(await admin.query('SELECT count(*)::int AS count FROM hcm.audit_event')).rows[0].count,
	).toBe(before)
})
