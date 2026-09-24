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
	ReviewSummary,
	ReviewItem,
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
/** Create an actual current-assignment snapshot through the API. */
async function start(label = 'Quarterly access review'): Promise<ReviewSummary> {
	const result = await send<ReviewSummary>('POST', 'reviews', {
		label,
		reason: 'Review acceptance',
	})
	expect(result.status, JSON.stringify(result.body)).toBe(201)
	return result.body
}
/** Read the bounded snapshot for a test review. */
async function items(id: string): Promise<ReviewItem[]> {
	const result = await send<Page<ReviewItem>>('GET', `reviews/${id}/items?limit=100`)
	expect(result.status).toBe(200)
	return result.body.items
}
/** Decide an exact snapshot revision through the command endpoint. */
async function decide(id: string, item: ReviewItem, decision: 'Retain' | 'Revoke' = 'Retain') {
	return send<ReviewItem>('POST', `reviews/${id}/items/${item.id}/decide`, {
		decision,
		expectedRevision: item.revision,
		reason: 'Reviewed current evidence',
	})
}
/** Refresh outdated evidence explicitly rather than accepting a stale decision. */
async function refresh(id: string, item: ReviewItem) {
	return send<ReviewItem>('POST', `reviews/${id}/items/${item.id}/refresh`, {
		expectedRevision: item.revision,
		reason: 'Inspect updated assignment',
	})
}
/** Close using the current parent revision. */
async function close(id: string) {
	const current = await send<ReviewSummary>('GET', `reviews/${id}`)
	return send<ReviewSummary>('POST', `reviews/${id}/close`, {
		expectedRevision: current.body.revision,
		reason: 'Completed snapshot review',
	})
}
/** Read current assignment revision for a genuine shared mutation. */
async function account(): Promise<AssignmentSummary> {
	const result = await send<AssignmentSummary>('GET', `assignments/${encodeURIComponent(jim)}`)
	expect(result.status).toBe(200)
	return result.body
}
/** Grant or revoke using the existing assignment endpoint. */
async function assignment(operation: 'grant' | 'revoke', grantId?: string) {
	const current = await account()
	const result = await send<AssignmentSummary>(
		'POST',
		`assignments/${encodeURIComponent(jim)}/${operation}`,
		{
			roleId: 'manager',
			expectedRevision: current.revision,
			reason: 'Review occurrence test',
			...(grantId ? { grantId } : {}),
		},
	)
	expect(result.status, JSON.stringify(result.body)).toBe(200)
	return result.body.roles.items.find(
		/** Find the tested occurrence. */ (row) => row.id === 'manager',
	)?.grantId
}
it('snapshots persisted occurrences and binds stable filtered cursors', /** Prove safe real projections and bounded continuation. */ async () => {
	const review = await start('Literal % review')
	expect(review).toMatchObject({ status: 'Open', revision: 1, closedAt: null })
	const snapshot = await items(review.id)
	const count = await admin.query('SELECT count(*)::int AS count FROM hcm.account_role')
	expect(snapshot).toHaveLength(count.rows[0].count)
	expect(
		snapshot.every(/** Inspect initial state. */ (row) => row.decision === 'Pending' && !row.stale),
	).toBe(true)
	expect(JSON.stringify(snapshot)).not.toMatch(/tenantId|accountRevision|roleRevision/)
	const first = await send<Page<ReviewItem>>('GET', `reviews/${review.id}/items?limit=2`)
	expect(first.cache).toBe('no-store')
	const second = await send<Page<ReviewItem>>(
		'GET',
		`reviews/${review.id}/items?limit=2&cursor=${first.body.nextCursor}`,
	)
	expect(
		new Set(
			[...first.body.items, ...second.body.items].map(/** Compare unique IDs. */ (row) => row.id),
		).size,
	).toBe(4)
	expect(
		(
			await send(
				'GET',
				`reviews/${review.id}/items?limit=2&decision=Retain&cursor=${first.body.nextCursor}`,
			)
		).status,
	).toBe(400)
	const another = await start('Second review')
	expect(
		(await send('GET', `reviews/${another.id}/items?limit=2&cursor=${first.body.nextCursor}`))
			.status,
	).toBe(400)
	expect((await send<Page<ReviewSummary>>('GET', 'reviews?q=%25')).body.items).toHaveLength(1)
	const page = await send<Page<ReviewSummary>>('GET', 'reviews?limit=1&sort=createdAt:asc')
	expect(
		(await send('GET', `reviews?limit=1&sort=createdAt:desc&cursor=${page.body.nextCursor}`))
			.status,
	).toBe(400)
	expect(
		(
			await send<Page<ReviewSummary>>(
				'GET',
				`reviews?limit=1&sort=createdAt:asc&cursor=${page.body.nextCursor}`,
			)
		).body.items[0].id,
	).toBe(another.id)
})
it('replays exact commands and closes only complete current evidence', /** Enforce revisions, stale retained evidence and read-only closure. */ async () => {
	const key = randomUUID(),
		body = { label: 'Lifecycle review', reason: 'Lifecycle acceptance' }
	const created = await send<ReviewSummary>('POST', 'reviews', body, { 'idempotency-key': key })
	expect(created.status).toBe(201)
	expect((await send('POST', 'reviews', body, { 'idempotency-key': key })).body).toEqual(
		created.body,
	)
	expect(
		(await send('POST', 'reviews', { ...body, label: 'Changed' }, { 'idempotency-key': key }))
			.status,
	).toBe(409)
	const id = created.body.id
	expect((await close(id)).status).toBe(409)
	for (const row of await items(id)) expect((await decide(id, row)).status).toBe(200)
	await admin.query("UPDATE hcm.access_role SET revision=revision+1 WHERE id='employee'")
	expect((await close(id)).status).toBe(409)
	for (const row of await items(id)) {
		if (!row.stale) continue
		expect((await decide(id, row)).status).toBe(409)
		const renewed = await refresh(id, row)
		expect(renewed.status).toBe(200)
		expect(renewed.body).toMatchObject({
			decision: 'Pending',
			stale: false,
			reason: null,
			revision: row.revision + 1,
		})
		expect((await decide(id, renewed.body)).status).toBe(200)
	}
	const closed = await close(id)
	expect(closed.status).toBe(200)
	expect(closed.body.status).toBe('Closed')
	expect((await close(id)).status).toBe(409)
	expect((await refresh(id, (await items(id))[0])).status).toBe(409)
	const audit = await admin.query(
		'SELECT action FROM hcm.audit_event WHERE target_id=$1 ORDER BY occurred_at',
		[id],
	)
	expect(audit.rows).toEqual([{ action: 'review.started' }, { action: 'review.closed' }])
})
it('detects replacement occurrences and revokes through the shared assignment command', /** Same-pair regrant cannot reuse old evidence or bypass assignment audit and revision updates. */ async () => {
	const grantId = await assignment('grant')
	const review = await start('Occurrence review')
	const item = (await items(review.id)).find(
		/** Find the temporary grant. */ (row) => row.accountId === jim && row.roleId === 'manager',
	)!
	await assignment('revoke', grantId)
	const replacement = await assignment('grant')
	expect(replacement).not.toBe(grantId)
	expect((await decide(review.id, item, 'Revoke')).status).toBe(409)
	const updated = await refresh(review.id, item)
	expect(updated.status).toBe(200)
	expect(updated.body.grantId).toBe(replacement)
	const before = await account(),
		key = randomUUID()
	const body = {
		decision: 'Revoke',
		expectedRevision: updated.body.revision,
		reason: 'Review revocation',
	}
	const path = `reviews/${review.id}/items/${item.id}/decide`
	const revoked = await send<ReviewItem>('POST', path, body, { 'idempotency-key': key })
	expect(revoked.status, JSON.stringify(revoked.body)).toBe(200)
	expect(revoked.body).toMatchObject({ decision: 'Revoke', stale: false })
	expect((await send('POST', path, body, { 'idempotency-key': key })).body).toEqual(revoked.body)
	expect((await account()).revision).toBe(before.revision + 1)
	expect(
		(await account()).roles.items.some(
			/** Detect an erroneous surviving grant. */ (row) => row.id === 'manager',
		),
	).toBe(false)
	const events = await admin.query(
		"SELECT action FROM hcm.audit_event WHERE safe_summary->>'reason'='Review revocation' ORDER BY action",
	)
	expect(events.rows).toEqual([{ action: 'review.decided' }, { action: 'role.revoked' }])
	expect((await refresh(review.id, revoked.body)).status).toBe(409)
})
it('protects the final administrator and rolls back review side effects', /** A denied revoke must not decide the snapshot or create a receipt. */ async () => {
	const review = await start('Protected review')
	const item = (await items(review.id)).find(
		/** Locate the protected administrator. */ (row) => row.roleId === 'tenant-administrator',
	)!
	const before = await send('GET', `reviews/${review.id}`)
	expect((await decide(review.id, item, 'Revoke')).status).toBe(409)
	expect(
		(await items(review.id)).find(/** Read the unchanged snapshot. */ (row) => row.id === item.id),
	).toEqual(item)
	expect((await send('GET', `reviews/${review.id}`)).body).toEqual(before.body)
	expect(
		(await admin.query('SELECT id FROM hcm.audit_event WHERE target_id=$1', [item.id])).rows,
	).toEqual([])
})
it('explicitly marks removed occurrences and preserves historical labels', /** Absence is a reviewed terminal outcome, never a silently dropped snapshot. */ async () => {
	const grantId = await assignment('grant'),
		review = await start('Removed review')
	const row = (await items(review.id)).find(
		/** Select the temporary occurrence. */ (item) =>
			item.accountId === jim && item.roleId === 'manager',
	)!
	await assignment('revoke', grantId)
	const removed = await refresh(review.id, row)
	expect(removed.status).toBe(200)
	expect(removed.body).toMatchObject({
		decision: 'Removed',
		stale: false,
		grantId,
		roleLabel: 'Manager',
	})
	expect((await decide(review.id, removed.body)).status).toBe(409)
})
it('rolls back snapshot and receipt when audit persistence fails', /** Exercise a real PostgreSQL failure inside the review transaction. */ async () => {
	const before = await admin.query('SELECT count(*)::int AS count FROM hcm.access_review')
	await admin.query(
		"CREATE FUNCTION hcm.reject_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='review.started' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$",
	)
	await admin.query(
		'CREATE TRIGGER test_review_audit BEFORE INSERT ON hcm.audit_event FOR EACH ROW EXECUTE FUNCTION hcm.reject_review_audit()',
	)
	const key = randomUUID()
	try {
		expect(
			(
				await send(
					'POST',
					'reviews',
					{ label: 'Rollback', reason: 'Failure test' },
					{ 'idempotency-key': key },
				)
			).status,
		).toBe(503)
		expect(
			(await admin.query('SELECT count(*)::int AS count FROM hcm.access_review')).rows,
		).toEqual(before.rows)
		expect(
			(
				await admin.query(
					'SELECT idempotency_key FROM hcm.access_command_receipt WHERE idempotency_key=$1',
					[key],
				)
			).rows,
		).toEqual([])
	} finally {
		await admin.query('DROP TRIGGER test_review_audit ON hcm.audit_event')
		await admin.query('DROP FUNCTION hcm.reject_review_audit()')
	}
})
it('rejects malformed transport and independently enforces persisted authority', /** UI discovery and successful receipts never replace current permissions. */ async () => {
	const key = randomUUID(),
		body = { label: 'Authority review', reason: 'Authority acceptance' }
	expect((await send('POST', 'reviews', body, { 'idempotency-key': key })).status).toBe(201)
	for (const path of [
		'reviews?tenantId=foreign',
		'reviews?limit=101',
		'reviews?q=a&q=b',
		'reviews?status=Other',
		'reviews?cursor=bad',
	])
		expect((await send('GET', path)).status).toBe(400)
	expect((await send('POST', 'reviews', { ...body, tenantId: 'foreign' })).status).toBe(400)
	expect((await send('POST', 'reviews', body, { origin: 'http://evil.invalid' })).status).toBe(403)
	expect((await send('POST', 'reviews', body, { 'content-type': 'text/plain' })).status).toBe(415)
	expect(
		(await send('GET', 'reviews', undefined, { 'x-hcm-development-persona': 'jim' })).status,
	).toBe(403)
	expect((await send('GET', 'reviews/missing')).status).toBe(404)
	await admin.query(
		"DELETE FROM hcm.role_permission WHERE role_id='tenant-administrator' AND permission_code='hcm.access-control.reviews.manage'",
	)
	try {
		expect((await send('POST', 'reviews', body, { 'idempotency-key': key })).status).toBe(403)
	} finally {
		await admin.query(
			"INSERT INTO hcm.role_permission VALUES($1,'tenant-administrator','hcm.access-control.reviews.manage')",
			[tenant],
		)
	}
	await admin.query(
		"UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.access-control'",
	)
	try {
		expect((await send('GET', 'reviews')).status).toBe(403)
	} finally {
		await admin.query(
			"UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.access-control'",
		)
	}
})

it('isolates existing foreign review evidence with FORCE RLS and no destructive runtime grants', /** Cross-tenant reads, inserts and updates fail independently of HTTP guards. */ async () => {
	await admin.query("SELECT set_config('hcm.tenant_id','foreign-reviews',false)")
	try {
		await admin.query(
			"INSERT INTO hcm.tenant(id,slug,display_name,status,defaults) VALUES('foreign-reviews','foreign-reviews','Foreign','active','{}')",
		)
		await admin.query(
			"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES('foreign-reviews','person','Foreign','Person','Foreign Person')",
		)
		await admin.query(
			"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES('foreign-reviews','account','person','foreign@example.com')",
		)
		await admin.query(
			"INSERT INTO hcm.access_review(tenant_id,id,label,created_by_account_id) VALUES('foreign-reviews','foreign-review','Foreign review','account')",
		)
		await admin.query(
			"INSERT INTO hcm.access_review_item(tenant_id,id,review_id,account_id,role_id,grant_id,account_revision,role_revision,account_label,role_label) VALUES('foreign-reviews','foreign-item','foreign-review','account','role','historical-grant',1,1,'Foreign account','Historical role')",
		)
	} finally {
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	}
	expect((await send('GET', 'reviews/foreign-review')).status).toBe(404)
	expect((await send('GET', 'reviews/foreign-review/items')).status).toBe(404)
	const local = await start('Isolation review')
	expect(
		(
			await send('POST', `reviews/${local.id}/items/foreign-item/decide`, {
				decision: 'Retain',
				expectedRevision: 1,
				reason: 'Foreign attempt',
			})
		).status,
	).toBe(404)
	const runtime = new Client({ connectionString: process.env['HCM_TEST_RUNTIME'] })
	await runtime.connect()
	try {
		await runtime.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		expect(
			(await runtime.query("SELECT id FROM hcm.access_review WHERE id='foreign-review'")).rows,
		).toEqual([])
		expect(
			(await runtime.query("SELECT id FROM hcm.access_review_item WHERE id='foreign-item'")).rows,
		).toEqual([])
		expect(
			(
				await runtime.query(
					"UPDATE hcm.access_review SET revision=revision+1 WHERE id='foreign-review'",
				)
			).rowCount,
		).toBe(0)
		expect(
			(
				await runtime.query(
					"UPDATE hcm.access_review_item SET revision=revision+1 WHERE id='foreign-item'",
				)
			).rowCount,
		).toBe(0)
		await expect(
			runtime.query(
				"INSERT INTO hcm.access_review(tenant_id,id,label,created_by_account_id) VALUES('foreign-reviews','attack','Denied','account')",
			),
		).rejects.toMatchObject({ code: '42501' })
		await expect(
			runtime.query(
				"INSERT INTO hcm.access_review_item(tenant_id,id,review_id,account_id,role_id,grant_id,account_revision,role_revision,account_label,role_label) VALUES('foreign-reviews','attack','foreign-review','account','role','attack-grant',1,1,'Account','Role')",
			),
		).rejects.toMatchObject({ code: '42501' })
		await expect(
			runtime.query('DELETE FROM hcm.access_review WHERE id=$1', [local.id]),
		).rejects.toMatchObject({ code: '42501' })
		await expect(runtime.query('TRUNCATE hcm.access_review_item')).rejects.toMatchObject({
			code: '42501',
		})
	} finally {
		await runtime.end()
	}
	const flags = await admin.query(
		"SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='hcm'::regnamespace AND relname IN ('access_review','access_review_item')",
	)
	expect(flags.rows).toHaveLength(2)
	expect(
		flags.rows.every(
			/** Verify mandatory owner-enforced isolation. */ (row) =>
				row.relrowsecurity && row.relforcerowsecurity,
		),
	).toBe(true)
})
it('closes an empty snapshot and serializes competing decisions', /** Empty evidence is explicit, and concurrent decisions cannot both commit. */ async () => {
	const empty = await start('Empty snapshot fixture')
	// Removing harness-owned snapshot rows models a historical empty review without changing live grants.
	await admin.query('DELETE FROM hcm.access_review_item WHERE review_id=$1', [empty.id])
	expect((await close(empty.id)).status).toBe(200)
	const review = await start('Concurrent decisions'),
		row = (await items(review.id))[0]
	const results = await Promise.all([decide(review.id, row), decide(review.id, row)])
	expect(
		results.map(/** Compare committed and conflicted outcomes. */ (result) => result.status).sort(),
	).toEqual([200, 409])
	expect(
		(
			await admin.query(
				"SELECT id FROM hcm.audit_event WHERE target_id=$1 AND action='review.decided'",
				[row.id],
			)
		).rows,
	).toHaveLength(1)
})
