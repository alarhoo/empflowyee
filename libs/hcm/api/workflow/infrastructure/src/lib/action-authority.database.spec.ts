import { beforeAll, afterAll, it, expect, vi } from 'vitest'
import { Client } from 'pg'
import { randomUUID, randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { sql, type Transaction } from 'kysely'
import { HcmTenantDatabase } from '@empflowyee/hcm-api-database-kysely'
import { migrateHcmDatabase, loadSqlMigrations } from '@empflowyee/hcm-api-database-migrations'
import { runDevelopmentSeeds } from '@empflowyee/hcm-api-database-seed'
import {
	HcmRuntimeApplication,
	HcmWorkloadIssuer,
	HcmActionAuthorityResolver,
	requireAuthenticatedScope,
	requireHcmActionAuthority,
	requireWorkloadScope,
	type AuthenticatedHcmContext,
	type HcmWorkloadContext,
	type HcmActionBinding,
} from '@empflowyee/hcm-api-runtime-application'
import {
	HcmRuntimeStore,
	createTenantDirectory,
	createSessionReader,
	KyselyHcmActionAuthorizationBinder,
	LocalFieldCipher,
	HcmDurableWorkStore,
	HcmTransactionalWorkerLane,
	enqueueHcmWork,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import {
	TransactionalActionAccessPolicy,
	TransactionalAccessPolicy,
	type AccessTables,
} from '@empflowyee/hcm-api-access-control-infrastructure'
import {
	WorkflowSourceBinder,
	WorkflowSourceActionBinder,
	type WorkflowSourceActionIntent,
	type WorkflowSourceActionReceipt,
} from '@empflowyee/hcm-api-workflow-application'
import type {
	DomainApprovalManifest,
	WorkflowSource,
	WorkflowActionCommand,
} from '@empflowyee/hcm-workflow-contract'
import { KyselyWorkflowActionBinder } from './action-intake'
import { KyselyWorkflowDispatchHandler } from './action-dispatch'
import { KyselyWorkflowIntakeBinder } from './hcm-api-workflow-infrastructure'
import { KyselyWorkflowPlanHandler } from './plan-worker'
import { KyselyWorkflowReconcileHandler } from './reconcile-worker'

const tenant = 'local-dunder-mifflin'
const account = 'dunder-mifflin/account/david'
const permission = 'hcm.attendance.work-schedules.manage'
const environment = {
	APP_ENVIRONMENT: 'local',
	NODE_ENV: 'test',
	HCM_LOCAL_TENANTS: 'true',
	HCM_LOCAL_SESSION: 'true',
}
const binder = new KyselyHcmActionAuthorizationBinder()
let admin: Client
let runtime: Client
let directory: HcmRuntimeStore
let database: HcmTenantDatabase<AccessTables>
let application: HcmRuntimeApplication
let actor: AuthenticatedHcmContext
let dispatch: HcmWorkloadContext
let issuer: HcmWorkloadIssuer

const actionManifests = new Map<string, DomainApprovalManifest>()
const sourceReceipts = new Map<string, WorkflowSourceActionReceipt>()
const sourceDecisions = new Map<string, number>()
let loseNextResponse = false
const actionCipher = new LocalFieldCipher(randomBytes(32))

/** Explicit test source for dispatch protocol acceptance; this fixture is not Attendance business acceptance. */
class ActionTestProjection extends WorkflowSourceBinder {
	/** Keep all test projections within the real seeded tenant. */
	bind(_transaction: unknown, tenantId: string, source: WorkflowSource) {
		if (tenantId !== tenant || source !== 'Attendance') throw new Error('Unexpected fixture source')
		return {
			/** Return a safe controlled manifest to the real planner. */ async manifest(caseId: string) {
				return actionManifests.get(caseId) ?? null
			},
			/** Return the actual seeded account as this protocol fixture's independent candidate. */ async candidates() {
				return { accountIds: [account], digest: 'c'.repeat(64) }
			},
		}
	}
}

/** Simulate fixed-adapter accepted receipts and lost acknowledgements, while using real Runtime and Access checks. */
class ActionTestSource extends WorkflowSourceActionBinder {
	/** Bind both online and worker actor checks to the same restricted SQL transaction. */
	bind(transaction: unknown, tenantId: string, source: WorkflowSource) {
		if (tenantId !== tenant || source !== 'Attendance') throw new Error('Unexpected fixture source')
		const tx = transaction as Transaction<AccessTables>
		return {
			/** Read recovery requires a current ordinary source read grant. */ async authorizeRead(
				context: AuthenticatedHcmContext,
			) {
				await new TransactionalAccessPolicy(tx, context).require({
					permission: 'hcm.attendance.work-schedules.read',
					entitlement: 'hcm.attendance',
				})
			},
			/** Admit only a currently authorized account, never the manifest's discovery fields. */ async authorize(
				context: AuthenticatedHcmContext,
			) {
				await new TransactionalAccessPolicy(tx, context).require({
					permission,
					entitlement: 'hcm.attendance',
				})
				return { permission, scopeReference: 'a'.repeat(64) }
			},
			/** The test receipt survives a deliberately lost transport response, modeling an independently committed source. */ async query(
				context: HcmWorkloadContext,
				intent: WorkflowSourceActionIntent,
			) {
				const scope = requireWorkloadScope(context, 'WorkflowDispatch')
				if (scope.tenantId !== tenantId) throw new Error('Foreign dispatch')
				return sourceReceipts.get(intent.dispatchKey) ?? null
			},
			/** Use real human authority, then retain one test-owned source decision for the original key. */ async decide(
				context: HcmWorkloadContext,
				reference: string,
				intent: WorkflowSourceActionIntent,
			) {
				const authority = await new HcmActionAuthorityResolver(binder.bind(tx, tenant)).resolve(
					context,
					reference,
					{ permission, scopeReference: 'a'.repeat(64), intentDigest: intent.intentDigest },
				)
				await new TransactionalActionAccessPolicy(tx, authority, 'a'.repeat(64)).require({
					permission,
					entitlement: 'hcm.attendance',
				})
				const receipt: WorkflowSourceActionReceipt = {
					id: randomUUID(),
					dispatchKey: intent.dispatchKey,
					intentDigest: intent.intentDigest,
					caseId: intent.caseId,
					slotId: intent.slotId,
					actorAccountId: intent.actorAccountId,
					generation: intent.generation,
					outcome: 'Accepted',
					caseRevision: intent.expectedCaseRevision + 1,
					subjectRevision: intent.expectedSubjectRevision,
					decisionId: randomUUID(),
					safeFailureCode: null,
				}
				sourceReceipts.set(intent.dispatchKey, receipt)
				sourceDecisions.set(intent.caseId, (sourceDecisions.get(intent.caseId) ?? 0) + 1)
				const manifest = actionManifests.get(intent.caseId)
				if (!manifest) throw new Error('Missing fixture manifest')
				manifest.caseRevision = receipt.caseRevision
				for (const slot of manifest.slots)
					if (slot.id === intent.slotId) {
						slot.state = intent.action === 'Approve' ? 'Approved' : 'Rejected'
						slot.revision++
					}
				if (intent.action === 'Reject') manifest.safeFacts.sourceState = 'Rejected'
				else if (
					manifest.slots.every(
						/** The fixture retains the all-required source invariant. */ (slot) =>
							slot.state === 'Approved',
					)
				)
					manifest.safeFacts.sourceState = 'Approved'
				if (loseNextResponse) {
					loseNextResponse = false
					throw new Error('Source acknowledgement lost')
				}
				return receipt
			},
		}
	}
}

/** Materialize a unique test source through the actual durable planner and return its persisted ready task. */
async function readyTask(stages = 1) {
	const caseId = randomUUID(),
		slotId = randomUUID()
	const manifest: DomainApprovalManifest = {
		schemaVersion: 1,
		registryVersion: 1,
		source: 'Attendance',
		caseId,
		caseRevision: 1,
		subjectId: randomUUID(),
		subjectRevision: 1,
		generation: 1,
		completion: 'AllRequiredAnyReject',
		allowedActions: ['Approve', 'Reject'],
		registeredRouteCode: 'WORK_SCHEDULES',
		safeFacts: {
			subjectType: 'Override',
			dateFrom: '2027-02-03',
			dateTo: '2027-02-03',
			legalEntityId: 'fixture-entity',
			sourceState: 'Pending',
		},
		slots: [
			{
				id: slotId,
				revision: 1,
				state: 'Pending',
				stage: 1,
				ordinal: 1,
				independent: true,
				distinctActors: false,
				candidateRuleCode: 'fixture-rule',
			},
		],
	}
	if (stages === 2) manifest.slots.push({ ...manifest.slots[0], id: randomUUID(), stage: 2 })
	actionManifests.set(caseId, manifest)
	await database.transaction(
		actor,
		/** Queue the protocol fixture exactly like a source's atomic case admission. */ (tx) =>
			new KyselyWorkflowIntakeBinder().bind(tx, tenant).enqueue(manifest),
	)
	const planner = await issuer.issue(tenant, 'WorkflowPlan', randomUUID(), 60000)
	const lane = new HcmTransactionalWorkerLane(
		'WorkflowPlan',
		new HcmDurableWorkStore(database, { leaseMilliseconds: 60000, maximumAttempts: 3 }),
		[new KyselyWorkflowPlanHandler(new ActionTestProjection())],
	)
	const job = await lane.claim(planner)
	if (!job) throw new Error('Expected planner job')
	await lane.complete(planner, job)
	const row = (
		await admin.query(
			'SELECT t.id,t.revision FROM hcm.workflow_task t JOIN hcm.workflow_instance i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id WHERE i.source_case_id=$1 ORDER BY t.stage',
			[caseId],
		)
	).rows[0]
	return { caseId, taskId: String(row.id), revision: Number(row.revision) }
}

/** Use real cipher, current source checks, runtime reference storage and durable Workflow outbox. */
function actions(tx: Transaction<AccessTables>) {
	return new KyselyWorkflowActionBinder(
		actionCipher,
		binder,
		new ActionTestProjection(),
		new ActionTestSource(),
	).bind(tx, tenant)
}

/** Each scenario requests an explicit decision with bounded narrative and exact source/task revisions. */
function actionCommand(): WorkflowActionCommand {
	return {
		expectedRevision: 1,
		expectedSourceRevision: 1,
		expectedSubjectRevision: 1,
		generation: 1,
		action: 'Approve',
		reason: 'Reviewed private source detail',
	}
}

/** Use only the ephemeral database injected by the integration harness. */
function connection(role: string): string {
	const value = process.env[`HCM_TEST_${role}`]
	if (!value) throw new Error('Disposable PostgreSQL harness required')
	return value
}

/** Model one unique canonical intent without embedding any private business narrative. */
function binding(): HcmActionBinding {
	return {
		permission,
		scopeReference: 'a'.repeat(64),
		intentDigest: randomUUID().replaceAll('-', '').repeat(2),
	}
}

/** Authenticate the real canonical local persona through Runtime's existing development session adapter. */
async function authenticate() {
	return application.authenticate(
		await application.resolveTenant('acme.localhost', '127.0.0.1'),
		undefined,
		{ tenantId: tenant, peerAddress: '127.0.0.1', developmentPersona: 'david' },
	)
}

/** Issue a reference in the same transaction boundary used by online source commands. */
async function issue(input: HcmActionBinding, context = actor) {
	return database.transaction(
		context,
		/** Capture only privately verified server authority. */ (tx) =>
			binder.bind(tx, tenant).issue(context, input),
	)
}

/** Reconstruct dispatch provenance from a real immutable SQL record inside a verified worker transaction. */
async function withAuthority<T>(
	referenceId: string,
	input: HcmActionBinding,
	work: (
		tx: Transaction<AccessTables>,
		authority: Awaited<ReturnType<HcmActionAuthorityResolver['resolve']>>,
	) => Promise<T>,
) {
	return database.workloadTransaction(
		dispatch,
		'WorkflowDispatch',
		/** Keep restore, authorization and effect under the same current-tenant lock. */ async (
			tx,
		) => {
			const authority = await new HcmActionAuthorityResolver(binder.bind(tx, tenant)).resolve(
				dispatch,
				referenceId,
				input,
			)
			const result = await work(tx, authority)
			requireHcmActionAuthority(authority)
			return result
		},
	)
}

beforeAll(
	/** Migrate isolated SQL and seed actual accounts before testing durable action admission. */ async () => {
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
		directory = new HcmRuntimeStore(connection('RUNTIME'))
		database = new HcmTenantDatabase({ connectionString: connection('RUNTIME'), maxConnections: 2 })
		application = new HcmRuntimeApplication(
			createTenantDirectory(environment, directory),
			createSessionReader(environment, directory),
		)
		actor = await authenticate()
		expect(requireAuthenticatedScope(actor).accountId).toBe(account)
		issuer = new HcmWorkloadIssuer(directory, [
			'WorkflowDispatch',
			'WorkflowPlan',
			'WorkflowReconcile',
		])
		dispatch = await issuer.issue(tenant, 'WorkflowDispatch', randomUUID(), 300000)
	},
)

afterAll(
	/** Release only suite-owned connections and restore the clock after failure injection. */ async () => {
		vi.restoreAllMocks()
		await database?.destroy()
		await directory?.onApplicationShutdown()
		await runtime?.end()
		await admin?.end()
	},
)

it('captures private authority, rejects forged contexts and preserves expiry on replay', /** Public DTO changes and later sessions cannot replace the original actor or extend an admitted action. */ async () => {
	const input = binding()
	const context = await authenticate()
	const original = requireAuthenticatedScope(context)
	context.session.user.id = 'forged-account'
	context.session.session.expiresAt = '2199-01-01T00:00:00Z'
	const reference = await issue(input, context)
	expect(await issue(input, await authenticate())).toBe(reference)
	await database.transaction(
		actor,
		/** Inspect the owner projection rather than accepting public session fields. */ async (tx) => {
			expect(await binder.bind(tx, tenant).read(reference)).toMatchObject({
				accountId: account,
				expiresAt: original.expiresAt,
			})
			await expect(binder.bind(tx, tenant).issue({ ...context }, binding())).rejects.toThrow(
				'unauthenticated',
			)
			await expect(
				binder.bind(tx, tenant).issue(actor, { ...input, scopeReference: 'b'.repeat(64) }),
			).rejects.toThrow('forbidden')
		},
	)
	await expect(
		runtime.query(
			"UPDATE hcm.runtime_action_authorization SET expires_at=expires_at+interval '1 hour' WHERE id=$1",
			[reference],
		),
	).rejects.toMatchObject({ code: '42501' })
})

it('requires verified dispatch, exact bindings and registered capabilities', /** Serialized references alone cannot authorize source decisions or be used for another operation. */ async () => {
	const input = binding(),
		reference = await issue(input)
	await withAuthority(
		reference,
		input,
		/** Check private registration and current real grants. */ async (tx, authority) => {
			expect(requireHcmActionAuthority(authority).accountId).toBe(account)
			expect(
				/** A JSON copy has no Runtime registration. */ () =>
					requireHcmActionAuthority({ ...authority }),
			).toThrow('unauthenticated')
			const policy = new TransactionalActionAccessPolicy(tx, authority, input.scopeReference)
			expect((await policy.require({ permission, entitlement: 'hcm.attendance' })).accountId).toBe(
				account,
			)
			await expect(
				policy.require({
					permission: 'hcm.access-control.roles.manage',
					entitlement: 'hcm.access-control',
				}),
			).rejects.toThrow('forbidden')
			await expect(
				new TransactionalActionAccessPolicy(tx, authority, 'b'.repeat(64)).require({
					permission,
					entitlement: 'hcm.attendance',
				}),
			).rejects.toThrow('forbidden')
		},
	)
	await database.workloadTransaction(
		dispatch,
		'WorkflowDispatch',
		/** Reject altered intent identity and a planner attempting dispatch. */ async (tx) => {
			const resolver = new HcmActionAuthorityResolver(binder.bind(tx, tenant))
			await expect(
				resolver.resolve(dispatch, reference, { ...input, intentDigest: 'f'.repeat(64) }),
			).rejects.toThrow('forbidden')
			await expect(resolver.resolve({ ...dispatch }, reference, input)).rejects.toThrow(
				'unauthenticated',
			)
			await expect(
				resolver.resolve(
					await issuer.issue(tenant, 'WorkflowPlan', randomUUID()),
					reference,
					input,
				),
			).rejects.toThrow('forbidden')
		},
	)
})

it('enforces RLS, composite actor ownership and transaction binding', /** Even a valid dispatch cannot resolve authority belonging to another tenant. */ async () => {
	const input = binding(),
		reference = await issue(input)
	await database.transaction(
		actor,
		/** Reject mismatched owner binders and verify unfiltered RLS after switching only the test transaction context. */ async (
			tx,
		) => {
			await expect(binder.bind(tx, 'foreign').read(reference)).rejects.toThrow('forbidden')
			await sql`SELECT set_config('hcm.tenant_id','authority-other',true)`.execute(tx)
			expect((await sql`SELECT id FROM hcm.runtime_action_authorization`.execute(tx)).rows).toEqual(
				[],
			)
			expect(await binder.bind(tx, 'authority-other').read(reference)).toBeNull()
			await expect(
				new HcmActionAuthorityResolver(binder.bind(tx, 'authority-other')).resolve(
					dispatch,
					reference,
					input,
				),
			).rejects.toThrow('forbidden')
		},
	)
	await expect(
		runtime.query(
			"INSERT INTO hcm.runtime_action_authorization(tenant_id,id,actor_account_id,expires_at,permission,scope_reference,intent_digest) VALUES($1,$2,'missing-account',now()+interval '1 hour',$3,$4,$5)",
			[tenant, randomUUID(), permission, input.scopeReference, binding().intentDigest],
		),
	).rejects.toMatchObject({ code: '23503' })
	expect(
		/** A pool-like object cannot be bound as an authorized transaction. */ () =>
			binder.bind({ isTransaction: false }, tenant),
	).toThrow('forbidden')
})

it('rolls back authority with its admitting transaction', /** A crashed producer cannot leave an independently usable action reference. */ async () => {
	const input = binding()
	await expect(
		database.transaction(
			actor,
			/** Fail after insertion to exercise the real transaction rollback. */ async (tx) => {
				await binder.bind(tx, tenant).issue(actor, input)
				throw new Error('injected rollback')
			},
		),
	).rejects.toThrow('injected rollback')
	expect(
		(
			await admin.query('SELECT id FROM hcm.runtime_action_authorization WHERE intent_digest=$1', [
				input.intentDigest,
			])
		).rows,
	).toEqual([])
})

it('rechecks revocation and account disablement before a new action', /** A stored authority reference is never a frozen copy of grants. */ async () => {
	const input = binding(),
		reference = await issue(input)
	await admin.query('UPDATE hcm.user_account SET enabled=false WHERE id=$1', [account])
	try {
		await expect(
			withAuthority(
				reference,
				input,
				/** Disabled real accounts have no decision authority. */ async (tx, authority) =>
					new TransactionalActionAccessPolicy(tx, authority, input.scopeReference).require({
						permission,
						entitlement: 'hcm.attendance',
					}),
			),
		).rejects.toThrow('unauthenticated')
	} finally {
		await admin.query('UPDATE hcm.user_account SET enabled=true WHERE id=$1', [account])
	}
	await admin.query('UPDATE hcm.tenant_entitlement SET enabled=false WHERE code=$1', [
		'hcm.attendance',
	])
	try {
		await expect(
			withAuthority(
				reference,
				input,
				/** Entitlement revocation takes effect despite an earlier successful admission. */ async (
					tx,
					authority,
				) =>
					new TransactionalActionAccessPolicy(tx, authority, input.scopeReference).require({
						permission,
						entitlement: 'hcm.attendance',
					}),
			),
		).rejects.toThrow('forbidden')
	} finally {
		await admin.query('UPDATE hcm.tenant_entitlement SET enabled=true WHERE code=$1', [
			'hcm.attendance',
		])
	}
	const grants = (
		await admin.query(
			'DELETE FROM hcm.role_permission WHERE permission_code=$1 RETURNING role_id',
			[permission],
		)
	).rows
	try {
		await expect(
			withAuthority(
				reference,
				input,
				/** Current exact permission revocation defeats a previously issued durable reference. */ async (
					tx,
					authority,
				) =>
					new TransactionalActionAccessPolicy(tx, authority, input.scopeReference).require({
						permission,
						entitlement: 'hcm.attendance',
					}),
			),
		).rejects.toThrow('forbidden')
	} finally {
		for (const grant of grants)
			await admin.query(
				'INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,$2,$3)',
				[tenant, grant.role_id, permission],
			)
	}
})

it('denies expired human authority and rolls back effects when it expires before commit', /** Worker execution cannot renew the human session or retain an effect past the source commit guard. */ async () => {
	const input = binding(),
		reference = await issue(input)
	const expiry = requireAuthenticatedScope(actor).expiresAt
	const clock = vi.spyOn(Date, 'now')
	try {
		await expect(
			withAuthority(
				reference,
				input,
				/** Move beyond human expiry after a write; the wrapper's source guard must roll everything back. */ async (
					tx,
				) => {
					await sql`INSERT INTO hcm.access_role(tenant_id,id,label) VALUES(${tenant},'expired-action-effect','Must roll back')`.execute(
						tx,
					)
					clock.mockReturnValue(expiry + 1)
				},
			),
		).rejects.toThrow('unauthenticated')
		const laterWorker = await issuer.issue(tenant, 'WorkflowDispatch', randomUUID(), 60000)
		await expect(
			database.workloadTransaction(
				laterWorker,
				'WorkflowDispatch',
				/** A newly issued worker capability still cannot revive the old human. */ async (tx) =>
					new HcmActionAuthorityResolver(binder.bind(tx, tenant)).resolve(
						laterWorker,
						reference,
						input,
					),
			),
		).rejects.toThrow('unauthenticated')
	} finally {
		clock.mockRestore()
	}
	expect(
		(await admin.query("SELECT id FROM hcm.access_role WHERE id='expired-action-effect'")).rows,
	).toEqual([])
})

it('queues one encrypted action under concurrent retries and accepts only a source-backed receipt', /** Planner, intake, Runtime authority, dispatch and receipt persistence all use real restricted PostgreSQL. */ async () => {
	const task = await readyTask(),
		key = randomUUID(),
		input = actionCommand()
	const requests = await Promise.all(
		[0, 1].map(
			/** Race the same browser identity through separate database transactions. */ () =>
				database.transaction(
					actor,
					/** Retain the caller's real session in the admission boundary. */ (tx) =>
						actions(tx).submit(actor, task.taskId, key, input),
				),
		),
	)
	expect(requests[0]).toEqual(requests[1])
	const result = requests[0]
	await expect(
		database.transaction(
			actor,
			/** A changed reason cannot reuse an existing browser retry identity. */ (tx) =>
				actions(tx).submit(actor, task.taskId, key, { ...input, reason: 'Changed' }),
		),
	).rejects.toMatchObject({ code: 'revision-conflict' })
	const stored = (
		await admin.query(
			'SELECT a.state,a.encrypted_reason,o.payload FROM hcm.workflow_action_attempt a JOIN hcm.workflow_outbox o ON o.tenant_id=a.tenant_id AND o.id=a.outbox_id WHERE a.id=$1',
			[result.attemptId],
		)
	).rows[0]
	expect(stored.state).toBe('Pending')
	expect(stored.encrypted_reason.toString('utf8')).not.toContain(input.reason)
	expect(stored.payload).toEqual({
		attemptId: result.attemptId,
		intentDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
	})
	await expect(
		runtime.query(
			"UPDATE hcm.workflow_task SET state='Completed',revision=revision+1 WHERE id=$1",
			[task.taskId],
		),
	).rejects.toMatchObject({ code: '23514' })
	const lane = new HcmTransactionalWorkerLane(
		'WorkflowDispatch',
		new HcmDurableWorkStore(database, { leaseMilliseconds: 60000, maximumAttempts: 3 }),
		[new KyselyWorkflowDispatchHandler(new ActionTestSource(), actionCipher, binder)],
	)
	const job = await lane.claim(dispatch)
	if (!job) throw new Error('Expected dispatch')
	expect(job.id).toBe(result.operationId)
	await lane.complete(dispatch, job)
	const recovered = await database.transaction(
		actor,
		/** Accepted results remain readable without pretending the old task is actionable. */ (tx) =>
			actions(tx).read(actor, result.attemptId),
	)
	expect(recovered).toMatchObject({
		id: result.attemptId,
		taskId: task.taskId,
		state: 'Accepted',
		sourceRevision: 2,
	})
	expect(
		(await admin.query('SELECT state FROM hcm.workflow_task WHERE id=$1', [task.taskId])).rows[0]
			.state,
	).toBe('Completed')
	expect(sourceDecisions.get(task.caseId)).toBe(1)
	expect(
		(
			await admin.query(
				'SELECT count(*)::int AS count FROM hcm.workflow_action_attempt WHERE task_id=$1',
				[task.taskId],
			)
		).rows[0].count,
	).toBe(1)
	expect(
		await database.transaction(
			actor,
			/** A lost browser response recovers the original accepted-intent response, not a second decision. */ (
				tx,
			) => actions(tx).submit(actor, task.taskId, key, input),
		),
	).toEqual(result)
})

it('queries the original source receipt after a lost acknowledgement before any redispatch', /** The explicit test source commits independently to exercise the unknown-delivery protocol; no Attendance success is claimed here. */ async () => {
	const task = await readyTask()
	const result = await database.transaction(
		actor,
		/** Admit an ordinary action before injecting response loss. */ (tx) =>
			actions(tx).submit(actor, task.taskId, randomUUID(), actionCommand()),
	)
	const lane = new HcmTransactionalWorkerLane(
		'WorkflowDispatch',
		new HcmDurableWorkStore(database, { leaseMilliseconds: 60000, maximumAttempts: 3 }),
		[new KyselyWorkflowDispatchHandler(new ActionTestSource(), actionCipher, binder)],
	)
	const job = await lane.claim(dispatch)
	if (!job) throw new Error('Expected dispatch')
	loseNextResponse = true
	await expect(lane.complete(dispatch, job)).rejects.toThrow('Source acknowledgement lost')
	expect(
		(await admin.query('SELECT state FROM hcm.workflow_task WHERE id=$1', [task.taskId])).rows[0]
			.state,
	).toBe('ActionPending')
	expect(
		(
			await admin.query('SELECT attempt_id FROM hcm.workflow_action_receipt WHERE attempt_id=$1', [
				result.attemptId,
			])
		).rows,
	).toEqual([])
	await lane.fail(dispatch, job, 0)
	const retry = await lane.claim(dispatch)
	if (!retry) throw new Error('Expected original dispatch retry')
	expect(retry.id).toBe(job.id)
	await lane.complete(dispatch, retry)
	expect(sourceDecisions.get(task.caseId)).toBe(1)
	expect(
		(
			await database.transaction(
				actor,
				/** Recovery follows the persisted source receipt. */ (tx) =>
					actions(tx).read(actor, result.attemptId),
			)
		).state,
	).toBe('Accepted')
})

/** Drain only source reconciliation jobs and persist their real Runtime completion fences. */
async function reconcileSources() {
	const context = await issuer.issue(tenant, 'WorkflowReconcile', randomUUID(), 60000)
	const lane = new HcmTransactionalWorkerLane(
		'WorkflowReconcile',
		new HcmDurableWorkStore(database, { leaseMilliseconds: 60000, maximumAttempts: 3 }),
		[new KyselyWorkflowReconcileHandler(new ActionTestProjection())],
	)
	for (;;) {
		const job = await lane.claim(context)
		if (!job) break
		await lane.complete(context, job)
	}
}

it('advances only the next required stage and closes a fully receipt-backed case', /** Current source progress activates later slots while terminal reconciliation cancels pending reminders. */ async () => {
	const task = await readyTask(2)
	const lane = new HcmTransactionalWorkerLane(
		'WorkflowDispatch',
		new HcmDurableWorkStore(database, { leaseMilliseconds: 60000, maximumAttempts: 3 }),
		[new KyselyWorkflowDispatchHandler(new ActionTestSource(), actionCipher, binder)],
	)
	await database.transaction(
		actor,
		/** Admit the first required stage only. */ (tx) =>
			actions(tx).submit(actor, task.taskId, randomUUID(), actionCommand()),
	)
	const first = await lane.claim(dispatch)
	if (!first) throw new Error('Expected stage one action')
	await lane.complete(dispatch, first)
	await reconcileSources()
	const tasks = (
		await admin.query(
			'SELECT t.* FROM hcm.workflow_task t JOIN hcm.workflow_instance i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id WHERE i.source_case_id=$1 ORDER BY t.stage',
			[task.caseId],
		)
	).rows
	expect(
		tasks.map(
			/** Compare source-backed stage activation after the first decision. */ (row) => row.state,
		),
	).toEqual(['Completed', 'Ready'])
	expect(tasks[1].expected_case_revision).toBe(2)
	expect(
		(
			await admin.query(
				"SELECT count(*)::int AS count FROM hcm.workflow_task_timer WHERE task_id=$1 AND state='Pending'",
				[tasks[1].id],
			)
		).rows[0].count,
	).toBe(5)
	await database.transaction(
		actor,
		/** A later-stage decision uses the newly reconciled revisions. */ (tx) =>
			actions(tx).submit(actor, tasks[1].id, randomUUID(), {
				...actionCommand(),
				expectedRevision: tasks[1].revision,
				expectedSourceRevision: 2,
			}),
	)
	const second = await lane.claim(dispatch)
	if (!second) throw new Error('Expected stage two action')
	await lane.complete(dispatch, second)
	await reconcileSources()
	expect(
		(
			await admin.query('SELECT state FROM hcm.workflow_instance WHERE source_case_id=$1', [
				task.caseId,
			])
		).rows[0].state,
	).toBe('Completed')
	expect(
		(
			await admin.query(
				"SELECT count(*)::int AS count FROM hcm.workflow_task_timer r JOIN hcm.workflow_task t ON t.tenant_id=r.tenant_id AND t.id=r.task_id WHERE t.instance_id=$1 AND r.state='Pending'",
				[tasks[0].instance_id],
			)
		).rows[0].count,
	).toBe(0)
	expect(sourceDecisions.get(task.caseId)).toBe(2)
})

it('refuses a source status projection as a replacement for accepted decision proof', /** A decided slot without its authentic receipt becomes a named reconciliation exception, never Completed. */ async () => {
	const task = await readyTask()
	const manifest = actionManifests.get(task.caseId)
	if (!manifest) throw new Error('Missing fixture manifest')
	manifest.caseRevision++
	manifest.slots[0].state = 'Approved'
	manifest.slots[0].revision++
	manifest.safeFacts.sourceState = 'Approved'
	await database.transaction(
		actor,
		/** Queue a source change notification without creating any decision receipt. */ (tx) =>
			enqueueHcmWork(tx, tenant, {
				workload: 'WorkflowReconcile',
				kind: 'workflow.source.reconcile',
				schemaVersion: 1,
				businessKey: randomUUID(),
				payload: { source: 'Attendance', caseId: task.caseId, generation: 1 },
			}),
	)
	await reconcileSources()
	expect(
		(await admin.query('SELECT state FROM hcm.workflow_task WHERE id=$1', [task.taskId])).rows[0]
			.state,
	).toBe('Failed')
	expect(
		(
			await admin.query('SELECT code FROM hcm.workflow_reconciliation_exception WHERE task_id=$1', [
				task.taskId,
			])
		).rows[0].code,
	).toBe('SourceProofMissing')
	expect(
		(
			await admin.query('SELECT state FROM hcm.workflow_instance WHERE source_case_id=$1', [
				task.caseId,
			])
		).rows[0].state,
	).toBe('Open')
})

it('cancels remaining source obligations after a receipt-backed rejection', /** Workflow completion here means coordination closed; the source remains Rejected, never Approved. */ async () => {
	const task = await readyTask(2)
	await database.transaction(
		actor,
		/** An explicit rejection is admitted with the same current source authority requirements. */ (
			tx,
		) =>
			actions(tx).submit(actor, task.taskId, randomUUID(), {
				...actionCommand(),
				action: 'Reject',
			}),
	)
	const lane = new HcmTransactionalWorkerLane(
		'WorkflowDispatch',
		new HcmDurableWorkStore(database, { leaseMilliseconds: 60000, maximumAttempts: 3 }),
		[new KyselyWorkflowDispatchHandler(new ActionTestSource(), actionCipher, binder)],
	)
	const job = await lane.claim(dispatch)
	if (!job) throw new Error('Expected rejection dispatch')
	await lane.complete(dispatch, job)
	await reconcileSources()
	const rows = (
		await admin.query(
			'SELECT t.state FROM hcm.workflow_task t JOIN hcm.workflow_instance i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id WHERE i.source_case_id=$1 ORDER BY t.stage',
			[task.caseId],
		)
	).rows
	expect(
		rows.map(
			/** A source rejection closes the decided slot and cancels later requirements. */ (row) =>
				row.state,
		),
	).toEqual(['Completed', 'Cancelled'])
	expect(actionManifests.get(task.caseId)?.safeFacts.sourceState).toBe('Rejected')
	expect(sourceDecisions.get(task.caseId)).toBe(1)
})
