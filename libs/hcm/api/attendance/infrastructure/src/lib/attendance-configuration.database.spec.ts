import { beforeAll, afterAll, it, expect } from 'vitest'
import { Client, Pool } from 'pg'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { migrateHcmDatabase, loadSqlMigrations } from '@empflowyee/hcm-api-database-migrations'
import { runDevelopmentSeeds } from '@empflowyee/hcm-api-database-seed'
import { KyselyAttendanceConfigurationReader } from './configuration-readers'

const tenant = 'local-dunder-mifflin',
	actor = 'dunder-mifflin/account/toby'
let admin: Client, runtime: Client, projection: Kysely<unknown>

/** Require the explicit disposable database harness before any schema setup or fixture write. */
function connection(role: string): string {
	const value = process.env[`HCM_TEST_${role}`]
	if (!value) throw new Error('Disposable database required')
	return value
}

/** Roll back each scenario so publication state cannot affect a later fixture. */
async function scenario(work: () => Promise<void>): Promise<void> {
	await runtime.query('BEGIN')
	try {
		await runtime.query("SELECT set_config('hcm.tenant_id',$1,true)", [tenant])
		await work()
	} finally {
		await runtime.query('ROLLBACK')
	}
}

/** Prove a database denial without leaving the containing test transaction aborted. */
async function denied(statement: string, values: unknown[] = [], code = '23514'): Promise<void> {
	await runtime.query('SAVEPOINT rejected_command')
	try {
		await expect(runtime.query(statement, values)).rejects.toMatchObject({ code })
	} finally {
		await runtime.query('ROLLBACK TO SAVEPOINT rejected_command')
	}
}

/** Seed one explicit draft policy and calendar under the real runtime role. */
async function drafts(): Promise<void> {
	await runtime.query(
		"INSERT INTO hcm.attendance_policy(tenant_id,id,code,created_by_account_id) VALUES($1,'policy','EXACT',$2)",
		[tenant, actor],
	)
	await runtime.query(
		"INSERT INTO hcm.attendance_policy_version(tenant_id,id,policy_id,version_number,name,effective_from,effective_to,grace_in_minutes,grace_out_minutes,rounding,overtime_enabled,created_by_account_id) VALUES($1,'policy-v1','policy',1,'Exact','2026-01-01','2026-12-31',0,0,'None',false,$2)",
		[tenant, actor],
	)
	await runtime.query(
		"INSERT INTO hcm.holiday_calendar(tenant_id,id,code,created_by_account_id) VALUES($1,'calendar','CALENDAR',$2)",
		[tenant, actor],
	)
	await runtime.query(
		"INSERT INTO hcm.holiday_calendar_version(tenant_id,id,calendar_id,version_number,name,effective_from,effective_to,created_by_account_id) VALUES($1,'calendar-v1','calendar',1,'Calendar','2026-01-01','2026-12-31',$2)",
		[tenant, actor],
	)
	await runtime.query(
		"INSERT INTO hcm.holiday(tenant_id,id,version_id,ordinal,actual_date,observed_date,category,name,priority,start_time,end_time) VALUES($1,'holiday','calendar-v1',1,'2025-12-31','2026-01-02','Substitute','Explicit observed',3,'09:00:00.001','12:00')",
		[tenant],
	)
}

/** Apply the fixed publication mutation to either admitted configuration family. */
async function publish(owner: 'attendance_policy' | 'holiday_calendar'): Promise<void> {
	await runtime.query(
		`UPDATE hcm.${owner}_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id=$2,publication_digest=repeat('a',64) WHERE tenant_id=$1`,
		[tenant, actor],
	)
}

beforeAll(
	/** Migrate only the disposable test schema and seed current workforce identities plus a distinct foreign tenant. */ async () => {
		admin = new Client({ connectionString: connection('MIGRATOR') })
		runtime = new Client({ connectionString: connection('RUNTIME') })
		await admin.connect()
		await runtime.connect()
		projection = new Kysely({
			dialect: new PostgresDialect({
				pool: new Pool({ connectionString: connection('RUNTIME'), max: 1 }),
			}),
		})
		await admin.query('DROP SCHEMA IF EXISTS hcm CASCADE')
		const inventory = resolve('libs/hcm/api/database/migrations/sql')
		await migrateHcmDatabase(connection('MIGRATOR'), inventory)
		await runDevelopmentSeeds({
			env: {
				APP_ENVIRONMENT: 'local',
				NODE_ENV: 'test',
				HCM_SEED_TARGET: tenant,
				HCM_SEED_DATABASE_URL: connection('MIGRATOR'),
			},
			manifestDirectory: resolve('libs/hcm/api/database/seed/manifest'),
			migrations: await loadSqlMigrations(inventory),
		})
		await admin.query('BEGIN')
		await admin.query("SELECT set_config('hcm.tenant_id','foreign-tenant',true)")
		await admin.query(
			"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES('foreign-tenant','foreign','Foreign','active')",
		)
		await admin.query(
			"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES('foreign-tenant','foreign-person','Other','Person','Other Person')",
		)
		await admin.query(
			"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES('foreign-tenant','foreign-account','foreign-person','other@example.test')",
		)
		await admin.query(
			"INSERT INTO hcm.attendance_policy(tenant_id,id,code,created_by_account_id) VALUES('foreign-tenant','foreign-policy','FOREIGN','foreign-account')",
		)
		await admin.query('COMMIT')
	},
)

afterAll(
	/** Close every test connection before the harness removes its isolated PostgreSQL instance. */ async () => {
		await runtime?.end()
		await projection?.destroy()
		await admin?.end()
	},
)

it('enforces policy dependent fields and independence below the DTO layer', /** Direct SQL cannot smuggle enabled overtime, implicit rest or a self-approved adjustment. */ async () =>
	scenario(
		/** Run all invalid field transitions against a complete Draft. */ async () => {
			await drafts()
			for (const update of [
				'overtime_enabled=true',
				'overtime_cap_minutes=30',
				'minimum_rest_minutes=660',
				"rounding='Configured'",
				'grace_in_minutes=-1',
			])
				await denied(
					`UPDATE hcm.attendance_policy_version SET ${update},revision=revision+1 WHERE tenant_id=$1`,
					[tenant],
				)
			await denied(
				"INSERT INTO hcm.attendance_approval_rule(tenant_id,id,version_id,ordinal,subject_type,stage,independent,candidate_source) VALUES($1,'bad-rule','policy-v1',1,'Adjustment',1,false,'LineManager')",
				[tenant],
			)
			await denied(
				"INSERT INTO hcm.attendance_approval_rule(tenant_id,id,version_id,ordinal,subject_type,stage,independent,candidate_source,account_id) VALUES($1,'bad-rule','policy-v1',1,'Adjustment',1,true,'LineManager','foreign-account')",
				[tenant],
			)
			await denied(
				"INSERT INTO hcm.attendance_approval_rule(tenant_id,id,version_id,ordinal,subject_type,stage,independent,candidate_source,account_id) VALUES($1,'bad-rule','policy-v1',1,'Adjustment',1,true,'NamedUser','foreign-account')",
				[tenant],
				'23503',
			)
		},
	))

it('requires a manager slot at publication and freezes policy rules', /** Draft editing may be incomplete, but publication cannot omit actual overtime approval or skip a stage. */ async () =>
	scenario(
		/** Complete the policy incrementally and prove every publication fence. */ async () => {
			await drafts()
			await runtime.query(
				"UPDATE hcm.attendance_policy_version SET overtime_enabled=true,overtime_qualification='ScheduledExcess',overtime_cap_minutes=120,overtime_preapproval_required=false,revision=revision+1 WHERE tenant_id=$1",
				[tenant],
			)
			await denied(
				"UPDATE hcm.attendance_policy_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id=$2,publication_digest=repeat('a',64) WHERE tenant_id=$1",
				[tenant, actor],
			)
			await runtime.query(
				"INSERT INTO hcm.attendance_approval_rule(tenant_id,id,version_id,ordinal,subject_type,stage,independent,candidate_source) VALUES($1,'manager-rule','policy-v1',1,'Overtime',2,true,'LineManager')",
				[tenant],
			)
			await denied(
				"UPDATE hcm.attendance_policy_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id=$2,publication_digest=repeat('a',64) WHERE tenant_id=$1",
				[tenant, actor],
			)
			await runtime.query('UPDATE hcm.attendance_approval_rule SET stage=1 WHERE tenant_id=$1', [
				tenant,
			])
			await publish('attendance_policy')
			await denied('UPDATE hcm.attendance_approval_rule SET stage=2 WHERE tenant_id=$1', [tenant])
			await denied('DELETE FROM hcm.attendance_approval_rule WHERE tenant_id=$1', [tenant])
			await denied(
				'UPDATE hcm.attendance_policy_version SET grace_in_minutes=5,revision=revision+1 WHERE tenant_id=$1',
				[tenant],
			)
			await denied(
				'DELETE FROM hcm.attendance_policy_version WHERE tenant_id=$1',
				[tenant],
				'42501',
			)
		},
	))

it('keeps explicit holiday dates and rejects incomplete or lossy partial intervals', /** Storage cannot invent observed dates, round sub-milliseconds or edit a published holiday. */ async () =>
	scenario(
		/** Test validity both during draft editing and at publication. */ async () => {
			await drafts()
			for (const update of [
				'end_time=NULL',
				"end_time='08:00'",
				"start_time='09:00:00.0001'",
				"end_time='24:00'",
				"category='AutomaticSubstitute'",
			])
				await denied(`UPDATE hcm.holiday SET ${update} WHERE tenant_id=$1`, [tenant])
			await runtime.query("UPDATE hcm.holiday SET observed_date='2027-01-01' WHERE tenant_id=$1", [
				tenant,
			])
			await denied(
				"UPDATE hcm.holiday_calendar_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id=$2,publication_digest=repeat('a',64) WHERE tenant_id=$1",
				[tenant, actor],
			)
			await runtime.query("UPDATE hcm.holiday SET observed_date='2026-01-02' WHERE tenant_id=$1", [
				tenant,
			])
			await publish('holiday_calendar')
			await denied("UPDATE hcm.holiday SET name='Changed' WHERE tenant_id=$1", [tenant])
			await denied('DELETE FROM hcm.holiday WHERE tenant_id=$1', [tenant])
			expect(
				(
					await runtime.query(
						'SELECT actual_date::text,observed_date::text FROM hcm.holiday WHERE tenant_id=$1',
						[tenant],
					)
				).rows[0],
			).toEqual({ actual_date: '2025-12-31', observed_date: '2026-01-02' })
		},
	))

it('rejects overlapping assignments and permits only ending existing retired coverage', /** Retiring a version preserves history while allowing its assignment to be explicitly superseded. */ async () =>
	scenario(
		/** Exercise both owner families under identical typed scope rules. */ async () => {
			await drafts()
			for (const owner of ['attendance_policy', 'holiday_calendar'] as const) {
				const versionId = owner === 'attendance_policy' ? 'policy-v1' : 'calendar-v1'
				const insert = `INSERT INTO hcm.${owner}_assignment(tenant_id,id,version_id,scope_kind,effective_from,effective_to,created_by_account_id) VALUES($1,$2,$3,'Tenant','2026-01-01','2026-12-31',$4)`
				await denied(insert, [tenant, 'assignment', versionId, actor])
				await publish(owner)
				await runtime.query(insert, [tenant, 'assignment', versionId, actor])
				await denied(insert, [tenant, 'overlap', versionId, actor], '23P01')
				await denied(
					`INSERT INTO hcm.${owner}_assignment(tenant_id,id,version_id,scope_kind,effective_from,created_by_account_id) VALUES($1,'unbounded',$2,'Tenant','2027-01-01',$3)`,
					[tenant, versionId, actor],
				)
				await runtime.query(
					`UPDATE hcm.${owner}_version SET state='Retired',revision=revision+1 WHERE tenant_id=$1`,
					[tenant],
				)
				await runtime.query(
					`UPDATE hcm.${owner}_assignment SET effective_to='2026-06-30',revision=revision+1 WHERE tenant_id=$1`,
					[tenant],
				)
				await denied(
					`UPDATE hcm.${owner}_assignment SET effective_to='2026-07-01',revision=revision+1 WHERE tenant_id=$1`,
					[tenant],
				)
				await denied(
					`UPDATE hcm.${owner}_assignment SET effective_to=NULL,revision=revision+1 WHERE tenant_id=$1`,
					[tenant],
				)
			}
		},
	))

it('enforces RLS and composite ownership with a real second tenant', /** Known foreign IDs cannot become local roots, named candidates or visible list entries. */ async () =>
	scenario(
		/** Inspect current role behavior and policy flags without bypassing row-level security. */ async () => {
			await drafts()
			expect(
				(await runtime.query("SELECT id FROM hcm.attendance_policy WHERE id='foreign-policy'"))
					.rows,
			).toEqual([])
			await denied(
				"INSERT INTO hcm.attendance_policy(tenant_id,id,code,created_by_account_id) VALUES('foreign-tenant','forged','FORGED','foreign-account')",
				[],
				'42501',
			)
			await denied(
				"INSERT INTO hcm.attendance_policy(tenant_id,id,code,created_by_account_id) VALUES($1,'forged','FORGED','foreign-account')",
				[tenant],
				'23503',
			)
			for (const name of [
				'attendance_policy',
				'attendance_policy_version',
				'attendance_approval_rule',
				'attendance_policy_assignment',
				'holiday_calendar',
				'holiday_calendar_version',
				'holiday',
				'holiday_calendar_assignment',
			]) {
				const flags = (
					await admin.query(
						'SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',
						['hcm.' + name],
					)
				).rows[0]
				expect(flags).toEqual({ relrowsecurity: true, relforcerowsecurity: true })
			}
			await runtime.query("SELECT set_config('hcm.tenant_id','',true)")
			expect((await runtime.query('SELECT id FROM hcm.attendance_policy')).rows).toEqual([])
		},
	))

it('projects safe contracts from SQL and clears tenant context on pool reuse', /** Neither audit actors nor publication digests leak through the declared DTO projection. */ async () => {
	await runtime.query('BEGIN')
	await runtime.query("SELECT set_config('hcm.tenant_id',$1,true)", [tenant])
	await drafts()
	await runtime.query('COMMIT')
	await projection.transaction().execute(
		/** Read both owner DTOs using one explicitly bound transaction. */ async (transaction) => {
			await sql`SELECT set_config('hcm.tenant_id',${tenant},true)`.execute(transaction)
			const reader = new KyselyAttendanceConfigurationReader(transaction, tenant)
			const policy = await reader.policy('policy', 'policy-v1')
			const calendar = await reader.holidayCalendar('calendar', 'calendar-v1')
			expect(policy).toMatchObject({
				overtime: { enabled: false },
				approvalRules: [],
				rounding: 'None',
			})
			expect(policy).not.toHaveProperty('minimumRestMinutes')
			expect(calendar?.entries[0]).toMatchObject({
				date: '2025-12-31',
				observedDate: '2026-01-02',
				startTime: '09:00:00.001',
			})
			expect(JSON.stringify([policy, calendar])).not.toMatch(
				/tenant_id|created_by|published_by|publication_digest|version_id/,
			)
			expect(
				await new KyselyAttendanceConfigurationReader(transaction, 'foreign-tenant').policy(
					'foreign-policy',
					'unknown',
				),
			).toBeNull()
		},
	)
	await projection.transaction().execute(
		/** A pooled connection must not retain the previous transaction's tenant. */ async (
			transaction,
		) => {
			const reader = new KyselyAttendanceConfigurationReader(transaction, tenant)
			expect(await reader.policy('policy', 'policy-v1')).toBeNull()
			expect(await reader.holidayCalendar('calendar', 'calendar-v1')).toBeNull()
		},
	)
	expect(
		/** A raw pool cannot be passed as an implicitly authorized configuration reader. */ () =>
			new KyselyAttendanceConfigurationReader(projection, tenant),
	).toThrow()
})

it('serializes configuration publication against concurrent edits to both child families', /** An editor waiting behind publication must see the new immutable state before it changes a rule or holiday. */ async () => {
	const competitor = new Client({ connectionString: connection('RUNTIME') })
	await competitor.connect()
	try {
		await runtime.query('BEGIN')
		await runtime.query("SELECT set_config('hcm.tenant_id',$1,true)", [tenant])
		await runtime.query(
			"INSERT INTO hcm.attendance_policy(tenant_id,id,code,created_by_account_id) VALUES($1,'race-policy','RACE_POLICY',$2)",
			[tenant, actor],
		)
		await runtime.query(
			"INSERT INTO hcm.attendance_policy_version(tenant_id,id,policy_id,version_number,name,effective_from,grace_in_minutes,grace_out_minutes,rounding,overtime_enabled,created_by_account_id) VALUES($1,'race-policy-v1','race-policy',1,'Race','2026-01-01',0,0,'None',false,$2)",
			[tenant, actor],
		)
		await runtime.query(
			"INSERT INTO hcm.attendance_approval_rule(tenant_id,id,version_id,ordinal,subject_type,stage,independent,candidate_source) VALUES($1,'race-rule','race-policy-v1',1,'Adjustment',1,true,'LineManager')",
			[tenant],
		)
		await runtime.query(
			"INSERT INTO hcm.holiday_calendar(tenant_id,id,code,created_by_account_id) VALUES($1,'race-calendar','RACE_CALENDAR',$2)",
			[tenant, actor],
		)
		await runtime.query(
			"INSERT INTO hcm.holiday_calendar_version(tenant_id,id,calendar_id,version_number,name,effective_from,created_by_account_id) VALUES($1,'race-calendar-v1','race-calendar',1,'Race','2026-01-01',$2)",
			[tenant, actor],
		)
		await runtime.query(
			"INSERT INTO hcm.holiday(tenant_id,id,version_id,ordinal,actual_date,observed_date,category,name,priority) VALUES($1,'race-holiday','race-calendar-v1',1,'2026-01-01','2026-01-01','Company','Race',1)",
			[tenant],
		)
		await runtime.query('COMMIT')
		for (const [owner, versionId, edit] of [
			[
				'attendance_policy',
				'race-policy-v1',
				"UPDATE hcm.attendance_approval_rule SET stage=2 WHERE tenant_id=$1 AND id='race-rule'",
			],
			[
				'holiday_calendar',
				'race-calendar-v1',
				"UPDATE hcm.holiday SET name='Changed' WHERE tenant_id=$1 AND id='race-holiday'",
			],
		]) {
			await runtime.query('BEGIN')
			await runtime.query("SELECT set_config('hcm.tenant_id',$1,true)", [tenant])
			await runtime.query(
				`UPDATE hcm.${owner}_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id=$2,publication_digest=repeat('a',64) WHERE tenant_id=$1 AND id=$3`,
				[tenant, actor, versionId],
			)
			await competitor.query('BEGIN')
			await competitor.query("SELECT set_config('hcm.tenant_id',$1,true)", [tenant])
			const pid = (await competitor.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
			const pending = competitor.query(edit, [tenant]).then(
				/** A successful concurrent write would violate the publication fence. */ () => null,
				/** Preserve only the SQL failure category for the invariant assertion. */ (error: {
					code: string
				}) => error.code,
			)
			let waiting = false
			for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
				waiting = (
					await admin.query(
						'SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted) AS waiting',
						[pid],
					)
				).rows[0].waiting
				if (!waiting) await delay(10)
			}
			expect(waiting).toBe(true)
			await runtime.query('COMMIT')
			expect(await pending).toBe('23514')
			await competitor.query('ROLLBACK')
		}
	} finally {
		await runtime.query('ROLLBACK')
		await competitor.query('ROLLBACK')
		await competitor.end()
	}
})
