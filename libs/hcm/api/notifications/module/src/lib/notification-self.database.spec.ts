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
	NotificationPreferences,
	NotificationPreference,
	NotificationPage,
	NotificationItem,
} from '@empflowyee/hcm-notifications-contract'
import { notificationDelivery } from '@empflowyee/hcm-api-notifications-domain'
import { HcmNotificationsModule } from './hcm-api-notifications-module'

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
				`${origin}/api/v1/notifications/${path}`,
				{
					method,
					headers: {
						host: 'acme.localhost',
						'x-hcm-development-persona': 'jim',
						origin: browserOrigin,
						'sec-fetch-site': 'same-origin',
						'content-type': 'application/json',
						'idempotency-key': randomUUID(),
						'content-length': String(
							Buffer.byteLength(body === undefined ? '' : JSON.stringify(body)),
						),
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
		const module = await Test.createTestingModule({ imports: [HcmNotificationsModule] })
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
const event = 'document.requested'
/** Insert bounded fictional producer evidence only in disposable PostgreSQL test storage. */
async function notification(
	id: string,
	recipient = jim,
	body = 'A document has been requested',
	time = '2026-08-01T10:00:00.000001Z',
	tenantId = tenant,
): Promise<void> {
	await admin.query(
		"INSERT INTO hcm.notification_intent(tenant_id,id,event_id,event_type,source_request_id,recipient_account_id,recipient_key,outcome,reason_code) VALUES($1,$2,$2,'document.requested','request-test',$3,$3,'Delivered','delivered')",
		[tenantId, id, recipient],
	)
	await admin.query(
		"INSERT INTO hcm.notification(tenant_id,id,intent_id,recipient_account_id,event_type,title,body,source_request_id,created_at) VALUES($1,$2,$2,$3,'document.requested','Document request',$4,'request-test',$5)",
		[tenantId, id, recipient, body, time],
	)
}
/** Fetch real own-category projections without browser fixtures. */
async function preferences(): Promise<NotificationPreferences> {
	const reply = await send<NotificationPreferences>('GET', 'me/preferences')
	expect(reply.status).toBe(200)
	return reply.body
}
it('reads exactly three absent-row defaults and keeps the initial inbox honestly empty', /** Verify read-only defaults do not silently seed preferences or notifications. */ async () => {
	const prefs = await preferences()
	expect(prefs.items).toEqual([
		{ eventType: 'document.requested', enabled: true, revision: 0 },
		{ eventType: 'document.submitted', enabled: true, revision: 0 },
		{ eventType: 'document.replacement-requested', enabled: true, revision: 0 },
	])
	expect((await admin.query('SELECT * FROM hcm.notification_preference')).rows).toEqual([])
	const inbox = await send<NotificationPage>('GET', 'me/inbox')
	expect(inbox.status).toBe(200)
	expect(inbox.cache).toBe('no-store')
	expect(inbox.body).toEqual({ items: [], nextCursor: null })
	expect(notificationDelivery(true, undefined, true)).toBe('Delivered')
	expect(notificationDelivery(true, false, true)).toBe('Suppressed')
	expect(notificationDelivery(false, true, true)).toBe('Suppressed')
	expect(notificationDelivery(true, true, false)).toBe('Undeliverable')
})
it('queries only the authenticated recipient with bounded literal search and scope-bound cursors', /** Same-person aliases and same-tenant accounts never share an inbox. */ async () => {
	await notification('notice-a', jim, 'Literal % body')
	await notification('notice-b')
	await notification('notice-c', jim, 'Microsecond ordering', '2026-08-01T10:00:00.000002Z')
	await notification('notice-michael', 'dunder-mifflin/account/michael')
	await admin.query(
		"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES($1,'jim-alias','dunder-mifflin/person/jim','alias@example.com')",
		[tenant],
	)
	await notification('notice-alias', 'jim-alias')
	const first = await send<NotificationPage>('GET', 'me/inbox?limit=2&sort=createdAt:asc')
	expect(first.body.items.map(/** Read stable ordering. */ (row) => row.id)).toEqual([
		'notice-a',
		'notice-b',
	])
	const second = await send<NotificationPage>(
		'GET',
		`me/inbox?limit=2&sort=createdAt:asc&cursor=${first.body.nextCursor}`,
	)
	expect(second.body.items.map(/** Read the microsecond successor. */ (row) => row.id)).toEqual([
		'notice-c',
	])
	expect(
		(
			await send(
				'GET',
				`me/inbox?limit=2&sort=createdAt:asc&unread=true&cursor=${first.body.nextCursor}`,
			)
		).status,
	).toBe(400)
	expect(
		(
			await send(
				'GET',
				`me/inbox?limit=2&sort=createdAt:asc&cursor=${first.body.nextCursor}`,
				undefined,
				{ 'x-hcm-development-persona': 'michael' },
			)
		).status,
	).toBe(400)
	const literal = await send<NotificationPage>('GET', 'me/inbox?q=%25')
	expect(literal.body.items).toHaveLength(1)
	expect(Object.keys(literal.body.items[0]).sort()).toEqual([
		'body',
		'createdAt',
		'eventType',
		'id',
		'readAt',
		'requestId',
		'revision',
		'title',
	])
	for (const id of ['notice-michael', 'notice-alias', 'missing'])
		expect((await send('POST', `me/inbox/${id}/read`, { expectedRevision: 1 })).status).toBe(404)
})
it('marks read once and replays exact successful commands without changing the first timestamp', /** Concurrency and new keys cannot replace existing read evidence. */ async () => {
	const key = randomUUID(),
		path = 'me/inbox/notice-a/read',
		body = { expectedRevision: 1 }
	const first = await send<NotificationItem>('POST', path, body, { 'idempotency-key': key })
	expect(first.status).toBe(200)
	expect(first.body.revision).toBe(2)
	expect(first.body.readAt).toBeTruthy()
	expect((await send('POST', path, body, { 'idempotency-key': key })).body).toEqual(first.body)
	expect(
		(await send('POST', 'me/inbox/notice-b/read', body, { 'idempotency-key': key })).status,
	).toBe(409)
	expect((await send('POST', path, body)).status).toBe(409)
	expect((await send('POST', path, { expectedRevision: 2 })).body).toEqual(first.body)
	expect(
		(
			await admin.query(
				"SELECT id FROM hcm.audit_event WHERE action='notification.read' AND target_id='notice-a'",
			)
		).rows,
	).toHaveLength(1)
	expect((await send<NotificationPage>('GET', 'me/inbox?unread=false')).body.items).toHaveLength(1)
	const replies = await Promise.all([
		send('POST', 'me/inbox/notice-b/read', { expectedRevision: 1 }),
		send('POST', 'me/inbox/notice-b/read', { expectedRevision: 1 }),
	])
	expect(
		replies.map(/** Compare committed and stale responses. */ (reply) => reply.status).sort(),
	).toEqual([200, 409])
})
it('persists one category with revision-zero creation, replay and isolated account ownership', /** Defaults, stale saves and simultaneous first choices follow the same explicit contract. */ async () => {
	const key = randomUUID(),
		body = { enabled: false, expectedRevision: 0 },
		path = `me/preferences/${event}`
	const first = await send<NotificationPreference>('PUT', path, body, { 'idempotency-key': key })
	expect(first.status).toBe(200)
	expect(first.body).toEqual({ eventType: event, enabled: false, revision: 1 })
	expect((await send('PUT', path, body, { 'idempotency-key': key })).body).toEqual(first.body)
	expect(
		(await send('PUT', path, { ...body, enabled: true }, { 'idempotency-key': key })).status,
	).toBe(409)
	expect((await send('PUT', path, body)).status).toBe(409)
	expect((await preferences()).items[0]).toEqual(first.body)
	expect(
		(
			await send<NotificationPreferences>('GET', 'me/preferences', undefined, {
				'x-hcm-development-persona': 'michael',
			})
		).body.items[0],
	).toEqual({ eventType: event, enabled: true, revision: 0 })
	const next = 'me/preferences/document.submitted'
	const replies = await Promise.all([
		send('PUT', next, { enabled: true, expectedRevision: 0 }),
		send('PUT', next, { enabled: false, expectedRevision: 0 }),
	])
	expect(
		replies.map(/** Exactly one initial preference may commit. */ (reply) => reply.status).sort(),
	).toEqual([200, 409])
	const evidence = (
		await admin.query(
			"SELECT safe_summary FROM hcm.audit_event WHERE action='notification.preference-changed'",
		)
	).rows
	expect(evidence).toHaveLength(2)
	expect(evidence[0].safe_summary).toEqual({ changedFields: ['enabled'] })
	expect((await send<NotificationPage>('GET', 'me/inbox')).body.items).toHaveLength(3)
})
it('rejects unknown selectors and rechecks current grants, entitlement and enabled state', /** Neither discovery nor a stored receipt authorizes self-service writes. */ async () => {
	for (const path of [
		'me/inbox?accountId=other',
		'me/inbox?tenantId=foreign',
		'me/inbox?q=a&q=b',
		'me/inbox?eventType=email',
		'me/inbox?unread=maybe',
		'me/inbox?limit=101',
		'me/inbox?cursor=invalid',
		'me/preferences?accountId=other',
	])
		expect((await send('GET', path)).status).toBe(400)
	const path = 'me/preferences/document.replacement-requested',
		body = { enabled: false, expectedRevision: 0 },
		key = randomUUID()
	expect((await send('PUT', path, { ...body, accountId: 'other' })).status).toBe(400)
	expect((await send('PUT', path, body, { origin: 'http://evil.invalid' })).status).toBe(403)
	expect((await send('PUT', path, body, { 'content-type': 'text/plain' })).status).toBe(415)
	expect((await send('PUT', 'me/preferences/email', body)).status).toBe(400)
	expect((await send('PUT', path, body, { 'idempotency-key': key })).status).toBe(200)
	await admin.query(
		"DELETE FROM hcm.role_permission WHERE role_id='employee' AND permission_code='hcm.notifications.preferences.self.manage'",
	)
	try {
		expect((await send('PUT', path, body, { 'idempotency-key': key })).status).toBe(403)
	} finally {
		await admin.query(
			"INSERT INTO hcm.role_permission VALUES($1,'employee','hcm.notifications.preferences.self.manage')",
			[tenant],
		)
	}
	await admin.query('UPDATE hcm.user_account SET enabled=false WHERE id=$1', [jim])
	try {
		expect((await send('GET', 'me/inbox')).status).toBe(401)
	} finally {
		await admin.query('UPDATE hcm.user_account SET enabled=true WHERE id=$1', [jim])
	}
	await admin.query(
		"UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.notifications'",
	)
	try {
		expect((await send('GET', 'me/inbox')).status).toBe(403)
	} finally {
		await admin.query(
			"UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.notifications'",
		)
	}
})
it('rolls back read-state and preference writes when audit fails', /** Real storage failure must preserve unread evidence, revisions and absent receipts. */ async () => {
	await admin.query(
		"CREATE FUNCTION hcm.reject_notification_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'notification.%' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$",
	)
	await admin.query(
		'CREATE TRIGGER test_notification_audit BEFORE INSERT ON hcm.audit_event FOR EACH ROW EXECUTE FUNCTION hcm.reject_notification_audit()',
	)
	const key = randomUUID()
	try {
		expect(
			(
				await send(
					'POST',
					'me/inbox/notice-c/read',
					{ expectedRevision: 1 },
					{ 'idempotency-key': key },
				)
			).status,
		).toBe(503)
		expect(
			(await admin.query("SELECT read_at,revision FROM hcm.notification WHERE id='notice-c'"))
				.rows[0],
		).toEqual({ read_at: null, revision: 1 })
		expect(
			(await send('PUT', `me/preferences/${event}`, { enabled: true, expectedRevision: 1 })).status,
		).toBe(503)
		expect((await preferences()).items[0]).toEqual({
			eventType: event,
			enabled: false,
			revision: 1,
		})
		expect(
			(
				await admin.query(
					'SELECT idempotency_key FROM hcm.notification_command_receipt WHERE idempotency_key=$1',
					[key],
				)
			).rows,
		).toEqual([])
	} finally {
		await admin.query('DROP TRIGGER test_notification_audit ON hcm.audit_event')
		await admin.query('DROP FUNCTION hcm.reject_notification_audit()')
	}
})
it('enforces foreign-tenant RLS and immutable inbox evidence', /** Direct runtime SQL cannot rewrite ownership or message bodies, even when API filters are bypassed. */ async () => {
	await admin.query("SELECT set_config('hcm.tenant_id','foreign-notifications',false)")
	try {
		await admin.query(
			"INSERT INTO hcm.tenant(id,slug,display_name,status,defaults) VALUES('foreign-notifications','foreign-notifications','Foreign','active','{}')",
		)
		await admin.query(
			"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES('foreign-notifications','person','Foreign','Person','Foreign Person')",
		)
		await admin.query(
			"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES('foreign-notifications','account','person','foreign@example.com')",
		)
		await notification(
			'foreign-notice',
			'account',
			'Foreign content',
			'2026-08-01T10:00:00.000001Z',
			'foreign-notifications',
		)
		await admin.query(
			"INSERT INTO hcm.notification_preference(tenant_id,account_id,event_type,enabled) VALUES('foreign-notifications','account','document.requested',false)",
		)
	} finally {
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	}
	expect((await send('POST', 'me/inbox/foreign-notice/read', { expectedRevision: 1 })).status).toBe(
		404,
	)
	const runtime = new Client({ connectionString: process.env['HCM_TEST_RUNTIME'] })
	await runtime.connect()
	try {
		await runtime.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		for (const table of [
			'notification',
			'notification_intent',
			'notification_preference',
			'notification_command_receipt',
		]) {
			expect(
				(
					await runtime.query(
						`SELECT tenant_id FROM hcm.${table} WHERE tenant_id='foreign-notifications'`,
					)
				).rows,
			).toEqual([])
			await expect(runtime.query(`DELETE FROM hcm.${table}`)).rejects.toMatchObject({
				code: '42501',
			})
		}
		await expect(
			runtime.query(
				"INSERT INTO hcm.notification_preference(tenant_id,account_id,event_type,enabled) VALUES('foreign-notifications','account','document.submitted',true)",
			),
		).rejects.toMatchObject({ code: '42501' })
		await expect(
			runtime.query("UPDATE hcm.notification SET body='Altered' WHERE id='notice-a'"),
		).rejects.toMatchObject({ code: '42501' })
		expect(
			(await runtime.query("UPDATE hcm.notification SET read_at=now() WHERE id='foreign-notice'"))
				.rowCount,
		).toBe(0)
		await expect(
			runtime.query("UPDATE hcm.notification_preference SET account_id='other'"),
		).rejects.toMatchObject({ code: '42501' })
	} finally {
		await runtime.end()
	}
})
