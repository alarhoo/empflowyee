import 'reflect-metadata'
import { beforeAll, afterAll, it, expect } from 'vitest'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { request } from 'node:http'
import { resolve } from 'node:path'
import { Client } from 'pg'
import { migrateHcmDatabase, loadSqlMigrations } from '@empflowyee/hcm-api-database-migrations'
import { runDevelopmentSeeds } from '@empflowyee/hcm-api-database-seed'
import { HcmSessionReader, TenantDirectory } from '@empflowyee/hcm-api-runtime-application'
import {
	HcmRuntimeStore,
	createTenantDirectory,
	createSessionReader,
	createRuntimeStore,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import type { HcmRuntimeContext } from '@empflowyee/hcm-runtime-contract'
import { HcmRuntimeModule } from './hcm-api-runtime-module'

let app: INestApplication
let store: HcmRuntimeStore
let admin: Client
let runtime: Client
let origin: string
const tenant = 'local-dunder-mifflin'
const env = {
	APP_ENVIRONMENT: 'local',
	NODE_ENV: 'test',
	HCM_LOCAL_TENANTS: 'true',
	HCM_LOCAL_SESSION: 'true',
}

/** Make a real HTTP request with exact Host and optional persona; never intercept or synthesize a session response. */
function get(
	host = 'acme.localhost',
	persona?: string,
	path = 'session',
): Promise<{ status: number; body: HcmRuntimeContext }> {
	return new Promise(
		/** Collect the actual Nest HTTP boundary output. */ (resolveResult, reject) => {
			const call = request(
				`${origin}/api/v1/runtime/${path}`,
				{ headers: { host, ...(persona ? { 'x-hcm-development-persona': persona } : {}) } },
				/** Read the API's safe DTO for assertions. */ (response) => {
					let text = ''
					response.on(
						'data',
						/** Assemble the JSON stream. */ (chunk) => {
							text += String(chunk)
						},
					)
					response.on(
						'end',
						/** Return status and parsed public data. */ () =>
							resolveResult({ status: response.statusCode ?? 0, body: JSON.parse(text) }),
					)
				},
			)
			call.on('error', reject)
			call.end()
		},
	)
}

beforeAll(
	/** Migrate and seed a disposable database, then compose production adapters through real Nest routing. */ async () => {
		const migrator = process.env['HCM_TEST_MIGRATOR']
		const runtimeUrl = process.env['HCM_TEST_RUNTIME']
		if (!migrator || !runtimeUrl) throw new Error('Disposable PostgreSQL harness is required')
		admin = new Client({ connectionString: migrator })
		runtime = new Client({ connectionString: runtimeUrl })
		await admin.connect()
		await runtime.connect()
		await admin.query('DROP SCHEMA IF EXISTS hcm CASCADE')
		const inventory = resolve('libs/hcm/api/database/migrations/sql')
		await migrateHcmDatabase(migrator, inventory)
		await runDevelopmentSeeds({
			env: { ...env, HCM_SEED_TARGET: 'local-dunder-mifflin', HCM_SEED_DATABASE_URL: migrator },
			manifestDirectory: resolve('libs/hcm/api/database/seed/manifest'),
			migrations: await loadSqlMigrations(inventory),
		})
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		store = createRuntimeStore({ ...env, HCM_DATABASE_URL: runtimeUrl }) as HcmRuntimeStore
		const module = await Test.createTestingModule({ imports: [HcmRuntimeModule] })
			.overrideProvider(HcmRuntimeStore)
			.useValue(store)
			.overrideProvider(TenantDirectory)
			.useValue(createTenantDirectory(env, store))
			.overrideProvider(HcmSessionReader)
			.useValue(createSessionReader(env, store))
			.compile()
		app = module.createNestApplication({ logger: false })
		app.setGlobalPrefix('api')
		await app.listen(0, '127.0.0.1')
		origin = await app.getUrl()
	},
)

afterAll(
	/** Drain real providers and PostgreSQL clients before disposable container teardown. */ async () => {
		await app?.close()
		await admin?.end()
		await runtime?.end()
	},
)

it('serves all persisted personas with workforce identity and database grants', /** Inspect normal API DTOs and verify joined spine counts rather than fixture arrays. */ async () => {
	for (const [key, name, role] of [
		['jim', 'Jim Halpert', 'employee'],
		['michael', 'Michael Scott', 'manager'],
		['toby', 'Toby Flenderson', 'hr-specialist'],
		['david', 'David Wallace', 'tenant-administrator'],
	]) {
		const response = await get('acme.localhost', key)
		expect(response.status).toBe(200)
		expect(response.body).toMatchObject({
			tenant: { displayName: 'Dunder Mifflin' },
			user: { displayName: name, employeeId: `dunder-mifflin/worker/${key}` },
			access: { roles: [role] },
			development: { personaId: key },
		})
		expect(response.body.access.permissions.length).toBeGreaterThan(0)
		expect(response.body.access.entitlements).toHaveLength(26)
		expect(response.body.development?.personas).toHaveLength(4)
	}
	expect((await get()).body.user.displayName).toBe('Jim Halpert')
	// Four persona assignments plus four workforce.foundation@3 workers without accounts.
	expect(
		(
			await admin.query(
				'SELECT count(*)::int AS count FROM hcm.assignment a JOIN hcm.employment e USING (tenant_id) WHERE a.employment_id=e.id',
			)
		).rows[0].count,
	).toBe(8)
	expect((await get('unknown.localhost')).status).toBe(404)
	expect((await get('acme.localhost', 'unknown')).status).toBe(401)
})

it('reflects database grant, entitlement and identity changes on the next API request', /** Remove and restore real rows to prove the adapter has no catalogue-derived or identity fixture fallback. */ async () => {
	const before = (await get()).body
	const permission = before.access.permissions[0]
	await admin.query(
		'DELETE FROM hcm.role_permission WHERE tenant_id=$1 AND role_id=$2 AND permission_code=$3',
		[tenant, 'employee', permission],
	)
	await admin.query(
		"UPDATE hcm.tenant_entitlement SET enabled=false WHERE tenant_id=$1 AND code='hcm.employee'",
		[tenant],
	)
	await admin.query(
		"UPDATE hcm.person SET display_name='Jim from PostgreSQL' WHERE tenant_id=$1 AND id='dunder-mifflin/person/jim'",
		[tenant],
	)
	try {
		const after = (await get()).body
		expect(after.user.displayName).toBe('Jim from PostgreSQL')
		expect(after.access.permissions).not.toContain(permission)
		expect(after.access.entitlements).not.toContain('hcm.employee')
	} finally {
		await admin.query('INSERT INTO hcm.role_permission VALUES ($1,$2,$3)', [
			tenant,
			'employee',
			permission,
		])
		await admin.query(
			"UPDATE hcm.tenant_entitlement SET enabled=true WHERE tenant_id=$1 AND code='hcm.employee'",
			[tenant],
		)
		await admin.query(
			"UPDATE hcm.person SET display_name='Jim Halpert' WHERE tenant_id=$1 AND id='dunder-mifflin/person/jim'",
			[tenant],
		)
	}
})

it('denies disabled accounts and inactive tenants independently of browser navigation', /** Enforce persisted account activation and tenant lifecycle on the backend. */ async () => {
	await admin.query(
		"UPDATE hcm.user_account SET enabled=false WHERE tenant_id=$1 AND id='dunder-mifflin/account/jim'",
		[tenant],
	)
	try {
		expect((await get()).status).toBe(401)
		expect((await get('acme.localhost', 'michael')).body.development?.personas).toHaveLength(3)
	} finally {
		await admin.query(
			"UPDATE hcm.user_account SET enabled=true WHERE tenant_id=$1 AND id='dunder-mifflin/account/jim'",
			[tenant],
		)
	}
	await admin.query("UPDATE hcm.tenant SET status='suspended' WHERE id=$1", [tenant])
	try {
		expect((await get()).status).toBe(423)
		expect((await get('acme.localhost', undefined, 'tenant')).status).toBe(200)
	} finally {
		await admin.query("UPDATE hcm.tenant SET status='active' WHERE id=$1", [tenant])
	}
})

it('enforces RLS, composite tenant foreign keys and separate tenant persona resolution', /** A second tenant shares a selector name but can never read or reference Dunder Mifflin data. */ async () => {
	await admin.query("SELECT set_config('hcm.tenant_id','test-other',false)")
	await admin.query(`INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES ('test-other','other','Other tenant','active');
		INSERT INTO hcm.tenant_hostname VALUES ('other.localhost','test-other');
		INSERT INTO hcm.person VALUES ('test-other','other-person','Other','User','Other User');
		INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES ('test-other','other-account','other-person','other@example.test');
		INSERT INTO hcm.development_persona VALUES ('test-other','jim','other-account','No grants',0,true);`)
	await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	await expect(
		admin.query("INSERT INTO hcm.worker VALUES ($1,'cross-tenant-worker','other-person','CROSS')", [
			tenant,
		]),
	).rejects.toMatchObject({ code: '23503' })
	const other = await get('other.localhost', 'jim')
	expect(other.status).toBe(200)
	expect(other.body.user).toMatchObject({ displayName: 'Other User' })
	expect(other.body.user.employeeId).toBeUndefined()
	expect(other.body.access).toEqual({
		roles: [],
		permissions: [],
		entitlements: [],
		featureFlags: [],
	})
	expect((await runtime.query('SELECT * FROM hcm.person')).rows).toEqual([])
	await runtime.query('BEGIN')
	await runtime.query("SELECT set_config('hcm.tenant_id',$1,true)", [tenant])
	expect(
		(await runtime.query("SELECT * FROM hcm.person WHERE tenant_id='test-other'")).rows,
	).toEqual([])
	await runtime.query('COMMIT')
	expect((await runtime.query('SELECT * FROM hcm.person')).rows).toEqual([])
	// Identity Administration grants lifecycle updates, but absent tenant context still selects no rows.
	expect((await runtime.query('UPDATE hcm.user_account SET enabled=true')).rowCount).toBe(0)
	await expect(
		runtime.query("UPDATE hcm.user_account SET email='forbidden@example.test'"),
	).rejects.toMatchObject({
		code: '42501',
	})
	await expect(runtime.query('SET ROLE hcm_migrator')).rejects.toMatchObject({ code: '42501' })
})

it('supports multiple employments and assignments without forcing an account on every person', /** Persist the approved cardinalities while keeping lifecycle behavior outside this foundation. */ async () => {
	await admin.query(`INSERT INTO hcm.person VALUES ('local-dunder-mifflin','no-account','No','Account','No Account');
		INSERT INTO hcm.employment VALUES ('local-dunder-mifflin','second-employment','dunder-mifflin/worker/jim','dunder-mifflin/organisation/company');
		INSERT INTO hcm.assignment VALUES ('local-dunder-mifflin','second-assignment','second-employment','dunder-mifflin/organisation/scranton','dunder-mifflin/location/scranton','Additional assignment');
		INSERT INTO hcm.assignment VALUES ('local-dunder-mifflin','third-assignment','second-employment','dunder-mifflin/organisation/scranton','dunder-mifflin/location/scranton','Another assignment');`)
	expect(
		(
			await admin.query(
				"SELECT count(*)::int AS count FROM hcm.employment WHERE worker_id='dunder-mifflin/worker/jim'",
			)
		).rows[0].count,
	).toBe(2)
	expect(
		(
			await admin.query(
				"SELECT count(*)::int AS count FROM hcm.user_account WHERE person_id='no-account'",
			)
		).rows[0].count,
	).toBe(0)
})

it('rejects nonloopback callers, unresolved scope and missing local configuration', /** Preserve the accepted local-only trust contract with no silent database or fixture fallback. */ async () => {
	const directory = createTenantDirectory(env, store)
	const sessions = createSessionReader(env, store)
	expect(await directory.findByHost('acme.localhost', '10.0.0.2')).toBeNull()
	expect(await sessions.read(undefined, { tenantId: tenant, peerAddress: '10.0.0.2' })).toBeNull()
	expect(await sessions.read(undefined, { peerAddress: '127.0.0.1' })).toBeNull()
	expect(
		/** Local opt-in requires a persisted connection. */ () => createRuntimeStore(env),
	).toThrow('HCM_DATABASE_URL')
	expect(createRuntimeStore({})).toBeNull()
})
