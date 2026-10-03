import { afterAll, beforeAll, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { sql, type Kysely } from 'kysely'
import { HcmTenantDatabase } from '@empflowyee/hcm-api-database-kysely'
import type { WorkloadAuditTables } from '@empflowyee/hcm-api-audit-infrastructure'
import { HcmWorkloadIssuer } from '@empflowyee/hcm-api-runtime-application'
import {
	HcmRuntimeStore,
	HcmDurableWorkStore,
	HcmTransactionalWorkerLane,
	enqueueHcmWork,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import { AssignedWorkdayResolver } from '@empflowyee/hcm-api-attendance-application'
import {
	KyselyAttendanceConfigurationInputBinder,
	KyselyAttendanceResolveHandler,
	KyselyScheduleRepository,
} from '@empflowyee/hcm-api-attendance-infrastructure'
import { KyselyWorkforceTimeContextBinder } from '@empflowyee/hcm-api-workforce-foundation-infrastructure'
import type {
	LeavePolicyVersionView,
	LeaveEnrollmentView,
	LeaveRequestView,
	LeavePolicyDraft,
} from '@empflowyee/hcm-leave-contract'
import {
	startHcmTestApi,
	HCM_TEST_TENANT as tenant,
	type HcmTestApi,
} from '@empflowyee/hcm-api-attendance-module/testing'
import { HcmLeaveModule } from './hcm-api-leave-module'

let api: HcmTestApi, database: HcmTenantDatabase<WorkloadAuditTables>, directory: HcmRuntimeStore
let enrollmentId: string
let policyDraft: LeavePolicyDraft
const actor = 'dunder-mifflin/account/david',
	employment = 'dunder-mifflin/employment/jim'
/** Build a user request from the real enrollment prepared through its owning API. */
function input() {
	return {
		employmentId: employment,
		enrollmentId,
		days: [{ workDate: '2026-10-05', portion: 'Full' }],
		reason: 'Private family occasion',
		evidenceIds: [],
	}
}

beforeAll(
	/** Arrange only disposable policy/configuration prerequisites, then obtain real worker-published workdays and an API enrollment. */ async () => {
		api = await startHcmTestApi(HcmLeaveModule)
		const runtime = process.env['HCM_TEST_RUNTIME']
		if (!runtime) throw new Error('Disposable PostgreSQL required')
		database = new HcmTenantDatabase({ connectionString: runtime, maxConnections: 4 })
		directory = new HcmRuntimeStore(runtime)
		const context = await new HcmWorkloadIssuer(directory, ['AttendanceResolve']).issue(
			tenant,
			'AttendanceResolve',
			randomUUID(),
			600000,
		)
		const binder = new KyselyAttendanceConfigurationInputBinder(
			new KyselyWorkforceTimeContextBinder(),
		)
		await database.workloadTransaction(
			context,
			'AttendanceResolve',
			/** Reuse Attendance's real typed repository and explicit test-only published configuration. */ async (
				transaction,
			) => {
				const tx = transaction as unknown as Kysely<unknown>,
					schedules = new KyselyScheduleRepository(tx, tenant, actor)
				await schedules.createOwner('request-schedule', 'REQUEST_SCHEDULE', false)
				await schedules.insertVersion({
					id: 'request-schedule-v1',
					ownerId: 'request-schedule',
					versionNumber: 1,
					copiedFromId: null,
					supersedesId: null,
					draft: {
						code: 'REQUEST_SCHEDULE',
						name: 'Explicit request schedule',
						isTemplate: false,
						effectiveFrom: '2026-01-01',
						timezoneMode: 'Fixed',
						fixedZone: 'UTC',
						weekStartsOn: 1,
						days: [1, 2, 3, 4, 5, 6, 7].map(
							/** Supply an explicit eight-hour pattern; no production default is inferred. */ (
								weekday,
							) => ({
								weekday,
								kind: 'Work',
								segments: [{ kind: 'Work', startTime: '09:00', endTime: '17:00', endDayOffset: 0 }],
							}),
						),
					},
				})
				await schedules.publish('request-schedule', 'request-schedule-v1', 1, 'a'.repeat(64))
				await sql`INSERT INTO hcm.work_schedule_assignment(tenant_id,id,version_id,scope_kind,effective_from,created_by_account_id) VALUES(${tenant},'request-schedule-link','request-schedule-v1','Tenant','2026-01-01',${actor})`.execute(
					tx,
				)
				await sql`INSERT INTO hcm.holiday_calendar(tenant_id,id,code,created_by_account_id) VALUES(${tenant},'request-calendar','REQUEST_CALENDAR',${actor})`.execute(
					tx,
				)
				await sql`INSERT INTO hcm.holiday_calendar_version(tenant_id,id,calendar_id,version_number,name,effective_from,created_by_account_id) VALUES(${tenant},'request-calendar-v1','request-calendar',1,'Explicit empty calendar','2026-01-01',${actor})`.execute(
					tx,
				)
				await sql`UPDATE hcm.holiday_calendar_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id=${actor},publication_digest=repeat('a',64) WHERE tenant_id=${tenant} AND id='request-calendar-v1'`.execute(
					tx,
				)
				await sql`INSERT INTO hcm.holiday_calendar_assignment(tenant_id,id,version_id,scope_kind,effective_from,created_by_account_id) VALUES(${tenant},'request-calendar-link','request-calendar-v1','Tenant','2026-01-01',${actor})`.execute(
					tx,
				)
				await sql`INSERT INTO hcm.attendance_policy(tenant_id,id,code,created_by_account_id) VALUES(${tenant},'request-attendance','REQUEST_ATTENDANCE',${actor})`.execute(
					tx,
				)
				await sql`INSERT INTO hcm.attendance_policy_version(tenant_id,id,policy_id,version_number,name,effective_from,grace_in_minutes,grace_out_minutes,rounding,overtime_enabled,created_by_account_id) VALUES(${tenant},'request-attendance-v1','request-attendance',1,'Explicit inactive rules','2026-01-01',0,0,'None',false,${actor})`.execute(
					tx,
				)
				await sql`UPDATE hcm.attendance_policy_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id=${actor},publication_digest=repeat('a',64) WHERE tenant_id=${tenant} AND id='request-attendance-v1'`.execute(
					tx,
				)
				await sql`INSERT INTO hcm.attendance_policy_assignment(tenant_id,id,version_id,scope_kind,effective_from,created_by_account_id) VALUES(${tenant},'request-policy-link','request-attendance-v1','Tenant','2026-01-01',${actor})`.execute(
					tx,
				)
				for (const date of ['2026-10-05', '2026-10-06']) {
					const basis = await new AssignedWorkdayResolver(binder.bind(tx, tenant), 366).resolve(
						employment,
						date,
					)
					if (basis.state !== 'Available') throw new Error('Explicit test workday unavailable')
					await enqueueHcmWork(transaction, tenant, {
						workload: 'AttendanceResolve',
						kind: 'attendance.workday.resolve',
						schemaVersion: 1,
						businessKey: randomUUID(),
						payload: { employmentId: employment, workDate: date, inputDigest: basis.inputDigest },
					})
				}
			},
		)
		const lane = new HcmTransactionalWorkerLane(
			'AttendanceResolve',
			new HcmDurableWorkStore(database, { leaseMilliseconds: 60000, maximumAttempts: 3 }),
			[new KyselyAttendanceResolveHandler(binder)],
		)
		for (let index = 0; index < 2; index++) {
			const claimed = await lane.claim(context)
			if (!claimed) throw new Error('Expected real Attendance intent')
			await lane.complete(context, claimed)
		}
		await api.admin.query(
			"INSERT INTO hcm.leave_type(tenant_id,id,code,name,category,unit,is_paid,is_sensitive,is_active) VALUES($1,'request-type','REQUEST_TYPE','Request fixture','Annual','Day',true,false,true)",
			[tenant],
		)
		policyDraft = {
			code: 'REQUEST_POLICY',
			name: 'Explicit request policy',
			leaveTypeId: 'request-type',
			effectiveFrom: '2026-10-01',
			effectiveTo: '2026-10-31',
			trackingMode: 'Balance',
			unit: 'Day',
			eligibility: { workerTypes: [], legalEntityIds: [] },
			eligibilityRules: [
				{ id: 'all', priority: 1, effect: 'Include', effectiveFrom: '2026-10-01' },
			],
			datedAssignments: [],
			rounding: { scale: 6, mode: 'Nearest' },
			allowHourly: true,
			hourlyIncrementMinutes: 30,
			allowHalfDay: false,
			maximumBackdatedDays: 0,
			maximumAdvanceDays: 365,
			accrual: { enabled: false },
			carryForward: { enabled: false },
			noticeMode: 'Warning',
			approvalRules: [],
			compOff: { enabled: false },
			encashment: { configured: false, annualOnly: true },
			bridgeRule: 'None',
			blackoutDates: [],
			allowOverlap: false,
			negativeBalanceAllowed: false,
			postingPoint: 'OnApproval',
		}
		const policy = await api.send<LeavePolicyVersionView>(
			'david',
			'POST',
			'leave/policies',
			policyDraft,
		)
		expect(policy.status, JSON.stringify(policy.body)).toBe(201)
		await api.admin.query(
			"UPDATE hcm.leave_policy_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id=$2,publication_digest=repeat('a',64) WHERE tenant_id=$3 AND id=$1",
			[policy.body.versionId, actor, tenant],
		)
		await api.admin.query(
			"INSERT INTO hcm.leave_period(tenant_id,id,code,name,start_date,end_date,created_by_account_id) VALUES($1,'request-period','REQUEST_PERIOD','Explicit October','2026-10-01','2026-10-31',$2)",
			[tenant, actor],
		)
		await api.admin.query(
			"UPDATE hcm.leave_period SET state='Open',revision=revision+1 WHERE tenant_id=$1 AND id='request-period'",
			[tenant],
		)
		const enrolled = await api.send<LeaveEnrollmentView>('toby', 'POST', 'leave/enrollments', {
			employmentId: employment,
			policyVersionId: policy.body.versionId,
			effectiveFrom: '2026-10-01',
			effectiveTo: '2026-10-31',
			reason: 'Explicit test enrollment',
		})
		expect(enrolled.status, JSON.stringify(enrolled.body)).toBe(201)
		enrollmentId = enrolled.body.id
	},
)
afterAll(
	/** Close only the suite's pools and listener before its isolated PostgreSQL is removed. */ async () => {
		await database?.destroy()
		await directory?.onApplicationShutdown()
		await api?.close()
	},
)

it('persists a current self Draft exactly once with encrypted reason and no reservation or posting', /** Real HTTP concurrency and reload prove a durable calculated request, not a success stub. */ async () => {
	const key = randomUUID()
	const [left, right] = await Promise.all([
		api.send<LeaveRequestView>('jim', 'POST', 'leave/me/requests', input(), {
			'idempotency-key': key,
		}),
		api.send<LeaveRequestView>('jim', 'POST', 'leave/me/requests', input(), {
			'idempotency-key': key,
		}),
	])
	expect(left.status, JSON.stringify(left.body)).toBe(201)
	expect(right.body).toEqual(left.body)
	expect(left.body).toMatchObject({
		state: 'Draft',
		employmentId: employment,
		totalUnits: '1.000000',
		days: [{ requestedMilliseconds: '28800000' }],
	})
	expect(JSON.stringify(left.body)).not.toMatch(/Private family|encrypted|evidenceIds|eligibility/)
	const read = await api.send('jim', 'GET', `leave/me/requests/${left.body.id}`)
	expect(read.body).toEqual(left.body)
	expect(
		(
			await api.send(
				'jim',
				'POST',
				'leave/me/requests',
				{ ...input(), reason: 'Altered same key' },
				{ 'idempotency-key': key },
			)
		).status,
	).toBe(409)
	expect(
		(await api.admin.query('SELECT count(*)::int AS count FROM hcm.leave_request')).rows[0].count,
	).toBe(1)
	expect(
		(
			await api.admin.query(
				"SELECT count(*)::int AS count FROM hcm.leave_command_receipt WHERE operation='Request.create'",
			)
		).rows[0].count,
	).toBe(1)
	expect(
		(
			await api.admin.query(
				'SELECT posted_units::text AS posted,reserved_units::text AS reserved FROM hcm.leave_balance_account WHERE enrollment_id=$1',
				[enrollmentId],
			)
		).rows[0],
	).toEqual({ posted: '0.000000', reserved: '0.000000' })
	expect(
		(await api.admin.query("SELECT encode(encrypted_reason,'hex') AS value FROM hcm.leave_request"))
			.rows[0]?.value,
	).not.toContain(Buffer.from(input().reason).toString('hex'))
})
it('rejects another person even with administrator or HR role permissions', /** A broad role never changes self-service employment ownership. */ async () => {
	const id = (await api.admin.query('SELECT id FROM hcm.leave_request LIMIT 1')).rows[0].id
	for (const persona of ['david', 'toby', 'michael']) {
		expect((await api.send(persona, 'POST', 'leave/me/requests', input())).status).toBe(403)
		expect((await api.send(persona, 'GET', `leave/me/requests/${id}`)).status).toBe(403)
	}
	expect((await api.send('jim', 'GET', `leave/me/requests/${id}?tenantId=foreign`)).status).toBe(
		400,
	)
	expect(
		(await api.send('jim', 'POST', 'leave/me/requests', { ...input(), tenantId: 'foreign' }))
			.status,
	).toBe(400)
})
it('stores actual hourly local and consumed UTC intervals and fails incomplete sources atomically', /** A saved Draft never rounds an invalid increment or substitutes a missing workday. */ async () => {
	const hourly = {
		...input(),
		days: [
			{
				workDate: '2026-10-06',
				portion: 'Hourly',
				startTime: '09:00',
				endTime: '10:00',
				startDayOffset: 0,
				endDayOffset: 0,
			},
		],
	}
	const saved = await api.send<LeaveRequestView>('jim', 'POST', 'leave/me/requests', hourly)
	expect(saved.status, JSON.stringify(saved.body)).toBe(201)
	expect(saved.body).toMatchObject({
		totalUnits: '0.125000',
		days: [
			{
				input: { portion: 'Hourly', startDayOffset: 0, endDayOffset: 0 },
				requestedMilliseconds: '3600000',
			},
		],
	})
	for (const bad of [
		{ ...input(), evidenceIds: ['unadmitted-document'] },
		{ ...input(), days: [{ workDate: '2026-10-07', portion: 'Full' }] },
		{ ...input(), days: [{ workDate: '2026-11-01', portion: 'Full' }] },
		{ ...hourly, days: [{ ...hourly.days[0], endTime: '09:15' }] },
		{ ...input(), days: [{ workDate: '2026-10-05', portion: 'FirstHalf' }] },
	])
		expect((await api.send('jim', 'POST', 'leave/me/requests', bad)).status).toBeGreaterThanOrEqual(
			400,
		)
	expect(
		(await api.admin.query('SELECT count(*)::int AS count FROM hcm.leave_request')).rows[0].count,
	).toBe(2)
})
it('tracks Unpaid request units without a consumable account', /** The same real self-service command persists LOP quantities without manufacturing funding or reservations. */ async () => {
	await api.admin.query(
		"INSERT INTO hcm.leave_type(tenant_id,id,code,name,category,unit,is_paid,is_sensitive,is_active) VALUES($1,'unpaid-request-type','UNPAID_REQUEST','Unpaid request fixture','Unpaid','Day',false,false,true)",
		[tenant],
	)
	const policy = await api.send<LeavePolicyVersionView>('david', 'POST', 'leave/policies', {
		...policyDraft,
		code: 'UNPAID_REQUEST',
		name: 'Explicit Unpaid policy',
		leaveTypeId: 'unpaid-request-type',
		trackingMode: 'Unpaid',
	})
	expect(policy.status, JSON.stringify(policy.body)).toBe(201)
	await api.admin.query(
		"UPDATE hcm.leave_policy_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id=$2,publication_digest=repeat('a',64) WHERE tenant_id=$3 AND id=$1",
		[policy.body.versionId, actor, tenant],
	)
	const enrolled = await api.send<LeaveEnrollmentView>('toby', 'POST', 'leave/enrollments', {
		employmentId: employment,
		policyVersionId: policy.body.versionId,
		effectiveFrom: '2026-10-01',
		effectiveTo: '2026-10-31',
		reason: 'Explicit Unpaid enrollment',
	})
	expect(enrolled.status, JSON.stringify(enrolled.body)).toBe(201)
	const saved = await api.send<LeaveRequestView>('jim', 'POST', 'leave/me/requests', {
		...input(),
		enrollmentId: enrolled.body.id,
	})
	expect(saved.status, JSON.stringify(saved.body)).toBe(201)
	expect(saved.body).toMatchObject({
		state: 'Draft',
		trackingMode: 'Unpaid',
		totalUnits: '1.000000',
	})
	expect((await api.send('jim', 'GET', `leave/me/requests/${saved.body.id}`)).body).toEqual(
		saved.body,
	)
	expect(
		(
			await api.admin.query('SELECT id FROM hcm.leave_balance_account WHERE enrollment_id=$1', [
				enrolled.body.id,
			])
		).rows,
	).toEqual([])
})
it('protects immutable evidence, deferred completeness and negative tenant reads', /** Direct runtime/migrator attempts cannot bypass storage invariants behind the real API. */ async () => {
	await expect(
		api.admin.query("UPDATE hcm.leave_request SET encrypted_reason=decode('01','hex')"),
	).rejects.toThrow()
	await expect(
		api.admin.query(
			"INSERT INTO hcm.leave_request SELECT (jsonb_populate_record(NULL::hcm.leave_request,to_jsonb(r)||jsonb_build_object('id','incomplete-request'))).* FROM hcm.leave_request r LIMIT 1",
		),
	).rejects.toThrow()
	await expect(
		api.admin.query(
			"INSERT INTO hcm.leave_request_day SELECT (jsonb_populate_record(NULL::hcm.leave_request_day,to_jsonb(d)||jsonb_build_object('id','late-day','work_date','2026-10-06'))).* FROM hcm.leave_request_day d LIMIT 1",
		),
	).rejects.toThrow()
	const runtime = new Client({ connectionString: process.env['HCM_TEST_RUNTIME'] })
	await runtime.connect()
	try {
		expect((await runtime.query('SELECT id FROM hcm.leave_request')).rows).toEqual([])
		await runtime.query("SELECT set_config('hcm.tenant_id','foreign',false)")
		for (const table of ['leave_request', 'leave_request_day', 'leave_request_day_interval'])
			expect((await runtime.query(`SELECT * FROM hcm.${table}`)).rows).toEqual([])
	} finally {
		await runtime.end()
	}
})
it('denies duplicate recovery after read revocation and refuses changed workday inputs', /** Neither the original key nor an old published row overrides current authority and source revision. */ async () => {
	const key = randomUUID(),
		saved = await api.send('jim', 'POST', 'leave/me/requests', input(), { 'idempotency-key': key })
	expect(saved.status).toBe(201)
	await api.admin.query(
		"DELETE FROM hcm.role_permission WHERE tenant_id=$1 AND role_id='employee' AND permission_code='hcm.leave.apply-leave.read'",
		[tenant],
	)
	expect(
		(await api.send('jim', 'POST', 'leave/me/requests', input(), { 'idempotency-key': key }))
			.status,
	).toBe(403)
	await api.admin.query(
		"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'employee','hcm.leave.apply-leave.read')",
		[tenant],
	)
	await api.admin.query('UPDATE hcm.location SET revision=revision+1 WHERE tenant_id=$1', [tenant])
	expect((await api.send('jim', 'POST', 'leave/me/requests', input())).status).toBe(409)
})
