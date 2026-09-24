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
	RoleDetail,
	RoleSummary,
	Page,
	PermissionOption,
} from '@empflowyee/hcm-access-control-contract'
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
/** Build bounded command input for disposable test roles only. */
function create(label: string) {
	return {
		label,
		permissionCodes: ['hcm.audit.activity.self.read'],
		reason: 'Verification of reviewed access',
	}
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

it('TEST-ROLE-MANAGEMENT-001 reads persisted roles and permissions through real HTTP', /** Assert safe DTOs, no-store and independent business authorization. */ async () => {
	const roles = await send<Page<RoleSummary>>('GET', 'roles')
	expect(roles.status).toBe(200)
	expect(roles.cache).toBe('no-store')
	expect(roles.body.items).toHaveLength(4)
	expect(
		roles.body.items.every(
			/** All seed roles are immutable through this app. */ (role) => role.systemRole,
		),
	).toBe(true)
	const permissions = await send<{ items: PermissionOption[] }>('GET', 'permissions')
	expect(permissions.status).toBe(200)
	expect(permissions.body.items).toHaveLength(209)
	expect(
		permissions.body.items.find(
			/** Verify explicit commercial policy. */ (item) =>
				item.code === 'hcm.access-control.roles.manage',
		)?.entitlement,
	).toBe('hcm.access-control')
	expect(
		(await send('GET', 'roles', undefined, { 'x-hcm-development-persona': 'jim' })).status,
	).toBe(403)
	expect(
		(await send('GET', 'roles', undefined, { 'x-hcm-development-persona': 'unknown' })).status,
	).toBe(401)
	expect((await send('GET', 'roles', undefined, { host: 'unknown.localhost' })).status).toBe(404)
})

it('TEST-ROLE-MANAGEMENT-002 creates, replays, revises and deletes custom roles atomically', /** Verify receipts and optimistic concurrency under concurrent HTTP commands. */ async () => {
	const key = randomUUID(),
		body = create('Workflow readers')
	const [first, replay] = await Promise.all([
		send<RoleDetail>('POST', 'roles', body, { 'idempotency-key': key }),
		send<RoleDetail>('POST', 'roles', body, { 'idempotency-key': key }),
	])
	expect(first.status).toBe(201)
	expect(replay.body).toEqual(first.body)
	expect(first.body).toMatchObject({
		label: body.label,
		systemRole: false,
		protectedAdmin: false,
		revision: 1,
		permissionCodes: body.permissionCodes,
	})
	expect(
		(await send('POST', 'roles', create('Changed payload'), { 'idempotency-key': key })).status,
	).toBe(409)
	const id = first.body.id
	const revisions = await Promise.all(
		['A', 'B'].map(
			/** Race commands against one observed revision. */ (suffix) =>
				send<RoleDetail>('PUT', `roles/${id}`, {
					...body,
					label: `Workflow readers ${suffix}`,
					expectedRevision: 1,
				}),
		),
	)
	expect(
		revisions
			.map(/** Compare outcomes independently of scheduling. */ (result) => result.status)
			.sort(),
	).toEqual([200, 409])
	expect((await send<RoleDetail>('GET', `roles/${id}`)).body.revision).toBe(2)
	expect(
		(
			await admin.query('SELECT count(*)::int AS count FROM hcm.audit_event WHERE target_id=$1', [
				id,
			])
		).rows[0].count,
	).toBe(2)
	const deleteKey = randomUUID(),
		deletion = { expectedRevision: 2, reason: 'Remove test role' }
	expect(
		(await send('POST', `roles/${id}/delete`, deletion, { 'idempotency-key': deleteKey })).status,
	).toBe(200)
	expect(
		(await send('POST', `roles/${id}/delete`, deletion, { 'idempotency-key': deleteKey })).status,
	).toBe(200)
	expect((await send('GET', `roles/${id}`)).status).toBe(404)
	expect(
		(
			await admin.query('SELECT count(*)::int AS count FROM hcm.audit_event WHERE target_id=$1', [
				id,
			])
		).rows[0].count,
	).toBe(3)
})

it('TEST-ROLE-MANAGEMENT-003 rejects protected edits, assigned deletion and invented permissions', /** Exercise domain rules through authenticated request resolution. */ async () => {
	expect(
		(
			await send('PUT', 'roles/tenant-administrator', {
				...create('Altered admin'),
				expectedRevision: 1,
			})
		).body['code'],
	).toBe('system-role')
	expect(
		(await send('POST', 'roles', { ...create('Injected flags'), systemRole: true })).status,
	).toBe(400)
	expect(
		(
			await send('POST', 'roles', {
				...create('Invented authority'),
				permissionCodes: ['hcm.access-control.forged'],
			})
		).status,
	).toBe(400)
	const result = await send<RoleDetail>('POST', 'roles', create('Assignment protection'))
	expect(result.status).toBe(201)
	expect((await send('POST', 'roles', create('assignment protection'))).body['code']).toBe(
		'duplicate-label',
	)
	await admin.query(
		'INSERT INTO hcm.account_role (tenant_id,account_id,role_id) VALUES ($1,$2,$3)',
		[tenant, 'dunder-mifflin/account/jim', result.body.id],
	)
	expect(
		(
			await send('POST', `roles/${result.body.id}/delete`, {
				expectedRevision: 1,
				reason: 'In use',
			})
		).body['code'],
	).toBe('role-assigned')
	await admin.query('DELETE FROM hcm.account_role WHERE role_id=$1', [result.body.id])
	expect(
		(
			await send('POST', `roles/${result.body.id}/delete`, {
				expectedRevision: 1,
				reason: 'No longer assigned',
			})
		).status,
	).toBe(200)
})

it('TEST-ROLE-MANAGEMENT-004 denies cross-origin, foreign and malformed requests', /** Reject forged context fields and unsupported input without revealing tenant data. */ async () => {
	const blockedHeaders: Record<string, string>[] = [
		{ origin: 'http://evil.invalid' },
		{ origin: '' },
		{ 'sec-fetch-site': 'cross-site' },
	]
	for (const headers of blockedHeaders)
		expect((await send('POST', 'roles', create('Blocked'), headers)).status).toBe(403)
	expect(
		(await send('POST', 'roles', create('Wrong type'), { 'content-type': 'text/plain' })).status,
	).toBe(415)
	expect(
		(await send('POST', 'roles', create('Missing key'), { 'idempotency-key': '' })).status,
	).toBe(400)
	for (const path of [
		'roles?tenantId=other',
		'roles?limit=101',
		'roles?limit=1&limit=2',
		'roles?sort=sql',
		'roles?cursor=bad',
		'permissions?kind=admin',
	])
		expect((await send('GET', path)).status).toBe(400)
	await admin.query("SELECT set_config('hcm.tenant_id','other-tenant',false)")
	await admin.query(
		"INSERT INTO hcm.tenant (id,slug,display_name,status,defaults) VALUES ('other-tenant','other','Other','active','{}')",
	)
	await admin.query(
		"INSERT INTO hcm.access_role (tenant_id,id,label) VALUES ('other-tenant','foreign-role','Other role')",
	)
	await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	expect((await send('GET', 'roles/foreign-role')).status).toBe(404)
	expect(
		(await send('PUT', 'roles/foreign-role', { ...create('Foreign attempt'), expectedRevision: 1 }))
			.status,
	).toBe(404)
})

it('TEST-ROLE-MANAGEMENT-006 rolls back audit failure and safely retries the command key', /** Revoke audit insertion only in the disposable DB to inject a real persistence failure. */ async () => {
	const key = randomUUID(),
		body = create('Recovered command')
	await admin.query('REVOKE INSERT ON hcm.audit_event FROM hcm_runtime')
	try {
		const failed = await send('POST', 'roles', body, { 'idempotency-key': key })
		expect(failed.status).toBe(503)
		expect(failed.body['code']).toBe('runtime-unavailable')
		expect(JSON.stringify(failed.body)).not.toMatch(/postgres|INSERT|permission denied/)
		expect(
			(await admin.query('SELECT id FROM hcm.access_role WHERE label=$1', [body.label])).rows,
		).toEqual([])
		expect(
			(
				await admin.query(
					'SELECT operation FROM hcm.access_command_receipt WHERE idempotency_key=$1',
					[key],
				)
			).rows,
		).toEqual([])
	} finally {
		await admin.query('GRANT INSERT ON hcm.audit_event TO hcm_runtime')
	}
	expect((await send('POST', 'roles', body, { 'idempotency-key': key })).status).toBe(201)
})

it('paginates stable keysets and treats wildcard characters as literal query input', /** Prevent duplicate page rows and cursor reuse with different filters. */ async () => {
	const first = await send<Page<RoleSummary>>('GET', 'roles?limit=2')
	expect(first.body.items).toHaveLength(2)
	expect(first.body.nextCursor).toBeTruthy()
	const second = await send<Page<RoleSummary>>(
		'GET',
		`roles?limit=2&cursor=${first.body.nextCursor}`,
	)
	expect(second.status).toBe(200)
	expect(
		new Set(
			[...first.body.items, ...second.body.items].map(/** Compare stable IDs. */ (role) => role.id),
		).size,
	).toBe(4)
	expect(
		(await send('GET', `roles?limit=2&q=changed&cursor=${first.body.nextCursor}`)).status,
	).toBe(400)
	expect((await send<Page<RoleSummary>>('GET', 'roles?q=%25')).body.items).toEqual([])
})

it('reauthorizes successful receipt replay against current grants and entitlements', /** A previous success never acts as authority after the actor loses access. */ async () => {
	const key = randomUUID(),
		body = create('Replay authority verification')
	const first = await send<RoleDetail>('POST', 'roles', body, { 'idempotency-key': key })
	expect(first.status).toBe(201)
	await admin.query(
		"DELETE FROM hcm.role_permission WHERE role_id='tenant-administrator' AND permission_code='hcm.access-control.roles.manage'",
	)
	try {
		expect((await send('POST', 'roles', body, { 'idempotency-key': key })).status).toBe(403)
	} finally {
		await admin.query('INSERT INTO hcm.role_permission VALUES ($1,$2,$3)', [
			tenant,
			'tenant-administrator',
			'hcm.access-control.roles.manage',
		])
	}
	await admin.query(
		"UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.access-control'",
	)
	try {
		expect((await send('POST', 'roles', body, { 'idempotency-key': key })).status).toBe(403)
	} finally {
		await admin.query(
			"UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.access-control'",
		)
	}
	expect((await send('POST', 'roles', body, { 'idempotency-key': key })).body).toEqual(first.body)
	expect(
		(
			await admin.query('SELECT count(*)::int AS count FROM hcm.audit_event WHERE target_id=$1', [
				first.body.id,
			])
		).rows[0].count,
	).toBe(1)
})
