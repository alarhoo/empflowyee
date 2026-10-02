import { afterAll, beforeAll, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { Client } from 'pg'
import { HcmTenantDatabase } from '@empflowyee/hcm-api-database-kysely'
import type { WorkloadAuditTables } from '@empflowyee/hcm-api-audit-infrastructure'
import { HcmWorkloadIssuer, type HcmWorkloadContext } from '@empflowyee/hcm-api-runtime-application'
import {
	HcmRuntimeStore,
	HcmDurableWorkStore,
	HcmTransactionalWorkerLane,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import {
	KyselyHolidayPreviewHandler,
	KyselyAttendanceResolveHandler,
	KyselyAttendanceConfigurationInputBinder,
	KyselyScheduleRepository,
} from '@empflowyee/hcm-api-attendance-infrastructure'
import { KyselyWorkforceTimeContextBinder } from '@empflowyee/hcm-api-workforce-foundation-infrastructure'
import type { HolidayVersionView, HolidayPreviewView } from '@empflowyee/hcm-attendance-contract'
import type { HolidayAssignmentResult } from '@empflowyee/hcm-attendance-contract'
import { HcmAttendanceModule } from './hcm-api-attendance-module'
import {
	startHcmTestApi,
	HCM_TEST_TENANT as tenant,
	type HcmTestApi,
} from './attendance-test-harness'

let api: HcmTestApi,
	database: HcmTenantDatabase<WorkloadAuditTables>,
	directory: HcmRuntimeStore,
	context: HcmWorkloadContext,
	lane: HcmTransactionalWorkerLane<WorkloadAuditTables>
const base = 'attendance/holiday-calendars'
const employmentId = 'dunder-mifflin/employment/jim'

/** Publish a real bounded assignment-test calendar through the approved worker review. */
async function assignmentCalendar(from: string, to: string): Promise<HolidayVersionView> {
	const created = await api.send<HolidayVersionView>('david', 'POST', base, {
		code: 'A_' + randomUUID().slice(0, 8).toUpperCase(),
		name: 'Assignment test',
		effectiveFrom: from,
		effectiveTo: to,
		entries: [],
	})
	expect(created.status).toBe(201)
	const preview = await review(created.body)
	expect(preview.state).toBe('Ready')
	const published = await api.send<HolidayVersionView>(
		'david',
		'POST',
		path(created.body) + '/publish',
		{
			expectedRevision: created.body.revision,
			previewId: preview.previewId,
			digest: preview.digest,
			reason: 'Review assignment calendar',
		},
	)
	expect(published.status).toBe(200)
	return published.body
}

it('assigns and supersedes exact dated coverage atomically with replay and independent authorization', /** SQL exclusions and expected revisions protect both the predecessor and immutable source. */ async () => {
	const source = await assignmentCalendar('2027-02-01', '2027-02-28')
	const command = {
		versionId: source.versionId,
		expectedRevision: source.revision,
		employmentId,
		effectiveFrom: '2027-02-01',
		effectiveTo: '2027-02-28',
		resolutionFrom: '2027-02-01',
		resolutionTo: '2027-02-02',
		reason: 'Assign the explicit calendar',
	}
	const route = 'attendance/holiday-calendar-assignments',
		key = randomUUID()
	expect((await api.send('jim', 'POST', route, command)).status).toBe(403)
	expect((await api.send('david', 'POST', route, { ...command, expectedRevision: 1 })).status).toBe(
		409,
	)
	const assigned = await api.send<HolidayAssignmentResult>('david', 'POST', route, command, {
		'idempotency-key': key,
	})
	expect(assigned.status).toBe(201)
	expect(assigned.body).toMatchObject({
		versionId: source.versionId,
		revision: 1,
		target: { kind: 'Employment', id: employmentId },
		queuedWorkdays: 0,
		unavailableWorkdays: 2,
	})
	expect(
		(await api.send('david', 'POST', route, command, { 'idempotency-key': key })).body,
	).toEqual(assigned.body)
	expect(
		(
			await api.send(
				'david',
				'POST',
				route,
				{ ...command, reason: 'Altered' },
				{ 'idempotency-key': key },
			)
		).status,
	).toBe(409)
	expect((await api.send('david', 'POST', route, command)).status).toBe(409)
	const successor = {
		...command,
		effectiveFrom: '2027-02-15',
		resolutionFrom: '2027-02-15',
		resolutionTo: '2027-02-16',
		supersedes: { id: assigned.body.id, expectedRevision: 99 },
	}
	expect((await api.send('david', 'POST', route, successor)).status).toBe(409)
	const changed = await api.send<HolidayAssignmentResult>('david', 'POST', route, {
		...successor,
		supersedes: { id: assigned.body.id, expectedRevision: 1 },
	})
	expect(changed.status).toBe(201)
	expect(
		(
			await api.admin.query(
				'SELECT effective_to::text AS "effectiveTo",revision FROM hcm.holiday_calendar_assignment WHERE id=$1',
				[assigned.body.id],
			)
		).rows,
	).toEqual([{ effectiveTo: '2027-02-14', revision: 2 }])
	expect((await api.send('david', 'GET', path(source))).body).toMatchObject({
		state: 'Published',
		revision: 2,
		entries: [],
	})
	expect(
		(
			await api.admin.query(
				"SELECT count(*)::int AS count FROM hcm.attendance_command_receipt WHERE operation='Holidays.assign' AND holiday_calendar_version_id=$1",
				[source.versionId],
			)
		).rows[0].count,
	).toBe(2)
	const bad = {
		...successor,
		effectiveFrom: '2027-02-20',
		resolutionFrom: '2027-02-20',
		resolutionTo: '2027-02-21',
		supersedes: { id: changed.body.id, expectedRevision: 1 },
		effectiveTo: '2027-03-01',
	}
	expect((await api.send('david', 'POST', route, bad)).status).toBe(400)
	expect(
		(
			await api.admin.query(
				'SELECT effective_to::text AS "effectiveTo",revision FROM hcm.holiday_calendar_assignment WHERE id=$1',
				[changed.body.id],
			)
		).rows[0],
	).toEqual({ effectiveTo: '2027-02-28', revision: 1 })
})

it('produces exact accepted workday intents and materializes them through the real worker', /** Explicit test-only schedule and policy fixtures isolate the new production assignment producer. */ async () => {
	const actor = 'dunder-mifflin/account/david'
	await database.workloadTransaction(
		context,
		'AttendanceResolve',
		/** Arrange real immutable prerequisite inputs only inside the disposable test database. */ async (
			transaction,
		) => {
			const schedules = new KyselyScheduleRepository(
				transaction as unknown as Kysely<unknown>,
				tenant,
				actor,
			)
			await schedules.createOwner('assignment-schedule', 'ASSIGNMENT_SCHEDULE', false)
			await schedules.insertVersion({
				id: 'assignment-schedule-v1',
				ownerId: 'assignment-schedule',
				versionNumber: 1,
				copiedFromId: null,
				supersedesId: null,
				draft: {
					code: 'ASSIGNMENT_SCHEDULE',
					name: 'Explicit workweek',
					isTemplate: false,
					effectiveFrom: '2028-01-01',
					effectiveTo: '2028-12-31',
					timezoneMode: 'Employment',
					weekStartsOn: 1,
					days: [1, 2, 3, 4, 5, 6, 7].map(
						/** Keep working and rest days explicit in the fixture. */ (weekday) => ({
							weekday,
							kind: weekday < 6 ? 'Work' : 'Rest',
							segments:
								weekday < 6
									? [{ kind: 'Work', startTime: '09:00', endTime: '17:00', endDayOffset: 0 }]
									: [],
						}),
					),
				},
			})
			await schedules.publish('assignment-schedule', 'assignment-schedule-v1', 1, 'a'.repeat(64))
			await sql`INSERT INTO hcm.work_schedule_assignment(tenant_id,id,version_id,scope_kind,employment_id,effective_from,effective_to,created_by_account_id) VALUES(${tenant},'assignment-schedule-link','assignment-schedule-v1','Employment',${employmentId},'2028-01-01','2028-12-31',${actor})`.execute(
				transaction,
			)
			await sql`INSERT INTO hcm.attendance_policy(tenant_id,id,code,created_by_account_id) VALUES(${tenant},'assignment-policy','ASSIGNMENT_POLICY',${actor})`.execute(
				transaction,
			)
			await sql`INSERT INTO hcm.attendance_policy_version(tenant_id,id,policy_id,version_number,name,effective_from,effective_to,grace_in_minutes,grace_out_minutes,rounding,overtime_enabled,created_by_account_id) VALUES(${tenant},'assignment-policy-v1','assignment-policy',1,'Explicit inactive rules','2028-01-01','2028-12-31',0,0,'None',false,${actor})`.execute(
				transaction,
			)
			await sql`UPDATE hcm.attendance_policy_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id=${actor},publication_digest=repeat('a',64) WHERE tenant_id=${tenant} AND id='assignment-policy-v1'`.execute(
				transaction,
			)
			await sql`INSERT INTO hcm.attendance_policy_assignment(tenant_id,id,version_id,scope_kind,employment_id,effective_from,effective_to,created_by_account_id) VALUES(${tenant},'assignment-policy-link','assignment-policy-v1','Employment',${employmentId},'2028-01-01','2028-12-31',${actor})`.execute(
				transaction,
			)
		},
	)
	const source = await assignmentCalendar('2028-03-01', '2028-03-05')
	const result = await api.send<HolidayAssignmentResult>(
		'david',
		'POST',
		'attendance/holiday-calendar-assignments',
		{
			versionId: source.versionId,
			expectedRevision: source.revision,
			employmentId,
			effectiveFrom: '2028-03-01',
			effectiveTo: '2028-03-05',
			resolutionFrom: '2028-03-03',
			resolutionTo: '2028-03-05',
			reason: 'Resolve explicit working and rest dates',
		},
	)
	expect(result.status).toBe(201)
	expect(result.body).toMatchObject({ queuedWorkdays: 3, unavailableWorkdays: 0 })
	for (let index = 0; index < 3; index++) {
		const work = await lane.claim(context)
		if (!work) throw new Error('Assignment did not admit expected resolution work')
		expect(work.kind).toBe('attendance.workday.resolve')
		await lane.complete(context, work)
	}
	expect(
		(
			await api.admin.query(
				'SELECT work_date::text AS "workDate" FROM hcm.published_workday WHERE employment_id=$1 ORDER BY work_date',
				[employmentId],
			)
		).rows,
	).toEqual([{ workDate: '2028-03-03' }, { workDate: '2028-03-04' }, { workDate: '2028-03-05' }])
	expect(
		(
			await api.admin.query(
				'SELECT state,result_code AS "resultCode" FROM hcm.attendance_workday_resolution_receipt ORDER BY outbox_id',
			)
		).rows,
	).toEqual(
		Array.from(
			{ length: 3 },
			/** Every queued workday must have actual successful worker evidence. */ () => ({
				state: 'Available',
				resultCode: 'Resolved',
			}),
		),
	)
	const read = await api.send<HolidayAssignmentResult>(
		'david',
		'GET',
		'attendance/holiday-calendar-assignments?kind=Employment&id=' +
			encodeURIComponent(employmentId) +
			'&asOf=2028-03-03',
	)
	expect(read.status).toBe(200)
	expect(read.body).toMatchObject({
		id: result.body.id,
		calendarName: 'Assignment test',
		effectiveFrom: '2028-03-01',
	})
	expect(
		(
			await api.send(
				'jim',
				'GET',
				'attendance/holiday-calendar-assignments?kind=Employment&id=' +
					encodeURIComponent(employmentId) +
					'&asOf=2028-03-03',
			)
		).status,
	).toBe(403)
})

/** Create a real calendar through its source API; test fixture values never enter production defaults. */
async function calendar(
	date = '2026-10-05',
	entries: unknown[] = [
		{ date, observedDate: date, category: 'Company', name: 'Explicit day', priority: 1 },
	],
): Promise<HolidayVersionView> {
	const response = await api.send<HolidayVersionView>('david', 'POST', base, {
		code: 'C_' + randomUUID().slice(0, 8).toUpperCase(),
		name: 'Publication test',
		effectiveFrom: date,
		effectiveTo: date,
		entries,
	})
	expect(response.status).toBe(201)
	return response.body
}
/** Encode the exact root/version path used by browser clients. */
function path(source: HolidayVersionView): string {
	return `${base}/${source.id}/versions/${source.versionId}`
}

/** Reuse one explicit test context without inferring it in production. */
function previewCommand(source: HolidayVersionView) {
	return {
		expectedRevision: source.revision,
		effectiveFrom: source.effectiveFrom,
		effectiveTo: source.effectiveFrom,
		employmentId,
		timezone: 'America/New_York',
	}
}

it('authorizes one exact employment scope and rejects broader, foreign and revoked assignment commands', /** Scope selection and a prior receipt never manufacture current authority. */ async () => {
	const source = await assignmentCalendar('2029-01-01', '2029-01-10')
	const role = 'holiday-scoped-operator',
		account = 'dunder-mifflin/account/jim',
		grant = 'holiday-scoped-grant'
	await api.admin.query('INSERT INTO hcm.access_role(tenant_id,id,label) VALUES($1,$2,$2)', [
		tenant,
		role,
	])
	await api.admin.query(
		"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,$2,'hcm.attendance.holiday-calendars.manage'),($1,$2,'hcm.attendance.holiday-calendars.read')",
		[tenant, role],
	)
	await api.admin.query(
		'INSERT INTO hcm.account_role(tenant_id,account_id,role_id,grant_id) VALUES($1,$2,$3,$4)',
		[tenant, account, role, grant],
	)
	await api.admin.query(
		"INSERT INTO hcm.account_role_scope(tenant_id,id,grant_id,scope_kind,employment_id) VALUES($1,'holiday-scope',$2,'Employment',$3)",
		[tenant, grant, employmentId],
	)
	const route = 'attendance/holiday-calendar-assignments',
		key = randomUUID()
	const command = {
		versionId: source.versionId,
		expectedRevision: source.revision,
		employmentId,
		effectiveFrom: '2029-01-01',
		effectiveTo: '2029-01-10',
		resolutionFrom: '2029-01-01',
		resolutionTo: '2029-01-01',
		reason: 'Authorized exact employment',
	}
	try {
		const { employmentId: ignored, ...broad } = command
		void ignored
		expect((await api.send('jim', 'POST', route, { ...broad, tenantScope: true })).status).toBe(403)
		expect(
			(
				await api.send('jim', 'POST', route, {
					...command,
					employmentId: 'dunder-mifflin/employment/pam',
				})
			).status,
		).toBe(403)
		expect(
			(await api.send('jim', 'POST', route, { ...command, employmentId: 'foreign-employment' }))
				.status,
		).toBe(403)
		const assigned = await api.send<HolidayAssignmentResult>('jim', 'POST', route, command, {
			'idempotency-key': key,
		})
		expect(assigned.status).toBe(201)
		const query = '?kind=Employment&id=' + encodeURIComponent(employmentId) + '&asOf=2029-01-05'
		expect((await api.send('jim', 'GET', route + query)).body).toMatchObject({
			id: assigned.body.id,
		})
		expect((await api.send('jim', 'GET', route + query + '&kind=Tenant')).status).toBe(400)
		await api.admin.query(
			"DELETE FROM hcm.role_permission WHERE role_id=$1 AND permission_code='hcm.attendance.holiday-calendars.manage'",
			[role],
		)
		expect((await api.send('jim', 'POST', route, command, { 'idempotency-key': key })).status).toBe(
			403,
		)
	} finally {
		await api.admin.query('DELETE FROM hcm.account_role_scope WHERE grant_id=$1', [grant])
		await api.admin.query('DELETE FROM hcm.account_role WHERE grant_id=$1', [grant])
		await api.admin.query('DELETE FROM hcm.role_permission WHERE role_id=$1', [role])
		await api.admin.query('DELETE FROM hcm.access_role WHERE id=$1', [role])
	}
})

it('rejects assignment DST conflicts in the actual target timezone and rolls back all effects', /** Prior publication in another valid context does not waive dated assignment validation. */ async () => {
	const date = '2027-03-28'
	const draft = await calendar(date, [
		{
			date,
			observedDate: date,
			category: 'Company',
			name: 'Partial interval',
			priority: 1,
			startTime: '01:30',
			endTime: '02:30',
		},
	])
	const preview = await review(draft)
	expect(preview.state).toBe('Ready')
	const source = await api.send<HolidayVersionView>('david', 'POST', path(draft) + '/publish', {
		expectedRevision: draft.revision,
		previewId: preview.previewId,
		digest: preview.digest,
		reason: 'Valid explicit New York context',
	})
	expect(source.status).toBe(200)
	const location = 'dunder-mifflin/location/scranton'
	const original = (
		await api.admin.query('SELECT timezone FROM hcm.location WHERE id=$1', [location])
	).rows[0].timezone
	await api.admin.query(
		"UPDATE hcm.location SET timezone='Europe/London',revision=revision+1 WHERE id=$1",
		[location],
	)
	try {
		const result = await api.send('david', 'POST', 'attendance/holiday-calendar-assignments', {
			versionId: source.body.versionId,
			expectedRevision: source.body.revision,
			employmentId,
			effectiveFrom: date,
			effectiveTo: date,
			resolutionFrom: date,
			resolutionTo: date,
			reason: 'Must reject nonexistent London endpoint',
		})
		expect(result.status).toBe(409)
		expect(
			(
				await api.admin.query(
					'SELECT count(*)::int AS count FROM hcm.holiday_calendar_assignment WHERE version_id=$1',
					[source.body.versionId],
				)
			).rows[0].count,
		).toBe(0)
		expect(
			(
				await api.admin.query(
					"SELECT count(*)::int AS count FROM hcm.attendance_command_receipt WHERE operation='Holidays.assign' AND holiday_calendar_version_id=$1",
					[source.body.versionId],
				)
			).rows[0].count,
		).toBe(0)
	} finally {
		await api.admin.query('UPDATE hcm.location SET timezone=$1,revision=revision+1 WHERE id=$2', [
			original,
			location,
		])
	}
})

it('provides minimal calendar-authorized reference choices without granting employee changes', /** Picker authorization is independent of unrelated HR operations and projections exclude private facts. */ async () => {
	const workers = await api.send<{
		items: { id: string; code: string; name: string }[]
		hasMore: boolean
	}>('david', 'GET', base + '/references/workers?q=Jim&asOf=2026-10-05')
	expect(workers.status).toBe(200)
	expect(workers.body.items).toContainEqual({
		id: 'dunder-mifflin/worker/jim',
		name: 'Jim Halpert',
		code: expect.any(String),
	})
	for (const option of workers.body.items)
		expect(Object.keys(option).sort()).toEqual(['code', 'id', 'name'])
	const employments = await api.send<{
		employments: { employmentId: string; legalEntityName: string | null }[]
	}>(
		'david',
		'GET',
		base +
			'/references/workers/' +
			encodeURIComponent('dunder-mifflin/worker/jim') +
			'/employments?asOf=2026-10-05',
	)
	expect(employments.status).toBe(200)
	expect(
		employments.body.employments.some(
			/** Retain Jim's exact employment without an implicit primary selection. */ (item) =>
				item.employmentId === employmentId,
		),
	).toBe(true)
	for (const option of employments.body.employments)
		expect(Object.keys(option).sort()).toEqual(['employmentId', 'legalEntityName'])
	expect(
		(await api.send('toby', 'GET', base + '/references/workers?q=Jim&asOf=2026-10-05')).status,
	).toBe(403)
	expect(
		(await api.send('david', 'GET', base + '/references/workers?q=Jim&q=Other&asOf=2026-10-05'))
			.status,
	).toBe(400)
	expect((await api.send('david', 'GET', base + '/references/locations?asOf=invalid')).status).toBe(
		400,
	)
	expect(
		(
			await api.send(
				'david',
				'GET',
				base + '/references/workers/unknown/employments?asOf=2026-10-05',
			)
		).status,
	).toBe(404)
	expect(
		(await api.send('david', 'GET', base + '/references/locations?q=Scranton&asOf=2026-10-05'))
			.status,
	).toBe(200)
})
/** Admit a preview through HTTP, execute its leased durable work, and read the actual completion. */
async function review(
	source: HolidayVersionView,
	timezone = 'America/New_York',
): Promise<HolidayPreviewView> {
	const response = await api.send<HolidayPreviewView>('david', 'POST', path(source) + '/preview', {
		expectedRevision: source.revision,
		effectiveFrom: source.effectiveFrom,
		effectiveTo: source.effectiveTo,
		employmentId,
		timezone,
	})
	expect(response.status).toBe(202)
	expect(response.body.state).toBe('Running')
	const work = await lane.claim(context)
	if (!work) throw new Error('Preview producer did not enqueue durable work')
	await lane.complete(context, work)
	const completed = await api.send<HolidayPreviewView>(
		'david',
		'GET',
		path(source) + '/previews/' + response.body.previewId,
	)
	expect(completed.status).toBe(200)
	return completed.body
}

beforeAll(
	/** Run only against the harness-owned disposable PostgreSQL database. */ async () => {
		api = await startHcmTestApi(HcmAttendanceModule)
		const connectionString = process.env['HCM_TEST_RUNTIME']
		if (!connectionString) throw new Error('Disposable database required')
		database = new HcmTenantDatabase({ connectionString, maxConnections: 3 })
		directory = new HcmRuntimeStore(connectionString)
		context = await new HcmWorkloadIssuer(directory, ['AttendanceResolve']).issue(
			tenant,
			'AttendanceResolve',
			randomUUID(),
			600000,
		)
		lane = new HcmTransactionalWorkerLane(
			'AttendanceResolve',
			new HcmDurableWorkStore(database, { leaseMilliseconds: 60000, maximumAttempts: 3 }),
			[
				new KyselyHolidayPreviewHandler(new KyselyWorkforceTimeContextBinder()),
				new KyselyAttendanceResolveHandler(
					new KyselyAttendanceConfigurationInputBinder(new KyselyWorkforceTimeContextBinder()),
				),
			],
		)
	},
	60000,
)
afterAll(
	/** Release only this suite's database pools and loopback server. */ async () => {
		await database?.destroy()
		await directory?.onApplicationShutdown()
		await api?.close()
	},
)

it('requires explicit context and publishes only after durable validation, replaying one committed result', /** Preview, publication and private evidence share real SQL and source authority. */ async () => {
	const source = await calendar()
	expect(
		(
			await api.send('david', 'POST', path(source) + '/preview', {
				expectedRevision: 1,
				effectiveFrom: source.effectiveFrom,
			})
		).status,
	).toBe(400)
	const preview = await review(source)
	expect(preview).toMatchObject({
		state: 'Ready',
		conflicts: 0,
		lockedImpact: false,
		affectedEmploymentCount: 1,
		affectedWorkdayCount: 1,
	})
	const body = {
			expectedRevision: 1,
			previewId: preview.previewId,
			digest: preview.digest,
			reason: 'Reviewed explicit local calendar',
		},
		key = randomUUID()
	const published = await api.send<HolidayVersionView>(
		'david',
		'POST',
		path(source) + '/publish',
		body,
		{ 'idempotency-key': key },
	)
	expect(published.status).toBe(200)
	expect(published.body).toMatchObject({ state: 'Published', revision: 2, entries: source.entries })
	expect(
		(await api.send('david', 'POST', path(source) + '/publish', body, { 'idempotency-key': key }))
			.body,
	).toEqual(published.body)
	expect(
		(
			await api.send(
				'david',
				'POST',
				path(source) + '/publish',
				{ ...body, reason: 'Changed' },
				{ 'idempotency-key': key },
			)
		).status,
	).toBe(409)
	const retired = await api.send<HolidayVersionView>('david', 'POST', path(source) + '/retire', {
		expectedRevision: 2,
		reason: 'End future selection',
	})
	expect(retired.status).toBe(200)
	expect(retired.body.state).toBe('Retired')
	expect(retired.body.entries).toEqual(source.entries)
})

it('rejects timezone mismatch, DST gaps, ambiguous offsets and equal-priority overlap', /** Timezone-dependent checks execute in the real worker rather than a successful preview stub. */ async () => {
	expect(await review(await calendar(), 'UTC')).toMatchObject({
		state: 'Failed',
		failureCode: 'TimezoneContextChanged',
	})
	const gap = '2026-03-08',
		overlap = '2026-11-01'
	expect(
		await review(
			await calendar(gap, [
				{
					date: gap,
					observedDate: gap,
					category: 'Company',
					name: 'Gap',
					priority: 1,
					startTime: '02:10',
					endTime: '03:20',
				},
			]),
		),
	).toMatchObject({ state: 'Failed', failureCode: 'DstGap' })
	expect(
		await review(
			await calendar(overlap, [
				{
					date: overlap,
					observedDate: overlap,
					category: 'Company',
					name: 'Overlap',
					priority: 1,
					startTime: '01:10',
					endTime: '02:20',
				},
			]),
		),
	).toMatchObject({ state: 'Failed', failureCode: 'DstOverlap' })
	expect(
		await review(
			await calendar(overlap, [
				{
					date: overlap,
					observedDate: overlap,
					category: 'Company',
					name: 'Resolved overlap',
					priority: 1,
					startTime: '01:10',
					endTime: '02:20',
					overlapOffset: { start: 'Later' },
				},
			]),
		),
	).toMatchObject({ state: 'Ready', conflicts: 0 })
	const day = '2026-10-05',
		entry = { date: day, observedDate: day, category: 'Company', name: 'Collision', priority: 1 }
	expect(await review(await calendar(day, [entry, { ...entry, name: 'Other' }]))).toMatchObject({
		state: 'Failed',
		failureCode: 'HolidayPriorityCollision',
	})
})

it('rechecks Workforce facts, exact source revisions and independent read/publish authority', /** A completed worker result never creates future authority or freezes stale mutable inputs. */ async () => {
	const source = await calendar(),
		preview = await review(source)
	await api.admin.query(
		'UPDATE hcm.location SET revision=revision+1 WHERE tenant_id=$1 AND id=$2',
		[tenant, 'dunder-mifflin/location/scranton'],
	)
	expect(
		(
			await api.send('david', 'POST', path(source) + '/publish', {
				expectedRevision: 1,
				previewId: preview.previewId,
				digest: preview.digest,
				reason: 'Stale location review',
			})
		).status,
	).toBe(409)
	expect(
		(await api.send('toby', 'GET', path(source) + '/previews/' + preview.previewId)).status,
	).toBe(403)
	expect(
		(
			await api.send('toby', 'POST', path(source) + '/publish', {
				expectedRevision: 1,
				previewId: preview.previewId,
				digest: preview.digest,
				reason: 'Unauthorized publication',
			})
		).status,
	).toBe(403)
	expect((await api.send('david', 'GET', path(source) + '/previews/' + randomUUID())).status).toBe(
		404,
	)
	expect(
		(
			await api.send(
				'david',
				'GET',
				path(source) + '/previews/' + preview.previewId + '?tenant=foreign',
			)
		).status,
	).toBe(400)
})

it('keeps admission idempotent and marks an edited pending source failed without publishing it', /** A source edit between enqueue and execution must invalidate worker evidence. */ async () => {
	const source = await calendar(),
		body = previewCommand(source),
		key = randomUUID()
	const first = await api.send<HolidayPreviewView>(
		'david',
		'POST',
		path(source) + '/preview',
		body,
		{ 'idempotency-key': key },
	)
	expect(first.status).toBe(202)
	expect(first.body.operationId).toBe(first.body.previewId)
	expect(first.body.statusUrl).toBe('/api/v1/' + path(source) + '/previews/' + first.body.previewId)
	expect(
		(await api.send('david', 'POST', path(source) + '/preview', body, { 'idempotency-key': key }))
			.body,
	).toEqual(first.body)
	expect(
		(
			await api.send(
				'david',
				'POST',
				path(source) + '/preview',
				{ ...body, timezone: 'UTC' },
				{ 'idempotency-key': key },
			)
		).status,
	).toBe(409)
	const { id, versionId, revision, versionNumber, state, ...draft } = source
	void [id, versionId, versionNumber, state]
	expect(
		(
			await api.send('david', 'PATCH', path(source), {
				...draft,
				name: 'Edited before worker execution',
				expectedRevision: revision,
			})
		).status,
	).toBe(200)
	const work = await lane.claim(context)
	if (!work) throw new Error('Admitted preview work missing')
	await lane.complete(context, work)
	expect(
		(await api.send('david', 'GET', path(source) + '/previews/' + first.body.previewId)).body,
	).toMatchObject({ state: 'Failed', failureCode: 'SourceChanged' })
	expect((await api.send('david', 'GET', path(source))).body).toMatchObject({
		state: 'Draft',
		revision: 2,
	})
	expect(
		(
			await api.admin.query(
				'SELECT count(*)::int AS count FROM hcm.attendance_outbox WHERE tenant_id=$1 AND business_key=$2',
				[tenant, first.body.previewId],
			)
		).rows[0].count,
	).toBe(1)
})

it('validates every declared holiday across years without turning the query window into a calendar lifespan limit', /** A bounded review still checks declared dates outside its selected view. */ async () => {
	const response = await api.send<HolidayVersionView>('david', 'POST', base, {
		code: 'MULTI_' + randomUUID().slice(0, 8).toUpperCase(),
		name: 'Multiple years',
		effectiveFrom: '2026-10-05',
		effectiveTo: '2028-01-01',
		entries: [
			{
				date: '2027-10-05',
				observedDate: '2027-10-05',
				name: 'Next year',
				category: 'Company',
				priority: 1,
			},
		],
	})
	expect(response.status).toBe(201)
	const source = response.body
	const pending = await api.send<HolidayPreviewView>(
		'david',
		'POST',
		path(source) + '/preview',
		previewCommand(source),
	)
	expect(pending.status).toBe(202)
	const work = await lane.claim(context)
	if (!work) throw new Error('Admitted preview work missing')
	await lane.complete(context, work)
	expect(
		(await api.send('david', 'GET', path(source) + '/previews/' + pending.body.previewId)).body,
	).toMatchObject({ state: 'Ready', affectedWorkdayCount: 2 })
})

it('protects explicit context with RLS, tenant-composite references and immutable runtime privileges', /** No tenant selector, pooled connection or direct context write may escape the database boundary. */ async () => {
	const source = await calendar(),
		preview = await review(source)
	const runtime = new Client({ connectionString: process.env['HCM_TEST_RUNTIME'] })
	await runtime.connect()
	try {
		expect(
			(await runtime.query('SELECT preview_id FROM hcm.holiday_publication_context')).rows,
		).toEqual([])
		await runtime.query("SELECT set_config('hcm.tenant_id','foreign-tenant',false)")
		expect(
			(
				await runtime.query(
					'SELECT preview_id FROM hcm.holiday_publication_context WHERE preview_id=$1',
					[preview.previewId],
				)
			).rows,
		).toEqual([])
		await expect(
			runtime.query(
				'INSERT INTO hcm.holiday_publication_context(tenant_id,preview_id,employment_id,timezone) VALUES($1,$2,$3,$4)',
				[tenant, randomUUID(), employmentId, 'America/New_York'],
			),
		).rejects.toMatchObject({ code: '23514' })
		await runtime.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		const unbound = randomUUID()
		await api.admin.query(
			"INSERT INTO hcm.time_configuration_impact_preview(tenant_id,id,actor_account_id,holiday_calendar_version_id,source_revision,source_digest,from_date,to_date,state,input_revisions,expires_at) SELECT tenant_id,$2,actor_account_id,holiday_calendar_version_id,source_revision,source_digest,from_date,to_date,'Running',input_revisions,clock_timestamp()+interval '15 minutes' FROM hcm.time_configuration_impact_preview WHERE tenant_id=$1 AND id=$3",
			[tenant, unbound, preview.previewId],
		)
		await expect(
			runtime.query(
				'INSERT INTO hcm.holiday_publication_context(tenant_id,preview_id,employment_id,timezone) VALUES($1,$2,$3,$4)',
				[tenant, unbound, 'foreign-employment', 'America/New_York'],
			),
		).rejects.toMatchObject({ code: '23503' })
		await expect(
			runtime.query('UPDATE hcm.holiday_publication_context SET timezone=$1 WHERE preview_id=$2', [
				'UTC',
				preview.previewId,
			]),
		).rejects.toMatchObject({ code: '42501' })
		await expect(
			runtime.query('DELETE FROM hcm.holiday_publication_context WHERE preview_id=$1', [
				preview.previewId,
			]),
		).rejects.toMatchObject({ code: '42501' })
	} finally {
		await runtime.end()
	}
	await database.workloadTransaction(
		context,
		'AttendanceResolve',
		/** Only the correctly issued tenant workload can read its saved context. */ async (
			transaction,
		) => {
			expect(
				(
					await sql<{
						count: number
					}>`SELECT count(*)::int AS count FROM hcm.holiday_publication_context WHERE preview_id=${preview.previewId}`.execute(
						transaction,
					)
				).rows[0].count,
			).toBe(1)
		},
	)
})
