import { afterAll, beforeAll, expect, it } from 'vitest'
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely'
import { Pool } from 'pg'
import type { AttendanceConfigurationInputPort } from '@empflowyee/hcm-api-attendance-application'
import {
	KyselyAttendanceConfigurationInputBinder,
	KyselyScheduleRepository,
} from '@empflowyee/hcm-api-attendance-infrastructure'
import { KyselyWorkforceTimeContextBinder } from '@empflowyee/hcm-api-workforce-foundation-infrastructure'
import { HcmAttendanceModule } from './hcm-api-attendance-module'
import {
	startHcmTestApi,
	HCM_TEST_TENANT as tenant,
	type HcmTestApi,
} from './attendance-test-harness'

let api: HcmTestApi, runtime: Kysely<unknown>
const actor = 'dunder-mifflin/account/david',
	employment = 'dunder-mifflin/employment/jim',
	date = '2026-09-28'
const binder = new KyselyAttendanceConfigurationInputBinder(new KyselyWorkforceTimeContextBinder())
class Rollback extends Error {}

/** Keep all scenario facts isolated while using the real restricted runtime role. */
async function scenario(
	work: (
		port: AttendanceConfigurationInputPort,
		transaction: Transaction<unknown>,
	) => Promise<void>,
): Promise<void> {
	try {
		await runtime.transaction().execute(
			/** Establish RLS and roll back the test-only configuration after assertions. */ async (
				transaction,
			) => {
				await sql`SELECT set_config('hcm.tenant_id',${tenant},true)`.execute(transaction)
				await work(binder.bind(transaction, tenant), transaction)
				throw new Rollback()
			},
		)
	} catch (error) {
		if (!(error instanceof Rollback)) throw error
	}
}

/** Arrange an explicit immutable calendar solely as an input-reader fixture; this is not an application publication path. */
async function calendar(transaction: Transaction<unknown>, id: string): Promise<void> {
	await sql`INSERT INTO hcm.holiday_calendar(tenant_id,id,code,created_by_account_id) VALUES(${tenant},${id},${id.toUpperCase()},${actor})`.execute(
		transaction,
	)
	await sql`INSERT INTO hcm.holiday_calendar_version(tenant_id,id,calendar_id,version_number,name,effective_from,effective_to,created_by_account_id) VALUES(${tenant},${id + '-v1'},${id},1,'Calendar','2026-01-01','2026-12-31',${actor})`.execute(
		transaction,
	)
	await sql`INSERT INTO hcm.holiday(tenant_id,id,version_id,ordinal,actual_date,observed_date,category,name,priority,start_time,end_time) VALUES(${tenant},${id + '-day'},${id + '-v1'},1,'2026-09-27','2026-09-28','Substitute','Explicit observed',4,'09:00:00.125','12:00:00.375')`.execute(
		transaction,
	)
	await sql`UPDATE hcm.holiday_calendar_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id=${actor},publication_digest=repeat('a',64) WHERE tenant_id=${tenant} AND id=${id + '-v1'}`.execute(
		transaction,
	)
}

/** Create a typed assignment fixture without exercising the still-pending assignment command API. */
async function assign(
	transaction: Transaction<unknown>,
	id: string,
	version: string,
	kind: 'Tenant' | 'Employment' | 'Location',
	target: string | null = null,
): Promise<void> {
	await sql`INSERT INTO hcm.holiday_calendar_assignment(tenant_id,id,version_id,scope_kind,employment_id,location_id,effective_from,effective_to,created_by_account_id) VALUES(${tenant},${id},${version},${kind},${kind === 'Employment' ? target : null},${kind === 'Location' ? target : null},'2026-01-01','2026-12-31',${actor})`.execute(
		transaction,
	)
}

beforeAll(
	/** Migrate/seed only the disposable test database and compose the actual Attendance Nest module. */ async () => {
		api = await startHcmTestApi(HcmAttendanceModule)
		const connectionString = process.env['HCM_TEST_RUNTIME']
		if (!connectionString) throw new Error('Disposable database required')
		runtime = new Kysely({
			dialect: new PostgresDialect({ pool: new Pool({ connectionString, max: 1 }) }),
		})
	},
)
afterAll(
	/** Close both real pools before the harness removes its disposable database. */ async () => {
		await runtime?.destroy()
		await api?.close()
	},
)

it('reports missing workforce and configuration without inventing an unscheduled workday', /** An unavailable source is different from a genuine published rest pattern. */ async () =>
	scenario(
		/** Resolve explicit missing inputs in an otherwise seeded tenant. */ async (port) => {
			expect(await port.read('Holiday', employment, date)).toEqual({
				state: 'Unavailable',
				family: 'Holiday',
				reason: 'MissingConfiguration',
			})
			expect(await port.read('Schedule', 'missing', date)).toMatchObject({
				state: 'Unavailable',
				reason: 'employment-unavailable',
			})
			expect(await port.read('Policy', employment, '1900-01-01')).toMatchObject({
				state: 'Unavailable',
				reason: 'outside-employment',
			})
			await expect(port.read('Holiday', employment, '2026-02-30')).rejects.toThrow()
			await expect(port.read('constructor' as 'Holiday', employment, date)).rejects.toThrow(
				'Unsupported',
			)
		},
	))

it('selects exact published holiday versions by employment and invalidates evidence when dependencies change', /** More-specific dated facts win; a newer Draft never silently replaces the assigned Published version. */ async () =>
	scenario(
		/** Arrange tenant and subject scope, then edit independent input revisions. */ async (
			port,
			transaction,
		) => {
			await calendar(transaction, 'tenant-calendar')
			await calendar(transaction, 'employee-calendar')
			await assign(transaction, 'tenant-assignment', 'tenant-calendar-v1', 'Tenant')
			await assign(
				transaction,
				'employee-assignment',
				'employee-calendar-v1',
				'Employment',
				employment,
			)
			const first = await port.read('Holiday', employment, date)
			expect(first).toMatchObject({
				state: 'Available',
				assignment: { id: 'employee-assignment' },
				version: {
					versionId: 'employee-calendar-v1',
					entries: [{ observedDate: date, startTime: '09:00:00.125' }],
				},
			})
			if (first.state !== 'Available') throw new Error('Expected assigned source')
			expect(JSON.stringify(first)).not.toMatch(
				/created_by|published_by|publication_digest|workEmail|displayName|encrypted_reason/,
			)
			expect(await port.read('Holiday', employment, date)).toEqual(first)
			await sql`INSERT INTO hcm.holiday_calendar_version(tenant_id,id,calendar_id,version_number,name,effective_from,created_by_account_id) VALUES(${tenant},'employee-calendar-v2','employee-calendar',2,'New Draft','2026-01-01',${actor})`.execute(
				transaction,
			)
			expect(await port.read('Holiday', employment, date)).toEqual(first)
			await sql`UPDATE hcm.location SET revision=revision+1,timezone='America/Chicago' WHERE tenant_id=${tenant} AND id=${first.workforce.assignments[0].locationId}`.execute(
				transaction,
			)
			const locationChanged = await port.read('Holiday', employment, date)
			if (locationChanged.state !== 'Available') throw new Error('Expected current workforce')
			expect(locationChanged.digest).not.toBe(first.digest)
			expect(locationChanged.version).toEqual(first.version)
			await sql`UPDATE hcm.holiday_calendar_assignment SET revision=revision+1,effective_to='2026-11-30' WHERE tenant_id=${tenant} AND id='employee-assignment'`.execute(
				transaction,
			)
			const assignmentChanged = await port.read('Holiday', employment, date)
			if (assignmentChanged.state !== 'Available') throw new Error('Expected covering assignment')
			expect(assignmentChanged.digest).not.toBe(locationChanged.digest)
			expect(await port.read('Holiday', employment, '2026-12-01')).toMatchObject({
				state: 'Available',
				assignment: { id: 'tenant-assignment' },
			})
			expect(await port.read('Holiday', 'dunder-mifflin/employment/dwight', date)).toMatchObject({
				state: 'Available',
				assignment: { id: 'tenant-assignment' },
			})
		},
	))

it('rejects equal precedence across two effective locations and keeps historical source content readable', /** No primary flag or insertion order breaks a configuration tie. Retired versions cannot supply new selection. */ async () =>
	scenario(
		/** Add two location scopes and retain exact source history after retirement. */ async (
			port,
			transaction,
		) => {
			const workforce = new KyselyWorkforceTimeContextBinder().bind(transaction, tenant)
			const basis = await workforce.read(employment, date)
			if (basis.state !== 'Available') throw new Error('Seed workforce unavailable')
			const location = basis.context.assignments[0].locationId
			await sql`INSERT INTO hcm.location(city,organisation_id,tenant_id,id,code,name,country_code,state_or_province,timezone) VALUES('Scranton','dunder-mifflin/organisation/company',${tenant},'second-time-location','TIME_LOC','Other location','US','PA','America/Chicago')`.execute(
				transaction,
			)
			await sql`INSERT INTO hcm.assignment(tenant_id,id,employment_id,organisation_id,location_id,job_title,work_mode,full_time_equivalent,is_primary_assignment,effective_from) VALUES(${tenant},'second-time-assignment',${employment},'dunder-mifflin/organisation/scranton','second-time-location','Test','Remote',0.2,false,'2026-01-01')`.execute(
				transaction,
			)
			await calendar(transaction, 'first-location-calendar')
			await calendar(transaction, 'second-location-calendar')
			await assign(
				transaction,
				'first-location-link',
				'first-location-calendar-v1',
				'Location',
				location,
			)
			await assign(
				transaction,
				'second-location-link',
				'second-location-calendar-v1',
				'Location',
				'second-time-location',
			)
			expect(await port.read('Holiday', employment, date)).toMatchObject({
				state: 'Unavailable',
				reason: 'EqualPrecedenceConflict',
			})
			await sql`UPDATE hcm.holiday_calendar_version SET state='Retired',revision=revision+1 WHERE tenant_id=${tenant} AND id='second-location-calendar-v1'`.execute(
				transaction,
			)
			expect(await port.read('Holiday', employment, date)).toMatchObject({
				state: 'Available',
				version: { versionId: 'first-location-calendar-v1' },
			})
			expect(
				(
					await sql<{
						count: number
					}>`SELECT count(*)::int AS count FROM hcm.holiday WHERE tenant_id=${tenant} AND version_id='second-location-calendar-v1'`.execute(
						transaction,
					)
				).rows[0].count,
			).toBe(1)
		},
	))

it('projects schedule and policy families and refuses foreign or ambient tenant bindings', /** All three adapters keep tenant RLS, exact version references and a legitimate Rest day distinct from unavailable. */ async () =>
	scenario(
		/** Store explicit published inputs and exercise the same port under wrong tenant contexts. */ async (
			port,
			transaction,
		) => {
			const schedules = new KyselyScheduleRepository(transaction, tenant, actor)
			await schedules.createOwner('input-schedule', 'INPUT_SCHEDULE', false)
			await schedules.insertVersion({
				id: 'input-schedule-v1',
				ownerId: 'input-schedule',
				versionNumber: 1,
				copiedFromId: null,
				supersedesId: null,
				draft: {
					code: 'INPUT_SCHEDULE',
					name: 'Explicit rest pattern',
					isTemplate: false,
					effectiveFrom: '2026-01-01',
					timezoneMode: 'Fixed',
					fixedZone: 'Asia/Kolkata',
					weekStartsOn: 1,
					days: [1, 2, 3, 4, 5, 6, 7].map(
						/** Explicit test-only rest pattern, never a runtime fallback. */ (weekday) => ({
							weekday,
							kind: 'Rest',
							segments: [],
						}),
					),
				},
			})
			await schedules.publish('input-schedule', 'input-schedule-v1', 1, 'a'.repeat(64))
			await sql`INSERT INTO hcm.work_schedule_assignment(tenant_id,id,version_id,scope_kind,effective_from,created_by_account_id) VALUES(${tenant},'input-schedule-link','input-schedule-v1','Tenant','2026-01-01',${actor})`.execute(
				transaction,
			)
			await sql`INSERT INTO hcm.attendance_policy(tenant_id,id,code,created_by_account_id) VALUES(${tenant},'input-policy','INPUT_POLICY',${actor})`.execute(
				transaction,
			)
			await sql`INSERT INTO hcm.attendance_policy_version(tenant_id,id,policy_id,version_number,name,effective_from,grace_in_minutes,grace_out_minutes,rounding,overtime_enabled,created_by_account_id) VALUES(${tenant},'input-policy-v1','input-policy',1,'Exact disabled','2026-01-01',0,0,'None',false,${actor})`.execute(
				transaction,
			)
			await sql`UPDATE hcm.attendance_policy_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id=${actor},publication_digest=repeat('a',64) WHERE tenant_id=${tenant} AND id='input-policy-v1'`.execute(
				transaction,
			)
			await sql`INSERT INTO hcm.attendance_policy_assignment(tenant_id,id,version_id,scope_kind,effective_from,created_by_account_id) VALUES(${tenant},'input-policy-link','input-policy-v1','Tenant','2026-01-01',${actor})`.execute(
				transaction,
			)
			const schedule = await port.read('Schedule', employment, date),
				policy = await port.read('Policy', employment, date)
			expect(schedule).toMatchObject({
				state: 'Available',
				version: { isTemplate: false, days: expect.arrayContaining([expect.objectContaining({ kind: 'Rest', segments: [] })]) },
			})
			expect(policy).toMatchObject({
				state: 'Available',
				version: { overtime: { enabled: false }, rounding: 'None' },
			})
			if (policy.state === 'Available')
				expect(policy.version).not.toHaveProperty('minimumRestMinutes')
			expect(
				await binder.bind(transaction, 'foreign-tenant').read('Schedule', employment, date),
			).toMatchObject({ state: 'Unavailable', reason: 'employment-unavailable' })
			await sql`SELECT set_config('hcm.tenant_id','',true)`.execute(transaction)
			expect(await port.read('Policy', employment, date)).toMatchObject({
				state: 'Unavailable',
				reason: 'employment-unavailable',
			})
			expect(
				/** A pool cannot carry the caller's transaction-local authority. */ () =>
					binder.bind(runtime, tenant),
			).toThrow('tenant transaction')
		},
	))
