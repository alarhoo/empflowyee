import { afterAll, beforeAll, expect, it } from 'vitest'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { resolve } from 'node:path'
import { runDevelopmentSeeds } from '@empflowyee/hcm-api-database-seed'
import { loadSqlMigrations } from '@empflowyee/hcm-api-database-migrations'
import type { HcmPage } from '@empflowyee/hcm-runtime-contract'
import type {
	ScheduleDraft,
	ScheduleSegment,
	ScheduleVersionView,
	ConfigurationPreviewView,
	ScheduleSeedDefaults,
} from '@empflowyee/hcm-attendance-contract'
import { HcmAttendanceModule } from './hcm-api-attendance-module'
import { startHcmTestApi, HCM_TEST_TENANT, type HcmTestApi } from './attendance-test-harness'

let api: HcmTestApi
const base = 'attendance/schedule-templates'

/** An explicit test pattern; no production seed placement or zone is inferred from this fixture. */
function pattern(code: string, name = 'Test pattern'): ScheduleDraft {
	const segments: ScheduleSegment[] = [
		{ startTime: '09:00', endTime: '12:00', endDayOffset: 0, kind: 'Work' },
		{ startTime: '12:00', endTime: '13:00', endDayOffset: 0, kind: 'UnpaidBreak' },
		{ startTime: '13:00', endTime: '18:00', endDayOffset: 0, kind: 'Work' },
	]
	return {
		code,
		name,
		isTemplate: true,
		effectiveFrom: '2026-01-01',
		timezoneMode: 'Fixed',
		fixedZone: 'America/New_York',
		weekStartsOn: 1,
		days: Array.from(
			{ length: 7 },
			/** Declare weekly rest and one explicit work envelope. */ (_, index) => ({
				weekday: index + 1,
				kind: index < 5 ? 'Work' : 'Rest',
				segments: index < 5 ? structuredClone(segments) : [],
			}),
		),
	}
}

beforeAll(
	/** Start real Nest routing over migrated PostgreSQL and persisted authenticated development personas. */ async () => {
		api = await startHcmTestApi(HcmAttendanceModule)
		await api.admin.query('BEGIN')
		try {
			await api.admin.query("SELECT set_config('hcm.tenant_id','foreign-query-tenant',true)")
			await api.admin.query(
				"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES('foreign-query-tenant','foreign-query-tenant','Other tenant','active')",
			)
			await api.admin.query(
				"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES('foreign-query-tenant','foreign-person','Other','Actor','Other Actor')",
			)
			await api.admin.query(
				"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES('foreign-query-tenant','foreign-actor','foreign-person','other@example.test')",
			)
			await api.admin.query(
				"INSERT INTO hcm.work_schedule(tenant_id,id,code,is_template,created_by_account_id) VALUES('foreign-query-tenant','foreign-template','FOREIGN_ONLY',true,'foreign-actor')",
			)
			await api.admin.query(
				"INSERT INTO hcm.work_schedule_version(tenant_id,id,schedule_id,version_number,name,effective_from,timezone_mode,fixed_zone,week_starts_on,created_by_account_id) VALUES('foreign-query-tenant','foreign-version','foreign-template',1,'Private foreign pattern','2026-01-01','Fixed','UTC',1,'foreign-actor')",
			)
			await api.admin.query('COMMIT')
		} catch (error) {
			await api.admin.query('ROLLBACK')
			throw error
		}
	},
)

afterAll(
	/** Close real connections and discard the test-only in-memory key. */ async () => {
		await api?.close()
	},
)

it('reads canonical draft defaults without manufacturing placement, zone or live configuration', /** Real database defaults and explicit seeded operation grants survive idempotent reseeding. */ async () => {
	const result = await api.send<ScheduleSeedDefaults>('david', 'GET', base + '/defaults')
	expect(result.status).toBe(200)
	expect(result.body).toMatchObject({
		state: 'DraftDefaults',
		code: 'STANDARD_WEEK',
		revision: 1,
		weekStartsOn: 1,
	})
	expect(result.body.days).toHaveLength(7)
	for (let index = 0; index < 7; index++) {
		if (index < 5)
			expect(result.body.days[index]).toEqual({
				weekday: index + 1,
				kind: 'Work',
				startTime: '09:00:00',
				endTime: '18:00:00',
				endDayOffset: 0,
				unpaidBreakMinutes: 60,
			})
		else
			expect(result.body.days[index]).toEqual({
				weekday: index + 1,
				kind: 'Rest',
				unpaidBreakMinutes: 0,
			})
	}
	expect(JSON.stringify(result.body)).not.toMatch(
		/timezone|fixedZone|effectiveFrom|elapsedMilliseconds|segments/,
	)
	expect((await api.send('toby', 'GET', base + '/defaults')).status).toBe(403)
	expect((await api.send('david', 'GET', base + '/defaults?tenantId=foreign')).status).toBe(400)
	expect((await api.send('david', 'POST', base, result.body)).status).toBe(400)
	expect(
		(
			await api.send(
				'david',
				'POST',
				`${base}/${encodeURIComponent(result.body.id)}/preview?version=${encodeURIComponent(result.body.id)}`,
				{ expectedRevision: 1, effectiveFrom: '2026-01-01' },
			)
		).status,
	).toBe(404)
	const connection = process.env['HCM_TEST_MIGRATOR']
	if (!connection) throw new Error('Disposable database required')
	expect(
		await runDevelopmentSeeds({
			env: {
				APP_ENVIRONMENT: 'local',
				NODE_ENV: 'test',
				HCM_SEED_TARGET: HCM_TEST_TENANT,
				HCM_SEED_DATABASE_URL: connection,
			},
			manifestDirectory: resolve('libs/hcm/api/database/seed/manifest'),
			migrations: await loadSqlMigrations(resolve('libs/hcm/api/database/migrations/sql')),
		}),
	).toEqual([])
	expect((await api.send<ScheduleSeedDefaults>('david', 'GET', base + '/defaults')).body).toEqual(
		result.body,
	)
	expect(
		(
			await api.admin.query('SELECT id FROM hcm.work_schedule WHERE tenant_id=$1', [
				HCM_TEST_TENANT,
			])
		).rows,
	).toEqual([])
})

it('serves exact versioned template lifecycle routes with safe public projections', /** Real HTTP create/edit/preview/publish/copy/version/retire commands preserve their admitted statuses and source history. */ async () => {
	const empty = await api.send<HcmPage<ScheduleVersionView>>('david', 'GET', base)
	expect(empty.status).toBe(200)
	expect(empty.cache).toBe('no-store')
	expect(empty.body).toEqual({ items: [], nextCursor: null })
	const input = pattern('API_TEMPLATE')
	const created = await api.send<ScheduleVersionView>('david', 'POST', base, input)
	expect(created.status).toBe(201)
	expect(created.body).toMatchObject({ code: input.code, revision: 1, state: 'Draft' })
	const source = created.body
	const route = `${base}/${source.id}`
	const version = `?version=${source.versionId}`
	expect((await api.send('david', 'PATCH', route, { ...input, expectedRevision: 1 })).status).toBe(
		400,
	)
	const updated = await api.send<ScheduleVersionView>('david', 'PATCH', route + version, {
		...input,
		name: 'Edited pattern',
		expectedRevision: 1,
	})
	expect(updated.status).toBe(200)
	expect(updated.body.revision).toBe(2)
	expect(
		(await api.send('david', 'PATCH', route + version, { ...input, expectedRevision: 1 })).status,
	).toBe(409)
	const preview = await api.send<ConfigurationPreviewView>(
		'david',
		'POST',
		route + '/preview' + version,
		{ expectedRevision: 2, effectiveFrom: '2026-01-01' },
	)
	expect(preview.status).toBe(200)
	expect(preview.body.affectedEmploymentCount).toBe(0)
	const publish = {
		expectedRevision: 2,
		previewId: preview.body.previewId,
		digest: preview.body.digest,
		reason: 'Private review reason',
	}
	const key = randomUUID()
	expect(
		(
			await api.send('david', 'POST', route + '/publish' + version, publish, {
				'idempotency-key': key,
			})
		).status,
	).toBe(200)
	expect(
		(
			await api.send('david', 'POST', route + '/publish' + version, publish, {
				'idempotency-key': key,
			})
		).status,
	).toBe(200)
	const copy = await api.send<ScheduleVersionView>('david', 'POST', route + '/copy', {
		sourceVersionId: source.versionId,
		expectedRevision: 3,
		code: 'API_COPY',
		name: 'Independent',
		reason: 'Private copy reason',
	})
	expect(copy.status).toBe(201)
	expect(copy.body).toMatchObject({
		isTemplate: false,
		copiedFromVersionId: source.versionId,
		state: 'Draft',
	})
	expect((await api.send('david', 'GET', `${base}/${copy.body.id}`)).status).toBe(404)
	const next = await api.send<ScheduleVersionView>('david', 'POST', route + '/versions', {
		sourceVersionId: source.versionId,
		expectedRevision: 3,
		reason: 'Private successor reason',
	})
	expect(next.status).toBe(201)
	expect(next.body).toMatchObject({ versionNumber: 2, state: 'Draft' })
	expect((await api.send<ScheduleVersionView>('david', 'GET', route)).body.versionId).toBe(
		next.body.versionId,
	)
	expect((await api.send<ScheduleVersionView>('david', 'GET', route + version)).body.state).toBe(
		'Published',
	)
	expect(
		(
			await api.send<HcmPage<ScheduleVersionView>>(
				'david',
				'GET',
				`${base}?id=${source.id}&state=Published`,
			)
		).body.items,
	).toEqual([])
	expect(
		(
			await api.send('david', 'POST', route + '/retire' + version, {
				expectedRevision: 3,
				reason: 'Private retirement reason',
			})
		).status,
	).toBe(200)
	const detail = await api.send<ScheduleVersionView>('david', 'GET', route + version)
	expect(detail.body.state).toBe('Retired')
	expect(JSON.stringify(detail.body)).not.toMatch(
		/Private|tenant_id|account_id|publication_digest|encrypted_reason/,
	)
	expect((await api.send('david', 'DELETE', route)).status).toBe(404)
})

it('paginates latest versions with server-owned handles bound to query, source and current authority', /** Equal sort values, forged handles, changed queries, actor changes and a source edit cannot silently skip or expose rows. */ async () => {
	for (const code of ['PAGE_A', 'PAGE_B', 'PAGE_C'])
		expect((await api.send('david', 'POST', base, pattern(code, 'Same name'))).status).toBe(201)
	const query = '?code=PAGE_&sort=name:asc&limit=1'
	const first = await api.send<HcmPage<ScheduleVersionView>>('david', 'GET', base + query)
	expect(first.status).toBe(200)
	expect(first.body.items).toHaveLength(1)
	const cursor = first.body.nextCursor
	expect(cursor).toMatch(/^[A-Za-z0-9_-]{43}$/)
	const second = await api.send<HcmPage<ScheduleVersionView>>(
		'david',
		'GET',
		`${base}${query}&cursor=${cursor}`,
	)
	expect(second.status).toBe(200)
	const third = await api.send<HcmPage<ScheduleVersionView>>(
		'david',
		'GET',
		`${base}${query}&cursor=${second.body.nextCursor}`,
	)
	expect(third.status).toBe(200)
	expect(third.body.nextCursor).toBeNull()
	expect(
		new Set(
			[...first.body.items, ...second.body.items, ...third.body.items].map(
				/** Compare opaque row identity across tied sort values. */ (row) => row.id,
			),
		).size,
	).toBe(3)
	for (const altered of [
		`?code=PAGE_&sort=name:desc&limit=1&cursor=${cursor}`,
		`?code=PAGE_&sort=name:asc&limit=2&cursor=${cursor}`,
		`?code=API&sort=name:asc&limit=1&cursor=${cursor}`,
		`${query}&cursor=${'x'.repeat(43)}`,
	])
		expect((await api.send('david', 'GET', base + altered)).status).toBe(400)
	expect(
		(await api.send<HcmPage<ScheduleVersionView>>('david', 'GET', base + '?name=%25')).body.items,
	).toEqual([])
	await api.admin.query(
		"INSERT INTO hcm.account_role(tenant_id,account_id,role_id,grant_id) VALUES($1,'dunder-mifflin/account/toby','tenant-administrator','api-cursor-grant')",
		[HCM_TEST_TENANT],
	)
	try {
		expect((await api.send('toby', 'GET', `${base}${query}&cursor=${cursor}`)).status).toBe(400)
	} finally {
		await api.admin.query(
			"DELETE FROM hcm.account_role WHERE tenant_id=$1 AND grant_id='api-cursor-grant'",
			[HCM_TEST_TENANT],
		)
	}
	const permission = 'hcm.attendance.work-schedule-templates.read'
	await api.admin.query(
		"DELETE FROM hcm.role_permission WHERE tenant_id=$1 AND role_id='tenant-administrator' AND permission_code=$2",
		[HCM_TEST_TENANT, permission],
	)
	try {
		expect((await api.send('david', 'GET', `${base}${query}&cursor=${cursor}`)).status).toBe(403)
	} finally {
		await api.admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'tenant-administrator',$2)",
			[HCM_TEST_TENANT, permission],
		)
	}
	const row = first.body.items[0]
	expect(
		(
			await api.send('david', 'PATCH', `${base}/${row.id}?version=${row.versionId}`, {
				...pattern(row.code),
				name: 'Changed',
				expectedRevision: row.revision,
			})
		).status,
	).toBe(200)
	expect((await api.send('david', 'GET', `${base}${query}&cursor=${cursor}`)).status).toBe(400)
})

it('rejects expired handles and removes expired cache rows without granting UPDATE', /** Cursor expiry is checked by PostgreSQL and cleanup remains independent of business mutation. */ async () => {
	const query = '?code=PAGE_&limit=1'
	const first = await api.send<HcmPage<ScheduleVersionView>>('david', 'GET', base + query)
	expect(first.status).toBe(200)
	const token = first.body.nextCursor
	if (!token) throw new Error('Continuation fixture required')
	const digest = createHash('sha256').update(token).digest('hex')
	const expiredToken = randomBytes(32).toString('base64url')
	const expiredDigest = createHash('sha256').update(expiredToken).digest('hex')
	await api.admin.query(
		"INSERT INTO hcm.attendance_query_cursor(tenant_id,token_digest,actor_account_id,app_code,binding_digest,last_sort_value,last_id,created_at,expires_at) SELECT tenant_id,$3,actor_account_id,app_code,binding_digest,last_sort_value,last_id,now()-interval '30 minutes',now()-interval '15 minutes' FROM hcm.attendance_query_cursor WHERE tenant_id=$1 AND token_digest=$2",
		[HCM_TEST_TENANT, digest, expiredDigest],
	)
	expect((await api.send('david', 'GET', `${base}${query}&cursor=${expiredToken}`)).status).toBe(
		400,
	)
	expect((await api.send('david', 'GET', base + query)).status).toBe(200)
	expect(
		(
			await api.admin.query(
				'SELECT token_digest FROM hcm.attendance_query_cursor WHERE tenant_id=$1 AND token_digest=$2',
				[HCM_TEST_TENANT, expiredDigest],
			)
		).rows,
	).toEqual([])
	expect(
		(
			await api.admin.query(
				'SELECT token_digest FROM hcm.attendance_query_cursor WHERE tenant_id=$1 AND token_digest=$2',
				[HCM_TEST_TENANT, token],
			)
		).rows,
	).toEqual([])
})

it('protects cursor storage with RLS and never exposes or stores bearer handles as authority', /** Restricted pooled SQL cannot inspect another tenant cache or update an immutable continuation. */ async () => {
	const runtime = process.env['HCM_TEST_RUNTIME']
	if (!runtime) throw new Error('Disposable database required')
	const client = new Client({ connectionString: runtime })
	await client.connect()
	try {
		await client.query("SELECT set_config('hcm.tenant_id','foreign-query-tenant',false)")
		expect((await client.query('SELECT id FROM hcm.work_schedule_seed_default')).rows).toEqual([])
		expect((await client.query('SELECT weekday FROM hcm.work_schedule_seed_day')).rows).toEqual([])
		expect(
			(await client.query('SELECT token_digest FROM hcm.attendance_query_cursor')).rows,
		).toEqual([])
		await expect(
			client.query(
				"INSERT INTO hcm.attendance_query_cursor(tenant_id,token_digest,actor_account_id,app_code,binding_digest,last_sort_value,last_id,expires_at) VALUES($1,repeat('a',64),'dunder-mifflin/account/david','WORK_SCHEDULE_TEMPLATES',repeat('b',64),'foreign','foreign-template',clock_timestamp()+interval '10 minutes')",
				[HCM_TEST_TENANT],
			),
		).rejects.toMatchObject({ code: '42501' })
		await client.query("SELECT set_config('hcm.tenant_id',$1,false)", [HCM_TEST_TENANT])
		expect((await client.query('SELECT id FROM hcm.work_schedule_seed_default')).rows).toHaveLength(
			1,
		)
		expect(
			(await client.query('SELECT weekday FROM hcm.work_schedule_seed_day')).rows,
		).toHaveLength(7)
		await expect(
			client.query('UPDATE hcm.work_schedule_seed_default SET revision=revision+1'),
		).rejects.toMatchObject({ code: '42501' })
		await expect(
			client.query('UPDATE hcm.work_schedule_seed_day SET unpaid_break_minutes=0'),
		).rejects.toMatchObject({ code: '42501' })
		expect(
			(await client.query('SELECT token_digest FROM hcm.attendance_query_cursor')).rows.length,
		).toBeGreaterThan(0)
		await expect(
			client.query(
				"INSERT INTO hcm.attendance_query_cursor(tenant_id,token_digest,actor_account_id,app_code,binding_digest,last_sort_value,last_id,expires_at) VALUES($1,repeat('c',64),'foreign-actor','WORK_SCHEDULE_TEMPLATES',repeat('b',64),'foreign','foreign-template',clock_timestamp()+interval '10 minutes')",
				[HCM_TEST_TENANT],
			),
		).rejects.toMatchObject({ code: '23503' })
		await expect(
			client.query("UPDATE hcm.attendance_query_cursor SET last_sort_value='forged'"),
		).rejects.toMatchObject({ code: '42501' })
	} finally {
		await client.end()
	}
})

it('rejects unauthorized, foreign-tenant and malformed HTTP commands without SQL detail', /** Browser origin/media/key protections remain enforced with exact-version mutation queries. */ async () => {
	expect((await api.send('toby', 'GET', base)).status).toBe(403)
	expect((await api.send('jim', 'POST', base, pattern('DENIED'))).status).toBe(403)
	expect(
		(await api.send('david', 'GET', `${base}/foreign-template?version=foreign-version`)).status,
	).toBe(404)
	expect(
		(await api.send<HcmPage<ScheduleVersionView>>('david', 'GET', `${base}?id=foreign-template`))
			.body.items,
	).toEqual([])
	expect(
		(
			await api.send('david', 'POST', `${base}/foreign-template/preview?version=foreign-version`, {
				expectedRevision: 1,
				effectiveFrom: '2026-01-01',
			})
		).status,
	).toBe(404)
	expect(
		(
			await api.send('david', 'POST', base, pattern('ORIGIN'), {
				origin: 'https://untrusted.invalid',
			})
		).status,
	).toBe(403)
	expect(
		(await api.send('david', 'POST', base, pattern('MEDIA'), { 'content-type': 'text/plain' }))
			.status,
	).toBe(415)
	expect(
		(await api.send('david', 'POST', base, pattern('BADKEY'), { 'idempotency-key': 'invalid' }))
			.status,
	).toBe(400)
	for (const suffix of [
		'?limit=101',
		'?limit=1&limit=2',
		'?sort=description',
		'?tenantId=foreign',
		'?q=anything',
	])
		expect((await api.send('david', 'GET', base + suffix)).status).toBe(400)
	const missing = await api.send('david', 'GET', `${base}/${randomUUID()}`)
	expect(missing.status).toBe(404)
	expect(missing.body).toMatchObject({ code: 'not-found', requestId: expect.any(String) })
	expect(JSON.stringify(missing.body)).not.toMatch(/SELECT|hcm\.|stack|password/)
})

it('reports incomplete defaults honestly and refuses seed reset over real Attendance evidence', /** The seed loader rolls every reset effect back instead of erasing configurations or silently reseeding them. */ async () => {
	await api.admin.query('DELETE FROM hcm.work_schedule_seed_day WHERE tenant_id=$1 AND weekday=7', [
		HCM_TEST_TENANT,
	])
	try {
		const missing = await api.send('david', 'GET', base + '/defaults')
		expect(missing.status).toBe(409)
		expect(missing.body).toMatchObject({ code: 'record-incomplete' })
	} finally {
		await api.admin.query(
			"INSERT INTO hcm.work_schedule_seed_day(tenant_id,default_id,weekday,kind,unpaid_break_minutes) VALUES($1,'dunder-mifflin/attendance-default/standard-week',7,'Rest',0)",
			[HCM_TEST_TENANT],
		)
	}
	const before = (
		await api.admin.query('SELECT id FROM hcm.work_schedule WHERE tenant_id=$1 ORDER BY id', [
			HCM_TEST_TENANT,
		])
	).rows
	const connection = process.env['HCM_TEST_MIGRATOR']
	if (!connection) throw new Error('Disposable database required')
	await expect(
		runDevelopmentSeeds({
			env: {
				APP_ENVIRONMENT: 'local',
				NODE_ENV: 'test',
				HCM_SEED_TARGET: HCM_TEST_TENANT,
				HCM_SEED_DATABASE_URL: connection,
			},
			manifestDirectory: resolve('libs/hcm/api/database/seed/manifest'),
			migrations: await loadSqlMigrations(resolve('libs/hcm/api/database/migrations/sql')),
			mode: 'reset',
			resetConfirmation: HCM_TEST_TENANT,
		}),
	).rejects.toThrow('Attendance evidence exists')
	expect(
		(
			await api.admin.query('SELECT id FROM hcm.work_schedule WHERE tenant_id=$1 ORDER BY id', [
				HCM_TEST_TENANT,
			])
		).rows,
	).toEqual(before)
	expect((await api.send('david', 'GET', base + '/defaults')).status).toBe(200)
	expect(
		(await api.admin.query('SELECT module_id FROM hcm.development_seed_history')).rowCount,
	).toBe(30)
})
