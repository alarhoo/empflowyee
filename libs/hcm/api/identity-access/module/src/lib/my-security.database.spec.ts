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
import type { SecuritySummary, SecurityRoles } from '@empflowyee/hcm-identity-access-contract'
import { HcmIdentityAccessModule } from './hcm-api-identity-access-module'

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
				`${origin}/api/v1/${path.startsWith('access-control/') ? path : 'identity-access/' + path}`,
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
		const module = await Test.createTestingModule({ imports: [HcmIdentityAccessModule] })
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

const own = 'me/security'
const jim = 'dunder-mifflin/account/jim'
/** Exercise the own-account endpoint with a real persisted persona. */
function self<T>(path = own, persona = 'jim') {
	return send<T>('GET', path, undefined, { 'x-hcm-development-persona': persona })
}
it('TEST-MY-SECURITY-001 resolves each persona to persisted own identity', /** Compare actual storage for every supported local persona and expose no credentials. */ async () => {
	for (const persona of ['jim', 'michael', 'toby', 'david']) {
		const reply = await self<SecuritySummary>(own, persona)
		expect(reply.status).toBe(200)
		expect(reply.cache).toBe('no-store')
		const row = (
			await admin.query(
				'SELECT a.id,a.email,a.enabled,p.display_name FROM hcm.user_account a JOIN hcm.person p ON p.tenant_id=a.tenant_id AND p.id=a.person_id WHERE a.id=$1',
				[`dunder-mifflin/account/${persona}`],
			)
		).rows[0]
		expect(reply.body).toEqual({
			accountId: row.id,
			displayName: row.display_name,
			email: row.email,
			enabled: row.enabled,
			sessionMode: 'local-development',
			expiresAt: expect.any(String),
		})
		expect(Date.parse(reply.body.expiresAt)).toBeGreaterThan(Date.now())
	}
})
it('TEST-MY-SECURITY-002 reads live assignments with stable self-bound pagination', /** Prove actual grant changes, literal search, minimal labels and strict cursor/query binding. */ async () => {
	for (const [id, label] of [
		['self-alpha', 'A role'],
		['self-beta', 'B role'],
		['self-other', 'Other account role'],
	])
		await admin.query('INSERT INTO hcm.access_role(tenant_id,id,label) VALUES($1,$2,$3)', [
			tenant,
			id,
			label,
		])
	for (const id of ['self-alpha', 'self-beta'])
		await admin.query(
			'INSERT INTO hcm.account_role(tenant_id,account_id,role_id) VALUES($1,$2,$3)',
			[tenant, jim, id],
		)
	await admin.query(
		"INSERT INTO hcm.account_role(tenant_id,account_id,role_id) VALUES($1,'dunder-mifflin/account/david','self-other')",
		[tenant],
	)
	const first = await self<SecurityRoles>(own + '/roles?limit=1')
	expect(first.body.items).toEqual([{ id: 'self-alpha', label: 'A role' }])
	const second = await self<SecurityRoles>(own + `/roles?limit=1&cursor=${first.body.nextCursor}`)
	expect(second.body.items).toEqual([{ id: 'self-beta', label: 'B role' }])
	expect((await self(own + `/roles?limit=2&cursor=${first.body.nextCursor}`)).status).toBe(400)
	expect((await self(own + `/roles?limit=1&q=A&cursor=${first.body.nextCursor}`)).status).toBe(400)
	expect((await self(own + `/roles?limit=1&cursor=${first.body.nextCursor}`, 'david')).status).toBe(
		400,
	)
	expect((await self<SecurityRoles>(own + '/roles?q=%25')).body.items).toEqual([])
	expect((await self<SecurityRoles>(own + '/roles?q=Other')).body.items).toEqual([])
	await admin.query("DELETE FROM hcm.account_role WHERE account_id=$1 AND role_id='self-alpha'", [
		jim,
	])
	expect((await self<SecurityRoles>(own + '/roles?q=A%20role')).body.items).toEqual([])
	for (const query of [
		'accountId=other',
		'tenantId=foreign',
		'sort=label:desc',
		'limit=0',
		'limit=101',
		'cursor=bad',
		'q=a&q=b',
	])
		expect((await self(own + '/roles?' + query)).status).toBe(400)
})
it('TEST-MY-SECURITY-003 rejects scope injection and unimplemented security commands', /** Local read contracts cannot create a production security surface. */ async () => {
	for (const query of ['accountId=dunder-mifflin/account/david', 'tenantId=foreign'])
		expect((await self(own + '?' + query)).status).toBe(400)
	for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
		expect((await send(method, own, {})).status).toBe(404)
	for (const path of ['password', 'mfa', 'revoke'])
		expect((await send('POST', own + '/' + path, {})).status).toBe(404)
})
it('TEST-MY-SECURITY-004 reauthorizes own reads against real enabled state and grants', /** Separate self permission and entitlement from catalogue visibility. */ async () => {
	await admin.query('UPDATE hcm.user_account SET enabled=false WHERE id=$1', [jim])
	try {
		expect((await self(own)).status).toBe(401)
		expect((await self(own + '/roles')).status).toBe(401)
	} finally {
		await admin.query('UPDATE hcm.user_account SET enabled=true WHERE id=$1', [jim])
	}
	await admin.query(
		"UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.identity-access'",
	)
	try {
		expect((await self(own)).status).toBe(403)
		expect((await self(own + '/roles')).status).toBe(403)
	} finally {
		await admin.query(
			"UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.identity-access'",
		)
	}
	const grants = (
		await admin.query(
			"DELETE FROM hcm.role_permission WHERE permission_code='hcm.identity-access.security.self.read' RETURNING tenant_id,role_id,permission_code",
		)
	).rows
	try {
		expect((await self(own)).status).toBe(403)
		expect((await self(own + '/roles')).status).toBe(403)
	} finally {
		for (const g of grants)
			await admin.query(
				'INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,$2,$3)',
				[g.tenant_id, g.role_id, g.permission_code],
			)
	}
})
it('TEST-MY-SECURITY-006 excludes foreign assignments even for a colliding account ID', /** Establish actual foreign rows under RLS and prove the self join cannot expose them. */ async () => {
	await admin.query("SELECT set_config('hcm.tenant_id','security-foreign',false)")
	try {
		await admin.query(
			"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES('security-foreign','security-foreign','Foreign','active')",
		)
		await admin.query(
			"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES('security-foreign','security-person','Foreign','Person','Foreign person')",
		)
		await admin.query(
			"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES('security-foreign',$1,'security-person','foreign@example.test')",
			[jim],
		)
		await admin.query(
			"INSERT INTO hcm.access_role(tenant_id,id,label) VALUES('security-foreign','foreign-role','Foreign role')",
		)
		await admin.query(
			"INSERT INTO hcm.account_role(tenant_id,account_id,role_id) VALUES('security-foreign',$1,'foreign-role')",
			[jim],
		)
	} finally {
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	}
	expect((await self<SecurityRoles>(own + '/roles?q=Foreign')).body.items).toEqual([])
	expect((await self<SecuritySummary>()).body.email).not.toBe('foreign@example.test')
})
