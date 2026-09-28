import { afterAll, beforeAll, expect, it } from 'vitest'
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely'
import { Client, Pool } from 'pg'
import { setTimeout as delay } from 'node:timers/promises'
import { KyselyAttendancePeriodFenceBinder } from '@empflowyee/hcm-api-attendance-infrastructure'
import { attendancePeriodMonths } from '@empflowyee/hcm-api-attendance-application'
import { HcmAttendanceModule } from './hcm-api-attendance-module'
import {
	startHcmTestApi,
	HCM_TEST_TENANT as tenant,
	type HcmTestApi,
} from './attendance-test-harness'

let api: HcmTestApi, runtime: Kysely<unknown>
const actor = 'dunder-mifflin/account/david',
	binder = new KyselyAttendancePeriodFenceBinder()
class Rollback extends Error {}

/** Keep storage fixtures isolated while executing through the non-owner runtime role. */
async function scenario(work: (transaction: Transaction<unknown>) => Promise<void>): Promise<void> {
	try {
		await runtime.transaction().execute(
			/** Establish transaction-local RLS and roll back after assertions. */ async (
				transaction,
			) => {
				await sql`SELECT set_config('hcm.tenant_id',${tenant},true)`.execute(transaction)
				await work(transaction)
				throw new Rollback()
			},
		)
	} catch (error) {
		if (!(error instanceof Rollback)) throw error
	}
}
/** Assert a rejected SQL command without aborting later checks in the scenario. */
async function rejected(
	transaction: Transaction<unknown>,
	query: () => Promise<unknown>,
	code = '23514',
): Promise<void> {
	await sql`SAVEPOINT denied`.execute(transaction)
	try {
		await expect(query()).rejects.toMatchObject({ code })
	} finally {
		await sql`ROLLBACK TO SAVEPOINT denied`.execute(transaction)
	}
}
/** Arrange an Open monthly fixture using only the declared SQL lifecycle. */
async function open(transaction: Transaction<unknown>, id: string, month: string): Promise<void> {
	await sql`INSERT INTO hcm.attendance_period(tenant_id,id,month_start) VALUES(${tenant},${id},${month}::date)`.execute(
		transaction,
	)
	await sql`UPDATE hcm.attendance_period SET state='Open',revision=revision+1 WHERE tenant_id=${tenant} AND id=${id}`.execute(
		transaction,
	)
}
/** Append an immutable test lock; the caller must pair it with the matching Locked transition. */
async function appendLock(
	transaction: Transaction<unknown>,
	id = 'lock',
	period = 'period',
): Promise<void> {
	await sql`INSERT INTO hcm.attendance_period_lock(tenant_id,id,period_id,lock_number,input_digest,output_digest,reconciliation_digest,locked_by_account_id) VALUES(${tenant},${id},${period},1,repeat('a',64),repeat('b',64),repeat('c',64),${actor})`.execute(
		transaction,
	)
}

beforeAll(
	/** Apply all forward migrations only to the disposable database and seed real tenant actors. */ async () => {
		api = await startHcmTestApi(HcmAttendanceModule)
		const connectionString = process.env['HCM_TEST_RUNTIME']
		if (!connectionString) throw new Error('Disposable database required')
		runtime = new Kysely({
			dialect: new PostgresDialect({ pool: new Pool({ connectionString, max: 2 }) }),
		})
		await api.admin.query('BEGIN')
		try {
			await api.admin.query("SELECT set_config('hcm.tenant_id','period-foreign',true)")
			await api.admin.query(
				"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES('period-foreign','period-foreign','Foreign','active')",
			)
			await api.admin.query(
				"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES('period-foreign','foreign-person','Other','Person','Other Person')",
			)
			await api.admin.query(
				"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES('period-foreign','foreign-account','foreign-person','period@example.test')",
			)
			await api.admin.query(
				"INSERT INTO hcm.attendance_period(tenant_id,id,month_start) VALUES('period-foreign','foreign-period','2026-09-01')",
			)
			await api.admin.query('COMMIT')
		} catch (error) {
			await api.admin.query('ROLLBACK')
			throw error
		}
		await api.admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	},
)
afterAll(
	/** Drain runtime connections before disposing the application and test database. */ async () => {
		await runtime?.destroy()
		await api?.close()
	},
)

it('preserves absent months, exact leap boundaries and changed revision evidence', /** Period absence cannot be silently treated as Open or skipped in a preview digest. */ async () =>
	scenario(
		/** Read a bounded range before and after period creation and transition. */ async (
			transaction,
		) => {
			const port = binder.bind(transaction, tenant)
			const absent = await port.fence('2024-02-29', '2024-03-01')
			expect(absent.months).toEqual([
				{ monthStart: '2024-02-01', period: null },
				{ monthStart: '2024-03-01', period: null },
			])
			await open(transaction, 'february', '2024-02-01')
			const created = await port.read('2024-02-29', '2024-03-01')
			expect(created.digest).not.toBe(absent.digest)
			expect(created.months[0].period).toEqual({
				id: 'february',
				state: 'Open',
				revision: 2,
				currentLockId: null,
			})
			expect(
				(
					await sql<{
						end: string
					}>`SELECT month_end::text AS end FROM hcm.attendance_period WHERE tenant_id=${tenant} AND id='february'`.execute(
						transaction,
					)
				).rows[0].end,
			).toBe('2024-02-29')
			expect(await port.read('2024-02-29', '2024-03-01')).toEqual(created)
			expect(attendancePeriodMonths('2026-12-31', '2027-01-01')).toEqual([
				'2026-12-01',
				'2027-01-01',
			])
			await expect(port.read('2026-02-30', '2026-03-01')).rejects.toThrow()
			await expect(port.fence('2026-01-01', '2027-01-02')).rejects.toThrow()
			await rejected(
				transaction,
				/** Reject a non-monthly period at the SQL boundary. */ () =>
					sql`INSERT INTO hcm.attendance_period(tenant_id,id,month_start) VALUES(${tenant},'midmonth','2024-02-02')`.execute(
						transaction,
					),
				'42501',
			)
			await rejected(
				transaction,
				/** Reject stale revision advancement even when the target state is otherwise valid. */ () =>
					sql`UPDATE hcm.attendance_period SET state='Closing',revision=99 WHERE tenant_id=${tenant} AND id='february'`.execute(
						transaction,
					),
			)
		},
	))

it('commits immutable lock evidence only with its matching period transition', /** A close basis and current pointer are atomic; a raw reopen cannot bypass the independent source decision. */ async () =>
	scenario(
		/** Exercise the admitted storage lifecycle, without claiming business reconciliation has run. */ async (
			transaction,
		) => {
			await open(transaction, 'period', '2026-09-01')
			await rejected(
				transaction,
				/** Open periods cannot accept a lock basis. */ () => appendLock(transaction),
			)
			await sql`UPDATE hcm.attendance_period SET state='Closing',revision=revision+1 WHERE tenant_id=${tenant} AND id='period'`.execute(
				transaction,
			)
			await rejected(
				transaction,
				/** No final lock state exists without immutable basis evidence. */ () =>
					sql`UPDATE hcm.attendance_period SET state='Locked',revision=revision+1,current_lock_id='missing' WHERE tenant_id=${tenant} AND id='period'`.execute(
						transaction,
					),
			)
			await sql`SAVEPOINT unfinished_lock`.execute(transaction)
			await appendLock(transaction)
			await expect(
				sql`SET CONSTRAINTS hcm.attendance_lock_commit IMMEDIATE`.execute(transaction),
			).rejects.toMatchObject({ code: '23514' })
			await sql`ROLLBACK TO SAVEPOINT unfinished_lock`.execute(transaction)
			await appendLock(transaction)
			await sql`UPDATE hcm.attendance_period SET state='Locked',revision=revision+1,current_lock_id='lock' WHERE tenant_id=${tenant} AND id='period'`.execute(
				transaction,
			)
			await sql`SET CONSTRAINTS hcm.attendance_lock_commit IMMEDIATE`.execute(transaction)
			expect(
				(await binder.bind(transaction, tenant).fence('2026-09-01', '2026-09-30')).months[0].period,
			).toEqual({ id: 'period', state: 'Locked', revision: 4, currentLockId: 'lock' })
			await rejected(
				transaction,
				/** Storage must reject reopening until the approved source-case/delta adapter exists. */ () =>
					sql`UPDATE hcm.attendance_period SET state='Reopened',revision=revision+1 WHERE tenant_id=${tenant} AND id='period'`.execute(
						transaction,
					),
			)
			await rejected(
				transaction,
				/** Runtime cannot rewrite the immutable reconciliation basis. */ () =>
					sql`UPDATE hcm.attendance_period_lock SET input_digest=repeat('d',64) WHERE tenant_id=${tenant} AND id='lock'`.execute(
						transaction,
					),
				'42501',
			)
			await rejected(
				transaction,
				/** Runtime cannot delete history or free the unique lock number. */ () =>
					sql`DELETE FROM hcm.attendance_period_lock WHERE tenant_id=${tenant} AND id='lock'`.execute(
						transaction,
					),
				'42501',
			)
		},
	))

it('enforces tenant isolation and rejects foreign actor or fence authority', /** Known foreign row IDs do not reveal or link another tenant's period and account facts. */ async () =>
	scenario(
		/** Attempt each storage boundary through the restricted runtime role. */ async (
			transaction,
		) => {
			const reader = binder.bind(transaction, tenant)
			expect((await reader.read('2026-09-01', '2026-09-30')).months[0].period).toBeNull()
			expect(
				(
					await sql`SELECT id FROM hcm.attendance_period WHERE id='foreign-period'`.execute(
						transaction,
					)
				).rows,
			).toEqual([])
			await rejected(
				transaction,
				/** A caller cannot acquire another tenant's publication fence. */ () =>
					sql`SELECT hcm.fence_attendance_month('period-foreign','2026-09-01',false)`.execute(
						transaction,
					),
				'42501',
			)
			await rejected(
				transaction,
				/** A foreign period identity cannot be referenced under this tenant. */ () =>
					appendLock(transaction, 'bad-lock', 'foreign-period'),
				'23503',
			)
			await open(transaction, 'local-period', '2026-09-01')
			await sql`UPDATE hcm.attendance_period SET state='Closing',revision=revision+1 WHERE tenant_id=${tenant} AND id='local-period'`.execute(
				transaction,
			)
			await rejected(
				transaction,
				/** Lock actor references remain composite with the local tenant. */ () =>
					sql`INSERT INTO hcm.attendance_period_lock(tenant_id,id,period_id,lock_number,input_digest,output_digest,reconciliation_digest,locked_by_account_id) VALUES(${tenant},'foreign-actor-lock','local-period',1,repeat('a',64),repeat('b',64),repeat('c',64),'foreign-account')`.execute(
						transaction,
					),
				'23503',
			)
			await sql`SELECT set_config('hcm.tenant_id','',true)`.execute(transaction)
			expect((await sql`SELECT id FROM hcm.attendance_period`.execute(transaction)).rows).toEqual(
				[],
			)
			expect(
				/** Pool handles have no bounded transaction lifetime. */ () =>
					binder.bind(runtime, tenant),
			).toThrow('tenant transaction')
		},
	))

it('serializes publication against period insertion and closing across connections and DateStyle settings', /** Shared month fences protect both absent and existing snapshots until the producing transaction settles. */ async () => {
	const connectionString = process.env['HCM_TEST_RUNTIME']
	if (!connectionString) throw new Error('Disposable database required')
	const writer = new Client({ connectionString })
	await writer.connect()
	try {
		for (const existing of [false, true]) {
			const month = existing ? '2027-02-01' : '2027-01-01',
				id = existing ? 'race-existing' : 'race-absent'
			if (existing) {
				await api.admin.query(
					'INSERT INTO hcm.attendance_period(tenant_id,id,month_start) VALUES($1,$2,$3)',
					[tenant, id, month],
				)
				await api.admin.query(
					"UPDATE hcm.attendance_period SET state='Open',revision=revision+1 WHERE tenant_id=$1 AND id=$2",
					[tenant, id],
				)
			}
			let pending: Promise<unknown> | undefined
			await writer.query('BEGIN')
			await writer.query("SELECT set_config('hcm.tenant_id',$1,true)", [tenant])
			await writer.query("SET LOCAL DateStyle TO 'SQL, DMY'")
			const pid = (await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
			await runtime.transaction().execute(
				/** Hold the reader's shared fence while a real competing write waits. */ async (
					transaction,
				) => {
					await sql`SELECT set_config('hcm.tenant_id',${tenant},true)`.execute(transaction)
					const port = binder.bind(transaction, tenant),
						before = await port.fence(month, month)
					pending = writer
						.query(
							existing
								? "UPDATE hcm.attendance_period SET state='Closing',revision=revision+1 WHERE tenant_id=$1 AND id=$2"
								: 'INSERT INTO hcm.attendance_period(tenant_id,id,month_start) VALUES($1,$2,$3)',
							existing ? [tenant, id] : [tenant, id, month],
						)
						.then(
							/** Capture success without allowing an unhandled promise during the lock assertion. */ (
								result,
							) => result,
							/** Surface the safe SQL error after releasing the test fence. */ (error) => error,
						)
					let blocked = false
					for (let attempt = 0; attempt < 100 && !blocked; attempt++) {
						blocked = (
							await api.admin.query(
								'SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted) AS blocked',
								[pid],
							)
						).rows[0].blocked
						if (!blocked) await delay(10)
					}
					expect(blocked).toBe(true)
					expect(await port.read(month, month)).toEqual(before)
				},
			)
			const result = await pending
			expect(result).not.toBeInstanceOf(Error)
			await writer.query('COMMIT')
			await scenario(
				/** Re-read after the competing transaction commits. */ async (transaction) => {
					expect(
						(await binder.bind(transaction, tenant).read(month, month)).months[0].period?.state,
					).toBe(existing ? 'Closing' : 'Planned')
				},
			)
		}
	} finally {
		await writer.query('ROLLBACK')
		await writer.end()
	}
})
