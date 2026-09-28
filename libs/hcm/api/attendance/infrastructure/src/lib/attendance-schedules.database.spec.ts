import { beforeAll, afterAll, it, expect } from 'vitest'
import { Client, Pool } from 'pg'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { setTimeout as delay } from 'node:timers/promises'
import { KyselyScheduleReader } from './hcm-api-attendance-infrastructure'
import { resolve } from 'node:path'
import { migrateHcmDatabase, loadSqlMigrations } from '@empflowyee/hcm-api-database-migrations'
import { runDevelopmentSeeds } from '@empflowyee/hcm-api-database-seed'

const tenant = 'local-dunder-mifflin',
	actor = 'dunder-mifflin/account/toby'
let admin: Client, runtime: Client
let projection: Kysely<unknown>

/** Refuse to run destructive test setup outside the explicit disposable PostgreSQL harness. */
function connection(role: string): string {
	const value = process.env[`HCM_TEST_${role}`]
	if (!value) throw new Error('Disposable database required')
	return value
}

/** Isolate each database scenario and its fixture writes under the real runtime role. */
async function scenario(work: () => Promise<void>): Promise<void> {
	await runtime.query('BEGIN')
	try {
		await runtime.query("SELECT set_config('hcm.tenant_id',$1,true)", [tenant])
		await work()
	} finally {
		await runtime.query('ROLLBACK')
	}
}

/** Assert a SQL guard failure while preserving the surrounding transaction for subsequent invariant checks. */
async function denied(statement: string, values: unknown[] = [], code = '23514'): Promise<void> {
	await runtime.query('SAVEPOINT rejected_command')
	try {
		await expect(runtime.query(statement, values)).rejects.toMatchObject({ code })
	} finally {
		await runtime.query('ROLLBACK TO SAVEPOINT rejected_command')
	}
}

/** Build explicit test configuration; these fixtures are never production defaults. */
async function schedule(id = 'schedule-one', template = false): Promise<void> {
	await runtime.query(
		'INSERT INTO hcm.work_schedule(tenant_id,id,code,is_template,created_by_account_id) VALUES($1,$2,$3,$4,$5)',
		[tenant, id, id.toUpperCase(), template, actor],
	)
	await version(id, id + '-v1', 1)
}

/** Insert a complete seven-day draft version with a deliberately simple test shift. */
async function version(root: string, id: string, number: number): Promise<void> {
	await runtime.query(
		"INSERT INTO hcm.work_schedule_version(tenant_id,id,schedule_id,version_number,name,effective_from,timezone_mode,fixed_zone,week_starts_on,created_by_account_id) VALUES($1,$2,$3,$4,'Test schedule','2026-01-01','Fixed','America/New_York',1,$5)",
		[tenant, id, root, number, actor],
	)
	await runtime.query(
		"INSERT INTO hcm.work_schedule_day(tenant_id,id,version_id,weekday,kind) SELECT $1,$2||'-day-'||i,$2,i,CASE WHEN i<=5 THEN 'Work' ELSE 'Rest' END FROM generate_series(1,7) i",
		[tenant, id],
	)
	await runtime.query(
		"INSERT INTO hcm.work_schedule_segment(tenant_id,id,version_id,day_id,ordinal,kind,start_time,end_time,start_day_offset,end_day_offset) SELECT $1,$2||'-segment-'||i,$2,$2||'-day-'||i,1,'Work','09:00','18:00',0,0 FROM generate_series(1,5) i",
		[tenant, id],
	)
}

/** Publish only after the test has established a complete source pattern. */
async function publish(id = 'schedule-one-v1'): Promise<void> {
	await runtime.query(
		"UPDATE hcm.work_schedule_version SET state='Published',revision=revision+1,published_by_account_id=$3,published_at=now(),publication_digest=repeat('a',64) WHERE tenant_id=$1 AND id=$2",
		[tenant, id, actor],
	)
}

it('projects only the version DTO and retains tenant scoping across pooled reuse', /** A database row or publication actor must never leak through the configuration read model. */ async () => {
	await runtime.query('BEGIN')
	await runtime.query("SELECT set_config('hcm.tenant_id',$1,true)", [tenant])
	await schedule('reader-schedule')
	await publish('reader-schedule-v1')
	await runtime.query('COMMIT')
	const view = await projection.transaction().execute(
		/** Read only through an explicitly tenant-bound transaction. */ async (transaction) => {
			await sql`SELECT set_config('hcm.tenant_id',${tenant},true)`.execute(transaction)
			return new KyselyScheduleReader(transaction, tenant).version(
				'reader-schedule',
				'reader-schedule-v1',
			)
		},
	)
	expect(view).toMatchObject({
		id: 'reader-schedule',
		versionId: 'reader-schedule-v1',
		state: 'Published',
		fixedZone: 'America/New_York',
		revision: 2,
	})
	expect(view?.days).toHaveLength(7)
	expect(view?.days[0].segments[0]).toEqual({
		startTime: '09:00:00',
		endTime: '18:00:00',
		endDayOffset: 0,
		kind: 'Work',
	})
	expect(JSON.stringify(view)).not.toMatch(
		/tenant_id|created_by|published_by|publication_digest|start_day_offset/,
	)
	await projection.transaction().execute(
		/** No tenant setting from the prior pooled transaction may survive checkout. */ async (
			transaction,
		) => {
			expect(
				await new KyselyScheduleReader(transaction, tenant).version(
					'reader-schedule',
					'reader-schedule-v1',
				),
			).toBeNull()
		},
	)
})

it('serializes publication against a racing child edit', /** A child editor that waits behind publication must see Published and reject its stale write. */ async () => {
	const competitor = new Client({ connectionString: connection('RUNTIME') })
	await competitor.connect()
	try {
		await runtime.query('BEGIN')
		await runtime.query("SELECT set_config('hcm.tenant_id',$1,true)", [tenant])
		await schedule('race-schedule')
		await runtime.query('COMMIT')
		await runtime.query('BEGIN')
		await runtime.query("SELECT set_config('hcm.tenant_id',$1,true)", [tenant])
		await publish('race-schedule-v1')
		await competitor.query('BEGIN')
		await competitor.query("SELECT set_config('hcm.tenant_id',$1,true)", [tenant])
		const pid = (await competitor.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
		const pending = competitor
			.query(
				"UPDATE hcm.work_schedule_segment SET end_time='17:00' WHERE tenant_id=$1 AND id='race-schedule-v1-segment-1'",
				[tenant],
			)
			.then(
				/** Successful mutation would violate the publication fence. */ () => null,
				/** Preserve only the SQL classification for the race assertion. */ (error: {
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
	} finally {
		await runtime.query('ROLLBACK')
		await competitor.query('ROLLBACK')
		await competitor.end()
	}
})

beforeAll(
	/** Apply every canonical forward migration to the disposable database before seeding known actors. */ async () => {
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
	},
)
afterAll(
	/** Release test connections before the harness removes its container. */ async () => {
		await runtime?.end()
		await projection?.destroy()
		await admin?.end()
	},
)

it('publishes complete patterns and protects immutable versions and children', /** Only retirement may change published lifecycle; payload updates and deletion remain forbidden. */ async () =>
	scenario(
		/** Exercise version and child constraints with actual runtime SQL privileges. */ async () => {
			await schedule()
			await publish()
			await denied(
				"UPDATE hcm.work_schedule_version SET name='Changed',revision=revision+1 WHERE tenant_id=$1 AND id='schedule-one-v1'",
				[tenant],
			)
			await denied(
				"UPDATE hcm.work_schedule_segment SET end_time='17:00' WHERE tenant_id=$1 AND id='schedule-one-v1-segment-1'",
				[tenant],
			)
			await denied(
				"DELETE FROM hcm.work_schedule_segment WHERE tenant_id=$1 AND id='schedule-one-v1-segment-1'",
				[tenant],
			)
			await denied(
				"DELETE FROM hcm.work_schedule_version WHERE tenant_id=$1 AND id='schedule-one-v1'",
				[tenant],
				'42501',
			)
			await runtime.query(
				"UPDATE hcm.work_schedule_version SET state='Retired',revision=revision+1 WHERE tenant_id=$1 AND id='schedule-one-v1'",
				[tenant],
			)
			await denied(
				"UPDATE hcm.work_schedule_version SET state='Draft',revision=revision+1,published_at=NULL,published_by_account_id=NULL,publication_digest=NULL WHERE tenant_id=$1 AND id='schedule-one-v1'",
				[tenant],
			)
		},
	))

it('rejects incomplete, split and rest-with-work patterns at publication', /** Direct SQL cannot bypass the universal parser's single-shift and seven-weekday rules. */ async () =>
	scenario(
		/** Remove required draft structure then test multiple invalid publication bases. */ async () => {
			await schedule()
			await runtime.query(
				"DELETE FROM hcm.work_schedule_day WHERE tenant_id=$1 AND id='schedule-one-v1-day-7'",
				[tenant],
			)
			await runtime.query('SAVEPOINT incomplete')
			await expect(publish()).rejects.toMatchObject({ code: '23514' })
			await runtime.query('ROLLBACK TO SAVEPOINT incomplete')
			await runtime.query(
				"INSERT INTO hcm.work_schedule_day(tenant_id,id,version_id,weekday,kind) VALUES($1,'schedule-one-v1-day-7','schedule-one-v1',7,'Rest')",
				[tenant],
			)
			await runtime.query(
			"UPDATE hcm.work_schedule_day SET kind='Rest' WHERE tenant_id=$1 AND version_id='schedule-one-v1' AND weekday=1",
				[tenant],
			)
			await runtime.query('SAVEPOINT rest_work')
			await expect(publish()).rejects.toMatchObject({ code: '23514' })
			await runtime.query('ROLLBACK TO SAVEPOINT rest_work')
			await runtime.query(
			"UPDATE hcm.work_schedule_day SET kind='Work' WHERE tenant_id=$1 AND version_id='schedule-one-v1' AND weekday=1",
				[tenant],
			)
			await runtime.query(
				"UPDATE hcm.work_schedule_segment SET end_time='12:00' WHERE tenant_id=$1 AND id='schedule-one-v1-segment-1'",
				[tenant],
			)
			await runtime.query(
				"INSERT INTO hcm.work_schedule_segment(tenant_id,id,version_id,day_id,ordinal,kind,start_time,end_time,start_day_offset,end_day_offset) VALUES($1,'split','schedule-one-v1','schedule-one-v1-day-1',2,'Work','14:00','18:00',0,0)",
				[tenant],
			)
			await runtime.query('SAVEPOINT split')
			await expect(publish()).rejects.toMatchObject({ code: '23514' })
			await runtime.query('ROLLBACK TO SAVEPOINT split')
		},
	))

it('rejects conflicting publication periods and preserves exact time precision', /** Published versions cannot compete over the same root period, and SQL must reject sub-millisecond rounding input. */ async () =>
	scenario(
		/** Publish one root and attempt a second overlapping version. */ async () => {
			await schedule()
			await publish()
			await version('schedule-one', 'schedule-one-v2', 2)
			await runtime.query('SAVEPOINT overlap')
			await expect(publish('schedule-one-v2')).rejects.toMatchObject({ code: '23P01' })
			await runtime.query('ROLLBACK TO SAVEPOINT overlap')
			await denied(
				"UPDATE hcm.work_schedule_segment SET start_time='09:00:00.0001' WHERE tenant_id=$1 AND id='schedule-one-v2-segment-1'",
				[tenant],
			)
			await denied(
				"UPDATE hcm.work_schedule_version SET minimum_rest_minutes=660,revision=revision+1 WHERE tenant_id=$1 AND id='schedule-one-v2'",
				[tenant],
			)
			expect(
				(
					await runtime.query(
						"SELECT minimum_rest_minutes,minimum_rest_mode FROM hcm.work_schedule_version WHERE tenant_id=$1 AND id='schedule-one-v2'",
						[tenant],
					)
				).rows[0],
			).toEqual({ minimum_rest_minutes: null, minimum_rest_mode: null })
		},
	))

it('requires one typed scope and refuses templates, drafts and overlapping assignments', /** Tenant assignment identity and version/date coverage are checked in SQL as well as source commands. */ async () =>
	scenario(
		/** Exercise draft/template denials before assigning an actual published version. */ async () => {
			await schedule()
			const assign =
				"INSERT INTO hcm.work_schedule_assignment(tenant_id,id,version_id,scope_kind,effective_from,created_by_account_id) VALUES($1,$2,$3,'Tenant','2026-01-01',$4)"
			await denied(assign, [tenant, 'draft-assignment', 'schedule-one-v1', actor])
			await schedule('schedule-template', true)
			await publish('schedule-template-v1')
			await denied(assign, [tenant, 'template-assignment', 'schedule-template-v1', actor])
			await publish()
			await runtime.query(assign, [tenant, 'valid-assignment', 'schedule-one-v1', actor])
			await denied(assign, [tenant, 'overlap-assignment', 'schedule-one-v1', actor], '23P01')
			await denied(
				"INSERT INTO hcm.work_schedule_assignment(tenant_id,id,version_id,scope_kind,location_id,employment_id,effective_from,created_by_account_id) VALUES($1,'mixed','schedule-one-v1','Location','dunder-mifflin/location/scranton','dunder-mifflin/employment/jim','2026-01-01',$2)",
				[tenant, actor],
			)
			await denied(
				"INSERT INTO hcm.work_schedule_assignment(tenant_id,id,version_id,scope_kind,employment_id,effective_from,created_by_account_id) VALUES($1,'before-range','schedule-one-v1','Employment','dunder-mifflin/employment/jim','2025-12-31',$2)",
				[tenant, actor],
			)
		},
	))

it('enforces tenant RLS and composite actor ownership under the runtime role', /** Missing or foreign tenant context cannot expose even a known schedule ID. */ async () =>
	scenario(
		/** Attempt explicit foreign ownership and then remove the transaction tenant context. */ async () => {
			await schedule()
			await denied(
				"INSERT INTO hcm.work_schedule(tenant_id,id,code,is_template,created_by_account_id) VALUES('foreign-tenant','forged','FORGED',false,$1)",
				[actor],
				'42501',
			)
			await denied(
				"INSERT INTO hcm.work_schedule(tenant_id,id,code,is_template,created_by_account_id) VALUES($1,'missing-actor','MISSING',false,'foreign-account')",
				[tenant],
				'23503',
			)
			await runtime.query("SELECT set_config('hcm.tenant_id','',true)")
			expect(
				(await runtime.query("SELECT id FROM hcm.work_schedule WHERE id='schedule-one'")).rows,
			).toEqual([])
			for (const table of [
				'work_schedule',
				'work_schedule_version',
				'work_schedule_day',
				'work_schedule_segment',
				'work_schedule_assignment',
			]) {
				const flags = (
					await admin.query(
						'SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',
						['hcm.' + table],
					)
				).rows[0]
				expect(flags).toEqual({ relrowsecurity: true, relforcerowsecurity: true })
			}
		},
	))
