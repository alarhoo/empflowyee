import { beforeAll, afterAll, it, expect } from 'vitest'
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { sql } from 'kysely'
import { migrateHcmDatabase, loadSqlMigrations } from '@empflowyee/hcm-api-database-migrations'
import { runDevelopmentSeeds } from '@empflowyee/hcm-api-database-seed'
import { HcmTenantDatabase } from '@empflowyee/hcm-api-database-kysely'
import {
	HcmWorkloadIssuer,
	type HcmWorkIntent,
	type HcmWorkloadContext,
	type ClaimedHcmWork,
} from '@empflowyee/hcm-api-runtime-application'
import {
	HcmRuntimeStore,
	HcmDurableWorkStore,
	enqueueHcmWork,
	advanceHcmPlanner,
	HcmTransactionalWorkerLane,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import type { WorkloadAuditTables } from '@empflowyee/hcm-api-audit-infrastructure'

interface WorkTables extends WorkloadAuditTables {
	'hcm.access_role': { tenant_id: string; id: string; label: string }
}
const tenant = 'local-dunder-mifflin'
let admin: Client
let runtime: Client
let directory: HcmRuntimeStore
let database: HcmTenantDatabase<WorkTables>
let store: HcmDurableWorkStore<WorkTables>
let context: HcmWorkloadContext
let second: HcmWorkloadContext

/** Never run failure injection against a developer or deployment database. */
function connection(role: string): string {
	const value = process.env[`HCM_TEST_${role}`]
	if (!value) throw new Error('Disposable PostgreSQL harness required')
	return value
}

/** Build test-only intent whose kind isolates each acceptance scenario. */
function intent(kind: string, businessKey = randomUUID()): HcmWorkIntent {
	return {
		workload: 'LeaveAccrual',
		kind,
		schemaVersion: 1,
		businessKey,
		payload: { rule: 'test-rule', date: '2026-09-28' },
	}
}

/** Insert work through the producer's real tenant-scoped SQL transaction. */
function enqueue(value: HcmWorkIntent) {
	return database.workloadTransaction(
		context,
		'LeaveAccrual',
		/** Store the test producer's durable intent under the verified tenant. */ (transaction) =>
			enqueueHcmWork(transaction, tenant, value),
	)
}

/** Fail loudly when the scenario expected an available claim. */
function claimed(work: ClaimedHcmWork | null): ClaimedHcmWork {
	if (!work) throw new Error('Expected a durable work claim')
	return work
}

beforeAll(
	/** Provision domain outboxes and real runtime roles using the repository's explicit migration path. */ async () => {
		admin = new Client({ connectionString: connection('MIGRATOR') })
		runtime = new Client({ connectionString: connection('RUNTIME') })
		await admin.connect()
		await runtime.connect()
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
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		await runtime.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		directory = new HcmRuntimeStore(connection('RUNTIME'))
		const issuer = new HcmWorkloadIssuer(directory, ['LeaveAccrual'])
		context = await issuer.issue(tenant, 'LeaveAccrual', randomUUID(), 300000)
		second = await issuer.issue(tenant, 'LeaveAccrual', randomUUID(), 300000)
		database = new HcmTenantDatabase({ connectionString: connection('RUNTIME'), maxConnections: 4 })
		store = new HcmDurableWorkStore(database, { leaseMilliseconds: 10000, maximumAttempts: 2 })
	},
)

afterAll(
	/** Drain only this suite's pools; the harness removes its uniquely named container. */ async () => {
		await database?.destroy()
		await directory?.onApplicationShutdown()
		await runtime?.end()
		await admin?.end()
	},
)

it('deduplicates canonical intent and rejects conflicting replay without overwriting evidence', /** Object property order is irrelevant but changed business input cannot reuse a key. */ async () => {
	const value = intent('test.replay')
	const id = await enqueue(value)
	expect(await enqueue({ ...value, payload: { date: '2026-09-28', rule: 'test-rule' } })).toBe(id)
	await expect(
		enqueue({ ...value, payload: { date: '2026-09-29', rule: 'test-rule' } }),
	).rejects.toMatchObject({ code: 'work-conflict' })
	expect(
		(await admin.query('SELECT count(*)::int AS count FROM hcm.leave_outbox WHERE id=$1', [id]))
			.rows[0].count,
	).toBe(1)
	await expect(
		runtime.query("UPDATE hcm.leave_outbox SET payload='{}' WHERE id=$1", [id]),
	).rejects.toMatchObject({ code: '42501' })
	await expect(
		runtime.query('DELETE FROM hcm.leave_outbox WHERE id=$1', [id]),
	).rejects.toMatchObject({ code: '42501' })
})

it('claims different rows under concurrent workers and completes each effect once', /** The claim commits separately, while the effect and completion marker share one transaction. */ async () => {
	await enqueue(intent('test.parallel'))
	await enqueue(intent('test.parallel'))
	const [left, right] = await Promise.all([
		store.claim(context, ['test.parallel']),
		store.claim(second, ['test.parallel']),
	])
	expect(claimed(left).id).not.toBe(claimed(right).id)
	for (const [authority, work] of [
		[context, claimed(left)],
		[second, claimed(right)],
	] as const) {
		await store.complete(
			authority,
			work,
			/** Represent a durable domain effect with a unique test-owned tenant record. */ async (
				transaction,
				verified,
			) => {
				await transaction
					.insertInto('hcm.access_role')
					.values({ tenant_id: tenant, id: verified.id, label: verified.id })
					.execute()
			},
		)
		await expect(
			store.complete(
				authority,
				work,
				/** A replay must never reach the handler after completion. */ async () => {
					throw new Error('Replayed handler')
				},
			),
		).rejects.toMatchObject({ code: 'lease-lost' })
	}
	expect(await store.claim(context, ['test.parallel'])).toBeNull()
})

it('rolls back a crashed handler and retries its original intent', /** A crash after SQL mutation but before completion cannot leave a partial business effect or receipt. */ async () => {
	await enqueue(intent('test.crash'))
	const work = claimed(await store.claim(context, ['test.crash']))
	await expect(
		store.complete(
			context,
			work,
			/** Inject a failure after the write inside the completion transaction. */ async (
				transaction,
			) => {
				await transaction
					.insertInto('hcm.access_role')
					.values({ tenant_id: tenant, id: 'crashed-effect', label: 'Crashed effect' })
					.execute()
				throw new Error('Injected crash')
			},
		),
	).rejects.toThrow('Injected crash')
	expect(
		(await admin.query("SELECT id FROM hcm.access_role WHERE id='crashed-effect'")).rows,
	).toEqual([])
	await store.fail(context, work, 'handler-failed', 0)
	const retry = claimed(await store.claim(second, ['test.crash']))
	expect(retry).toMatchObject({ id: work.id, digest: work.digest, attempt: 2, fence: 2 })
	await store.complete(
		second,
		retry,
		/** The recovered handler verifies the retained immutable intent. */ async (
			_transaction,
			verified,
		) => {
			expect(verified.payload).toEqual(work.payload)
		},
	)
})

it('fences a crashed expired lease and refuses stale completion or failure', /** A new holder can recover the item; the old fence can never publish or overwrite the new outcome. */ async () => {
	await enqueue(intent('test.fence'))
	const old = claimed(await store.claim(context, ['test.fence']))
	await admin.query(
		"UPDATE hcm.leave_outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
		[old.id],
	)
	const current = claimed(await store.claim(second, ['test.fence']))
	expect(current.fence).toBe(old.fence + 1)
	await expect(
		store.complete(
			context,
			old,
			/** A stale owner must not reach any business handler. */ async () => {
				throw new Error('Stale handler ran')
			},
		),
	).rejects.toMatchObject({ code: 'lease-lost' })
	await expect(store.fail(context, old, 'old-owner', 0)).rejects.toMatchObject({
		code: 'lease-lost',
	})
	await store.complete(
		second,
		current,
		/** Accept only the new owner's retained work identity. */ async (_transaction, verified) => {
			expect(verified.id).toBe(old.id)
		},
	)
})

it('quarantines exhausted work without starving another due item', /** Both explicit failure and final-attempt crash become visible exceptions rather than infinite retry loops. */ async () => {
	await enqueue(intent('test.poison'))
	let work = claimed(await store.claim(context, ['test.poison']))
	await store.fail(context, work, 'poison', 0)
	work = claimed(await store.claim(context, ['test.poison']))
	await admin.query(
		"UPDATE hcm.leave_outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
		[work.id],
	)
	const healthyId = await enqueue(intent('test.poison'))
	const healthy = claimed(await store.claim(second, ['test.poison']))
	expect(healthy.id).toBe(healthyId)
	expect(
		(await admin.query('SELECT state,last_error_code FROM hcm.leave_outbox WHERE id=$1', [work.id]))
			.rows[0],
	).toEqual({ state: 'Exception', last_error_code: 'retry-exhausted' })
	await store.fail(second, healthy, 'retryable', 0)
	const final = claimed(await store.claim(context, ['test.poison']))
	await store.fail(context, final, 'poison', 0)
	expect(
		(await admin.query('SELECT state FROM hcm.leave_outbox WHERE id=$1', [final.id])).rows[0].state,
	).toBe('Exception')
})

it('advances planner progress only with durable intents in the same transaction', /** A failed batch rolls back both cursor and intent; stale cursors cannot skip or duplicate dates. */ async () => {
	const value = intent('test.planner')
	await expect(
		database.workloadTransaction(
			context,
			'LeaveAccrual',
			/** Fail after both producer writes to prove the atomic catchup boundary. */ async (
				transaction,
			) => {
				await enqueueHcmWork(transaction, tenant, value)
				await advanceHcmPlanner(transaction, context, 'test-rule', '2026-09-28', 0)
				throw new Error('Interrupted planning')
			},
		),
	).rejects.toThrow('Interrupted planning')
	expect(
		(await admin.query("SELECT * FROM hcm.leave_planner_cursor WHERE rule_key='test-rule'")).rows,
	).toEqual([])
	expect(
		(
			await admin.query('SELECT id FROM hcm.leave_outbox WHERE business_key=$1', [
				value.businessKey,
			])
		).rows,
	).toEqual([])
	await database.workloadTransaction(
		context,
		'LeaveAccrual',
		/** Commit the same business date and original key after restart. */ async (transaction) => {
			await enqueueHcmWork(transaction, tenant, value)
			expect(await advanceHcmPlanner(transaction, context, 'test-rule', '2026-09-28', 0)).toBe(1)
		},
	)
	await expect(
		database.workloadTransaction(
			context,
			'LeaveAccrual',
			/** An obsolete cursor revision cannot advance another worker's planner. */ (transaction) =>
				advanceHcmPlanner(transaction, context, 'test-rule', '2026-09-29', 0),
		),
	).rejects.toMatchObject({ code: 'work-conflict' })
})

it('denies foreign tenant intents and preserves owner/workload table constraints', /** RLS and SQL checks remain active even when the application attempts a forged producer tenant or domain. */ async () => {
	await expect(
		database.workloadTransaction(
			context,
			'LeaveAccrual',
			/** Deliberately substitute a tenant outside the verified context. */ (transaction) =>
				enqueueHcmWork(transaction, 'foreign-tenant', intent('test.foreign')),
		),
	).rejects.toMatchObject({ code: '42501' })
	for (const owner of ['leave', 'attendance', 'workflow', 'notification']) {
		const row = (
			await admin.query(
				'SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',
				[`hcm.${owner}_outbox`],
			)
		).rows[0]
		expect(row).toEqual({ relrowsecurity: true, relforcerowsecurity: true })
	}
})

it('rolls back an effect when its lease expires during execution', /** The final clock check is required even after the handler acquired the original fence. */ async () => {
	await enqueue(intent('test.expiry'))
	const work = claimed(await store.claim(context, ['test.expiry']))
	await expect(
		store.complete(
			context,
			work,
			/** Inject expiry within the same transaction after a business write. */ async (
				transaction,
			) => {
				await transaction
					.insertInto('hcm.access_role')
					.values({ tenant_id: tenant, id: 'expired-effect', label: 'Expired effect' })
					.execute()
				await sql`UPDATE hcm.leave_outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE tenant_id=${tenant} AND id=${work.id}`.execute(
					transaction,
				)
			},
		),
	).rejects.toMatchObject({ code: 'lease-lost' })
	expect(
		(await admin.query("SELECT id FROM hcm.access_role WHERE id='expired-effect'")).rows,
	).toEqual([])
	expect(
		(await admin.query('SELECT state FROM hcm.leave_outbox WHERE id=$1', [work.id])).rows[0].state,
	).toBe('Leased')
})

it('binds the registered schema handler to verified database intent', /** Unsupported versions enter retry handling and cannot execute a caller-substituted supported version. */ async () => {
	let executed = 0
	const lane = new HcmTransactionalWorkerLane('LeaveAccrual', store, [
		{
			kind: 'test.registry',
			schemaVersion: 1,
			/** Count only executions of the explicitly supported work schema. */ async execute() {
				executed++
			},
		},
	])
	await enqueue({ ...intent('test.registry'), schemaVersion: 2 })
	const work = claimed(await lane.claim(context))
	await expect(lane.complete(context, { ...work, schemaVersion: 1 })).rejects.toMatchObject({
		code: 'invalid-work',
	})
	expect(executed).toBe(0)
	await lane.fail(context, work, 10000)
	await enqueue(intent('test.registry'))
	await lane.complete(context, claimed(await lane.claim(context)))
	expect(executed).toBe(1)
})
