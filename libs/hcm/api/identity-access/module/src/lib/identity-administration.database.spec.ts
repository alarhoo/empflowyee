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
	AccountSummary,
	IdentityPage,
	PersonOption,
} from '@empflowyee/hcm-identity-access-contract'
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

const jim = 'dunder-mifflin/account/jim',
	david = 'dunder-mifflin/account/david'
/** Encode seeded slash-containing account identifiers at the transport boundary. */
function path(id: string, suffix = ''): string {
	return `accounts/${encodeURIComponent(id)}${suffix}`
}
/** Fetch the current revision through the authorized API. */
async function account(id = jim): Promise<AccountSummary> {
	const reply = await send<AccountSummary>('GET', path(id))
	expect(reply.status).toBe(200)
	return reply.body
}
/** Submit enablement using the real latest revision. */
async function enabled(id: string, value: boolean) {
	const current = await account(id)
	return send<AccountSummary>('POST', path(id, '/enabled'), {
		enabled: value,
		expectedRevision: current.revision,
		reason: 'Identity acceptance',
	})
}
it('TEST-IDENTITY-ADMINISTRATION-001 reads actual accounts and bounded person choices', /** Prove filters, stable cursors and minimal workforce projection against PostgreSQL. */ async () => {
	const all = await send<IdentityPage<AccountSummary>>('GET', 'accounts')
	expect(all.status).toBe(200)
	expect(all.cache).toBe('no-store')
	expect(all.body.items).toHaveLength(4)
	const first = await send<IdentityPage<AccountSummary>>('GET', 'accounts?limit=2')
	const next = await send<IdentityPage<AccountSummary>>(
		'GET',
		`accounts?limit=2&cursor=${first.body.nextCursor}`,
	)
	expect(
		new Set(
			[...first.body.items, ...next.body.items].map(
				/** Compare persistent opaque identities. */ (row) => row.id,
			),
		).size,
	).toBe(4)
	expect((await send('GET', `accounts?limit=1&cursor=${first.body.nextCursor}`)).status).toBe(400)
	expect((await send('GET', `accounts?q=Jim&limit=2&cursor=${first.body.nextCursor}`)).status).toBe(
		400,
	)
	expect(
		(await send<IdentityPage<AccountSummary>>('GET', 'accounts?q=%25')).body.items,
	).toHaveLength(0)
	expect(
		(await send<IdentityPage<AccountSummary>>('GET', 'accounts?sort=displayName:desc')).body
			.items[0].displayName,
	).toBe('Toby Flenderson')
	const people = await send<IdentityPage<PersonOption>>('GET', 'account-person-options?limit=1')
	expect(people.status).toBe(200)
	expect(Object.keys(people.body.items[0]).sort()).toEqual(['displayName', 'id'])
	expect(
		(await send('GET', `account-person-options?limit=2&cursor=${first.body.nextCursor}`)).status,
	).toBe(400)
})
it('TEST-IDENTITY-ADMINISTRATION-002 creates attributable accounts without credentials or grants', /** Allow another account for an existing person while enforcing unique email and exact idempotent replay. */ async () => {
	const person = (await account()).personId,
		key = randomUUID(),
		body = {
			personId: person,
			email: '  identity.test@dundermifflin.example  ',
			reason: 'Create identity test',
		}
	const created = await send<AccountSummary>('POST', 'accounts', body, { 'idempotency-key': key })
	expect(created.status).toBe(201)
	expect(created.body.email).toBe(body.email.trim())
	expect(created.body.enabled).toBe(true)
	expect(created.body.revision).toBe(1)
	expect(await account(created.body.id)).toEqual(created.body)
	expect((await send('POST', 'accounts', body, { 'idempotency-key': key })).body).toEqual(
		created.body,
	)
	expect(
		(
			await send(
				'POST',
				'accounts',
				{ ...body, email: 'changed@dundermifflin.example' },
				{ 'idempotency-key': key },
			)
		).status,
	).toBe(409)
	expect(
		(await send('POST', 'accounts', { ...body, email: body.email.toUpperCase() })).status,
	).toBe(409)
	expect((await send('POST', 'accounts', { ...body, personId: 'missing' })).status).toBe(404)
	expect((await send('POST', 'accounts', { ...body, enabled: false })).status).toBe(400)
	expect((await send('POST', 'accounts', { ...body, email: 'not-an-email' })).status).toBe(400)
	expect(
		(
			await admin.query('SELECT count(*)::int AS count FROM hcm.account_role WHERE account_id=$1', [
				created.body.id,
			])
		).rows[0].count,
	).toBe(0)
	expect(
		(
			await admin.query(
				'SELECT count(*)::int AS count FROM hcm.development_persona WHERE account_id=$1',
				[created.body.id],
			)
		).rows[0].count,
	).toBe(0)
	const audit = await admin.query(
		'SELECT target_type,safe_summary FROM hcm.audit_event WHERE target_id=$1',
		[created.body.id],
	)
	expect(audit.rows).toEqual([
		{ target_type: 'user-account', safe_summary: { reason: body.reason, enabled: true } },
	])
	const attribution = await admin.query(
		'SELECT created_by_account_id,updated_by_account_id FROM hcm.user_account WHERE id=$1',
		[created.body.id],
	)
	expect(attribution.rows[0]).toEqual({
		created_by_account_id: david,
		updated_by_account_id: david,
	})
})
it('TEST-IDENTITY-ADMINISTRATION-003 disables and reenables without losing grants or workforce linkage', /** Prove revision conflicts, disabled persona denial and shared account revision behavior. */ async () => {
	const before = await account(),
		roles = (
			await admin.query(
				'SELECT role_id FROM hcm.account_role WHERE account_id=$1 ORDER BY role_id',
				[jim],
			)
		).rows
	const key = randomUUID(),
		body = { enabled: false, expectedRevision: before.revision, reason: 'Disable acceptance' }
	const result = await send<AccountSummary>('POST', path(jim, '/enabled'), body, {
		'idempotency-key': key,
	})
	expect(result.status).toBe(200)
	expect(result.body.revision).toBe(before.revision + 1)
	expect(
		(await send('POST', path(jim, '/enabled'), body, { 'idempotency-key': key })).body,
	).toEqual(result.body)
	expect(
		(await send('GET', 'accounts', undefined, { 'x-hcm-development-persona': 'jim' })).status,
	).toBe(401)
	expect((await send('POST', path(jim, '/enabled'), { ...body, enabled: true })).status).toBe(409)
	expect((await enabled(jim, true)).status).toBe(200)
	expect((await account()).personId).toBe(before.personId)
	expect(
		(
			await admin.query(
				'SELECT role_id FROM hcm.account_role WHERE account_id=$1 ORDER BY role_id',
				[jim],
			)
		).rows,
	).toEqual(roles)
	expect(
		(await send('POST', path(david, '/enabled'), body, { 'idempotency-key': key })).status,
	).toBe(409)
})
it('protects the last administrator across actual disable and assignment revoke contention', /** Share the tenant lock and reauthorization across the two owning API modules. */ async () => {
	const role = (await admin.query('SELECT id FROM hcm.access_role WHERE protected_admin')).rows[0]
		.id
	const grant = await send<{
		roles: { items: { id: string; grantId: string }[] }
		revision: number
	}>('POST', `access-control/assignments/${encodeURIComponent(jim)}/grant`, {
		roleId: role,
		expectedRevision: (await account()).revision,
		reason: 'Concurrent invariant setup',
	})
	expect(grant.status).toBe(200)
	const occurrence = grant.body.roles.items.find(
		/** Select only the protected role occurrence created by this test. */ (item) =>
			item.id === role,
	)!
	const results = await Promise.all([
		enabled(david, false),
		send('POST', `access-control/assignments/${encodeURIComponent(jim)}/revoke`, {
			roleId: role,
			grantId: occurrence.grantId,
			expectedRevision: grant.body.revision,
			reason: 'Concurrent invariant revoke',
		}),
	])
	expect(
		results.filter(
			/** Exactly one conflicting reduction can commit. */ (reply) => reply.status === 200,
		),
	).toHaveLength(1)
	expect(
		results.every(
			/** The other actor is stale-disabled or would remove the last protected administrator. */ (
				reply,
			) => [200, 401, 409].includes(reply.status),
		),
	).toBe(true)
	await admin.query('UPDATE hcm.user_account SET enabled=true WHERE id=$1', [david])
	await admin.query('DELETE FROM hcm.account_role WHERE account_id=$1 AND role_id=$2', [jim, role])
	expect((await enabled(david, false)).status).toBe(409)
	expect((await account(david)).enabled).toBe(true)
})
it('TEST-IDENTITY-ADMINISTRATION-004 rejects forged scope, foreign records and transport expansion', /** Test genuine foreign tenant data and independent business authority without fixture APIs. */ async () => {
	for (const query of [
		'tenantId=other',
		'q=x&q=y',
		'sort=email:asc',
		'enabled=1',
		'limit=101',
		'cursor=broken',
	])
		expect((await send('GET', `accounts?${query}`)).status).toBe(400)
	expect(
		(await send('GET', 'accounts', undefined, { 'x-hcm-development-persona': 'jim' })).status,
	).toBe(403)
	expect(
		(await send('GET', 'accounts', undefined, { 'x-hcm-development-persona': 'invented' })).status,
	).toBe(401)
	const body = {
		personId: (await account()).personId,
		email: 'transport@dundermifflin.example',
		reason: 'Transport acceptance',
	}
	expect((await send('POST', 'accounts', body, { origin: 'http://evil.invalid' })).status).toBe(403)
	expect((await send('POST', 'accounts', body, { 'content-type': 'text/plain' })).status).toBe(415)
	expect((await send('POST', 'accounts', body, { 'idempotency-key': 'invalid' })).status).toBe(400)
	await admin.query(
		"UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.identity-access'",
	)
	expect((await send('GET', 'accounts')).status).toBe(403)
	await admin.query(
		"UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.identity-access'",
	)
	await admin.query("SELECT set_config('hcm.tenant_id','foreign-identity',false)")
	await admin.query(
		"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES ('foreign-identity','foreign-identity','Foreign','active')",
	)
	await admin.query("SELECT set_config('hcm.tenant_id','foreign-identity',false)")
	await admin.query(
		"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES ('foreign-identity','foreign-person','Foreign','Person','Foreign person')",
	)
	await admin.query(
		"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES ('foreign-identity','foreign-account','foreign-person','foreign@example.test')",
	)
	await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	expect((await send('GET', path('foreign-account'))).status).toBe(404)
	expect((await send('POST', 'accounts', { ...body, personId: 'foreign-person' })).status).toBe(404)
	expect(
		(
			await send('POST', path('foreign-account', '/enabled'), {
				enabled: false,
				expectedRevision: 1,
				reason: 'Foreign target',
			})
		).status,
	).toBe(404)
	expect(
		(await send<IdentityPage<PersonOption>>('GET', 'account-person-options?q=Foreign')).body.items,
	).toEqual([])
})
it('TEST-IDENTITY-ADMINISTRATION-006 rolls back account creation when audit persistence fails', /** Inject a database failure, then prove no account or receipt success escaped the transaction. */ async () => {
	const key = randomUUID(),
		body = {
			personId: (await account()).personId,
			email: 'rollback.identity@example.test',
			reason: 'Atomic failure',
		}
	await admin.query(
		"CREATE FUNCTION hcm.reject_identity_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='account.created' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$",
	)
	await admin.query(
		'CREATE TRIGGER reject_identity BEFORE INSERT ON hcm.audit_event FOR EACH ROW EXECUTE FUNCTION hcm.reject_identity_audit()',
	)
	try {
		expect((await send('POST', 'accounts', body, { 'idempotency-key': key })).status).toBe(503)
		expect(
			(
				await admin.query('SELECT count(*)::int AS count FROM hcm.user_account WHERE email=$1', [
					body.email,
				])
			).rows[0].count,
		).toBe(0)
		expect(
			(
				await admin.query(
					'SELECT count(*)::int AS count FROM hcm.identity_command_receipt WHERE idempotency_key=$1',
					[key],
				)
			).rows[0].count,
		).toBe(0)
	} finally {
		await admin.query('DROP TRIGGER reject_identity ON hcm.audit_event')
		await admin.query('DROP FUNCTION hcm.reject_identity_audit()')
	}
	expect((await send('POST', 'accounts', body, { 'idempotency-key': key })).status).toBe(201)
	await admin.query(
		"DELETE FROM hcm.role_permission WHERE role_id=(SELECT id FROM hcm.access_role WHERE protected_admin) AND permission_code='hcm.identity-access.accounts.manage'",
	)
	expect((await send('POST', 'accounts', body, { 'idempotency-key': key })).status).toBe(403)
	await admin.query(
		"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) SELECT tenant_id,id,'hcm.identity-access.accounts.manage' FROM hcm.access_role WHERE protected_admin",
	)
})
