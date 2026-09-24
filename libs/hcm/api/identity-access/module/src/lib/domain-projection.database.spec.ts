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
import {
	HcmSessionReader,
	TenantDirectory,
	HcmRuntimeApplication,
} from '@empflowyee/hcm-api-runtime-application'
import {
	HcmRuntimeStore,
	createTenantDirectory,
	createSessionReader,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import { HCM_ROLE_WRITE_ORIGIN } from '@empflowyee/hcm-api-access-control-transport'
import type { DomainProjection } from '@empflowyee/hcm-identity-access-contract'
import { DomainProjectionReader } from '@empflowyee/hcm-api-identity-access-application'
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

it('TEST-DOMAIN-CONFIGURATION-001 reads exact current-tenant directory fields', /** Compare the HTTP projection to actual storage and prove the global index is scoped. */ async () => {
	await admin.query("SELECT set_config('hcm.tenant_id','domain-foreign',false)")
	await admin.query(
		"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES('domain-foreign','domain-foreign','Foreign','active')",
	)
	await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	await admin.query(
		"INSERT INTO hcm.tenant_hostname(hostname,tenant_id) VALUES ('foreign.localhost','domain-foreign')",
	)
	const reply = await send<DomainProjection>('GET', 'domains')
	expect(reply.status).toBe(200)
	expect(reply.cache).toBe('no-store')
	const stored = (await admin.query('SELECT slug,status FROM hcm.tenant WHERE id=$1', [tenant]))
		.rows[0]
	expect(reply.body).toEqual({
		tenantSlug: stored.slug,
		tenantStatus: stored.status,
		source: 'account-projection',
		hostnames: (
			await admin.query(
				'SELECT hostname FROM hcm.tenant_hostname WHERE tenant_id=$1 ORDER BY hostname',
				[tenant],
			)
		).rows,
	})
	expect(reply.body.hostnames).not.toContainEqual({ hostname: 'foreign.localhost' })
})
it('TEST-DOMAIN-CONFIGURATION-002 rejects mutation methods and scope injection', /** The read-only transport exposes no inert configuration commands. */ async () => {
	for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
		expect((await send(method, 'domains', {})).status).toBe(404)
	for (const query of ['tenantId=domain-foreign', 'accountId=other', 'q=x', 'limit=1'])
		expect((await send('GET', `domains?${query}`)).status).toBe(400)
})
it('TEST-DOMAIN-CONFIGURATION-003 distinguishes missing projection from database failure', /** Exercise an authenticated in-flight read after directory removal and a real SQL outage with restoration. */ async () => {
	const runtime = app.get(HcmRuntimeApplication)
	const record = await runtime.resolveTenant('acme.localhost', '127.0.0.1')
	const context = await runtime.authenticate(record, undefined, {
		developmentPersona: 'david',
		peerAddress: '127.0.0.1',
	})
	const hosts = (
		await admin.query('DELETE FROM hcm.tenant_hostname WHERE tenant_id=$1 RETURNING hostname', [
			tenant,
		])
	).rows
	try {
		expect((await app.get(DomainProjectionReader).read(context)).hostnames).toEqual([])
	} finally {
		for (const row of hosts)
			await admin.query('INSERT INTO hcm.tenant_hostname(hostname,tenant_id) VALUES($1,$2)', [
				row.hostname,
				tenant,
			])
	}
	await admin.query('ALTER TABLE hcm.tenant_hostname RENAME TO tenant_hostname_unavailable')
	try {
		expect((await send('GET', 'domains')).status).toBe(503)
		await expect(app.get(DomainProjectionReader).read(context)).rejects.toThrow()
	} finally {
		await admin.query('ALTER TABLE hcm.tenant_hostname_unavailable RENAME TO tenant_hostname')
	}
	expect((await send('GET', 'domains')).status).toBe(200)
})
it('TEST-DOMAIN-CONFIGURATION-004 enforces real actor grants and entitlement', /** Verify employee, disabled account, missing operation authority and missing licensing separately. */ async () => {
	expect(
		(await send('GET', 'domains', undefined, { 'x-hcm-development-persona': 'jim' })).status,
	).toBe(403)
	expect(
		(await send('GET', 'domains', undefined, { 'x-hcm-development-persona': 'forged' })).status,
	).toBe(401)
	await admin.query(
		"UPDATE hcm.user_account SET enabled=false WHERE id='dunder-mifflin/account/david'",
	)
	try {
		expect((await send('GET', 'domains')).status).toBe(401)
	} finally {
		await admin.query(
			"UPDATE hcm.user_account SET enabled=true WHERE id='dunder-mifflin/account/david'",
		)
	}
	await admin.query(
		"UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.identity-access'",
	)
	try {
		expect((await send('GET', 'domains')).status).toBe(403)
	} finally {
		await admin.query(
			"UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.identity-access'",
		)
	}
	const grants = (
		await admin.query(
			"DELETE FROM hcm.role_permission WHERE permission_code='hcm.identity-access.domains.read' RETURNING tenant_id,role_id,permission_code",
		)
	).rows
	try {
		expect((await send('GET', 'domains')).status).toBe(403)
	} finally {
		for (const row of grants)
			await admin.query(
				'INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,$2,$3)',
				[row.tenant_id, row.role_id, row.permission_code],
			)
	}
})
