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
import type {
	CatalogueEntry,
	CatalogueDiscovery,
	CatalogueAccount,
	Page,
} from '@empflowyee/hcm-access-control-contract'
import { HCM_CATALOGUE } from '@empflowyee/hcm-runtime-contract/catalogue'
import { HcmAccessControlModule } from './hcm-api-access-control-module'

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
				`${origin}/api/v1/access-control/${path}`,
				{
					method,
					headers: {
						host: 'acme.localhost',
						'x-hcm-development-persona': 'david',
						origin: browserOrigin,
						'sec-fetch-site': 'same-origin',
						'content-type': 'application/json',
						'content-length':
							body === undefined ? '0' : String(Buffer.byteLength(JSON.stringify(body))),
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
		const module = await Test.createTestingModule({ imports: [HcmAccessControlModule] })
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

const jim = 'dunder-mifflin/account/jim'
/** Resolve one selected subject without changing the authenticated actor. */
async function discovery(id = jim): Promise<CatalogueDiscovery> {
	const response = await send<CatalogueDiscovery>(
		'GET',
		`catalogue/accounts/${encodeURIComponent(id)}/discovery`,
	)
	expect(response.status).toBe(200)
	return response.body
}
it('TEST-APP-CATALOGUE-CONFIGURATION-001 projects the complete canonical inventory and placements', /** Prove a read-only canonical/tenant join instead of frontend business fixtures. */ async () => {
	const response = await send<{ items: CatalogueEntry[] }>('GET', 'catalogue')
	expect(response.status).toBe(200)
	expect(response.cache).toBe('no-store')
	expect(response.body.items).toHaveLength(HCM_CATALOGUE.apps.length)
	expect(
		response.body.items.map(/** Compare stable app identities. */ (app) => app.appCode),
	).toEqual(HCM_CATALOGUE.apps.map(/** Preserve canonical order. */ (app) => app.appCode))
	for (const app of response.body.items) {
		expect(app.placements.length).toBeGreaterThan(0)
		expect(app.entitled).toBe(true)
	}
	const role = response.body.items.find(
		/** Inspect an actual implemented app. */ (app) => app.appCode === 'ROLE_MANAGEMENT',
	)
	expect(role?.status).toBe('complete')
	expect(role?.route).toBe('/access-control/role-management')
	expect(
		response.body.items.find(
			/** Deferred production integration remains visibly planned. */ (app) =>
				app.appCode === 'SSO_CONFIGURATION',
		)?.status,
	).toBe('planned')
	const before = (await admin.query('SELECT count(*)::int AS count FROM hcm.audit_event')).rows[0]
		.count
	await send('GET', 'catalogue')
	await discovery()
	expect(
		(await admin.query('SELECT count(*)::int AS count FROM hcm.audit_event')).rows[0].count,
	).toBe(before)
})
it('TEST-APP-CATALOGUE-CONFIGURATION-002 offers bounded safe account choices', /** Enforce supported query shape and bound continuation to its filter and page size. */ async () => {
	const first = await send<Page<CatalogueAccount>>('GET', 'catalogue/accounts?limit=2')
	expect(first.status).toBe(200)
	expect(Object.keys(first.body.items[0]).sort()).toEqual(['displayName', 'email', 'id'])
	const next = await send<Page<CatalogueAccount>>(
		'GET',
		`catalogue/accounts?limit=2&cursor=${first.body.nextCursor}`,
	)
	expect(next.status).toBe(200)
	expect(
		new Set(
			[...first.body.items, ...next.body.items].map(
				/** Compare actual account IDs. */ (item) => item.id,
			),
		).size,
	).toBe(4)
	expect(
		(await send('GET', `catalogue/accounts?limit=1&cursor=${first.body.nextCursor}`)).status,
	).toBe(400)
	expect(
		(await send('GET', `catalogue/accounts?q=Jim&limit=2&cursor=${first.body.nextCursor}`)).status,
	).toBe(400)
	expect(
		(await send<Page<CatalogueAccount>>('GET', 'catalogue/accounts?q=%25')).body.items,
	).toEqual([])
	for (const query of [
		'enabled=true',
		'sort=email:asc',
		'tenantId=other',
		'q=x&q=y',
		'limit=0',
		'limit=101',
	])
		expect((await send('GET', `catalogue/accounts?${query}`)).status).toBe(400)
})
it('TEST-APP-CATALOGUE-CONFIGURATION-003 explains independent discovery reasons from persisted grants', /** Separate disabled identity, permission, entitlement and Space placement from implementation readiness. */ async () => {
	const normal = await discovery()
	expect(
		normal.items.find(
			/** Planned self-service apps may still be discoverable. */ (item) =>
				item.appCode === 'MY_PROFILE',
		),
	).toMatchObject({ discoverable: true, reasons: [] })
	expect(
		normal.items.find(
			/** Employee role does not expose administrative Space placement. */ (item) =>
				item.appCode === 'ROLE_MANAGEMENT',
		)?.reasons,
	).toEqual(['missing-discovery-permission', 'no-role-placement'])
	await admin.query('UPDATE hcm.user_account SET enabled=false WHERE id=$1', [jim])
	expect(
		(await discovery()).items.find(
			/** Disabled subjects have an explicit reason, not a false no-data state. */ (item) =>
				item.appCode === 'MY_PROFILE',
		)?.reasons,
	).toEqual(['account-disabled'])
	await admin.query('UPDATE hcm.user_account SET enabled=true WHERE id=$1', [jim])
	const employeeEntitlement = HCM_CATALOGUE.apps.find(
		/** Resolve entitlement from canonical metadata. */ (app) => app.appCode === 'MY_PROFILE',
	)!.discoveryPolicy.entitlement
	await admin.query('UPDATE hcm.tenant_entitlement SET enabled=false WHERE code=$1', [
		employeeEntitlement,
	])
	expect(
		(await discovery()).items.find(
			/** Licensing projection independently controls discovery. */ (item) =>
				item.appCode === 'MY_PROFILE',
		)?.reasons,
	).toEqual(['missing-entitlement'])
	await admin.query('UPDATE hcm.tenant_entitlement SET enabled=true WHERE code=$1', [
		employeeEntitlement,
	])
	await admin.query(
		"INSERT INTO hcm.access_role(tenant_id,id,label,revision) VALUES ($1,'test-discovery-role','Discovery test',1)",
		[tenant],
	)
	await admin.query(
		"INSERT INTO hcm.role_permission VALUES ($1,'test-discovery-role','hcm.catalogue.ROLE_MANAGEMENT.discover')",
		[tenant],
	)
	await admin.query(
		"INSERT INTO hcm.account_role(tenant_id,account_id,role_id) VALUES ($1,$2,'test-discovery-role')",
		[tenant, jim],
	)
	expect(
		(await discovery()).items.find(
			/** A custom permission grant does not invent a canonical Space placement. */ (item) =>
				item.appCode === 'ROLE_MANAGEMENT',
		)?.reasons,
	).toEqual(['no-role-placement'])
	await admin.query("DELETE FROM hcm.account_role WHERE role_id='test-discovery-role'")
	await admin.query("DELETE FROM hcm.role_permission WHERE role_id='test-discovery-role'")
	await admin.query("DELETE FROM hcm.access_role WHERE id='test-discovery-role'")
})
it('TEST-APP-CATALOGUE-CONFIGURATION-004 enforces caller authority and hides foreign subjects', /** Optional subject selection never impersonates or expands tenant scope. */ async () => {
	expect(
		(await send('GET', 'catalogue', undefined, { 'x-hcm-development-persona': 'jim' })).status,
	).toBe(403)
	expect(
		(await send('GET', 'catalogue', undefined, { 'x-hcm-development-persona': 'invented' })).status,
	).toBe(401)
	await admin.query(
		"UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.access-control'",
	)
	expect((await send('GET', 'catalogue')).status).toBe(403)
	await admin.query(
		"UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.access-control'",
	)
	await admin.query("SELECT set_config('hcm.tenant_id','foreign-catalogue',false)")
	await admin.query(
		"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES ('foreign-catalogue','foreign-catalogue','Foreign','active')",
	)
	await admin.query(
		"INSERT INTO hcm.person VALUES ('foreign-catalogue','foreign-person','Foreign','Person','Foreign person')",
	)
	await admin.query(
		"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES ('foreign-catalogue','foreign-account','foreign-person','foreign@example.test')",
	)
	await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	expect((await send('GET', 'catalogue/accounts/foreign-account/discovery')).status).toBe(404)
	expect(
		(await send<Page<CatalogueAccount>>('GET', 'catalogue/accounts?q=Foreign')).body.items,
	).toEqual([])
	expect((await send('GET', 'catalogue?tenantId=foreign-catalogue')).status).toBe(400)
})
it('TEST-APP-CATALOGUE-CONFIGURATION-006 exposes no catalogue or entitlement mutation transport', /** All implemented routes remain reads even for an authorized tenant administrator. */ async () => {
	for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
		expect((await send(method, 'catalogue', { route: '/invented', entitled: true })).status).toBe(
			404,
		)
	expect(
		(await send('GET', `catalogue/accounts/${encodeURIComponent(jim)}/discovery?actor=david`))
			.status,
	).toBe(400)
})
