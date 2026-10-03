import { afterAll, beforeAll, expect, it } from 'vitest'
import { Client, Pool } from 'pg'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { HcmTenantDatabase } from '@empflowyee/hcm-api-database-kysely'
import { HcmWorkloadIssuer, type HcmWorkloadContext } from '@empflowyee/hcm-api-runtime-application'
import {
	HcmRuntimeStore,
	HcmDurableWorkStore,
	HcmTransactionalWorkerLane,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import type { WorkloadAuditTables } from '@empflowyee/hcm-api-audit-infrastructure'
import { WorkflowSourceBinder } from '@empflowyee/hcm-api-workflow-application'
import { KyselyWorkflowPlanHandler } from './plan-worker'
import { migrateHcmDatabase, loadSqlMigrations } from '@empflowyee/hcm-api-database-migrations'
import { runDevelopmentSeeds } from '@empflowyee/hcm-api-database-seed'
import type { DomainApprovalManifest } from '@empflowyee/hcm-workflow-contract'
import { KyselyWorkflowIntakeBinder } from './hcm-api-workflow-infrastructure'

const tenant = 'local-dunder-mifflin'
let admin: Client
let runtime: Kysely<unknown>
const binder = new KyselyWorkflowIntakeBinder()
let directory: HcmRuntimeStore
let database: HcmTenantDatabase<WorkloadAuditTables>
let context: HcmWorkloadContext
let candidateAccount: string
const snapshots = new Map<string, DomainApprovalManifest>()
let candidateIds: string[] = []

/** Test-owned source adapter isolates coordination from source business-rule acceptance. */
class TestSources extends WorkflowSourceBinder {
	/** Bind only the seeded tenant; this fixture never claims to implement Attendance authority. */
	bind(_transaction: unknown, tenantId: string) {
		if (tenantId !== tenant) throw new Error('Unexpected source tenant')
		return {
			/** Return the current fixture projection, permitting explicit stale-source tests. */
			async manifest(caseId: string) {
				return snapshots.get(caseId) ?? null
			},
			/** Return bounded fixture candidates; the planner persists only actual seeded accounts. */
			async candidates() {
				return { accountIds: candidateIds, digest: 'a'.repeat(64) }
			},
		}
	}
}

/** Execute real claimed jobs through Runtime's immutable intent and lease completion fence. */
async function drainPlanner() {
	const lane = new HcmTransactionalWorkerLane(
		'WorkflowPlan',
		new HcmDurableWorkStore(database, { leaseMilliseconds: 60000, maximumAttempts: 3 }),
		[new KyselyWorkflowPlanHandler(new TestSources())],
	)
	for (;;) {
		const work = await lane.claim(context)
		if (!work) break
		await lane.complete(context, work)
	}
}

/** Queue a test source snapshot with the same tenant transaction used by production intake. */
async function enqueueSnapshot(value: DomainApprovalManifest) {
	return runtime.transaction().execute(
		/** Bind tenant before any source or Workflow access. */ async (tx) => {
			await sql`SELECT set_config('hcm.tenant_id',${tenant},true)`.execute(tx)
			return binder.bind(tx, tenant).enqueue(value)
		},
	)
}

/** A fixed safe source snapshot; real subject authority remains with its producing application. */
function manifest(): DomainApprovalManifest {
	return {
		schemaVersion: 1,
		registryVersion: 1,
		source: 'Attendance',
		caseId: 'override-case',
		caseRevision: 1,
		subjectId: 'override-1',
		subjectRevision: 1,
		generation: 1,
		completion: 'AllRequiredAnyReject',
		allowedActions: ['Approve', 'Reject'],
		registeredRouteCode: 'WORK_SCHEDULES',
		safeFacts: {
			subjectType: 'Override',
			dateFrom: '2027-02-03',
			dateTo: '2027-02-03',
			legalEntityId: 'legal-entity',
			sourceState: 'Pending',
		},
		slots: [
			{
				id: 'slot-1',
				revision: 1,
				state: 'Pending',
				stage: 1,
				ordinal: 1,
				independent: true,
				distinctActors: true,
				candidateRuleCode: 'rule-1',
			},
		],
	}
}
beforeAll(
	/** Explicitly migrate and seed only the disposable database, then use its restricted runtime role. */ async () => {
		const migrator = process.env['HCM_TEST_MIGRATOR'],
			connectionString = process.env['HCM_TEST_RUNTIME']
		if (!migrator || !connectionString) throw new Error('Disposable PostgreSQL required')
		admin = new Client({ connectionString: migrator })
		await admin.connect()
		await admin.query('DROP SCHEMA IF EXISTS hcm CASCADE')
		const inventory = resolve('libs/hcm/api/database/migrations/sql')
		await migrateHcmDatabase(migrator, inventory)
		await runDevelopmentSeeds({
			env: {
				APP_ENVIRONMENT: 'local',
				NODE_ENV: 'test',
				HCM_SEED_TARGET: tenant,
				HCM_SEED_DATABASE_URL: migrator,
			},
			manifestDirectory: resolve('libs/hcm/api/database/seed/manifest'),
			migrations: await loadSqlMigrations(inventory),
		})
		runtime = new Kysely({
			dialect: new PostgresDialect({ pool: new Pool({ connectionString, max: 2 }) }),
		})
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		candidateAccount = (
			await admin.query('SELECT id FROM hcm.user_account WHERE tenant_id=$1 ORDER BY id LIMIT 1', [
				tenant,
			])
		).rows[0].id
		directory = new HcmRuntimeStore(connectionString)
		context = await new HcmWorkloadIssuer(directory, ['WorkflowPlan']).issue(
			tenant,
			'WorkflowPlan',
			randomUUID(),
			300000,
		)
		database = new HcmTenantDatabase({ connectionString, maxConnections: 2 })
	},
)
afterAll(
	/** Close only the disposable connections created by this suite. */ async () => {
		await runtime?.destroy()
		await database?.destroy()
		await directory?.onApplicationShutdown()
		await admin?.end()
	},
)

it('queues a real safe intake and recovers its original operation without duplicating work', /** Workflow owns the payload contract and the runtime owns durable delivery mechanics. */ async () => {
	const first = await runtime.transaction().execute(
		/** Use the same explicit tenant transaction as a producing source case. */ async (tx) => {
			await sql`SELECT set_config('hcm.tenant_id',${tenant},true)`.execute(tx)
			return binder.bind(tx, tenant).enqueue(manifest())
		},
	)
	expect(first.state).toBe('Queued')
	await runtime.transaction().execute(
		/** Current retry identity returns the already durable operation. */ async (tx) => {
			await sql`SELECT set_config('hcm.tenant_id',${tenant},true)`.execute(tx)
			expect(await binder.bind(tx, tenant).enqueue(manifest())).toEqual(first)
			const row = (
				await sql<{
					payload: Record<string, unknown>
					state: string
					count: string
				}>`SELECT payload,state,count(*) OVER() AS count FROM hcm.workflow_outbox WHERE tenant_id=${tenant}`.execute(
					tx,
				)
			).rows[0]
			expect(row.state).toBe('Pending')
			expect(Number(row.count)).toBe(1)
			expect(Object.keys(row.payload).sort()).toEqual([
				'caseId',
				'caseRevision',
				'generation',
				'manifestDigest',
				'source',
				'subjectRevision',
			])
		},
	)
	await expect(
		runtime.transaction().execute(
			/** Same source revision cannot silently change its required graph. */ async (tx) => {
				await sql`SELECT set_config('hcm.tenant_id',${tenant},true)`.execute(tx)
				return binder.bind(tx, tenant).enqueue({ ...manifest(), subjectRevision: 2 })
			},
		),
	).rejects.toMatchObject({ code: 'work-conflict' })
})
it('rolls intake back with the producing source transaction and rejects tenant rebinding', /** A failed source submission must not leave an orphan coordination job. */ async () => {
	await expect(
		runtime.transaction().execute(
			/** Simulate failure after enqueue but before source commit. */ async (tx) => {
				await sql`SELECT set_config('hcm.tenant_id',${tenant},true)`.execute(tx)
				await binder.bind(tx, tenant).enqueue({ ...manifest(), caseId: 'rolled-back-case' })
				throw new Error('source failed before commit')
			},
		),
	).rejects.toThrow('source failed before commit')
	await runtime.transaction().execute(
		/** Verify rollback through the restricted runtime projection. */ async (tx) => {
			await sql`SELECT set_config('hcm.tenant_id',${tenant},true)`.execute(tx)
			expect(
				(
					await sql`SELECT id FROM hcm.workflow_outbox WHERE payload->>'caseId'='rolled-back-case'`.execute(
						tx,
					)
				).rows,
			).toHaveLength(0)
			await expect(binder.bind(tx, 'foreign-tenant').enqueue(manifest())).rejects.toThrow(
				'tenant mismatch',
			)
		},
	)
	await runtime.transaction().execute(
		/** A second tenant cannot see the first tenant's queued work. */ async (tx) => {
			await sql`SELECT set_config('hcm.tenant_id','foreign-tenant',true)`.execute(tx)
			expect((await sql`SELECT id FROM hcm.workflow_outbox`.execute(tx)).rows).toHaveLength(0)
		},
	)
	expect(
		/** Pool executors cannot bypass transaction-local isolation. */ () =>
			binder.bind(runtime, tenant),
	).toThrow('tenant transaction')
})

it('plans exact source stages through a leased worker and retains elapsed UTC timers', /** Coordination persists required tasks without completing source decisions. */ async () => {
	const identities = await admin.query(
		"SELECT data_type FROM information_schema.columns WHERE table_schema='hcm' AND table_name IN ('workflow_instance','workflow_stage_instance','workflow_task','workflow_task_candidate','workflow_task_timer','workflow_reconciliation_exception','workflow_planning_receipt') AND column_name IN ('id','instance_id','task_id','outbox_id')",
	)
	expect(identities.rows.length).toBeGreaterThan(0)
	expect(
		identities.rows.every(
			/** Domain identities retain the repository's opaque text mapping. */ (row) =>
				row.data_type === 'text',
		),
	).toBe(true)
	const source = manifest()
	source.caseId = 'staged-case'
	source.slots.push({ ...source.slots[0], id: 'stage-two-slot', stage: 2 })
	snapshots.set(source.caseId, source)
	candidateIds = [candidateAccount]
	const queued = await enqueueSnapshot(source)
	await drainPlanner()
	const receipt = (
		await admin.query('SELECT * FROM hcm.workflow_planning_receipt WHERE outbox_id=$1', [
			queued.operationId,
		])
	).rows[0]
	expect(receipt.outcome).toBe('Planned')
	const tasks = (
		await admin.query('SELECT * FROM hcm.workflow_task WHERE instance_id=$1 ORDER BY stage', [
			receipt.instance_id,
		])
	).rows
	expect(tasks.map(/** Compare states in source stage order. */ (row) => row.state)).toEqual([
		'Ready',
		'Blocked',
	])
	expect(tasks[0].assignment_mode).toBe('Direct')
	expect(tasks[0].due_at.getTime() - tasks[0].available_at.getTime()).toBe(48 * 3600000)
	expect(
		(
			await admin.query(
				'SELECT count(*)::int AS n FROM hcm.workflow_task_candidate WHERE task_id=$1',
				[tasks[0].id],
			)
		).rows[0].n,
	).toBe(1)
	expect(
		(
			await admin.query('SELECT count(*)::int AS n FROM hcm.workflow_task_timer WHERE task_id=$1', [
				tasks[0].id,
			])
		).rows[0].n,
	).toBe(5)
	expect(
		(
			await admin.query('SELECT count(*)::int AS n FROM hcm.workflow_task_timer WHERE task_id=$1', [
				tasks[1].id,
			])
		).rows[0].n,
	).toBe(0)
	expect(await enqueueSnapshot(source)).toEqual(queued)
	await drainPlanner()
	expect(
		(
			await admin.query('SELECT count(*)::int AS n FROM hcm.workflow_task WHERE instance_id=$1', [
				receipt.instance_id,
			])
		).rows[0].n,
	).toBe(2)
	expect(
		(await admin.query('SELECT state FROM hcm.workflow_outbox WHERE id=$1', [queued.operationId]))
			.rows[0].state,
	).toBe('Completed')
	await runtime.transaction().execute(
		/** Foreign tenants cannot read tasks, candidates, exceptions, timers or receipts. */ async (
			tx,
		) => {
			await sql`SELECT set_config('hcm.tenant_id','foreign-tenant',true)`.execute(tx)
			for (const table of [
				'workflow_instance',
				'workflow_stage_instance',
				'workflow_task',
				'workflow_task_candidate',
				'workflow_task_timer',
				'workflow_reconciliation_exception',
				'workflow_planning_receipt',
			])
				expect(
					(await sql`SELECT * FROM ${sql.table('hcm.' + table)}`.execute(tx)).rows,
				).toHaveLength(0)
		},
	)
	await expect(
		runtime.transaction().execute(
			/** A coordination task cannot be force-completed by unrestricted runtime SQL. */ async (
				tx,
			) => {
				await sql`SELECT set_config('hcm.tenant_id',${tenant},true)`.execute(tx)
				await sql`UPDATE hcm.workflow_task SET state='Completed' WHERE id=${tasks[0].id}`.execute(
					tx,
				)
			},
		),
	).rejects.toMatchObject({ code: '42501' })
})

it('records no-candidate exceptions without substituting an administrator or scheduling notifications', /** Missing routing remains an explicit recoverable coordination failure. */ async () => {
	const source = { ...manifest(), caseId: 'no-candidates' }
	snapshots.set(source.caseId, source)
	candidateIds = []
	const queued = await enqueueSnapshot(source)
	await drainPlanner()
	const task = (
		await admin.query(
			'SELECT t.* FROM hcm.workflow_task t JOIN hcm.workflow_planning_receipt r ON r.tenant_id=t.tenant_id AND r.instance_id=t.instance_id WHERE r.outbox_id=$1',
			[queued.operationId],
		)
	).rows[0]
	expect(task.state).toBe('Failed')
	expect(task.assignment_mode).toBeNull()
	expect(
		(
			await admin.query('SELECT code FROM hcm.workflow_reconciliation_exception WHERE task_id=$1', [
				task.id,
			])
		).rows,
	).toEqual([{ code: 'NoCandidates' }])
	expect(
		(await admin.query('SELECT id FROM hcm.workflow_task_timer WHERE task_id=$1', [task.id])).rows,
	).toEqual([])
})

it('never materializes a stale, missing, terminal or already-decided source as a fresh approval', /** Source changes require fresh intake or receipt reconciliation. */ async () => {
	for (const scenario of ['changed', 'missing', 'closed', 'decided'] as const) {
		const source = { ...manifest(), caseId: scenario }
		if (scenario === 'closed') {
			source.safeFacts = { ...source.safeFacts, sourceState: 'Approved' }
			source.slots = [{ ...source.slots[0], state: 'Approved' }]
		}
		if (scenario === 'decided')
			source.slots = [
				{ ...source.slots[0], state: 'Approved' },
				{ ...source.slots[0], id: 'remaining-slot', ordinal: 2 },
			]
		const queued = await enqueueSnapshot(source)
		if (scenario !== 'missing')
			snapshots.set(source.caseId, scenario === 'changed' ? { ...source, caseRevision: 2 } : source)
		await drainPlanner()
		const receipt = (
			await admin.query(
				'SELECT outcome,instance_id AS "instanceId" FROM hcm.workflow_planning_receipt WHERE outbox_id=$1',
				[queued.operationId],
			)
		).rows[0]
		expect(receipt).toEqual({
			outcome: {
				changed: 'SourceChanged',
				missing: 'SourceUnavailable',
				closed: 'SourceClosed',
				decided: 'ReconciliationRequired',
			}[scenario],
			instanceId: null,
		})
	}
})
