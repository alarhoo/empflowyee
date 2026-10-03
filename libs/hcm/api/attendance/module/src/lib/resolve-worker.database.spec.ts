import { afterAll, beforeAll, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import type { WorkloadAuditTables } from '@empflowyee/hcm-api-audit-infrastructure'
import { HcmTenantDatabase } from '@empflowyee/hcm-api-database-kysely'
import {
	HcmWorkloadIssuer,
	type ClaimedHcmWork,
	type HcmWorkloadContext,
} from '@empflowyee/hcm-api-runtime-application'
import {
	enqueueHcmWork,
	HcmDurableWorkStore,
	HcmRuntimeStore,
	HcmTransactionalWorkerLane,
	runHcmWorker,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import { AssignedWorkdayResolver } from '@empflowyee/hcm-api-attendance-application'
import { calculateLeaveDayQuantity } from '@empflowyee/hcm-api-leave-domain'
import {
	KyselyAttendanceResolveHandler,
	KyselyAttendanceConfigurationInputBinder,
	KyselyScheduleRepository,
	KyselyAttendancePublishedWorkdayBinder,
} from '@empflowyee/hcm-api-attendance-infrastructure'
import { KyselyWorkforceTimeContextBinder } from '@empflowyee/hcm-api-workforce-foundation-infrastructure'
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
	issuer: HcmWorkloadIssuer,
	store: HcmDurableWorkStore<WorkloadAuditTables>,
	lane: HcmTransactionalWorkerLane<WorkloadAuditTables>
const employment = 'dunder-mifflin/employment/jim',
	actor = 'dunder-mifflin/account/david'
const binder = new KyselyAttendanceConfigurationInputBinder(new KyselyWorkforceTimeContextBinder())
const handler = new KyselyAttendanceResolveHandler(binder)

it('exports current published evidence to source consumers and refuses stale or absent workdays', /** The internal owner port reuses real stored intervals without minting workdays, queue entries or human authority. */ async () => {
	const date = '2026-10-20'
	const reader = new KyselyAttendancePublishedWorkdayBinder(binder)
	await database.workloadTransaction(
		context,
		'AttendanceResolve',
		/** No persisted workday means unavailable even when configuration could resolve. */ async (
			tx,
		) => {
			const page = await reader
				.bind(tx, tenant)
				.read({ employmentId: employment, from: date, to: date })
			expect(page.items[0]).toMatchObject({ state: 'Unavailable', unavailableCode: 'NotResolved' })
			await expect(
				reader.bind(tx, 'foreign').read({ employmentId: employment, from: date, to: date }),
			).rejects.toThrow('forbidden')
		},
	)
	await enqueue(date, await basis(date))
	await lane.complete(context, await claim())
	await database.workloadTransaction(
		context,
		'AttendanceResolve',
		/** Verify exact source-backed data and no queue mutation while reading. */ async (tx) => {
			const before = (
				await sql<{
					count: string
				}>`SELECT count(*)::text AS count FROM hcm.attendance_outbox`.execute(tx)
			).rows[0].count
			const page = await reader
				.bind(tx, tenant)
				.read({ employmentId: employment, from: date, to: date })
			expect(page.items[0]).toMatchObject({
				state: 'Published',
				employmentId: employment,
				workDate: date,
				scheduledMilliseconds: '28800250',
			})
			expect(JSON.stringify(page)).not.toMatch(/input_digest|workforceDigest|accountId/)
			expect(
				calculateLeaveDayQuantity(
					page.items[0],
					{ portion: 'Full' },
					{ unit: 'Day', rounding: { scale: 6, mode: 'Nearest' } },
				),
			).toMatchObject({
				state: 'Available',
				units: '1',
				scheduledMilliseconds: '28800250',
				requestedMilliseconds: '28800250',
			})
			expect(
				(
					await sql<{
						count: string
					}>`SELECT count(*)::text AS count FROM hcm.attendance_outbox`.execute(tx)
				).rows[0].count,
			).toBe(before)
		},
	)
	await expect(
		database.workloadTransaction(
			context,
			'AttendanceResolve',
			/** Roll back a Workforce revision change after proving the old workday is rejected. */ async (
				tx,
			) => {
				const facts = await new KyselyWorkforceTimeContextBinder()
					.bind(tx, tenant)
					.read(employment, date)
				if (facts.state !== 'Available') throw new Error('Fixture workforce missing')
				await sql`UPDATE hcm.location SET revision=revision+1 WHERE tenant_id=${tenant} AND id=${facts.context.assignments[0].locationId}`.execute(
					tx,
				)
				const page = await reader
					.bind(tx, tenant)
					.read({ employmentId: employment, from: date, to: date })
				expect(page.items[0]).toMatchObject({
					state: 'Unavailable',
					unavailableCode: 'SourceChanged',
				})
				expect(
					calculateLeaveDayQuantity(
						page.items[0],
						{ portion: 'Full' },
						{ unit: 'Day', rounding: { scale: 6, mode: 'Nearest' } },
					),
				).toEqual({ state: 'Unavailable', reason: 'WorkdayUnavailable' })
				throw new Error('rollback source fixture')
			},
		),
	).rejects.toThrow('rollback source fixture')
})

/** Read the producer's actual current resolver digest through the same maintained source ports. */
async function basis(workDate: string): Promise<string> {
	return database.workloadTransaction(
		context,
		'AttendanceResolve',
		/** Resolve explicit seeded sources in a real tenant transaction. */ async (transaction) => {
			const result = await new AssignedWorkdayResolver(
				binder.bind(transaction, tenant),
				366,
			).resolve(employment, workDate)
			if (result.state !== 'Available') throw new Error(`Test source unavailable: ${result.reason}`)
			return result.inputDigest
		},
	)
}

/** Persist immutable intent as a test-only producer; no fixture queue is consumed by production code. */
async function enqueue(
	workDate: string,
	inputDigest: string,
	extra: Record<string, string> = {},
): Promise<string> {
	return database.workloadTransaction(
		context,
		'AttendanceResolve',
		/** Keep producer intent inside the existing restricted tenant transaction. */ (transaction) =>
			enqueueHcmWork(transaction, tenant, {
				workload: 'AttendanceResolve',
				kind: handler.kind,
				schemaVersion: 1,
				businessKey: randomUUID(),
				payload: { employmentId: employment, workDate, inputDigest, ...extra },
			}),
	)
}

/** Require a real leased item instead of constructing caller-authoritative queue evidence. */
async function claim(): Promise<ClaimedHcmWork> {
	const work = await lane.claim(context)
	if (!work) throw new Error('Expected available test work')
	return work
}

/** Inspect durable effects after the containing transaction has committed or rolled back. */
async function result(id: string) {
	return (
		await api.admin.query(
			'SELECT state,result_code AS code,workday_id AS workday,evidence FROM hcm.attendance_workday_resolution_receipt WHERE tenant_id=$1 AND outbox_id=$2',
			[tenant, id],
		)
	).rows[0]
}

beforeAll(
	/** Apply forward migrations only in disposable PostgreSQL and arrange immutable test-only sources/assignments. */ async () => {
		api = await startHcmTestApi(HcmAttendanceModule)
		const connectionString = process.env['HCM_TEST_RUNTIME']
		if (!connectionString) throw new Error('Disposable database required')
		database = new HcmTenantDatabase({ connectionString, maxConnections: 4 })
		directory = new HcmRuntimeStore(connectionString)
		issuer = new HcmWorkloadIssuer(directory, ['AttendanceResolve', 'AttendanceCalculate'])
		context = await issuer.issue(tenant, 'AttendanceResolve', randomUUID(), 600000)
		store = new HcmDurableWorkStore(database, { leaseMilliseconds: 60000, maximumAttempts: 3 })
		lane = new HcmTransactionalWorkerLane('AttendanceResolve', store, [handler])
		await database.workloadTransaction(
			context,
			'AttendanceResolve',
			/** Direct fixtures isolate worker acceptance from not-yet-delivered assignment producer APIs. */ async (
				transaction,
			) => {
				// The fixture repository uses raw SQL; the actual executor and transaction are preserved.
				const schedules = new KyselyScheduleRepository(
					transaction as unknown as Kysely<unknown>,
					tenant,
					actor,
				)
				await schedules.createOwner('resolve-schedule', 'RESOLVE_SCHEDULE', false)
				await schedules.insertVersion({
					id: 'resolve-schedule-v1',
					ownerId: 'resolve-schedule',
					versionNumber: 1,
					copiedFromId: null,
					supersedesId: null,
					draft: {
						code: 'RESOLVE_SCHEDULE',
						name: 'Night',
						isTemplate: false,
						effectiveFrom: '2026-01-01',
						timezoneMode: 'Employment',
						weekStartsOn: 1,
						days: [1, 2, 3, 4, 5, 6, 7].map(
							/** Explicit overnight millisecond pattern for every test date. */ (weekday) => ({
								weekday,
								kind: 'Work',
								segments: [
									{
										kind: 'Work',
										startTime: '22:00:00.125',
										endTime: '06:00:00.375',
										endDayOffset: 1,
									},
								],
							}),
						),
					},
				})
				await schedules.publish('resolve-schedule', 'resolve-schedule-v1', 1, 'a'.repeat(64))
				await sql`INSERT INTO hcm.work_schedule_assignment(tenant_id,id,version_id,scope_kind,effective_from,created_by_account_id) VALUES(${tenant},'resolve-schedule-link','resolve-schedule-v1','Tenant','2026-01-01',${actor})`.execute(
					transaction,
				)
				await sql`INSERT INTO hcm.holiday_calendar(tenant_id,id,code,created_by_account_id) VALUES(${tenant},'resolve-calendar','RESOLVE_CALENDAR',${actor})`.execute(
					transaction,
				)
				await sql`INSERT INTO hcm.holiday_calendar_version(tenant_id,id,calendar_id,version_number,name,effective_from,created_by_account_id) VALUES(${tenant},'resolve-calendar-v1','resolve-calendar',1,'Explicit empty calendar','2026-01-01',${actor})`.execute(
					transaction,
				)
				await sql`UPDATE hcm.holiday_calendar_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id=${actor},publication_digest=repeat('a',64) WHERE tenant_id=${tenant} AND id='resolve-calendar-v1'`.execute(
					transaction,
				)
				await sql`INSERT INTO hcm.holiday_calendar_assignment(tenant_id,id,version_id,scope_kind,effective_from,created_by_account_id) VALUES(${tenant},'resolve-calendar-link','resolve-calendar-v1','Tenant','2026-01-01',${actor})`.execute(
					transaction,
				)
				await sql`INSERT INTO hcm.attendance_policy(tenant_id,id,code,created_by_account_id) VALUES(${tenant},'resolve-policy','RESOLVE_POLICY',${actor})`.execute(
					transaction,
				)
				await sql`INSERT INTO hcm.attendance_policy_version(tenant_id,id,policy_id,version_number,name,effective_from,grace_in_minutes,grace_out_minutes,rounding,overtime_enabled,created_by_account_id) VALUES(${tenant},'resolve-policy-v1','resolve-policy',1,'Explicit inactive rules','2026-01-01',0,0,'None',false,${actor})`.execute(
					transaction,
				)
				await sql`UPDATE hcm.attendance_policy_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id=${actor},publication_digest=repeat('a',64) WHERE tenant_id=${tenant} AND id='resolve-policy-v1'`.execute(
					transaction,
				)
				await sql`INSERT INTO hcm.attendance_policy_assignment(tenant_id,id,version_id,scope_kind,effective_from,created_by_account_id) VALUES(${tenant},'resolve-policy-link','resolve-policy-v1','Tenant','2026-01-01',${actor})`.execute(
					transaction,
				)
			},
		)
	},
)
afterAll(
	/** Close every actual pool before the harness removes its disposable database. */ async () => {
		await database?.destroy()
		await directory?.onApplicationShutdown()
		await api?.close()
	},
)

it('publishes exact DST evidence once for concurrent intents and commits receipts plus workload audit', /** Two source operations with identical input recover one immutable workday without creating competing revisions. */ async () => {
	const digest = await basis('2026-10-31')
	const firstId = await enqueue('2026-10-31', digest),
		secondId = await enqueue('2026-10-31', digest)
	const [first, second] = await Promise.all([claim(), claim()])
	await Promise.all([lane.complete(context, first), lane.complete(context, second)])
	const left = await result(firstId),
		right = await result(secondId)
	expect(left).toMatchObject({
		state: 'Available',
		code: 'Resolved',
		evidence: { rest: { state: 'NotRequired' } },
	})
	expect(left.workday).toBe(right.workday)
	expect(
		(
			await api.admin.query(
				'SELECT scheduled_work_milliseconds::text AS exact,revision FROM hcm.published_workday WHERE tenant_id=$1 AND id=$2',
				[tenant, left.workday],
			)
		).rows[0],
	).toEqual({ exact: '32400250', revision: 1 })
	expect(
		(
			await api.admin.query(
				"SELECT count(*)::int AS count FROM hcm.audit_event WHERE tenant_id=$1 AND target_id=ANY($2::text[]) AND action='background.completed' AND actor_kind='Workload' AND actor_account_id IS NULL",
				[tenant, [firstId, secondId]],
			)
		).rows[0].count,
	).toBe(2)
	await expect(lane.complete(context, first)).rejects.toMatchObject({ code: 'lease-lost' })
})

it('records stale and missing input outcomes without zero workdays or source-decision fabrication', /** Changing a real location revision invalidates a producer digest; a new explicit operation can use the refreshed basis. */ async () => {
	const digest = await basis('2026-10-30')
	const stale = await enqueue('2026-10-30', digest)
	await api.admin.query('UPDATE hcm.location SET revision=revision+1 WHERE tenant_id=$1', [tenant])
	await lane.complete(context, await claim())
	expect(await result(stale)).toMatchObject({
		state: 'Unavailable',
		code: 'InputChanged',
		workday: null,
	})
	const missing = await enqueue('2026-10-30', digest, {
		employmentId: 'foreign-or-missing-employment',
	})
	await lane.complete(context, await claim())
	expect(await result(missing)).toMatchObject({
		state: 'Unavailable',
		code: 'employment-unavailable',
		workday: null,
	})
	expect(
		(
			await api.admin.query(
				'SELECT count(*)::int AS count FROM hcm.published_workday WHERE tenant_id=$1 AND work_date=$2',
				[tenant, '2026-10-30'],
			)
		).rows[0].count,
	).toBe(0)
	const current = await enqueue('2026-10-30', await basis('2026-10-30'))
	await lane.complete(context, await claim())
	expect(await result(current)).toMatchObject({ state: 'Available' })
})

it('holds the monthly fence and retains an explicit closed-period outcome', /** Closing cannot silently become an Open month or a new published basis. */ async () => {
	const id = await enqueue('2026-12-01', await basis('2026-12-01'))
	await api.admin.query(
		"INSERT INTO hcm.attendance_period(tenant_id,id,month_start) VALUES($1,'resolve-december','2026-12-01')",
		[tenant],
	)
	await api.admin.query(
		"UPDATE hcm.attendance_period SET state='Open',revision=revision+1 WHERE tenant_id=$1 AND id='resolve-december'",
		[tenant],
	)
	await api.admin.query(
		"UPDATE hcm.attendance_period SET state='Closing',revision=revision+1 WHERE tenant_id=$1 AND id='resolve-december'",
		[tenant],
	)
	await lane.complete(context, await claim())
	expect(await result(id)).toMatchObject({
		state: 'Unavailable',
		code: 'PeriodUnavailable',
		workday: null,
	})
})

it('rolls back workday and receipt after handler failure or lease expiry, then recovers the original intent', /** Failure injection occurs after real publication writes but before Runtime's completion statement. */ async () => {
	for (const expire of [false, true]) {
		const date = expire ? '2026-10-28' : '2026-10-29',
			id = await enqueue(date, await basis(date)),
			work = await claim()
		const failing = new HcmTransactionalWorkerLane('AttendanceResolve', store, [
			{
				kind: handler.kind,
				schemaVersion: 1,
				/** Inject failure only after real effects to prove the outer transaction owns their durability. */
				async execute(transaction, currentContext, verified) {
					await handler.execute(transaction, currentContext, verified)
					if (!expire) throw new Error('Test injected failure')
					await sql`UPDATE hcm.attendance_outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE tenant_id=${tenant} AND id=${verified.id}`.execute(
						transaction,
					)
				},
			},
		])
		await expect(failing.complete(context, work)).rejects.toThrow()
		expect(await result(id)).toBeUndefined()
		expect(
			(
				await api.admin.query(
					'SELECT count(*)::int AS count FROM hcm.published_workday WHERE tenant_id=$1 AND work_date=$2',
					[tenant, date],
				)
			).rows[0].count,
		).toBe(0)
		expect(
			(
				await api.admin.query(
					"SELECT count(*)::int AS count FROM hcm.audit_event WHERE tenant_id=$1 AND target_id=$2 AND action='background.completed'",
					[tenant, id],
				)
			).rows[0].count,
		).toBe(0)
		await lane.complete(context, work)
		expect(await result(id)).toMatchObject({ state: 'Available' })
	}
})

it('requires atomic outbox completion, refuses forged authority and ignores caller payload substitution', /** Direct handler effects cannot commit outside the verified lane; completion reloads immutable intent. */ async () => {
	const id = await enqueue('2026-10-27', await basis('2026-10-27')),
		work = await claim()
	await expect(
		database.workloadTransaction(
			context,
			'AttendanceResolve',
			/** Bypass only the completion call to exercise the deferred SQL guard. */ (transaction) =>
				handler.execute(transaction, context, work),
		),
	).rejects.toMatchObject({ code: '23514' })
	expect(await result(id)).toBeUndefined()
	await expect(
		database.workloadTransaction(
			context,
			'AttendanceResolve',
			/** A copied object is not a registered workload capability. */ (transaction) =>
				handler.execute(transaction, { ...context }, work),
		),
	).rejects.toThrow()
	const wrong = await issuer.issue(tenant, 'AttendanceCalculate', randomUUID())
	await expect(
		database.workloadTransaction(
			wrong,
			'AttendanceCalculate',
			/** Registered authority for another workload cannot publish schedules. */ (transaction) =>
				handler.execute(transaction, wrong, work),
		),
	).rejects.toThrow()
	await lane.complete(context, {
		...work,
		payload: { workDate: '1900-01-01', tenantId: 'foreign' },
	})
	expect(await result(id)).toMatchObject({ state: 'Available' })
	await expect(
		database.workloadTransaction(
			context,
			'AttendanceResolve',
			/** Runtime cannot rewrite or delete durable outcome evidence. */ (transaction) =>
				sql`DELETE FROM hcm.attendance_workday_resolution_receipt WHERE tenant_id=${tenant} AND outbox_id=${id}`.execute(
					transaction,
				),
		),
	).rejects.toMatchObject({ code: '42501' })
	const bad = await enqueue('2026-10-26', await basis('2026-10-26'), { tenantId: 'foreign' }),
		invalid = await claim()
	await expect(lane.complete(context, invalid)).rejects.toMatchObject({ code: 'invalid-request' })
	expect(await result(bad)).toBeUndefined()
	await lane.fail(context, invalid, 86400000)
})

it('drains real resolution work through the shared runtime and refuses absent business lanes', /** Finite local execution composes the same real handler, rather than asserting only a successful build. */ async () => {
	const id = await enqueue('2026-10-25', await basis('2026-10-25'))
	const reports: unknown[] = []
	const env = {
		APP_ENVIRONMENT: 'local',
		NODE_ENV: 'development',
		HCM_LOCAL_TENANTS: 'true',
		HCM_DATABASE_URL: process.env['HCM_TEST_RUNTIME'],
		HCM_WORKER_WORKLOADS: 'AttendanceResolve',
		HCM_WORKER_MAX_ITEMS: '10',
	}
	const composition = {
		/** Bind the source handler to the runtime-owned store exactly as the thin root does. */
		lanes(
			_database: HcmTenantDatabase<WorkloadAuditTables>,
			workStore: HcmDurableWorkStore<WorkloadAuditTables>,
		) {
			return [new HcmTransactionalWorkerLane('AttendanceResolve', workStore, [handler])]
		},
		/** Capture aggregate counters only; no payload or private source evidence enters operational logs. */
		report(value: unknown) {
			reports.push(value)
		},
	}
	await runHcmWorker(env, composition, new AbortController().signal)
	expect(await result(id)).toMatchObject({ state: 'Available' })
	expect(reports).toHaveLength(1)
	await expect(
		runHcmWorker(
			{ ...env, HCM_WORKER_WORKLOADS: 'LeaveAccrual' },
			composition,
			new AbortController().signal,
		),
	).rejects.toThrow('Worker handler unavailable')
})

it('isolates receipts and typed workday references between real active tenants', /** A valid foreign workload cannot read or attach another tenant's exact evidence. */ async () => {
	const foreign = 'resolve-foreign'
	await api.admin.query('BEGIN')
	try {
		await api.admin.query("SELECT set_config('hcm.tenant_id',$1,true)", [foreign])
		await api.admin.query(
			"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES($1,$1,'Foreign test tenant','active')",
			[foreign],
		)
		await api.admin.query('COMMIT')
	} catch (error) {
		await api.admin.query('ROLLBACK')
		throw error
	}
	const foreignContext = await issuer.issue(foreign, 'AttendanceResolve', randomUUID())
	const foreignId = await database.workloadTransaction(
		foreignContext,
		'AttendanceResolve',
		/** Persist only a foreign tenant's own immutable intent. */ (transaction) =>
			enqueueHcmWork(transaction, foreign, {
				workload: 'AttendanceResolve',
				kind: handler.kind,
				schemaVersion: 1,
				businessKey: randomUUID(),
				payload: { employmentId: employment, workDate: '2026-10-31', inputDigest: 'a'.repeat(64) },
			}),
	)
	const foreignWork = await lane.claim(foreignContext)
	if (!foreignWork) throw new Error('Expected foreign claim')
	const ownWorkday = (
		await api.admin.query('SELECT id FROM hcm.published_workday WHERE tenant_id=$1 LIMIT 1', [
			tenant,
		])
	).rows[0].id
	await database.workloadTransaction(
		foreignContext,
		'AttendanceResolve',
		/** Explicit tenant predicates never override the transaction's FORCE RLS scope. */ async (
			transaction,
		) => {
			const rows =
				await sql`SELECT * FROM hcm.attendance_workday_resolution_receipt WHERE tenant_id=${tenant}`.execute(
					transaction,
				)
			expect(rows.rows).toHaveLength(0)
		},
	)
	await expect(
		database.workloadTransaction(
			foreignContext,
			'AttendanceResolve',
			/** Attempt a forged cross-tenant typed reference under otherwise valid foreign lease evidence. */ (
				transaction,
			) =>
				sql`INSERT INTO hcm.attendance_workday_resolution_receipt(tenant_id,outbox_id,request_digest,lease_fence,workload_run_id,state,workday_id,result_code,evidence) VALUES(${foreign},${foreignId},${foreignWork.digest},${foreignWork.fence},${foreignContext.runId}::uuid,'Available',${ownWorkday},'Resolved','{}'::jsonb)`.execute(
					transaction,
				),
		),
	).rejects.toMatchObject({ code: '23514' })
	await lane.complete(foreignContext, foreignWork)
	await database.workloadTransaction(
		foreignContext,
		'AttendanceResolve',
		/** The source resolver records missing foreign employment instead of borrowing the other tenant's subject. */ async (
			transaction,
		) => {
			const receipt = await sql<{
				state: string
				resultCode: string
				workdayId: string | null
			}>`SELECT state,result_code AS "resultCode",workday_id AS "workdayId" FROM hcm.attendance_workday_resolution_receipt WHERE tenant_id=${foreign} AND outbox_id=${foreignId}`.execute(
				transaction,
			)
			expect(receipt.rows[0]).toEqual({
				state: 'Unavailable',
				resultCode: 'employment-unavailable',
				workdayId: null,
			})
		},
	)
})
