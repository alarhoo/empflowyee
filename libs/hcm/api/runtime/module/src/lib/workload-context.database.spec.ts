import { beforeAll, afterAll, it, expect, vi } from 'vitest'
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { migrateHcmDatabase, loadSqlMigrations } from '@empflowyee/hcm-api-database-migrations'
import { runDevelopmentSeeds } from '@empflowyee/hcm-api-database-seed'
import { HcmTenantDatabase } from '@empflowyee/hcm-api-database-kysely'
import {
	HcmWorkloadIssuer,
	requireWorkloadScope,
	type HcmWorkloadContext,
} from '@empflowyee/hcm-api-runtime-application'
import { HcmRuntimeStore } from '@empflowyee/hcm-api-runtime-infrastructure'
import {
	TransactionalWorkloadAudit,
	type WorkloadAuditTables,
} from '@empflowyee/hcm-api-audit-infrastructure'

interface WorkloadTables extends WorkloadAuditTables {
	'hcm.access_role': { tenant_id: string; id: string; label: string }
}
const tenant = 'local-dunder-mifflin'
let admin: Client
let runtime: Client
let store: HcmRuntimeStore
let issuer: HcmWorkloadIssuer
let database: HcmTenantDatabase<WorkloadTables>
let context: HcmWorkloadContext

/** Require the disposable harness rather than a machine-specific connection or credential. */
function connection(role: string): string {
	const value = process.env[`HCM_TEST_${role}`]
	if (!value) throw new Error('Disposable PostgreSQL harness required')
	return value
}

beforeAll(
	/** Migrate and seed two real tenant projections before issuing any workload capability. */ async () => {
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
		await admin.query("SELECT set_config('hcm.tenant_id','workload-other',false)")
		await admin.query(
			"INSERT INTO hcm.tenant (id,slug,display_name,status,defaults) VALUES ('workload-other','workload-other','Other','active','{}')",
		)
		await admin.query(
			"INSERT INTO hcm.tenant_hostname (hostname,tenant_id) VALUES ('workload-other.localhost','workload-other')",
		)
		await admin.query(
			"INSERT INTO hcm.access_role (tenant_id,id,label) VALUES ('workload-other','foreign-role','Foreign role')",
		)
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		await runtime.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		store = new HcmRuntimeStore(connection('RUNTIME'))
		issuer = new HcmWorkloadIssuer(store, ['LeaveAccrual', 'AttendanceCalculate'])
		database = new HcmTenantDatabase({ connectionString: connection('RUNTIME'), maxConnections: 1 })
		context = await issuer.issue(tenant, 'LeaveAccrual', randomUUID())
	},
)

afterAll(
	/** Close the worker-only pools and restore any deterministic clock override. */ async () => {
		vi.restoreAllMocks()
		await database?.destroy()
		await store?.onApplicationShutdown()
		await runtime?.end()
		await admin?.end()
	},
)

it('issues only active allowed workloads and rejects copies or mismatched handlers', /** Private registration, not public descriptor fields, is the workload authority. */ async () => {
	expect(requireWorkloadScope(context).tenantId).toBe(tenant)
	expect(
		/** A copied descriptor is not a registered capability. */ () =>
			requireWorkloadScope({ ...context }),
	).toThrow('unauthenticated')
	expect(
		/** An accrual capability cannot execute an attendance handler. */ () =>
			requireWorkloadScope(context, 'AttendanceCalculate'),
	).toThrow('forbidden')
	await expect(issuer.issue(tenant, 'WorkflowDispatch', randomUUID())).rejects.toThrow('forbidden')
	await expect(issuer.issue('missing-tenant', 'LeaveAccrual', randomUUID())).rejects.toThrow(
		'tenant-suspended',
	)
	await expect(
		database.workloadTransaction(
			{ ...context },
			'LeaveAccrual',
			/** This query must never run for an unregistered context. */ async (transaction) =>
				transaction.selectFrom('hcm.access_role').selectAll().execute(),
		),
	).rejects.toThrow('unauthenticated')
})

it('enumerates bounded active IDs and isolates unfiltered transactions on a reused connection', /** Workload context is local to each transaction and cannot carry another tenant's rows. */ async () => {
	const first = await store.activeTenantIds('', 1)
	expect(first.tenantIds).toEqual([tenant])
	expect(first.nextCursor).toBe(tenant)
	expect(await store.activeTenantIds(first.nextCursor ?? '', 1)).toEqual({
		tenantIds: ['workload-other'],
		nextCursor: null,
	})
	const rows = await database.workloadTransaction(
		context,
		'LeaveAccrual',
		/** Omit a tenant predicate deliberately to prove the runtime RLS boundary. */ async (
			transaction,
		) => transaction.selectFrom('hcm.access_role').selectAll().execute(),
	)
	expect(rows.length).toBeGreaterThan(0)
	expect(
		rows.every(
			/** Every visible row belongs to the issued tenant. */ (row) => row.tenant_id === tenant,
		),
	).toBe(true)
	const other = await issuer.issue('workload-other', 'LeaveAccrual', randomUUID())
	expect(
		await database.workloadTransaction(
			other,
			'LeaveAccrual',
			/** Reuse the same single connection under the second verified tenant. */ async (
				transaction,
			) => transaction.selectFrom('hcm.access_role').select('id').execute(),
		),
	).toEqual([{ id: 'foreign-role' }])
})

it('rechecks suspension after issuance and rejects unsafe roles', /** Issuance is not a permanent activation or bypass-RLS privilege. */ async () => {
	await admin.query("UPDATE hcm.tenant SET status='suspended' WHERE id=$1", [tenant])
	try {
		await expect(
			database.workloadTransaction(
				context,
				'LeaveAccrual',
				/** No business result can commit while this tenant is suspended. */ async () =>
					'forbidden-result',
			),
		).rejects.toThrow('tenant-suspended')
	} finally {
		await admin.query("UPDATE hcm.tenant SET status='active' WHERE id=$1", [tenant])
	}
	const unsafe = new HcmTenantDatabase({ connectionString: connection('MIGRATOR') })
	try {
		await expect(
			unsafe.workloadTransaction(
				context,
				'LeaveAccrual',
				/** A schema owner cannot run the workload query. */ async () => 'forbidden-result',
			),
		).rejects.toThrow('Unsafe HCM runtime database role')
	} finally {
		await unsafe.destroy()
	}
})

it('rolls back an effect when the workload capability expires before commit', /** Expiry during a handler cannot leave its SQL mutation committed. */ async () => {
	const now = Date.now()
	const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
	try {
		const expiring = await issuer.issue(tenant, 'LeaveAccrual', randomUUID(), 1000)
		await expect(
			database.workloadTransaction(
				expiring,
				'LeaveAccrual',
				/** Advance the authority clock after the SQL write but before the commit guard. */ async (
					transaction,
				) => {
					await transaction
						.insertInto('hcm.access_role')
						.values({ tenant_id: tenant, id: 'expired-effect', label: 'Expired effect' })
						.execute()
					clock.mockReturnValue(now + 1001)
				},
			),
		).rejects.toThrow('unauthenticated')
	} finally {
		clock.mockRestore()
	}
	expect(
		(await admin.query("SELECT id FROM hcm.access_role WHERE id='expired-effect'")).rows,
	).toEqual([])
})

it('appends explicit workload attribution and rejects malformed actors and mutable audit', /** System evidence is append-only and never manufactures a UserAccount. */ async () => {
	const id = await database.workloadTransaction(
		context,
		'LeaveAccrual',
		/** The audit event shares the transaction with the workload's effect. */ async (transaction) =>
			new TransactionalWorkloadAudit(transaction, context).append({
				action: 'background.completed',
				workId: 'test-work',
				attempt: 1,
				fence: 1,
			}),
	)
	const row = (
		await admin.query(
			'SELECT actor_kind,actor_account_id,workload_code,workload_run_id FROM hcm.audit_event WHERE id=$1',
			[id],
		)
	).rows[0]
	expect(row).toEqual({
		actor_kind: 'Workload',
		actor_account_id: null,
		workload_code: 'LeaveAccrual',
		workload_run_id: context.runId,
	})
	await expect(
		runtime.query("UPDATE hcm.audit_event SET action='background.failed' WHERE id=$1", [id]),
	).rejects.toMatchObject({ code: '42501' })
	await expect(
		runtime.query(
			"INSERT INTO hcm.audit_event (tenant_id,id,actor_kind,workload_run_id,action,target_type,target_id,outcome,request_id,category,safe_summary) VALUES ($1,'invalid','Workload',$2,'background.completed','background-work','test','Succeeded','test','business','{}')",
			[tenant, context.runId],
		),
	).rejects.toMatchObject({ code: '23514' })
})
