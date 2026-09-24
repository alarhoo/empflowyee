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
	AssignmentSummary,
	AssignmentRole,
	AssignmentRoleOption,
	Page,
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
const david = 'dunder-mifflin/account/david'
/** Construct encoded routes for the persisted opaque account identities. */
function accountPath(id: string, suffix = ''): string {
	return `assignments/${encodeURIComponent(id)}${suffix}`
}
/** Read the latest account revision through the actual read endpoint. */
async function account(id = jim): Promise<AssignmentSummary> {
	const response = await send<AssignmentSummary>('GET', accountPath(id))
	expect(response.status).toBe(200)
	return response.body
}
/** Submit one exact account-scoped mutation using the current server revision. */
async function command(
	id: string,
	operation: 'grant' | 'revoke',
	roleId: string,
	grantId?: string,
) {
	const current = await account(id)
	return send<AssignmentSummary>('POST', accountPath(id, `/${operation}`), {
		roleId,
		expectedRevision: current.revision,
		reason: 'Assignment acceptance verification',
		...(grantId ? { grantId } : {}),
	})
}
it('TEST-ACCESS-ASSIGNMENTS-001 reads persisted accounts and bounded role pages', /** Verify real identity projections, literal filters and cursor bindings. */ async () => {
	const all = await send<Page<AssignmentSummary>>('GET', 'assignments')
	expect(all.status).toBe(200)
	expect(all.cache).toBe('no-store')
	expect(all.body.items).toHaveLength(4)
	expect(all.body.items[0].displayName).toBe('David Wallace')
	const first = await send<Page<AssignmentSummary>>('GET', 'assignments?limit=2')
	const second = await send<Page<AssignmentSummary>>(
		'GET',
		`assignments?limit=2&cursor=${first.body.nextCursor}`,
	)
	expect(
		new Set(
			[...first.body.items, ...second.body.items].map(
				/** Compare opaque account IDs. */ (row) => row.accountId,
			),
		).size,
	).toBe(4)
	expect(
		(await send('GET', `assignments?limit=2&enabled=false&cursor=${first.body.nextCursor}`)).status,
	).toBe(400)
	expect((await send<Page<AssignmentSummary>>('GET', 'assignments?q=%25')).body.items).toEqual([])
	expect(
		(await send<Page<AssignmentSummary>>('GET', 'assignments?q=jim.halpert')).body.items[0]
			.accountId,
	).toBe(jim)
	expect((await account()).roles.items[0]).toMatchObject({ id: 'employee', label: 'Employee' })
	const choices = await send<Page<AssignmentRoleOption>>('GET', 'assignment-role-options?limit=2')
	expect(choices.status).toBe(200)
	expect(choices.body.items).toHaveLength(2)
	expect(
		(await send('GET', `assignment-role-options?limit=3&cursor=${choices.body.nextCursor}`)).status,
	).toBe(400)
})
it('TEST-ACCESS-ASSIGNMENTS-002 grants and revokes one occurrence with revision, audit and replay', /** Prove no role-set replacement, duplicate acceptance or duplicate successful audit. */ async () => {
	const initial = await account(),
		key = randomUUID()
	const body = {
		roleId: 'manager',
		expectedRevision: initial.revision,
		reason: 'Approved coverage',
	}
	const first = await send<AssignmentSummary>('POST', accountPath(jim, '/grant'), body, {
		'idempotency-key': key,
	})
	expect(first.status).toBe(200)
	expect(first.body.revision).toBe(initial.revision + 1)
	expect(first.body.roles.items).toHaveLength(2)
	expect(
		(await send('POST', accountPath(jim, '/grant'), body, { 'idempotency-key': key })).body,
	).toEqual(first.body)
	expect(
		(await send('POST', accountPath(david, '/grant'), body, { 'idempotency-key': key })).status,
	).toBe(409)
	expect((await command(jim, 'grant', 'manager')).status).toBe(409)
	const role = first.body.roles.items.find(
		/** Select the newly persisted occurrence. */ (item) => item.id === 'manager',
	)
	expect(role).toBeDefined()
	expect((await command(jim, 'revoke', 'manager', role?.grantId)).status).toBe(200)
	const next = await command(jim, 'grant', 'manager')
	const replacement = next.body.roles.items.find(
		/** Locate the replacement grant. */ (item) => item.id === 'manager',
	)
	expect(replacement?.grantId).not.toBe(role?.grantId)
	expect((await command(jim, 'revoke', 'manager', role?.grantId)).status).toBe(409)
	expect((await command(jim, 'revoke', 'manager', replacement?.grantId)).status).toBe(200)
	const events = await admin.query(
		'SELECT action,target_type,safe_summary FROM hcm.audit_event WHERE target_id=$1 ORDER BY occurred_at',
		[jim],
	)
	expect(events.rows).toHaveLength(4)
	expect(events.rows[0]).toMatchObject({
		action: 'role.granted',
		target_type: 'user-account',
		safe_summary: { reason: 'Approved coverage', roleId: 'manager', grantId: role?.grantId },
	})
	expect(JSON.stringify(events.rows)).not.toContain('@')
	expect(
		(await account()).roles.items.map(
			/** Verify the unrelated employee grant survived. */ (item) => item.id,
		),
	).toEqual(['employee'])
})
it('TEST-ACCESS-ASSIGNMENTS-003 preserves the last administrator under concurrent API commands', /** Two competing revokes cannot remove every enabled protected administrator. */ async () => {
	const original = await account(david),
		originalGrant = original.roles.items.find(
			/** Find the protected role. */ (role) => role.id === 'tenant-administrator',
		)
	expect(
		(await command(david, 'revoke', 'tenant-administrator', originalGrant?.grantId)).status,
	).toBe(409)
	const granted = await command(jim, 'grant', 'tenant-administrator')
	expect(granted.status).toBe(200)
	const jimGrant = granted.body.roles.items.find(
		/** Select Jim's temporary protected grant. */ (role) => role.id === 'tenant-administrator',
	)
	const targets = [
		{ id: jim, revision: granted.body.revision, grantId: jimGrant?.grantId },
		{ id: david, revision: original.revision, grantId: originalGrant?.grantId },
	]
	const replies = await Promise.all(
		targets.map(
			/** Race through HTTP under the same tenant lock. */ (target) =>
				send('POST', accountPath(target.id, '/revoke'), {
					roleId: 'tenant-administrator',
					expectedRevision: target.revision,
					grantId: target.grantId,
					reason: 'Concurrent administrator verification',
				}),
		),
	)
	expect(
		replies.filter(/** Count only committed revokes. */ (reply) => reply.status === 200),
	).toHaveLength(1)
	const rows = await admin.query(
		'SELECT a.id FROM hcm.account_role g JOIN hcm.user_account a ON a.tenant_id=g.tenant_id AND a.id=g.account_id JOIN hcm.access_role r ON r.tenant_id=g.tenant_id AND r.id=g.role_id WHERE a.enabled AND r.protected_admin',
	)
	expect(rows.rows).toHaveLength(1)
	// Restore disposable test authority without claiming a production identity API exists.
	await admin.query(
		"INSERT INTO hcm.account_role(tenant_id,account_id,role_id) VALUES($1,$2,'tenant-administrator') ON CONFLICT DO NOTHING",
		[tenant, david],
	)
	await admin.query(
		"DELETE FROM hcm.account_role WHERE account_id=$1 AND role_id='tenant-administrator'",
		[jim],
	)
})
it('TEST-ACCESS-ASSIGNMENTS-004 independently enforces authority, tenant scope and strict transport', /** Discovery, hidden controls and foreign identifiers never authorize assignments. */ async () => {
	for (const path of [
		'assignments',
		'assignment-role-options',
		accountPath(jim),
		accountPath(jim, '/roles'),
	])
		expect(
			(await send('GET', path, undefined, { 'x-hcm-development-persona': 'jim' })).status,
		).toBe(403)
	for (const path of [
		'assignments?tenantId=foreign',
		'assignments?limit=101',
		'assignments?q=a&q=b',
		'assignments?enabled=maybe',
		'assignments?cursor=bad',
		'assignment-role-options?sort=id',
	])
		expect((await send('GET', path)).status).toBe(400)
	expect((await send('GET', accountPath('foreign/account'))).status).toBe(404)
	const current = await account(),
		body = { roleId: 'manager', expectedRevision: current.revision, reason: 'Transport rejection' }
	expect(
		(await send('POST', accountPath(jim, '/grant'), { ...body, tenantId: 'foreign' })).status,
	).toBe(400)
	expect(
		(await send('POST', accountPath(jim, '/grant'), body, { origin: 'http://evil.invalid' }))
			.status,
	).toBe(403)
	expect(
		(await send('POST', accountPath(jim, '/grant'), body, { 'content-type': 'text/plain' })).status,
	).toBe(415)
	expect(
		(await send('POST', accountPath(jim, '/grant'), { ...body, roleId: 'foreign-role' })).status,
	).toBe(404)
	await admin.query('UPDATE hcm.user_account SET enabled=false WHERE id=$1', [david])
	try {
		expect((await send('GET', 'assignments')).status).toBe(401)
	} finally {
		await admin.query('UPDATE hcm.user_account SET enabled=true WHERE id=$1', [david])
	}
	await admin.query(
		"UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.access-control'",
	)
	try {
		expect((await send('GET', 'assignments')).status).toBe(403)
	} finally {
		await admin.query(
			"UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.access-control'",
		)
	}
})
it('TEST-ACCESS-ASSIGNMENTS-006 rolls back every side effect when audit append fails', /** Inject a database failure, not a fake success response. */ async () => {
	const current = await account()
	await admin.query(
		"CREATE FUNCTION hcm.reject_assignment_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='role.granted' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$",
	)
	await admin.query(
		'CREATE TRIGGER test_assignment_audit BEFORE INSERT ON hcm.audit_event FOR EACH ROW EXECUTE FUNCTION hcm.reject_assignment_audit()',
	)
	try {
		expect((await command(jim, 'grant', 'manager')).status).toBe(503)
		expect(await account()).toEqual(current)
	} finally {
		await admin.query('DROP TRIGGER test_assignment_audit ON hcm.audit_event')
		await admin.query('DROP FUNCTION hcm.reject_assignment_audit()')
	}
	const rows = await send<Page<AssignmentRole>>('GET', accountPath(jim, '/roles'))
	expect(rows.body.items).toHaveLength(1)
})

it('rejects real foreign records and preserves empty or disabled account projections', /** Tenant RLS hides existing foreign objects, while local accounts without grants remain truthful. */ async () => {
	await admin.query("SELECT set_config('hcm.tenant_id','foreign-assignments',false)")
	await admin.query(
		"INSERT INTO hcm.tenant(id,slug,display_name,status,defaults) VALUES('foreign-assignments','foreign-assignments','Foreign','active','{}')",
	)
	await admin.query(
		"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES('foreign-assignments','person','Foreign','Person','Foreign Person')",
	)
	await admin.query(
		"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES('foreign-assignments','foreign/account','person','foreign@example.com')",
	)
	await admin.query(
		"INSERT INTO hcm.access_role(tenant_id,id,label) VALUES('foreign-assignments','foreign-role','Foreign role')",
	)
	await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	expect((await send('GET', accountPath('foreign/account'))).status).toBe(404)
	expect((await command(jim, 'grant', 'foreign-role')).status).toBe(404)
	const current = await account()
	expect(
		(
			await send('POST', accountPath('foreign/account', '/grant'), {
				roleId: 'employee',
				expectedRevision: 1,
				reason: 'Foreign account attempt',
			})
		).status,
	).toBe(404)
	expect(await account()).toEqual(current)
	await admin.query(
		"INSERT INTO hcm.user_account(tenant_id,id,person_id,email,enabled) VALUES($1,'empty-account','dunder-mifflin/person/jim','empty@example.com',false)",
		[tenant],
	)
	const empty = await account('empty-account')
	expect(empty.enabled).toBe(false)
	expect(empty.roles).toEqual({ items: [], nextCursor: null })
	expect(
		(await send<Page<AssignmentSummary>>('GET', 'assignments?enabled=false')).body.items[0]
			.accountId,
	).toBe('empty-account')
})
it('rechecks assignment manage permission on successful receipt replay', /** A stored response cannot authorize a new request after a grant has been removed. */ async () => {
	const current = await account(),
		key = randomUUID(),
		body = { roleId: 'manager', expectedRevision: current.revision, reason: 'Replay authority' }
	const first = await send<AssignmentSummary>('POST', accountPath(jim, '/grant'), body, {
		'idempotency-key': key,
	})
	expect(first.status).toBe(200)
	await admin.query(
		"DELETE FROM hcm.role_permission WHERE role_id='tenant-administrator' AND permission_code='hcm.access-control.assignments.manage'",
	)
	try {
		expect(
			(await send('POST', accountPath(jim, '/grant'), body, { 'idempotency-key': key })).status,
		).toBe(403)
	} finally {
		await admin.query(
			"INSERT INTO hcm.role_permission VALUES($1,'tenant-administrator','hcm.access-control.assignments.manage')",
			[tenant],
		)
	}
	expect(
		(await send('POST', accountPath(jim, '/grant'), body, { 'idempotency-key': key })).body,
	).toEqual(first.body)
	const role = first.body.roles.items.find(
		/** Locate the disposable grant for cleanup. */ (item) => item.id === 'manager',
	)
	expect((await command(jim, 'revoke', 'manager', role?.grantId)).status).toBe(200)
})
