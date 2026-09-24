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
import type { AuditPage } from '@empflowyee/hcm-audit-contract'
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

it('TEST-AUDIT-LOG-001 starts honestly empty and reads evidence from real commands', /** No seed history is manufactured; actual role commands emit the first evidence. */ async () => {
	expect((await send<AuditPage>('GET', 'audit/events')).body.items).toEqual([])
	for (const label of ['Audit one', 'Audit two', 'Audit three'])
		expect(
			(
				await send('POST', 'access-control/roles', {
					label,
					permissionCodes: [],
					reason: 'Audit acceptance',
				})
			).status,
		).toBe(201)
	const reply = await send<AuditPage>('GET', 'audit/events')
	expect(reply.status).toBe(200)
	expect(reply.cache).toBe('no-store')
	expect(reply.body.items).toHaveLength(3)
	for (const item of reply.body.items) {
		expect(item.action).toBe('role.created')
		expect(item.actorAccountId).toBe('dunder-mifflin/account/david')
		expect(item.summary.reason).toBe('Audit acceptance')
		expect(Object.keys(item).sort()).toEqual([
			'action',
			'actorAccountId',
			'id',
			'occurredAt',
			'outcome',
			'requestId',
			'summary',
			'targetId',
			'targetType',
		])
	}
})
it('TEST-AUDIT-LOG-002 retains microsecond boundaries and stable equal-time cursor ordering', /** Use isolated audit fixtures to expose timestamp truncation and changed-control cursor defects. */ async () => {
	for (const [id, time] of [
		['cursor-a', '2040-01-01T00:00:00.123456Z'],
		['cursor-b', '2040-01-01T00:00:00.123456Z'],
		['cursor-c', '2040-01-01T00:00:00.123455Z'],
		['cursor-d', '2040-01-01T00:00:00.123457Z'],
	])
		await admin.query(
			"INSERT INTO hcm.audit_event(tenant_id,id,occurred_at,actor_account_id,action,target_type,target_id,outcome,request_id,category,safe_summary) VALUES($1,$2,$3,'dunder-mifflin/account/david','role.created','access-role','test-target','Succeeded','test-correlation','business',$4)",
			[tenant, id, time, { reason: 'Cursor fixture', changedFields: ['label'] }],
		)
	const bounds = 'from=2040-01-01T00:00:00.123456Z&to=2040-01-01T00:00:00.123456Z'
	expect(
		(await send<AuditPage>('GET', 'audit/events?' + bounds)).body.items.map(
			/** Compare exact boundary identities. */ (row) => row.id,
		),
	).toEqual(['cursor-b', 'cursor-a'])
	for (const sort of ['occurredAt:desc', 'occurredAt:asc']) {
		const base = `audit/events?from=2040-01-01T00:00:00Z&sort=${sort}&limit=1`
		let result = await send<AuditPage>('GET', base)
		const ids = result.body.items.map(/** Start a complete cursor traversal. */ (row) => row.id)
		const cursor = result.body.nextCursor
		while (result.body.nextCursor) {
			result = await send<AuditPage>('GET', base + '&cursor=' + result.body.nextCursor)
			ids.push(
				...result.body.items.map(
					/** Collect the next identity without re-sorting. */ (row) => row.id,
				),
			)
		}
		expect(ids).toEqual(
			sort === 'occurredAt:desc'
				? ['cursor-d', 'cursor-b', 'cursor-a', 'cursor-c']
				: ['cursor-c', 'cursor-a', 'cursor-b', 'cursor-d'],
		)
		expect(
			(await send('GET', base.replace('limit=1', 'limit=2') + '&cursor=' + cursor)).status,
		).toBe(400)
		expect((await send('GET', base + '&action=role.created&cursor=' + cursor)).status).toBe(400)
	}
	for (const query of [
		'q=raw',
		'tenantId=foreign',
		'from=2040-02-30T00:00:00Z',
		'from=2040-01-01',
		'from=2040-01-01T00:00:00.123457Z&to=2040-01-01T00:00:00.123456Z',
		'cursor=bad',
		'limit=101',
		'action=unregistered',
		'outcome=Failed',
		'sort=id:asc',
		'action=role.created&action=role.deleted',
	])
		expect((await send('GET', 'audit/events?' + query)).status).toBe(400)
})
it('TEST-AUDIT-LOG-003 omits forbidden JSON keys and distinguishes service failure from emptiness', /** The DTO allowlist remains effective even for a malformed historic row. */ async () => {
	await admin.query(
		'UPDATE hcm.audit_event SET safe_summary=safe_summary||\'{"password":"must-not-leak","email":"private@example.test"}\'::jsonb WHERE id=\'cursor-a\'',
	)
	const reply = await send<AuditPage>('GET', 'audit/events?from=2040-01-01T00:00:00Z')
	expect(JSON.stringify(reply.body)).not.toContain('must-not-leak')
	expect(JSON.stringify(reply.body)).not.toContain('private@example.test')
	expect((await send<AuditPage>('GET', 'audit/events?action=account.disabled')).body.items).toEqual(
		[],
	)
	await admin.query('ALTER TABLE hcm.audit_event RENAME TO audit_event_unavailable')
	try {
		expect((await send('GET', 'audit/events')).status).toBe(503)
	} finally {
		await admin.query('ALTER TABLE hcm.audit_event_unavailable RENAME TO audit_event')
	}
	expect((await send('GET', 'audit/events')).status).toBe(200)
})
it('TEST-AUDIT-LOG-004 checks persisted authority and isolates actual foreign evidence', /** Exercise real tenant rows, enabled state, entitlement and business permission independently. */ async () => {
	expect(
		(await send('GET', 'audit/events', undefined, { 'x-hcm-development-persona': 'jim' })).status,
	).toBe(403)
	await admin.query(
		"UPDATE hcm.user_account SET enabled=false WHERE id='dunder-mifflin/account/david'",
	)
	try {
		expect((await send('GET', 'audit/events')).status).toBe(401)
	} finally {
		await admin.query(
			"UPDATE hcm.user_account SET enabled=true WHERE id='dunder-mifflin/account/david'",
		)
	}
	await admin.query("UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.audit'")
	try {
		expect((await send('GET', 'audit/events')).status).toBe(403)
	} finally {
		await admin.query("UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.audit'")
	}
	const grants = (
		await admin.query(
			"DELETE FROM hcm.role_permission WHERE permission_code='hcm.audit.events.read' RETURNING tenant_id,role_id,permission_code",
		)
	).rows
	try {
		expect((await send('GET', 'audit/events')).status).toBe(403)
	} finally {
		for (const g of grants)
			await admin.query(
				'INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,$2,$3)',
				[g.tenant_id, g.role_id, g.permission_code],
			)
	}
	await admin.query("SELECT set_config('hcm.tenant_id','audit-foreign',false)")
	try {
		await admin.query(
			"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES('audit-foreign','audit-foreign','Foreign','active')",
		)
		await admin.query(
			"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES('audit-foreign','person','Foreign','Person','Foreign person')",
		)
		await admin.query(
			"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES('audit-foreign','foreign-account','person','foreign@example.test')",
		)
		await admin.query(
			"INSERT INTO hcm.audit_event(tenant_id,id,actor_account_id,action,target_type,target_id,outcome,request_id,category,safe_summary) VALUES('audit-foreign','foreign-event','foreign-account','role.created','access-role','foreign-role','Succeeded','foreign-request','business',$1)",
			[{ reason: 'Foreign reason', changedFields: ['label'] }],
		)
	} finally {
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	}
	expect(
		(await send<AuditPage>('GET', 'audit/events?actorAccountId=foreign-account')).body.items,
	).toEqual([])
	expect(JSON.stringify((await send('GET', 'audit/events')).body)).not.toContain('Foreign reason')
})
it('TEST-AUDIT-LOG-006 never mutates evidence or offers an exporter', /** Actual read requests produce no recursive audit rows and unsupported actions have no transport. */ async () => {
	const before = (await admin.query('SELECT count(*)::int AS count FROM hcm.audit_event')).rows[0]
		.count
	for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
		expect((await send(method, 'audit/events', {})).status).toBe(404)
	expect((await send('GET', 'audit/events/export')).status).toBe(404)
	await send('GET', 'audit/events')
	expect(
		(await admin.query('SELECT count(*)::int AS count FROM hcm.audit_event')).rows[0].count,
	).toBe(before)
})
