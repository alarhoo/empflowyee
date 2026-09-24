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
import { documentNotificationWriter } from '@empflowyee/hcm-api-notifications-infrastructure'
import type { DocumentNotificationEvent } from '@empflowyee/hcm-api-notifications-application'
import { HCM_ROLE_WRITE_ORIGIN } from '@empflowyee/hcm-api-access-control-transport'
import {
	renderNotificationText,
	type NotificationTemplate,
	type NotificationRule,
} from '@empflowyee/hcm-notifications-contract'
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
						'x-hcm-development-persona': 'david',
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

const event = 'document.requested'
/** Read one actual event configuration from the tenant API. */
async function template(): Promise<NotificationTemplate> {
	const value = await send<{ items: NotificationTemplate[] }>('GET', 'templates')
	expect(value.status).toBe(200)
	const item = value.body.items.find(
		/** Select the requested event configuration. */ (item) => item.eventType === event,
	)
	if (!item) throw new Error('Seeded template missing')
	return item
}
/** Read one fixed persisted tenant rule. */
async function rule(): Promise<NotificationRule> {
	const value = await send<{ items: NotificationRule[] }>('GET', 'rules')
	expect(value.status).toBe(200)
	const item = value.body.items.find(
		/** Select the requested event switch. */ (item) => item.eventType === event,
	)
	if (!item) throw new Error('Seeded rule missing')
	return item
}
it('exposes exactly the three configured events without creating inbox history', /** Explicit seeds are configuration only, and preview is pure text substitution. */ async () => {
	for (const path of ['templates', 'rules']) {
		const value = await send<{ items: { eventType: string }[] }>('GET', path)
		expect(value.status).toBe(200)
		expect(value.cache).toContain('no-store')
		expect(
			value.body.items.map(/** Compare exact supported keys. */ (item) => item.eventType).sort(),
		).toEqual(['document.replacement-requested', 'document.requested', 'document.submitted'])
	}
	expect(
		(await admin.query('SELECT count(*)::int AS count FROM hcm.notification')).rows[0].count,
	).toBe(0)
	expect(renderNotificationText('{requestId}: {dueDate}', '$&{dueDate}', null)).toBe(
		'$&{dueDate}: ',
	)
})
it('saves validated text with revisioned receipts and immutable existing inbox content', /** Template saves never rewrite messages, and the audit contains only field names and reason. */ async () => {
	const account = 'dunder-mifflin/account/jim'
	await admin.query(
		"INSERT INTO hcm.notification_intent(tenant_id,id,event_id,event_type,source_request_id,recipient_account_id,recipient_key,outcome,reason_code) VALUES($1,'prior','prior',$2,'request',$3,$3,'Delivered','delivered')",
		[tenant, event, account],
	)
	await admin.query(
		"INSERT INTO hcm.notification(tenant_id,id,intent_id,recipient_account_id,event_type,title,body,source_request_id) VALUES($1,'prior','prior',$2,$3,'Prior title','Immutable prior body','request')",
		[tenant, account, event],
	)
	const before = await template(),
		key = randomUUID(),
		body = {
			title: 'Updated request {requestId}',
			body: 'Please respond by {dueDate}.',
			reason: 'Clarify the request',
			expectedRevision: before.revision,
		}
	const result = await send<NotificationTemplate>('PUT', 'templates/' + event, body, {
		'idempotency-key': key,
	})
	expect(result.status).toBe(200)
	expect(result.body.revision).toBe(before.revision + 1)
	expect((await send('PUT', 'templates/' + event, body, { 'idempotency-key': key })).body).toEqual(
		result.body,
	)
	expect(
		(
			await send(
				'PUT',
				'templates/' + event,
				{ ...body, title: 'Different' },
				{ 'idempotency-key': key },
			)
		).status,
	).toBe(409)
	expect((await send('PUT', 'templates/' + event, body)).status).toBe(409)
	expect(
		(await admin.query("SELECT title,body FROM hcm.notification WHERE id='prior'")).rows[0],
	).toEqual({ title: 'Prior title', body: 'Immutable prior body' })
	const audit = (
		await admin.query(
			"SELECT safe_summary AS summary FROM hcm.audit_event WHERE action='notification.template-changed'",
		)
	).rows
	expect(audit).toHaveLength(1)
	expect(
		(
			await admin.query(
				"SELECT target_type FROM hcm.audit_event WHERE action='notification.template-changed'",
			)
		).rows[0].target_type,
	).toBe('notification-template')
	expect(audit[0].summary).toEqual({
		reason: 'Clarify the request',
		changedFields: ['title', 'body'],
	})
})
it('rejects unsafe template syntax and transport extensions before any revision changes', /** Plain-text boundaries reject external content, hidden selectors and unsupported methods. */ async () => {
	const before = await template(),
		body = {
			title: before.title,
			body: before.body,
			reason: 'Validation',
			expectedRevision: before.revision,
		}
	for (const text of [
		'',
		'<script>alert(1)</script>',
		'https://example.com',
		'www.example.com',
		'example.com/path',
		'{unknown}',
		'{requestId',
		'bad\ntext',
		'{requestId}}',
	]) {
		expect((await send('PUT', 'templates/' + event, { ...body, body: text })).status).toBe(400)
	}
	for (const payload of [
		{ ...body, title: 'x'.repeat(121) },
		{ ...body, body: 'x'.repeat(1001) },
		{ ...body, reason: '' },
		{ ...body, expectedRevision: 0 },
		{ ...body, tenantId: 'foreign' },
	])
		expect((await send('PUT', 'templates/' + event, payload)).status).toBe(400)
	expect((await send('PUT', 'templates/unregistered', body)).status).toBe(400)
	expect(
		(await send('PUT', 'templates/' + event, body, { origin: 'https://foreign.invalid' })).status,
	).toBe(403)
	expect(
		(await send('PUT', 'templates/' + event, body, { 'content-type': 'text/plain' })).status,
	).toBe(415)
	expect((await send('GET', 'templates?tenantId=foreign')).status).toBe(400)
	expect((await send('POST', 'templates', body)).status).toBe(404)
	expect(await template()).toEqual(before)
})
it('serializes competing rule changes and binds replay to actor, operation and authority', /** Only one expected revision wins; revoked authority cannot replay a prior receipt. */ async () => {
	const before = await rule(),
		body = {
			enabled: !before.enabled,
			expectedRevision: before.revision,
			reason: 'Verify delivery switch',
		},
		key = randomUUID()
	const result = await send('PUT', 'rules/' + event, body, { 'idempotency-key': key })
	expect(result.status).toBe(200)
	expect((await send('PUT', 'rules/' + event, body, { 'idempotency-key': key })).status).toBe(200)
	const fresh = await rule()
	const competing = await Promise.all([
		send('PUT', 'rules/' + event, { ...body, enabled: true, expectedRevision: fresh.revision }),
		send('PUT', 'rules/' + event, { ...body, enabled: false, expectedRevision: fresh.revision }),
	])
	expect(
		competing
			.map(
				/** Compare concurrency statuses independent of scheduler order. */ (item) => item.status,
			)
			.sort(),
	).toEqual([200, 409])
	expect((await send('PUT', 'rules/' + event, { ...body, enabled: 'true' })).status).toBe(400)
	expect(
		(await send('GET', 'rules', undefined, { 'x-hcm-development-persona': 'jim' })).status,
	).toBe(403)
	await admin.query(
		"UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.notifications'",
	)
	try {
		expect((await send('PUT', 'rules/' + event, body, { 'idempotency-key': key })).status).toBe(403)
	} finally {
		await admin.query(
			"UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.notifications'",
		)
	}
})
it('rolls back configuration and receipt if transactional audit fails', /** Trigger a real database failure after the business update to verify atomicity. */ async () => {
	const before = await template(),
		key = randomUUID()
	await admin.query(
		"CREATE FUNCTION hcm.fail_notification_configuration() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$",
	)
	await admin.query(
		'CREATE TRIGGER fail_notification_configuration BEFORE INSERT ON hcm.audit_event FOR EACH ROW EXECUTE FUNCTION hcm.fail_notification_configuration()',
	)
	try {
		expect(
			(
				await send(
					'PUT',
					'templates/' + event,
					{
						title: 'Rollback',
						body: 'No partial update',
						reason: 'Test rollback',
						expectedRevision: before.revision,
					},
					{ 'idempotency-key': key },
				)
			).status,
		).toBe(503)
		expect(await template()).toEqual(before)
		expect(
			(
				await admin.query(
					'SELECT * FROM hcm.notification_command_receipt WHERE idempotency_key=$1',
					[key],
				)
			).rows,
		).toEqual([])
	} finally {
		await admin.query('DROP TRIGGER fail_notification_configuration ON hcm.audit_event')
		await admin.query('DROP FUNCTION hcm.fail_notification_configuration()')
	}
})
it('isolates real foreign configuration and forbids runtime creation or ownership changes', /** FORCE RLS and column privileges apply even to direct SQL outside API filters. */ async () => {
	await admin.query("SELECT set_config('hcm.tenant_id','foreign-notification-admin',false)")
	try {
		await admin.query(
			"INSERT INTO hcm.tenant(id,slug,display_name,status,defaults) VALUES('foreign-notification-admin','foreign-notification-admin','Foreign','active','{}')",
		)
		await admin.query(
			"INSERT INTO hcm.notification_template(tenant_id,event_type,title,body) VALUES('foreign-notification-admin','document.requested','Foreign title','Foreign body')",
		)
		await admin.query(
			"INSERT INTO hcm.notification_rule(tenant_id,event_type,enabled) VALUES('foreign-notification-admin','document.requested',false)",
		)
	} finally {
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	}
	const runtime = new Client({ connectionString: process.env['HCM_TEST_RUNTIME'] })
	await runtime.connect()
	try {
		await runtime.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		for (const table of ['notification_template', 'notification_rule']) {
			expect(
				(
					await runtime.query(
						`SELECT * FROM hcm.${table} WHERE tenant_id='foreign-notification-admin'`,
					)
				).rows,
			).toEqual([])
			expect(
				(
					await runtime.query(
						`UPDATE hcm.${table} SET revision=revision+1 WHERE tenant_id='foreign-notification-admin'`,
					)
				).rowCount,
			).toBe(0)
			await expect(runtime.query(`DELETE FROM hcm.${table}`)).rejects.toMatchObject({
				code: '42501',
			})
			await expect(
				runtime.query(`UPDATE hcm.${table} SET tenant_id='foreign-notification-admin'`),
			).rejects.toMatchObject({ code: '42501' })
		}
		await expect(
			runtime.query(
				"INSERT INTO hcm.notification_rule(tenant_id,event_type,enabled) VALUES('foreign-notification-admin','document.submitted',true)",
			),
		).rejects.toMatchObject({ code: '42501' })
	} finally {
		await runtime.end()
	}
	expect(JSON.stringify((await send('GET', 'templates')).body)).not.toContain('Foreign title')
})

/** Invoke the internal delivery port on a real serialized and reauthorized producer transaction. */
async function deliver(value: DocumentNotificationEvent, fail = false) {
	const runtime = app.get(HcmRuntimeApplication)
	const record = await runtime.resolveTenant('acme.localhost', '127.0.0.1')
	const context = await runtime.authenticate(record, undefined, {
		tenantId: tenant,
		peerAddress: '127.0.0.1',
		developmentPersona: 'toby',
	})
	return app.get(HcmAccessDatabase).execute(
		context,
		{ permission: 'hcm.documents.requests.manage', entitlement: 'hcm.documents' },
		true,
		/** Bind the notifications writer to the producer transaction without extra commits. */ async (
			scope,
		) => {
			const outcomes = await documentNotificationWriter(scope).execute(value)
			if (fail) throw new Error('Producer rollback')
			return outcomes
		},
	)
}
it('delivers only to event-defined recipients and freezes event outcomes across retries', /** Verify persisted delivery, suppression, disabled/missing accounts and immutable rendered evidence. */ async () => {
	await admin.query('UPDATE hcm.notification_rule SET enabled=true')
	await admin.query(
		"INSERT INTO hcm.user_account(tenant_id,id,person_id,email,enabled) VALUES($1,'jim-alias','dunder-mifflin/person/jim','jim-alias@example.com',true),($1,'jim-disabled','dunder-mifflin/person/jim','jim-disabled@example.com',false)",
		[tenant],
	)
	await admin.query(
		"INSERT INTO hcm.notification_preference(tenant_id,account_id,event_type,enabled) VALUES($1,'jim-alias','document.requested',false)",
		[tenant],
	)
	const value: DocumentNotificationEvent = {
		eventId: randomUUID(),
		eventType: 'document.requested',
		requestId: 'delivery-request',
		dueDate: null,
		workerPersonId: 'dunder-mifflin/person/jim',
		requesterAccountId: 'dunder-mifflin/account/toby',
	}
	const result = await deliver(value)
	expect(
		result
			.map(
				/** Match explicit recipient outcomes without message text. */ (item) => [
					item.recipientId,
					item.outcome,
				],
			)
			.sort(),
	).toEqual([
		['dunder-mifflin/account/jim', 'Delivered'],
		['jim-alias', 'Suppressed'],
		['jim-disabled', 'Undeliverable'],
	])
	expect(result[0].title).toContain('delivery-request')
	await admin.query(
		"UPDATE hcm.notification_template SET title='Later template' WHERE event_type='document.requested'",
	)
	await admin.query(
		"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES($1,'jim-later','dunder-mifflin/person/jim','jim-later@example.com')",
		[tenant],
	)
	expect(await deliver(value)).toEqual(result)
	expect(
		(
			await admin.query(
				'SELECT count(*)::int AS count FROM hcm.notification_intent WHERE event_id=$1',
				[value.eventId],
			)
		).rows[0].count,
	).toBe(3)
	const submitted = await deliver({
		...value,
		eventId: randomUUID(),
		eventType: 'document.submitted',
	})
	expect(
		submitted.map(/** Assert requester-only submission delivery. */ (item) => item.recipientId),
	).toEqual(['dunder-mifflin/account/toby'])
	await admin.query(
		"UPDATE hcm.notification_rule SET enabled=false WHERE event_type='document.replacement-requested'",
	)
	const replacement = await deliver({
		...value,
		eventId: randomUUID(),
		eventType: 'document.replacement-requested',
	})
	expect(
		replacement.every(
			/** Rule disabling overrides enabled recipient preferences. */ (item) =>
				item.outcome !== 'Delivered',
		),
	).toBe(true)
	expect(
		await deliver({ ...value, eventId: randomUUID(), workerPersonId: 'no-linked-account' }),
	).toEqual([{ recipientId: null, outcome: 'Undeliverable', reason: 'missing-account' }])
	await expect(deliver({ ...value, requestId: 'different-target' })).rejects.toThrow(
		'identity conflict',
	)
})
it('rolls back producer delivery and preserves bounded literal expansion without truncation', /** No outcome survives producer failure, and template limits apply before rendering. */ async () => {
	await admin.query(
		"UPDATE hcm.notification_template SET title='{dueDate}',body=$1 WHERE event_type='document.requested'",
		['{requestId}'.repeat(80)],
	)
	const value: DocumentNotificationEvent = {
		eventId: randomUUID(),
		eventType: 'document.requested',
		requestId: 'a'.repeat(200),
		dueDate: null,
		workerPersonId: 'dunder-mifflin/person/jim',
		requesterAccountId: 'dunder-mifflin/account/toby',
	}
	await expect(deliver(value, true)).rejects.toThrow('Producer rollback')
	expect(
		(await admin.query('SELECT * FROM hcm.notification_intent WHERE event_id=$1', [value.eventId]))
			.rows,
	).toEqual([])
	const result = await deliver(value)
	const delivered = result.find(
		/** Inspect actual delivered evidence. */ (item) => item.outcome === 'Delivered',
	)
	expect(delivered?.title).toBe('')
	expect(delivered?.body).toBe('a'.repeat(16000))
	expect(
		(
			await admin.query(
				'SELECT length(n.body) AS length FROM hcm.notification n JOIN hcm.notification_intent i ON i.tenant_id=n.tenant_id AND i.id=n.intent_id WHERE i.event_id=$1',
				[value.eventId],
			)
		).rows[0].length,
	).toBe(16000)
})
