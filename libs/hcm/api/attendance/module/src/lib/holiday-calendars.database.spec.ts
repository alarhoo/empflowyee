import { afterAll, beforeAll, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Client } from 'pg'
import type { HcmPage } from '@empflowyee/hcm-runtime-contract'
import type { HolidayDraft, HolidayVersionView } from '@empflowyee/hcm-attendance-contract'
import { HcmAttendanceModule } from './hcm-api-attendance-module'
import { startHcmTestApi, type HcmTestApi } from './attendance-test-harness'

const base = 'attendance/holiday-calendars'
const tenant = 'local-dunder-mifflin'
let api: HcmTestApi
/** Supply explicit calendar content only for isolated integration testing. */
function draft(code: string): HolidayDraft {
	return {
		code,
		name: 'Holiday ' + code,
		effectiveFrom: '2026-01-01',
		entries: [
			{
				date: '2025-12-31',
				observedDate: '2026-01-02',
				category: 'Substitute',
				name: 'Explicit observed date',
				priority: 5,
			},
		],
	}
}
/** Create a real authorized draft and fail at the first unexpected transport response. */
async function create(code: string): Promise<HolidayVersionView> {
	const result = await api.send<HolidayVersionView>('david', 'POST', base, draft(code))
	expect(result.status).toBe(201)
	return result.body
}
/** Project editable business fields without replaying server identity or lifecycle metadata. */
function editable(value: HolidayVersionView): HolidayDraft {
	const { id, versionId, versionNumber, revision, state, ...body } = value
	void [id, versionId, versionNumber, revision, state]
	return body
}

beforeAll(
	/** Compose real Nest/SQL and explicit test-only holiday grants without changing canonical seed policy. */ async () => {
		api = await startHcmTestApi(HcmAttendanceModule)
		await api.admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		for (const operation of ['draft', 'read']) {
			const permission = 'hcm.attendance.holiday-calendars.' + operation
			await api.admin.query(
				"INSERT INTO hcm.access_permission(tenant_id,code,description,kind) VALUES($1,$2,'Holiday API test','business-operation') ON CONFLICT DO NOTHING",
				[tenant, permission],
			)
			await api.admin.query(
				"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'tenant-administrator',$2) ON CONFLICT DO NOTHING",
				[tenant, permission],
			)
		}
		await api.admin.query('BEGIN')
		try {
			await api.admin.query("SELECT set_config('hcm.tenant_id','holiday-http-foreign',true)")
			await api.admin.query(
				"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES('holiday-http-foreign','holiday-http-foreign','Other tenant','active')",
			)
			await api.admin.query(
				"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES('holiday-http-foreign','foreign-person','Other','Actor','Other Actor')",
			)
			await api.admin.query(
				"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES('holiday-http-foreign','foreign-actor','foreign-person','other@example.test')",
			)
			await api.admin.query(
				"INSERT INTO hcm.holiday_calendar(tenant_id,id,code,created_by_account_id) VALUES('holiday-http-foreign','foreign-calendar','FOREIGN_ONLY','foreign-actor')",
			)
			await api.admin.query(
				"INSERT INTO hcm.holiday_calendar_version(tenant_id,id,calendar_id,version_number,name,effective_from,created_by_account_id) VALUES('holiday-http-foreign','foreign-version','foreign-calendar',1,'Private calendar','2026-01-01','foreign-actor')",
			)
			await api.admin.query('COMMIT')
		} catch (error) {
			await api.admin.query('ROLLBACK')
			throw error
		}
	},
)
afterAll(
	/** Close only the real module and connections created by this suite. */ async () => {
		await api?.close()
	},
)

it('serves exact calendar draft/version routes without exposing source metadata or inventing publication', /** Route/root/revision mapping, replay and content replacement use the real database. */ async () => {
	const empty = await api.send<HcmPage<HolidayVersionView>>('david', 'GET', base)
	expect(empty.body).toEqual({ items: [], nextCursor: null })
	expect(empty.cache).toBe('no-store')
	const key = randomUUID(),
		input = draft('CALENDAR_API')
	const created = await api.send<HolidayVersionView>('david', 'POST', base, input, {
		'idempotency-key': key,
	})
	expect(created.status).toBe(201)
	expect((await api.send('david', 'POST', base, input, { 'idempotency-key': key })).body).toEqual(
		created.body,
	)
	const path = `${base}/${created.body.id}/versions/${created.body.versionId}`
	expect((await api.send('david', 'GET', path)).body).toEqual(created.body)
	const edited = await api.send<HolidayVersionView>('david', 'PATCH', path, {
		...input,
		name: 'Changed',
		expectedRevision: 1,
	})
	expect(edited.status).toBe(200)
	expect(edited.body.revision).toBe(2)
	expect((await api.send('david', 'PATCH', path, { ...input, expectedRevision: 1 })).status).toBe(
		409,
	)
	expect(
		(
			await api.send('david', 'POST', `${base}/${created.body.id}/versions`, {
				sourceVersionId: created.body.versionId,
				expectedRevision: 2,
				reason: 'Cannot version a draft',
			})
		).status,
	).toBe(409)
	await api.admin.query(
		"UPDATE hcm.holiday_calendar_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id='dunder-mifflin/account/david',publication_digest=repeat('a',64) WHERE tenant_id=$1 AND id=$2",
		[tenant, created.body.versionId],
	)
	const successor = await api.send<HolidayVersionView>(
		'david',
		'POST',
		`${base}/${created.body.id}/versions`,
		{
			sourceVersionId: created.body.versionId,
			expectedRevision: 3,
			reason: 'Private successor reason',
		},
	)
	expect(successor.status).toBe(201)
	expect(successor.body).toMatchObject({ state: 'Draft', versionNumber: 2, revision: 1 })
	expect(JSON.stringify(successor.body)).not.toMatch(
		/Private successor reason|tenantId|createdBy|publicationDigest/,
	)
	expect(
		(
			await api.send<HcmPage<HolidayVersionView>>(
				'david',
				'GET',
				`${base}?id=${created.body.id}&state=Published`,
			)
		).body.items,
	).toEqual([])
	expect((await api.send('david', 'POST', path + '/publish', {})).status).toBe(400)
})

it('binds literal filtered pagination to current actor, source, grant and exact query parameters', /** Opaque handles cannot be changed, mixed with other filters or reused after a source mutation. */ async () => {
	await create('PAGE_A')
	await create('PAGE_B')
	await create('PAGE_C')
	const query = `${base}?code=PAGE_&limit=1&sort=name:desc`
	const first = await api.send<HcmPage<HolidayVersionView>>('david', 'GET', query)
	expect(first.status).toBe(200)
	expect(first.body.items.map(/** Compare server ordering. */ (v) => v.code)).toEqual(['PAGE_C'])
	expect(first.body.nextCursor).toMatch(/^[A-Za-z0-9_-]{43}$/)
	const next = `${query}&cursor=${first.body.nextCursor}`
	const second = await api.send<HcmPage<HolidayVersionView>>('david', 'GET', next)
	expect(second.body.items[0].code).toBe('PAGE_B')
	for (const changed of [
		next.replace('PAGE_', 'PAGE_A'),
		next.replace('limit=1', 'limit=2'),
		next.replace('name:desc', 'code:asc'),
		query + '&cursor=' + 'A'.repeat(43),
	])
		expect((await api.send('david', 'GET', changed)).status).toBe(400)
	expect((await api.send('toby', 'GET', next)).status).toBe(403)
	await api.admin.query(
		"DELETE FROM hcm.role_permission WHERE tenant_id=$1 AND role_id='tenant-administrator' AND permission_code='hcm.attendance.holiday-calendars.read'",
		[tenant],
	)
	try {
		expect((await api.send('david', 'GET', next)).status).toBe(403)
	} finally {
		await api.admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'tenant-administrator','hcm.attendance.holiday-calendars.read')",
			[tenant],
		)
	}
	const row = first.body.items[0]
	await api.send('david', 'PATCH', `${base}/${row.id}/versions/${row.versionId}`, {
		...editable(row),
		expectedRevision: row.revision,
		name: 'Source changed',
	})
	expect((await api.send('david', 'GET', next)).status).toBe(400)
	expect(
		(await api.send<HcmPage<HolidayVersionView>>('david', 'GET', `${base}?name=%25`)).body.items,
	).toEqual([])
})

it('rejects unsupported selectors, malformed content, origin/key violations and foreign versions', /** Direct HTTP cannot bypass current source authority or the closed query/command grammar. */ async () => {
	const row = await create('BOUNDARY_API'),
		path = `${base}/${row.id}/versions/${row.versionId}`
	for (const suffix of ['?tenantId=other', '?limit=101', '?sort=entries', '?sort=code&sort=name'])
		expect((await api.send('david', 'GET', base + suffix)).status).toBe(400)
	expect((await api.send('david', 'GET', path + '?version=' + row.versionId)).status).toBe(400)
	expect(
		(
			await api.send('david', 'PATCH', path + '?version=' + row.versionId, {
				...draft('BOUNDARY_API'),
				expectedRevision: 1,
			})
		).status,
	).toBe(400)
	expect(
		(
			await api.send('david', 'POST', base, draft('BAD_ORIGIN'), {
				origin: 'https://other.example',
			})
		).status,
	).toBe(403)
	expect(
		(await api.send('david', 'POST', base, draft('BAD_KEY'), { 'idempotency-key': 'bad' })).status,
	).toBe(400)
	expect((await api.send('toby', 'POST', base, draft('DENIED'))).status).toBe(403)
	const invalid = draft('BAD_DATE')
	delete (invalid.entries[0] as Partial<HolidayDraft['entries'][number]>).observedDate
	const result = await api.send('david', 'POST', base, invalid)
	expect(result.status).toBe(400)
	expect(JSON.stringify(result.body)).toContain('observedDate')
	expect(
		(await api.send('david', 'GET', `${base}/foreign-calendar/versions/foreign-version`)).status,
	).toBe(404)
	expect(
		(await api.send<HcmPage<HolidayVersionView>>('david', 'GET', base + '?code=FOREIGN_ONLY')).body
			.items,
	).toEqual([])
	expect(
		(
			await api.send('david', 'PATCH', `${base}/foreign-calendar/versions/foreign-version`, {
				...draft('FOREIGN_ONLY'),
				expectedRevision: 1,
			})
		).status,
	).toBe(404)
})

it('retains RLS, typed cursor references, expiry and denied runtime updates', /** A valid tenant/actor still cannot point calendar continuation at an unrelated or foreign root. */ async () => {
	const runtime = process.env['HCM_TEST_RUNTIME']
	if (!runtime) throw new Error('Disposable database required')
	const client = new Client({ connectionString: runtime })
	await client.connect()
	try {
		await client.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		expect(
			(await client.query("SELECT id FROM hcm.holiday_calendar WHERE id='foreign-calendar'")).rows,
		).toEqual([])
		await expect(
			client.query(
				"INSERT INTO hcm.attendance_query_cursor(tenant_id,token_digest,actor_account_id,app_code,binding_digest,last_sort_value,last_id,expires_at) VALUES($1,repeat('b',64),'dunder-mifflin/account/david','HOLIDAY_CALENDARS',repeat('a',64),'FOREIGN_ONLY','foreign-calendar',clock_timestamp()+interval '1 minute')",
				[tenant],
			),
		).rejects.toMatchObject({ code: '23503' })
		await expect(
			client.query(
				"UPDATE hcm.attendance_query_cursor SET last_sort_value='changed' WHERE tenant_id=$1",
				[tenant],
			),
		).rejects.toMatchObject({ code: '42501' })
		const page = await api.send<HcmPage<HolidayVersionView>>('david', 'GET', base + '?limit=1')
		await api.admin.query(
			"UPDATE hcm.attendance_query_cursor SET expires_at=clock_timestamp()-interval '1 minute',created_at=clock_timestamp()-interval '2 minutes' WHERE tenant_id=$1",
			[tenant],
		)
		expect(
			(await api.send('david', 'GET', base + '?limit=1&cursor=' + page.body.nextCursor)).status,
		).toBe(400)
	} finally {
		await client.end()
	}
})

it('upgrades existing schedule cursor rows while keeping their insert shape compatible', /** The exact forward SQL must derive typed references for existing rows and reject a mismatched calendar family. */ async () => {
	const calendar = await create('UPGRADE_ROOT')
	await api.admin.query('BEGIN')
	try {
		await api.admin.query('DELETE FROM hcm.attendance_query_cursor WHERE tenant_id=$1', [tenant])
		await api.admin.query(
			'ALTER TABLE hcm.attendance_query_cursor DROP COLUMN work_schedule_id, DROP COLUMN holiday_calendar_id, DROP CONSTRAINT attendance_query_cursor_app_code_check',
		)
		await api.admin.query(
			"ALTER TABLE hcm.attendance_query_cursor ADD CONSTRAINT attendance_query_cursor_app_code_check CHECK(app_code IN ('WORK_SCHEDULE_TEMPLATES','WORK_SCHEDULES')), ADD CONSTRAINT attendance_query_cursor_tenant_id_last_id_fkey FOREIGN KEY(tenant_id,last_id) REFERENCES hcm.work_schedule(tenant_id,id)",
		)
		await api.admin.query(
			"INSERT INTO hcm.work_schedule(tenant_id,id,code,is_template,created_by_account_id) VALUES($1,'cursor-old-schedule','CURSOR_UPGRADE',true,'dunder-mifflin/account/david')",
			[tenant],
		)
		await api.admin.query(
			"INSERT INTO hcm.attendance_query_cursor(tenant_id,token_digest,actor_account_id,app_code,binding_digest,last_sort_value,last_id,expires_at) VALUES($1,repeat('d',64),'dunder-mifflin/account/david','WORK_SCHEDULE_TEMPLATES',repeat('a',64),'CURSOR_UPGRADE','cursor-old-schedule',clock_timestamp()+interval '1 minute')",
			[tenant],
		)
		await api.admin.query(
			await readFile(
				'libs/hcm/api/database/migrations/sql/000043_attendance_calendar_cursors.sql',
				'utf8',
			),
		)
		expect(
			(
				await api.admin.query(
					'SELECT work_schedule_id AS "scheduleId",holiday_calendar_id AS "calendarId" FROM hcm.attendance_query_cursor WHERE tenant_id=$1',
					[tenant],
				)
			).rows,
		).toEqual([{ scheduleId: 'cursor-old-schedule', calendarId: null }])
		await api.admin.query(
			"INSERT INTO hcm.attendance_query_cursor(tenant_id,token_digest,actor_account_id,app_code,binding_digest,last_sort_value,last_id,expires_at) VALUES($1,repeat('e',64),'dunder-mifflin/account/david','HOLIDAY_CALENDARS',repeat('a',64),'UPGRADE_ROOT',$2,clock_timestamp()+interval '1 minute')",
			[tenant, calendar.id],
		)
		await api.admin.query('SAVEPOINT invalid_family')
		await expect(
			api.admin.query(
				"INSERT INTO hcm.attendance_query_cursor(tenant_id,token_digest,actor_account_id,app_code,binding_digest,last_sort_value,last_id,expires_at) VALUES($1,repeat('f',64),'dunder-mifflin/account/david','HOLIDAY_CALENDARS',repeat('a',64),'CURSOR_UPGRADE','cursor-old-schedule',clock_timestamp()+interval '1 minute')",
				[tenant],
			),
		).rejects.toMatchObject({ code: '23503' })
		await api.admin.query('ROLLBACK TO SAVEPOINT invalid_family')
	} finally {
		await api.admin.query('ROLLBACK')
	}
})
