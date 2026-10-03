import { afterAll, beforeAll, expect, it } from 'vitest'
import { Client } from 'pg'
import { randomUUID, randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { sql, type Kysely } from 'kysely'
import { HcmTenantDatabase } from '@empflowyee/hcm-api-database-kysely'
import { loadSqlMigrations, migrateHcmDatabase } from '@empflowyee/hcm-api-database-migrations'
import { runDevelopmentSeeds } from '@empflowyee/hcm-api-database-seed'
import {
	HcmRuntimeApplication,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import {
	createSessionReader,
	createTenantDirectory,
	HcmRuntimeStore,
	LocalFieldCipher,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import { LeavePolicyCommands } from '@empflowyee/hcm-api-leave-application'
import { KyselyLeavePolicyUnit } from './policy-unit'
import { readLeavePolicyDraft, type LeavePolicyDraft } from '@empflowyee/hcm-leave-contract'
import { KyselyLeavePolicyRepository } from './hcm-api-leave-infrastructure'

const tenant = 'local-dunder-mifflin',
	account = 'dunder-mifflin/account/david'
const environment = {
	APP_ENVIRONMENT: 'local',
	NODE_ENV: 'test',
	HCM_LOCAL_TENANTS: 'true',
	HCM_LOCAL_SESSION: 'true',
}
let admin: Client,
	runtime: Client,
	database: HcmTenantDatabase<unknown>,
	directory: HcmRuntimeStore,
	actor: AuthenticatedHcmContext
let accessDatabase: HcmAccessDatabase,
	commands: LeavePolicyCommands,
	employee: AuthenticatedHcmContext

/** Restrict every test connection to the disposable harness configuration. */
function connection(role: string): string {
	const value = process.env[`HCM_TEST_${role}`]
	if (!value) throw new Error('Disposable PostgreSQL required')
	return value
}
/** Supply a complete explicit policy fixture, never a production default or grant. */
function draft(): LeavePolicyDraft {
	return readLeavePolicyDraft({
		code: `L_${randomUUID().replaceAll('-', '').toUpperCase()}`,
		name: '  Exact vacation  ',
		description: 'Test policy',
		leaveTypeId: 'leave-test-vac',
		effectiveFrom: '2026-01-01',
		effectiveTo: '2026-12-31',
		trackingMode: 'Balance',
		unit: 'Day',
		eligibility: { workerTypes: [], legalEntityIds: [], minimumServiceDays: 0 },
		eligibilityRules: [
			{ id: 'eligible', priority: 1, effect: 'Include', effectiveFrom: '2026-01-01' },
		],
		datedAssignments: [],
		rounding: { scale: 6, mode: 'Nearest' },
		allowHalfDay: true,
		allowHourly: false,
		maximumBackdatedDays: 0,
		maximumAdvanceDays: 365,
		minimumRequestUnits: '0.000001',
		maximumRequestUnits: '999999999999.999999',
		accrual: {
			enabled: true,
			frequency: 'Monthly',
			timing: 'Arrears',
			proration: 'None',
			waitingPeriodDays: 0,
			unitsPerOccurrence: '2.000001',
		},
		carryForward: { enabled: false },
		noticeMode: 'Warning',
		approvalRules: [
			{
				id: 'manager',
				stage: 1,
				roleCode: 'MANAGER',
				subjectType: 'Leave',
				independent: true,
				source: 'LineManager',
			},
		],
		compOff: { enabled: false },
		encashment: { configured: false, annualOnly: true },
		bridgeRule: 'None',
		blackoutDates: ['2026-12-25'],
		allowOverlap: false,
		negativeBalanceAllowed: false,
		postingPoint: 'OnApproval',
	})
}
/** Bind the real repository inside Runtime's verified tenant transaction. */
function repository(tx: Kysely<unknown>, tenantId = tenant) {
	return new KyselyLeavePolicyRepository(tx, tenantId, account)
}
/** Persist an independent fixture through the production draft repository. */
async function create(input = draft()) {
	const id = randomUUID(),
		versionId = randomUUID()
	await database.transaction(
		actor,
		/** Commit root and typed rules as one unit. */ async (tx) => {
			const store = repository(tx)
			await store.createPolicy(id, input)
			await store.insertVersion({
				id: versionId,
				policyId: id,
				version: 1,
				supersedesId: null,
				draft: input,
			})
		},
	)
	return { id, versionId, input }
}

beforeAll(
	/** Provision only the harness database and seed canonical authenticated identities. */ async () => {
		admin = new Client({ connectionString: connection('MIGRATOR') })
		runtime = new Client({ connectionString: connection('RUNTIME') })
		await admin.connect()
		await runtime.connect()
		await admin.query('DROP SCHEMA IF EXISTS hcm CASCADE')
		const inventory = resolve('libs/hcm/api/database/migrations/sql')
		await migrateHcmDatabase(connection('MIGRATOR'), inventory)
		await runDevelopmentSeeds({
			env: {
				...environment,
				HCM_SEED_TARGET: tenant,
				HCM_SEED_DATABASE_URL: connection('MIGRATOR'),
			},
			manifestDirectory: resolve('libs/hcm/api/database/seed/manifest'),
			migrations: await loadSqlMigrations(inventory),
		})
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		await runtime.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		await admin.query(
			"INSERT INTO hcm.leave_type(tenant_id,id,code,name,category,unit,is_paid,is_sensitive,is_active) VALUES($1,'leave-test-vac','TEST_VAC','Fixture vacation','Annual','Day',true,false,true)",
			[tenant],
		)
		directory = new HcmRuntimeStore(connection('RUNTIME'))
		database = new HcmTenantDatabase({ connectionString: connection('RUNTIME'), maxConnections: 3 })
		const app = new HcmRuntimeApplication(
			createTenantDirectory(environment, directory),
			createSessionReader(environment, directory),
		)
		actor = await app.authenticate(
			await app.resolveTenant('acme.localhost', '127.0.0.1'),
			undefined,
			{ tenantId: tenant, peerAddress: '127.0.0.1', developmentPersona: 'david' },
		)
		employee = await app.authenticate(
			await app.resolveTenant('acme.localhost', '127.0.0.1'),
			undefined,
			{ tenantId: tenant, peerAddress: '127.0.0.1', developmentPersona: 'jim' },
		)
		// Test grants exercise command authorization; production grants use versioned seed tooling.
		await admin.query(
			"INSERT INTO hcm.access_permission(tenant_id,code,description,kind) VALUES($1,'hcm.leave.leave-policies.read','Read policies','business-operation'),($1,'hcm.leave.leave-policies.draft','Draft policies','business-operation')",
			[tenant],
		)
		await admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'tenant-administrator','hcm.leave.leave-policies.read'),($1,'tenant-administrator','hcm.leave.leave-policies.draft')",
			[tenant],
		)
		await admin.query(
			"INSERT INTO hcm.tenant_entitlement(tenant_id,code,enabled) VALUES($1,'hcm.leave',true) ON CONFLICT(tenant_id,code) DO UPDATE SET enabled=true",
			[tenant],
		)
		accessDatabase = new HcmAccessDatabase(connection('RUNTIME'))
		commands = new LeavePolicyCommands(
			new KyselyLeavePolicyUnit(accessDatabase, new LocalFieldCipher(randomBytes(32))),
		)
	},
)
afterAll(
	/** Release only suite-owned pools and clients. */ async () => {
		await database?.destroy()
		await accessDatabase?.onApplicationShutdown()
		await directory?.onApplicationShutdown()
		await runtime?.end()
		await admin?.end()
	},
)

it('round-trips typed policy rows without binary decimal loss or narrative trimming', /** A new transaction reloads all explicit configuration from SQL. */ async () => {
	const item = await create()
	const loaded = await database.transaction(
		actor,
		/** Reload by exact stable and version identity. */ (tx) =>
			repository(tx).read(item.id, item.versionId),
	)
	expect(loaded).toMatchObject({
		id: item.id,
		versionId: item.versionId,
		revision: 1,
		state: 'Draft',
		name: '  Exact vacation  ',
		minimumRequestUnits: '0.000001',
		maximumRequestUnits: '999999999999.999999',
		accrual: { unitsPerOccurrence: '2.000001' },
		validation: [],
	})
	expect(loaded?.eligibilityRules).toEqual(item.input.eligibilityRules)
	expect(loaded?.approvalRules).toEqual(item.input.approvalRules)
	expect(loaded?.blackoutDates).toEqual(['2026-12-25'])
	expect(loaded).not.toHaveProperty('created_by_account_id')
})

it('serializes replacement and rolls every typed child back on failure', /** A stale revision cannot overwrite the winner or leave partial rule replacement. */ async () => {
	const item = await create()
	const change = { ...item.input, name: 'Updated', blackoutDates: [] }
	await database.transaction(
		actor,
		/** Store the first current revision. */ (tx) =>
			repository(tx).replace(item.id, item.versionId, 1, change),
	)
	await expect(
		database.transaction(
			actor,
			/** The old revision is no longer writable. */ (tx) =>
				repository(tx).replace(item.id, item.versionId, 1, item.input),
		),
	).rejects.toMatchObject({ code: 'revision-conflict' })
	await expect(
		database.transaction(
			actor,
			/** Simulate a command failing after child replacement. */ async (tx) => {
				await repository(tx).replace(item.id, item.versionId, 2, item.input)
				throw new Error('after-write failure')
			},
		),
	).rejects.toThrow('after-write failure')
	const loaded = await database.transaction(
		actor,
		/** Observe the prior committed version after rollback. */ (tx) =>
			repository(tx).read(item.id, item.versionId),
	)
	expect(loaded).toMatchObject({ revision: 2, name: 'Updated', blackoutDates: [] })
})

it('enforces tenant binding, RLS and composite type ownership', /** Runtime cannot read or reference a policy outside its current tenant. */ async () => {
	const item = await create()
	await database.transaction(
		actor,
		/** Change only the test transaction context to prove unfiltered SQL remains isolated. */ async (
			tx,
		) => {
			await expect(repository(tx, 'foreign').read(item.id, item.versionId)).rejects.toThrow(
				'forbidden',
			)
			await sql`SELECT set_config('hcm.tenant_id','foreign',true)`.execute(tx)
			expect((await sql`SELECT id FROM hcm.leave_policy`.execute(tx)).rows).toEqual([])
			expect(await repository(tx, 'foreign').read(item.id, item.versionId)).toBeNull()
		},
	)
	await expect(
		runtime.query(
			"INSERT INTO hcm.leave_policy(tenant_id,id,code,leave_type_id,unit,created_by_account_id) VALUES('foreign',$1,'FOREIGN','leave-test-vac','Day',$2)",
			[randomUUID(), account],
		),
	).rejects.toMatchObject({ code: '42501' })
	await expect(
		database.transaction(
			actor,
			/** A same-tenant root still cannot reference an absent foreign type. */ (tx) =>
				repository(tx).createPolicy(randomUUID(), { ...draft(), leaveTypeId: 'foreign-type' }),
		),
	).rejects.toMatchObject({ code: '23503' })
	await expect(
		database.transaction(
			actor,
			/** Type and policy units must agree at the composite key. */ (tx) =>
				repository(tx).createPolicy(randomUUID(), { ...draft(), unit: 'Hour' }),
		),
	).rejects.toMatchObject({ code: '23503' })
})

it('keeps incomplete drafts editable and denies publication without lifecycle admission', /** Neither client input nor a runtime SQL update can bypass required configuration and impact review. */ async () => {
	const input = draft()
	delete input.maximumAdvanceDays
	input.accrual = { enabled: true, unitsPerMonth: '2' }
	const item = await create(input)
	const loaded = await database.transaction(
		actor,
		/** Inspect publication errors without granting anything. */ (tx) =>
			repository(tx).read(item.id, item.versionId),
	)
	expect(loaded?.validation).toContainEqual({ field: 'accrual.timing', code: 'required' })
	const publish =
		"UPDATE hcm.leave_policy_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id=$2,publication_digest=repeat('a',64) WHERE id=$1"
	await expect(runtime.query(publish, [item.versionId, account])).rejects.toMatchObject({
		code: '42501',
	})
	await expect(admin.query(publish, [item.versionId, account])).rejects.toMatchObject({
		code: '23514',
	})
	const full = await create()
	// Migrator-only fixture establishes a published row to exercise SQL immutability;
	// it is not a production publication path or application acceptance claim.
	await admin.query(publish, [full.versionId, account])
	await expect(
		runtime.query('DELETE FROM hcm.leave_approval_rule WHERE version_id=$1', [full.versionId]),
	).rejects.toMatchObject({ code: '23514' })
	await expect(
		runtime.query(
			"UPDATE hcm.leave_policy_version SET name='Changed',revision=revision+1 WHERE id=$1",
			[full.versionId],
		),
	).rejects.toMatchObject({ code: '23514' })
	await expect(
		database.transaction(
			actor,
			/** Published payloads cannot return to the draft editor. */ (tx) =>
				repository(tx).replace(full.id, full.versionId, 2, full.input),
		),
	).rejects.toMatchObject({ code: 'version-published' })
})

it('rejects non-finite exact SQL quantities', /** PostgreSQL numeric NaN must not become an apparently positive entitlement. */ async () => {
	await expect(runtime.query("SELECT 'NaN'::hcm.leave_units")).rejects.toMatchObject({
		code: '23514',
	})
	await expect(runtime.query("SELECT '1000000000000'::hcm.leave_units")).rejects.toMatchObject({
		code: '22003',
	})
})

it('commits one policy, receipt and audit under simultaneous same-key commands', /** Real Access transactions serialize browser retries without duplicate effects. */ async () => {
	const input = draft(),
		key = randomUUID()
	const results = await Promise.all(
		[0, 1].map(
			/** Race equivalent requests through independent connections. */ () =>
				commands.create(actor, key, input),
		),
	)
	expect(results[0]).toEqual(results[1])
	expect(
		(await admin.query('SELECT id FROM hcm.leave_policy WHERE code=$1', [input.code])).rows,
	).toHaveLength(1)
	expect(
		(await admin.query('SELECT id FROM hcm.leave_command_receipt WHERE idempotency_key=$1', [key]))
			.rows,
	).toHaveLength(1)
	expect(
		(
			await admin.query(
				"SELECT id FROM hcm.audit_event WHERE request_id=$1 AND action='leave.policy-created'",
				[key],
			)
		).rows,
	).toHaveLength(1)
	await expect(
		commands.create(actor, key, { ...input, name: 'Changed retry' }),
	).rejects.toMatchObject({ code: 'idempotency-conflict' })
	const updated = await commands.update(actor, results[0].id, results[0].versionId, randomUUID(), {
		...input,
		expectedRevision: 1,
		name: 'Updated through command',
	})
	expect(updated.revision).toBe(2)
	expect(await commands.create(actor, key, input)).toEqual(results[0])
	await expect(
		commands.update(actor, updated.id, updated.versionId, randomUUID(), {
			...input,
			expectedRevision: 1,
		}),
	).rejects.toMatchObject({ code: 'revision-conflict' })
})

it('denies absent or revoked permission and entitlement on commands and replay', /** A stored receipt cannot outlive current source authority. */ async () => {
	const input = draft(),
		key = randomUUID()
	const created = await commands.create(actor, key, input)
	await expect(commands.detail(employee, created.id, created.versionId)).rejects.toMatchObject({
		code: 'forbidden',
	})
	await expect(commands.create(employee, randomUUID(), draft())).rejects.toMatchObject({
		code: 'forbidden',
	})
	await admin.query(
		"DELETE FROM hcm.role_permission WHERE role_id='tenant-administrator' AND permission_code='hcm.leave.leave-policies.read'",
	)
	try {
		await expect(commands.create(actor, key, input)).rejects.toMatchObject({ code: 'forbidden' })
	} finally {
		await admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'tenant-administrator','hcm.leave.leave-policies.read')",
			[tenant],
		)
	}
	await admin.query("UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.leave'")
	try {
		await expect(commands.create(actor, randomUUID(), draft())).rejects.toMatchObject({
			code: 'forbidden',
		})
	} finally {
		await admin.query("UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.leave'")
	}
})

it('retains immutable source rules and encrypted reason when creating a successor', /** Copy rules without changing publication evidence or exposing narrative in audit. */ async () => {
	const source = await create(),
		key = randomUUID(),
		reason = '  Renewal\nwith evidence  '
	// Migrator fixture isolates versioning from the unfinished impact/publication workflow.
	await admin.query(
		"UPDATE hcm.leave_policy_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id=$2,publication_digest=repeat('a',64) WHERE id=$1",
		[source.versionId, account],
	)
	const input = { sourceVersionId: source.versionId, expectedRevision: 2, reason }
	const next = await commands.version(actor, source.id, key, input)
	expect(next).toMatchObject({ id: source.id, version: 2, revision: 1, state: 'Draft' })
	expect(next.versionId).not.toBe(source.versionId)
	expect(next.approvalRules).toEqual(source.input.approvalRules)
	expect(await commands.version(actor, source.id, key, input)).toEqual(next)
	expect(await commands.detail(actor, source.id, source.versionId)).toMatchObject({
		state: 'Published',
		revision: 2,
	})
	const evidence = (
		await admin.query(
			'SELECT encrypted_reason,response FROM hcm.leave_command_receipt WHERE idempotency_key=$1',
			[key],
		)
	).rows[0]
	expect(evidence.encrypted_reason).toBeInstanceOf(Buffer)
	expect(evidence.encrypted_reason.toString('utf8')).not.toContain(reason)
	expect(JSON.stringify(evidence.response)).not.toContain('with evidence')
	const audit = (
		await admin.query('SELECT safe_summary FROM hcm.audit_event WHERE request_id=$1', [key])
	).rows[0]
	expect(audit.safe_summary.reason).toBeNull()
	await expect(
		runtime.query('UPDATE hcm.leave_command_receipt SET response=$1 WHERE idempotency_key=$2', [
			'{}',
			key,
		]),
	).rejects.toMatchObject({ code: '42501' })
})

it('pages latest policies on the server and invalidates continuations after filter or source changes', /** Partial browser results cannot be used as a complete sorted policy collection. */ async () => {
	const prefix = `PAGE_${randomUUID().slice(0, 6).toUpperCase()}`
	const first = await commands.create(actor, randomUUID(), {
		...draft(),
		code: `${prefix}_A`,
		name: 'Same name',
	})
	const second = await commands.create(actor, randomUUID(), {
		...draft(),
		code: `${prefix}_B`,
		name: 'Same name',
	})
	const query = new URLSearchParams({ code: prefix, limit: '1', sort: 'code:asc' })
	const page = await commands.list(actor, query)
	expect(page.items.map(/** Compare only safe root identities. */ (row) => row.id)).toEqual([
		first.id,
	])
	expect(page.nextCursor).toMatch(/^[A-Za-z0-9_-]{43}$/)
	const continuation = new URLSearchParams(query)
	continuation.set('cursor', page.nextCursor ?? '')
	expect((await commands.list(actor, continuation)).items[0].id).toBe(second.id)
	const changed = new URLSearchParams(continuation)
	changed.set('sort', 'name:asc')
	await expect(commands.list(actor, changed)).rejects.toMatchObject({ code: 'invalid-request' })
	await commands.create(actor, randomUUID(), { ...draft(), code: `${prefix}_C` })
	await expect(commands.list(actor, continuation)).rejects.toMatchObject({
		code: 'invalid-request',
	})
	const selected = await commands.list(actor, new URLSearchParams({ id: first.id }))
	expect(selected.items).toHaveLength(1)
	expect(selected.items[0].id).toBe(first.id)
	await expect(commands.list(employee, new URLSearchParams())).rejects.toMatchObject({
		code: 'forbidden',
	})
})
