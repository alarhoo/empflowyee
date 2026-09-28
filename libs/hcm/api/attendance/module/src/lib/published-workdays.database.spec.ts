import { afterAll, beforeAll, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { sql, type Transaction } from 'kysely'
import { HcmTenantDatabase } from '@empflowyee/hcm-api-database-kysely'
import { HcmWorkloadIssuer, type HcmWorkloadContext } from '@empflowyee/hcm-api-runtime-application'
import { HcmRuntimeStore } from '@empflowyee/hcm-api-runtime-infrastructure'
import {
	KyselyPublishedWorkdayWriter,
	KyselyScheduleRepository,
} from '@empflowyee/hcm-api-attendance-infrastructure'
import { resolveDatedWorkday, type PublishedHoliday } from '@empflowyee/hcm-api-attendance-domain'
import type { PublishedWorkdayInput } from '@empflowyee/hcm-api-attendance-application'
import type { ScheduleSegment } from '@empflowyee/hcm-attendance-contract'
import { HcmAttendanceModule } from './hcm-api-attendance-module'
import {
	startHcmTestApi,
	HCM_TEST_TENANT as tenant,
	type HcmTestApi,
} from './attendance-test-harness'

let api: HcmTestApi,
	database: HcmTenantDatabase<unknown>,
	directory: HcmRuntimeStore,
	issuer: HcmWorkloadIssuer,
	context: HcmWorkloadContext
const actor = 'dunder-mifflin/account/david',
	employment = 'dunder-mifflin/employment/jim'
const pattern: ScheduleSegment[] = [
	{ kind: 'Work', startTime: '23:00', endTime: '02:00', endDayOffset: 1 },
	{ kind: 'UnpaidBreak', startTime: '02:00', endTime: '02:30', endDayOffset: 1 },
	{ kind: 'Work', startTime: '02:30', endTime: '06:00', endDayOffset: 1 },
]
const holiday: PublishedHoliday = {
	id: 'workday-holiday',
	versionId: 'workday-calendar-v1',
	date: '2026-10-30',
	observedDate: '2026-11-01',
	category: 'Public',
	name: 'Explicit fold interval',
	priority: 2,
	startTime: '01:15:00.125',
	endTime: '01:45:00.375',
	overlapOffset: { start: 'Earlier', end: 'Later' },
}

/** Construct a real domain result from explicit test-only published inputs. */
function input(workDate = '2026-10-31', basis = 'a'): PublishedWorkdayInput {
	return {
		employmentId: employment,
		scheduleVersionId: 'workday-schedule-v1',
		policyVersionId: null,
		holidayCalendarVersionIds: ['workday-calendar-v1'],
		inputDigest: basis.repeat(64),
		previous: null,
		resolution: resolveDatedWorkday(
			workDate,
			'America/New_York',
			{ kind: 'Work', segments: pattern },
			{ regionCode: null, locationId: null },
			[holiday],
		),
	}
}
/** Execute an append in the real restricted workload transaction and wait for deferred SQL constraints to commit. */
async function append(value: PublishedWorkdayInput, workContext = context) {
	return database.workloadTransaction(
		workContext,
		'AttendanceResolve',
		/** The owning worker transaction supplies the trusted capability and commit boundary. */ (
			transaction,
		) => new KyselyPublishedWorkdayWriter(transaction, workContext).append(value),
	)
}
/** Count only the target employment/date after a failure without relying on an adapter's in-memory result. */
async function count(workDate: string): Promise<number> {
	return (
		await api.admin.query(
			'SELECT count(*)::int AS count FROM hcm.published_workday WHERE tenant_id=$1 AND employment_id=$2 AND work_date=$3',
			[tenant, employment, workDate],
		)
	).rows[0].count
}
/** Arrange immutable source fixtures directly; production schedule/holiday publication remains a separately tested command path. */
async function sources(transaction: Transaction<unknown>): Promise<void> {
	const schedules = new KyselyScheduleRepository(transaction, tenant, actor)
	for (const rest of [false, true]) {
		const id = rest ? 'workday-rest' : 'workday-schedule'
		await schedules.createOwner(id, id.replaceAll('-', '_').toUpperCase(), false)
		await schedules.insertVersion({
			id: id + '-v1',
			ownerId: id,
			versionNumber: 1,
			copiedFromId: null,
			supersedesId: null,
			draft: {
				code: id.replaceAll('-', '_').toUpperCase(),
				name: 'Workday input',
				isTemplate: false,
				effectiveFrom: '2026-01-01',
				effectiveTo: '2026-12-31',
				timezoneMode: 'Fixed',
				fixedZone: 'America/New_York',
				weekStartsOn: 1,
				days: [1, 2, 3, 4, 5, 6, 7].map(
					/** Use one explicit test-only pattern for each weekday. */ (weekday) => ({
						weekday,
						kind: rest ? 'Rest' : 'Work',
						segments: rest ? [] : pattern,
					}),
				),
			},
		})
		await schedules.publish(id, id + '-v1', 1, 'a'.repeat(64))
	}
	await sql`INSERT INTO hcm.holiday_calendar(tenant_id,id,code,created_by_account_id) VALUES(${tenant},'workday-calendar','WORKDAY_CALENDAR',${actor})`.execute(
		transaction,
	)
	await sql`INSERT INTO hcm.holiday_calendar_version(tenant_id,id,calendar_id,version_number,name,effective_from,effective_to,created_by_account_id) VALUES(${tenant},'workday-calendar-v1','workday-calendar',1,'Observed holiday','2026-01-01','2026-12-31',${actor})`.execute(
		transaction,
	)
	await sql`INSERT INTO hcm.holiday(tenant_id,id,version_id,ordinal,actual_date,observed_date,category,name,priority,start_time,end_time,start_overlap_choice,end_overlap_choice) VALUES(${tenant},${holiday.id},${holiday.versionId},1,${holiday.date}::date,${holiday.observedDate}::date,${holiday.category},${holiday.name},${holiday.priority},${holiday.startTime}::time,${holiday.endTime}::time,'Earlier','Later')`.execute(
		transaction,
	)
	await sql`UPDATE hcm.holiday_calendar_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id=${actor},publication_digest=repeat('a',64) WHERE tenant_id=${tenant} AND id='workday-calendar-v1'`.execute(
		transaction,
	)
}

beforeAll(
	/** Migrate/seed disposable PostgreSQL and issue the real tenant-bound workload context. */ async () => {
		api = await startHcmTestApi(HcmAttendanceModule)
		const connectionString = process.env['HCM_TEST_RUNTIME']
		if (!connectionString) throw new Error('Disposable database required')
		database = new HcmTenantDatabase({ connectionString, maxConnections: 3 })
		directory = new HcmRuntimeStore(connectionString)
		issuer = new HcmWorkloadIssuer(directory, ['AttendanceResolve', 'AttendanceCalculate'])
		context = await issuer.issue(tenant, 'AttendanceResolve', randomUUID(), 600000)
		await database.workloadTransaction(context, 'AttendanceResolve', sources)
		await api.admin.query('BEGIN')
		try {
			await api.admin.query("SELECT set_config('hcm.tenant_id','workday-foreign',true)")
			await api.admin.query(
				"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES('workday-foreign','workday-foreign','Foreign','active')",
			)
			await api.admin.query('COMMIT')
		} catch (error) {
			await api.admin.query('ROLLBACK')
			throw error
		}
	},
)
afterAll(
	/** Drain every adapter before removing the disposable database. */ async () => {
		await database?.destroy()
		await directory?.onApplicationShutdown()
		await api?.close()
	},
)

it('retains exact cross-midnight DST work, break and observed holiday evidence once under concurrent retry', /** A repeated local hour is preserved in UTC offsets and holiday subtraction never rounds fractional milliseconds. */ async () => {
	const value = input(),
		results = await Promise.all([append(value), append(value)])
	expect(results[0].id).toBe(results[1].id)
	expect(
		results.filter(
			/** Exactly one transaction performs the immutable append. */ (result) => !result.replayed,
		),
	).toHaveLength(1)
	expect(await count('2026-10-31')).toBe(1)
	const record = (
		await api.admin.query(
			'SELECT scheduled_work_milliseconds::text AS work,break_milliseconds::text AS breaks,expected_work_milliseconds::text AS expected,revision FROM hcm.published_workday WHERE tenant_id=$1 AND id=$2',
			[tenant, results[0].id],
		)
	).rows[0]
	expect(record).toEqual({ work: '27000000', breaks: '1800000', expected: '21599750', revision: 1 })
	const evidence = (
		await api.admin.query(
			"SELECT start_offset_seconds AS start,end_offset_seconds AS end,extract(epoch FROM(end_at-start_at))*1000 AS duration,holiday_id AS holiday FROM hcm.published_work_segment WHERE tenant_id=$1 AND workday_id=$2 AND kind='Holiday'",
			[tenant, results[0].id],
		)
	).rows[0]
	expect(evidence).toMatchObject({ start: -14400, end: -18000, holiday: holiday.id })
	expect(Number(evidence.duration)).toBe(5400250)
	const next = await append({
		...value,
		inputDigest: 'b'.repeat(64),
		previous: { id: results[0].id, revision: 1 },
	})
	expect(next.revision).toBe(2)
	expect(await count('2026-10-31')).toBe(2)
	expect(
		(
			await api.admin.query(
				'SELECT supersedes_id AS prior FROM hcm.published_workday WHERE tenant_id=$1 AND id=$2',
				[tenant, next.id],
			)
		).rows[0].prior,
	).toBe(results[0].id)
	await expect(
		append({ ...value, inputDigest: 'c'.repeat(64), previous: { id: results[0].id, revision: 1 } }),
	).rejects.toMatchObject({ code: '23514' })
	expect(await count('2026-10-31')).toBe(2)
})

it('rolls back incomplete totals, offset mismatches and missing typed holiday sources', /** Deferred aggregate constraints and immediate reference/offset guards protect the entire evidence graph. */ async () => {
	const wrongTotal = input('2026-09-01')
	wrongTotal.resolution.expectedWorkMilliseconds = '1'
	await expect(append(wrongTotal)).rejects.toMatchObject({ code: '23514' })
	expect(await count('2026-09-01')).toBe(0)
	const wrongOffset = input('2026-09-02')
	wrongOffset.resolution.scheduledSegments[0].startOffset = '+03:00'
	await expect(append(wrongOffset)).rejects.toMatchObject({ code: '23514' })
	expect(await count('2026-09-02')).toBe(0)
	const unboundHoliday = input('2026-11-01')
	unboundHoliday.holidayCalendarVersionIds = []
	await expect(append(unboundHoliday)).rejects.toMatchObject({ code: '23503' })
	expect(await count('2026-11-01')).toBe(0)
	const rows = await api.admin.query(
		'SELECT count(*)::int AS count FROM hcm.published_work_segment s LEFT JOIN hcm.published_workday d ON d.tenant_id=s.tenant_id AND d.id=s.workday_id WHERE s.tenant_id=$1 AND d.id IS NULL',
		[tenant],
	)
	expect(rows.rows[0].count).toBe(0)
})

it('blocks closed-period publication and denies post-commit mutation without conflating real Rest with unavailable', /** Only explicit configured rest can persist zero duration, and no child may be appended after commit. */ async () => {
	const rest: PublishedWorkdayInput = {
		...input('2026-08-01'),
		scheduleVersionId: 'workday-rest-v1',
		holidayCalendarVersionIds: [],
		resolution: resolveDatedWorkday(
			'2026-08-01',
			'America/New_York',
			{ kind: 'Rest', segments: [] },
			{ regionCode: null, locationId: null },
			[],
		),
	}
	const saved = await append(rest)
	expect(saved.revision).toBe(1)
	await expect(
		database.workloadTransaction(
			context,
			'AttendanceResolve',
			/** Try to add a late source to immutable evidence. */ (transaction) =>
				sql`INSERT INTO hcm.published_workday_holiday_source(tenant_id,workday_id,calendar_version_id) VALUES(${tenant},${saved.id},'workday-calendar-v1')`.execute(
					transaction,
				),
		),
	).rejects.toMatchObject({ code: '23514' })
	await expect(
		database.workloadTransaction(
			context,
			'AttendanceResolve',
			/** Runtime cannot rewrite the workday's input basis. */ (transaction) =>
				sql`UPDATE hcm.published_workday SET input_digest=repeat('f',64) WHERE tenant_id=${tenant} AND id=${saved.id}`.execute(
					transaction,
				),
		),
	).rejects.toMatchObject({ code: '42501' })
	await expect(
		database.workloadTransaction(
			context,
			'AttendanceResolve',
			/** Runtime cannot delete an immutable result and reuse its revision. */ (transaction) =>
				sql`DELETE FROM hcm.published_workday WHERE tenant_id=${tenant} AND id=${saved.id}`.execute(
					transaction,
				),
		),
	).rejects.toMatchObject({ code: '42501' })
	await api.admin.query(
		"INSERT INTO hcm.attendance_period(tenant_id,id,month_start) VALUES($1,'workday-closing','2026-07-01')",
		[tenant],
	)
	await api.admin.query(
		"UPDATE hcm.attendance_period SET state='Open',revision=revision+1 WHERE tenant_id=$1 AND id='workday-closing'",
		[tenant],
	)
	await api.admin.query(
		"UPDATE hcm.attendance_period SET state='Closing',revision=revision+1 WHERE tenant_id=$1 AND id='workday-closing'",
		[tenant],
	)
	await expect(append(input('2026-07-01'))).rejects.toMatchObject({ code: '23514' })
	expect(await count('2026-07-01')).toBe(0)
})

it('requires an opaque AttendanceResolve capability and retains foreign tenant RLS', /** Serialized/copied capabilities and another workload cannot invoke source publication. */ async () => {
	await expect(append(input('2026-09-03'), { ...context })).rejects.toMatchObject({
		code: 'unauthenticated',
	})
	const other = await issuer.issue(tenant, 'AttendanceCalculate', randomUUID())
	await expect(append(input('2026-09-03'), other)).rejects.toMatchObject({ code: 'forbidden' })
	const foreign = await issuer.issue('workday-foreign', 'AttendanceResolve', randomUUID())
	await expect(append(input('2026-09-03'), foreign)).rejects.toMatchObject({ code: '23514' })
	await database.workloadTransaction(
		foreign,
		'AttendanceResolve',
		/** Query known local evidence under the real foreign workload scope. */ async (
			transaction,
		) => {
			expect(
				(
					await sql`SELECT id FROM hcm.published_workday WHERE employment_id=${employment}`.execute(
						transaction,
					)
				).rows,
			).toEqual([])
		},
	)
	expect(await count('2026-09-03')).toBe(0)
})
