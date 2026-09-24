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
import type { AuditPage, MyActivityPage } from '@empflowyee/hcm-audit-contract'
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

it('TEST-MY-ACTIVITY-001 starts empty and strips diagnostics from actual own actions', /** Execute a real command and compare self output with the tenant audit projection. */ async () => {
	expect(
		(
			await send<MyActivityPage>('GET', 'audit/me/activity', undefined, {
				'x-hcm-development-persona': 'jim',
			})
		).body.items,
	).toEqual([])
	expect(
		(
			await send('POST', 'access-control/roles', {
				label: 'Self activity role',
				permissionCodes: [],
				reason: 'Operator-only justification',
			})
		).status,
	).toBe(201)
	const reply = await send<MyActivityPage>('GET', 'audit/me/activity')
	expect(reply.status).toBe(200)
	expect(reply.cache).toBe('no-store')
	expect(reply.body.items).toHaveLength(1)
	expect(Object.keys(reply.body.items[0]).sort()).toEqual([
		'action',
		'id',
		'occurredAt',
		'outcome',
		'summary',
		'targetId',
		'targetType',
	])
	expect(reply.body.items[0].summary.changedFields).toBeDefined()
	expect(JSON.stringify(reply.body)).not.toContain('Operator-only')
	expect(JSON.stringify(reply.body)).not.toContain('requestId')
	expect((await send<AuditPage>('GET', 'audit/events')).body.items[0].summary.reason).toBe(
		'Operator-only justification',
	)
	expect(
		(
			await send<MyActivityPage>('GET', 'audit/me/activity', undefined, {
				'x-hcm-development-persona': 'jim',
			})
		).body.items,
	).toEqual([])
})
it('TEST-MY-ACTIVITY-002 binds exact time cursors to the verified actor and self projection', /** Isolated fictional rows expose scope, timestamp and unsafe-summary defects without populating local history. */ async () => {
	for (const persona of ['jim', 'michael', 'toby', 'david']) {
		for (const [suffix, time] of [
			['a', '2040-01-01T00:00:00.123456Z'],
			['b', '2040-01-01T00:00:00.123456Z'],
			['c', '2040-01-01T00:00:00.123457Z'],
		])
			await admin.query(
				"INSERT INTO hcm.audit_event(tenant_id,id,occurred_at,actor_account_id,action,target_type,target_id,outcome,request_id,category,safe_summary) VALUES($1,$2,$3,$4,'role.created','access-role','test-role','Succeeded','private-correlation','business',$5)",
				[
					tenant,
					persona + '-' + suffix,
					time,
					'dunder-mifflin/account/' + persona,
					{ reason: 'Private reason', changedFields: ['label'], email: 'hidden@example.test' },
				],
			)
		const headers = { 'x-hcm-development-persona': persona }
		const exact = await send<MyActivityPage>(
			'GET',
			'audit/me/activity?from=2040-01-01T00:00:00.123456Z&to=2040-01-01T00:00:00.123456Z',
			undefined,
			headers,
		)
		expect(exact.status).toBe(200)
		expect(
			exact.body.items.map(/** Compare only self fixture identities. */ (row) => row.id),
		).toEqual([persona + '-b', persona + '-a'])
		expect(exact.body.items[0].summary).toEqual({ changedFields: ['label'] })
		for (const sort of ['occurredAt:desc', 'occurredAt:asc']) {
			const base = 'audit/me/activity?from=2040-01-01T00:00:00Z&limit=1&sort=' + sort
			let result = await send<MyActivityPage>('GET', base, undefined, headers)
			const ids = result.body.items.map(/** Collect the first server page. */ (row) => row.id)
			while (result.body.nextCursor) {
				result = await send<MyActivityPage>(
					'GET',
					base + '&cursor=' + result.body.nextCursor,
					undefined,
					headers,
				)
				expect(result.status).toBe(200)
				ids.push(...result.body.items.map(/** Keep server cursor order. */ (row) => row.id))
			}
			expect(ids).toEqual(
				(sort === 'occurredAt:desc' ? ['c', 'b', 'a'] : ['a', 'b', 'c']).map(
					/** Prefix expected rows with this verified actor. */ (suffix) => persona + '-' + suffix,
				),
			)
		}
	}
	const base = 'audit/me/activity?limit=1'
	const self = (await send<MyActivityPage>('GET', base)).body.nextCursor
	expect(self).toBeTruthy()
	expect(
		(await send('GET', base + '&cursor=' + self, undefined, { 'x-hcm-development-persona': 'jim' }))
			.status,
	).toBe(400)
	expect((await send('GET', base.replace('limit=1', 'limit=2') + '&cursor=' + self)).status).toBe(
		400,
	)
	const tenantCursor = (
		await send<AuditPage>(
			'GET',
			'audit/events?limit=1&actorAccountId=dunder-mifflin%2Faccount%2Fdavid',
		)
	).body.nextCursor
	expect((await send('GET', base + '&cursor=' + tenantCursor)).status).toBe(400)
	for (const query of [
		'actorAccountId=dunder-mifflin/account/jim',
		'accountId=jim',
		'tenantId=foreign',
		'q=secret',
		'cursor=bad',
		'action=unknown',
		'limit=101',
		'sort=label:asc',
		'outcome=Failed',
		'from=2040-02-30T00:00:00Z',
		'from=2040-01-01T00:00:00.123457Z&to=2040-01-01T00:00:00.123456Z',
	])
		expect((await send('GET', 'audit/me/activity?' + query)).status).toBe(400)
})
it('TEST-MY-ACTIVITY-004 reloads authority and excludes foreign rows with the same actor ID', /** Self permission and tenant ownership remain independent even for tenant administrators. */ async () => {
	await admin.query(
		"UPDATE hcm.user_account SET enabled=false WHERE id='dunder-mifflin/account/david'",
	)
	try {
		expect((await send('GET', 'audit/me/activity')).status).toBe(401)
	} finally {
		await admin.query(
			"UPDATE hcm.user_account SET enabled=true WHERE id='dunder-mifflin/account/david'",
		)
	}
	await admin.query("UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.audit'")
	try {
		expect((await send('GET', 'audit/me/activity')).status).toBe(403)
	} finally {
		await admin.query("UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.audit'")
	}
	const grants = (
		await admin.query(
			"DELETE FROM hcm.role_permission WHERE permission_code='hcm.audit.activity.self.read' RETURNING tenant_id,role_id,permission_code",
		)
	).rows
	try {
		expect((await send('GET', 'audit/me/activity')).status).toBe(403)
		expect((await send('GET', 'audit/events')).status).toBe(200)
	} finally {
		for (const grant of grants)
			await admin.query(
				'INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,$2,$3)',
				[grant.tenant_id, grant.role_id, grant.permission_code],
			)
	}
	await admin.query("SELECT set_config('hcm.tenant_id','activity-foreign',false)")
	try {
		await admin.query(
			"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES('activity-foreign','activity-foreign','Foreign','active')",
		)
		await admin.query(
			"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES('activity-foreign','person','Foreign','Person','Foreign person')",
		)
		await admin.query(
			"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES('activity-foreign','dunder-mifflin/account/david','person','foreign@example.test')",
		)
		await admin.query(
			"INSERT INTO hcm.audit_event(tenant_id,id,actor_account_id,action,target_type,target_id,outcome,request_id,category,safe_summary) VALUES('activity-foreign','foreign-event','dunder-mifflin/account/david','role.created','access-role','foreign-role','Succeeded','foreign-request','business',$1)",
			[{ reason: 'Foreign reason', changedFields: ['label'] }],
		)
	} finally {
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	}
	expect(JSON.stringify((await send('GET', 'audit/me/activity')).body)).not.toContain(
		'foreign-role',
	)
})
it('TEST-MY-ACTIVITY-003/006 fails safely on storage outage and cannot mutate or export', /** A failed query is never successful empty history and reads never recursively append. */ async () => {
	await admin.query('ALTER TABLE hcm.audit_event RENAME TO audit_event_unavailable')
	try {
		expect((await send('GET', 'audit/me/activity')).status).toBe(503)
	} finally {
		await admin.query('ALTER TABLE hcm.audit_event_unavailable RENAME TO audit_event')
	}
	const before = (await admin.query('SELECT count(*)::int AS count FROM hcm.audit_event')).rows[0]
		.count
	expect((await send('GET', 'audit/me/activity')).status).toBe(200)
	for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
		expect((await send(method, 'audit/me/activity', {})).status).toBe(404)
	expect((await send('GET', 'audit/me/activity/export')).status).toBe(404)
	expect(
		(await admin.query('SELECT count(*)::int AS count FROM hcm.audit_event')).rows[0].count,
	).toBe(before)
})
