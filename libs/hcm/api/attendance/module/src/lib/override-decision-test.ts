import { randomUUID } from 'node:crypto'
import { sql } from 'kysely'
import { expect } from 'vitest'
import { HcmTenantDatabase } from '@empflowyee/hcm-api-database-kysely'
import {
	HcmRuntimeApplication,
	HcmWorkloadIssuer,
	type AuthenticatedHcmContext,
	type HcmWorkload,
} from '@empflowyee/hcm-api-runtime-application'
import {
	HcmRuntimeStore,
	createTenantDirectory,
	createSessionReader,
	HcmDurableWorkStore,
	HcmTransactionalWorkerLane,
	KyselyHcmActionAuthorizationBinder,
	type HcmWorkHandler,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import { KyselyApprovalCandidateBinder } from '@empflowyee/hcm-api-access-control-infrastructure'
import {
	KyselyWorkforceTimeContextBinder,
	KyselyWorkforceApprovalRoutingBinder,
} from '@empflowyee/hcm-api-workforce-foundation-infrastructure'
import { KyselyLeaveWorkdayImpactBinder } from '@empflowyee/hcm-api-leave-infrastructure'
import {
	KyselyAttendanceWorkflowSourceBinder,
	KyselyAttendanceWorkflowActionBinder,
} from '@empflowyee/hcm-api-attendance-infrastructure'
import {
	KyselyWorkflowActionBinder,
	KyselyWorkflowPlanHandler,
	KyselyWorkflowDispatchHandler,
	KyselyWorkflowReconcileHandler,
} from '@empflowyee/hcm-api-workflow-infrastructure'
import type { WorkloadAuditTables } from '@empflowyee/hcm-api-audit-infrastructure'
import type { WorkflowActionCommand } from '@empflowyee/hcm-workflow-contract'
import { HCM_TEST_TENANT as tenant, type HcmTestApi } from './attendance-test-harness'

/** Exercise real source decisions and Workflow receipts after an HTTP-created override submission. */
export async function verifyOverrideDecisions(api: HcmTestApi, caseId: string, overrideId: string) {
	const connectionString = process.env['HCM_TEST_RUNTIME']
	if (!connectionString) throw new Error('Disposable database required')
	const database = new HcmTenantDatabase<WorkloadAuditTables>({
			connectionString,
			maxConnections: 3,
		}),
		directory = new HcmRuntimeStore(connectionString)
	const environment = {
		APP_ENVIRONMENT: 'local',
		NODE_ENV: 'test',
		HCM_LOCAL_TENANTS: 'true',
		HCM_LOCAL_SESSION: 'true',
	}
	const runtime = new HcmRuntimeApplication(
		createTenantDirectory(environment, directory),
		createSessionReader(environment, directory),
	)
	const workforce = new KyselyWorkforceTimeContextBinder(),
		routing = new KyselyWorkforceApprovalRoutingBinder(),
		authorities = new KyselyHcmActionAuthorizationBinder()
	const projections = new KyselyAttendanceWorkflowSourceBinder(
		workforce,
		routing,
		new KyselyApprovalCandidateBinder(),
	)
	const sources = new KyselyAttendanceWorkflowActionBinder(
		workforce,
		routing,
		projections,
		authorities,
		api.cipher,
		new KyselyLeaveWorkdayImpactBinder(),
	)
	const actions = new KyselyWorkflowActionBinder(api.cipher, authorities, projections, sources)
	const issuer = new HcmWorkloadIssuer(directory, [
		'WorkflowPlan',
		'WorkflowDispatch',
		'WorkflowReconcile',
	])
	/** Resolve an actual persisted development persona through the production authentication boundary. */
	async function actor(persona: string) {
		return runtime.authenticate(
			await runtime.resolveTenant('acme.localhost', '127.0.0.1'),
			undefined,
			{ peerAddress: '127.0.0.1', developmentPersona: persona },
		)
	}
	/** Consume one real durable job through the production lease and source receipt fence. */
	async function complete(
		workload: HcmWorkload,
		handler: HcmWorkHandler<WorkloadAuditTables>,
		failEnqueue = false,
	) {
		const context = await issuer.issue(tenant, workload, randomUUID(), 600000)
		const lane = new HcmTransactionalWorkerLane(
			workload,
			new HcmDurableWorkStore(database, { leaseMilliseconds: 60000, maximumAttempts: 3 }),
			[handler],
		)
		const work = await lane.claim(context)
		if (!work) throw new Error('Expected durable decision work')
		if (failEnqueue) {
			await api.admin.query(
				"CREATE FUNCTION hcm.test_decision_enqueue_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected queue failure' USING ERRCODE='P0001'; END $$",
			)
			await api.admin.query(
				'CREATE TRIGGER test_decision_enqueue_failure BEFORE INSERT ON hcm.attendance_outbox FOR EACH ROW EXECUTE FUNCTION hcm.test_decision_enqueue_failure()',
			)
			try {
				await expect(lane.complete(context, work)).rejects.toMatchObject({ code: 'P0001' })
				expect(
					(
						await api.admin.query(
							'SELECT state,revision FROM hcm.attendance_approval_case WHERE tenant_id=$1 AND id=$2',
							[tenant, caseId],
						)
					).rows,
				).toEqual([{ state: 'Pending', revision: 2 }])
				expect(
					(
						await api.admin.query(
							'SELECT count(*)::int AS n FROM hcm.attendance_decision WHERE tenant_id=$1 AND case_id=$2',
							[tenant, caseId],
						)
					).rows[0].n,
				).toBe(1)
				expect(
					(
						await api.admin.query(
							'SELECT state,revision FROM hcm.schedule_override WHERE tenant_id=$1 AND id=$2',
							[tenant, overrideId],
						)
					).rows,
				).toEqual([{ state: 'Draft', revision: 1 }])
			} finally {
				await api.admin.query('DROP TRIGGER test_decision_enqueue_failure ON hcm.attendance_outbox')
				await api.admin.query('DROP FUNCTION hcm.test_decision_enqueue_failure()')
			}
		}
		await lane.complete(context, work)
	}
	/** Submit through the real Workflow intake using the same tenant-before-case ordering as online source commands. */
	async function submit(
		context: AuthenticatedHcmContext,
		taskId: string,
		key: string,
		input: WorkflowActionCommand,
	) {
		return database.transaction(
			context,
			/** Source authorization remains inside the actual current tenant transaction. */ async (
				tx,
			) => {
				await sql`SELECT pg_advisory_xact_lock(hashtextextended(${tenant},0))`.execute(tx)
				return actions.bind(tx, tenant).submit(context, taskId, key, input)
			},
		)
	}
	try {
		// These fixture grants exercise explicit permission checks; they are not production seed defaults.
		await api.admin.query(
			"INSERT INTO hcm.access_permission(tenant_id,code,description,kind) VALUES($1,'hcm.attendance.approve-attendance.read','Read test source approvals','business-operation') ON CONFLICT DO NOTHING",
			[tenant],
		)
		await api.admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) SELECT $1,r.id,p.code FROM hcm.access_role r CROSS JOIN hcm.access_permission p WHERE r.tenant_id=$1 AND p.tenant_id=$1 AND r.id IN ('manager','hr-specialist','tenant-administrator') AND p.code IN ('hcm.attendance.approve-attendance.read','hcm.attendance.approve-attendance.decide') ON CONFLICT DO NOTHING",
			[tenant],
		)
		const michael = await actor('michael'),
			toby = await actor('toby'),
			david = await actor('david'),
			jim = await actor('jim')
		const dispatch = new KyselyWorkflowDispatchHandler(sources, api.cipher, authorities),
			reconcile = new KyselyWorkflowReconcileHandler(projections)
		const original = (
			await api.send<import('@empflowyee/hcm-attendance-contract').AttendanceOverrideView>(
				'david',
				'GET',
				'attendance/overrides/' + overrideId,
			)
		).body
		const rejectedDraft = await api.send<
			import('@empflowyee/hcm-attendance-contract').AttendanceOverrideView
		>('david', 'POST', 'attendance/overrides', {
			employmentId: original.employmentId,
			workDate: original.workDate,
			workdayRevision: original.workdayRevision,
			zone: original.zone,
			segments: original.segments,
			reason: 'Independent rejection journey',
			evidenceIds: [],
		})
		expect(rejectedDraft.status).toBe(201)
		const rejectPath = 'attendance/overrides/' + rejectedDraft.body.id
		const rejectReview = (
			await api.send<import('@empflowyee/hcm-attendance-contract').AttendanceOverrideReview>(
				'david',
				'POST',
				rejectPath + '/preview',
				{ expectedRevision: 1, reason: 'Review rejected proposal' },
			)
		).body
		const rejectCase = await api.send<
			import('@empflowyee/hcm-attendance-contract').AttendanceOverrideSubmission
		>('david', 'POST', rejectPath + '/submit', {
			expectedRevision: 1,
			previewId: rejectReview.previewId,
			digest: rejectReview.digest,
			reason: 'Request independent decision',
		})
		expect(rejectCase.status).toBe(200)
		await complete('WorkflowPlan', new KyselyWorkflowPlanHandler(projections))
		const rejectTask = (
			await api.admin.query(
				'SELECT t.id,t.revision FROM hcm.workflow_task t JOIN hcm.workflow_instance i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id WHERE i.tenant_id=$1 AND i.source_case_id=$2 AND t.stage=1',
				[tenant, rejectCase.body.caseId],
			)
		).rows[0]
		const rejectAttempt = await submit(michael, rejectTask.id, randomUUID(), {
			expectedRevision: rejectTask.revision,
			expectedSourceRevision: 1,
			expectedSubjectRevision: 1,
			generation: 1,
			action: 'Reject',
			reason: 'Private rejected decision',
		})
		const resolutionCount = (
			await api.admin.query(
				'SELECT count(*)::int AS n FROM hcm.attendance_outbox WHERE tenant_id=$1',
				[tenant],
			)
		).rows[0].n
		await complete('WorkflowDispatch', dispatch)
		expect(
			(
				await database.transaction(
					michael,
					/** Rejection is an accepted source decision, not a failed dispatch. */ (tx) =>
						actions.bind(tx, tenant).read(michael, rejectAttempt.attemptId),
				)
			).state,
		).toBe('Accepted')
		await complete('WorkflowReconcile', reconcile)
		expect(
			(
				await api.admin.query(
					'SELECT state FROM hcm.attendance_approval_case WHERE tenant_id=$1 AND id=$2',
					[tenant, rejectCase.body.caseId],
				)
			).rows,
		).toEqual([{ state: 'Rejected' }])
		expect((await api.send('david', 'GET', rejectPath)).body['state']).toBe('Draft')
		expect(
			(
				await api.admin.query(
					'SELECT count(*)::int AS n FROM hcm.attendance_outbox WHERE tenant_id=$1',
					[tenant],
				)
			).rows[0].n,
		).toBe(resolutionCount)
		expect(
			(
				await api.admin.query(
					'SELECT t.state FROM hcm.workflow_task t JOIN hcm.workflow_instance i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id WHERE i.tenant_id=$1 AND i.source_case_id=$2 ORDER BY t.stage',
					[tenant, rejectCase.body.caseId],
				)
			).rows,
		).toEqual([{ state: 'Completed' }, { state: 'Cancelled' }])

		const staleDraft = await api.send<
			import('@empflowyee/hcm-attendance-contract').AttendanceOverrideView
		>('david', 'POST', 'attendance/overrides', {
			employmentId: original.employmentId,
			workDate: original.workDate,
			workdayRevision: original.workdayRevision,
			zone: original.zone,
			segments: original.segments,
			reason: 'Review a competing proposal before source changes',
			evidenceIds: [],
		})
		expect(staleDraft.status).toBe(201)
		const stalePath = 'attendance/overrides/' + staleDraft.body.id
		const staleReview = (
			await api.send<import('@empflowyee/hcm-attendance-contract').AttendanceOverrideReview>(
				'david',
				'POST',
				stalePath + '/preview',
				{ expectedRevision: 1, reason: 'Review current inputs' },
			)
		).body
		const staleCase = await api.send<
			import('@empflowyee/hcm-attendance-contract').AttendanceOverrideSubmission
		>('david', 'POST', stalePath + '/submit', {
			expectedRevision: 1,
			previewId: staleReview.previewId,
			digest: staleReview.digest,
			reason: 'Retain source revision',
		})
		expect(staleCase.status).toBe(200)
		await complete('WorkflowPlan', new KyselyWorkflowPlanHandler(projections))

		for (const [index, approver] of [michael, toby].entries()) {
			const task = (
				await api.admin.query(
					'SELECT t.id,t.revision,t.expected_case_revision,t.source_slot_id,i.subject_revision,i.generation FROM hcm.workflow_task t JOIN hcm.workflow_instance i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id WHERE i.tenant_id=$1 AND i.source_case_id=$2 AND t.stage=$3',
					[tenant, caseId, index + 1],
				)
			).rows[0]
			const input: WorkflowActionCommand = {
				expectedRevision: task.revision,
				expectedSourceRevision: task.expected_case_revision,
				expectedSubjectRevision: task.subject_revision,
				generation: task.generation,
				action: 'Approve',
				reason: 'Private independent stage ' + (index + 1),
			}
			await expect(submit(david, task.id, randomUUID(), input)).rejects.toMatchObject({
				code: 'forbidden',
			})
			await expect(submit(jim, task.id, randomUUID(), input)).rejects.toMatchObject({
				code: 'forbidden',
			})
			if (index === 0) {
				const revoked = await submit(approver, task.id, randomUUID(), input)
				await api.admin.query(
					"DELETE FROM hcm.role_permission WHERE tenant_id=$1 AND role_id='manager' AND permission_code='hcm.attendance.approve-attendance.decide'",
					[tenant],
				)
				try {
					await complete('WorkflowDispatch', dispatch)
					const denied = await database.transaction(
						approver,
						/** Read remains separately authorized after the decision grant is revoked. */ (tx) =>
							actions.bind(tx, tenant).read(approver, revoked.attemptId),
					)
					expect(denied).toMatchObject({ state: 'Denied', safeFailureCode: 'AuthorityUnavailable' })
					expect(
						(
							await api.admin.query(
								'SELECT state,revision FROM hcm.attendance_approval_case WHERE tenant_id=$1 AND id=$2',
								[tenant, caseId],
							)
						).rows,
					).toEqual([{ state: 'Pending', revision: 1 }])
				} finally {
					await api.admin.query(
						"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'manager','hcm.attendance.approve-attendance.decide')",
						[tenant],
					)
				}
				await complete('WorkflowReconcile', reconcile)
				input.expectedRevision = (
					await api.admin.query(
						'SELECT revision FROM hcm.workflow_task WHERE tenant_id=$1 AND id=$2',
						[tenant, task.id],
					)
				).rows[0].revision
			}
			const persona = index ? 'toby' : 'michael'
			const sourcePath = `attendance/approval-cases/${caseId}`
			const caseView = await api.send<
				import('@empflowyee/hcm-attendance-contract').AttendanceApprovalCaseView
			>(persona, 'GET', sourcePath)
			expect(caseView.status).toBe(200)
			expect(caseView.body.slots[index].allowedActions).toEqual(['Approve', 'Reject'])
			const decisionPath = `${sourcePath}/slots/${task.source_slot_id}/decisions`
			const command = {
				expectedRevision: input.expectedSourceRevision,
				expectedSubjectRevision: input.expectedSubjectRevision,
				generation: input.generation,
				action: input.action,
				reason: input.reason,
			}
			expect((await api.send('david', 'POST', decisionPath, command)).status).toBe(403)
			expect((await api.send('jim', 'POST', decisionPath, command)).status).toBe(403)
			expect(
				(await api.send(persona, 'POST', decisionPath, { ...command, reason: ' ' })).status,
			).toBe(400)
			expect(
				(await api.send(persona, 'POST', decisionPath, { ...command, expectedRevision: 99 }))
					.status,
			).toBe(409)
			const key = randomUUID()
			const [acceptedHttp, duplicateHttp] = await Promise.all([
				api.send<import('@empflowyee/hcm-workflow-contract').WorkflowActionResult>(
					persona,
					'POST',
					decisionPath,
					command,
					{ 'idempotency-key': key },
				),
				api.send<import('@empflowyee/hcm-workflow-contract').WorkflowActionResult>(
					persona,
					'POST',
					decisionPath,
					command,
					{ 'idempotency-key': key },
				),
			])
			expect(acceptedHttp.status).toBe(202)
			expect(duplicateHttp.status).toBe(202)
			const first = acceptedHttp.body
			expect(duplicateHttp.body).toEqual(first)
			expect(
				(await api.send(persona, 'GET', 'attendance/decision-receipts/' + key)).body['state'],
			).toBe('Pending')

			expect(first.state).toBe('ActionPending')
			expect(
				(
					await api.admin.query(
						'SELECT state FROM hcm.schedule_override WHERE tenant_id=$1 AND id=$2',
						[tenant, overrideId],
					)
				).rows[0].state,
			).toBe('Draft')
			await complete('WorkflowDispatch', dispatch, index === 1)
			const attempt = await database.transaction(
				approver,
				/** Fresh source read access protects durable result recovery. */ (tx) =>
					actions.bind(tx, tenant).read(approver, first.attemptId),
			)
			expect(attempt.state).toBe('Accepted')
			expect(
				(await api.send(persona, 'GET', 'attendance/decision-receipts/' + key)).body['state'],
			).toBe('Accepted')
			expect(
				(await api.send(index ? 'michael' : 'toby', 'GET', 'attendance/decision-receipts/' + key))
					.status,
			).toBe(404)
			const recoveredHttp = await api.send(persona, 'POST', decisionPath, command, {
				'idempotency-key': key,
			})
			expect(recoveredHttp.status).toBe(202)
			expect(recoveredHttp.body).toEqual(first)

			expect(await submit(approver, task.id, key, input)).toEqual(first)
			await expect(
				submit(approver, task.id, key, { ...input, reason: 'Changed retry' }),
			).rejects.toMatchObject({ code: 'revision-conflict' })
			await complete('WorkflowReconcile', reconcile)
			const progress = (
				await api.admin.query(
					'SELECT state,revision FROM hcm.attendance_approval_case WHERE tenant_id=$1 AND id=$2',
					[tenant, caseId],
				)
			).rows[0]
			expect(progress).toEqual({ state: index ? 'Approved' : 'Pending', revision: index + 2 })
		}
		expect(
			(
				await api.admin.query(
					'SELECT state,revision FROM hcm.schedule_override WHERE tenant_id=$1 AND id=$2',
					[tenant, overrideId],
				)
			).rows,
		).toEqual([{ state: 'Approved', revision: 2 }])
		const proof = (
			await api.admin.query(
				"SELECT outcome,decision_id,subject_revision FROM hcm.attendance_decision_receipt WHERE tenant_id=$1 AND case_id=$2 AND outcome='Accepted' ORDER BY case_revision",
				[tenant, caseId],
			)
		).rows
		expect(proof).toHaveLength(2)
		expect(
			proof.map(
				/** Each independent source slot must retain its own immutable accepted proof. */ (row) =>
					row.outcome,
			),
		).toEqual(['Accepted', 'Accepted'])
		expect(
			proof.map(
				/** Only the final required approval advances the dated source. */ (row) =>
					row.subject_revision,
			),
		).toEqual([1, 2])
		const audit = (
			await api.admin.query(
				"SELECT actor_account_id,actor_kind,safe_summary FROM hcm.audit_event WHERE tenant_id=$1 AND target_id=$2 AND action='attendance.override-decided' ORDER BY occurred_at",
				[tenant, overrideId],
			)
		).rows
		expect(
			audit.map(
				/** Durable decisions preserve the original independent humans, not an invented worker user. */ (
					row,
				) => row.actor_account_id,
			),
		).toEqual(['dunder-mifflin/account/michael', 'dunder-mifflin/account/toby'])
		expect(JSON.stringify(audit)).not.toContain('Private independent')
		expect(
			(
				await api.admin.query(
					'SELECT state FROM hcm.workflow_instance WHERE tenant_id=$1 AND source_case_id=$2',
					[tenant, caseId],
				)
			).rows,
		).toEqual([{ state: 'Completed' }])
		const staleTask = (
			await api.admin.query(
				'SELECT t.id,t.revision FROM hcm.workflow_task t JOIN hcm.workflow_instance i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id WHERE i.tenant_id=$1 AND i.source_case_id=$2 AND t.stage=1',
				[tenant, staleCase.body.caseId],
			)
		).rows[0]
		const staleAttempt = await submit(michael, staleTask.id, randomUUID(), {
			expectedRevision: staleTask.revision,
			expectedSourceRevision: 1,
			expectedSubjectRevision: 1,
			generation: 1,
			action: 'Approve',
			reason: 'Must recheck the now changed source',
		})
		await complete('WorkflowDispatch', dispatch)
		expect(
			(
				await database.transaction(
					michael,
					/** Recover stale proof without applying the competing proposal. */ (tx) =>
						actions.bind(tx, tenant).read(michael, staleAttempt.attemptId),
				)
			).state,
		).toBe('Stale')
		await complete('WorkflowReconcile', reconcile)
		expect(
			(
				await api.admin.query(
					'SELECT state,revision FROM hcm.attendance_approval_case WHERE tenant_id=$1 AND id=$2',
					[tenant, staleCase.body.caseId],
				)
			).rows,
		).toEqual([{ state: 'Invalidated', revision: 2 }])
		expect(
			(
				await api.admin.query(
					'SELECT state FROM hcm.workflow_instance WHERE tenant_id=$1 AND source_case_id=$2',
					[tenant, staleCase.body.caseId],
				)
			).rows,
		).toEqual([{ state: 'Invalidated' }])
		expect((await api.send('david', 'GET', stalePath)).body['state']).toBe('Draft')
		await expect(
			api.admin.query(
				'UPDATE hcm.attendance_decision_receipt SET safe_failure_code=$3 WHERE tenant_id=$1 AND case_id=$2',
				[tenant, caseId, 'Changed'],
			),
		).rejects.toMatchObject({ code: '23514' })
		await expect(
			api.admin.query(
				"INSERT INTO hcm.attendance_decision_receipt(tenant_id,id,dispatch_key,intent_digest,case_id,slot_id,actor_account_id,generation,outcome,case_revision,subject_revision,decision_id) SELECT tenant_id,$3,$4::uuid,intent_digest,case_id,slot_id,actor_account_id,generation,outcome,case_revision,subject_revision,decision_id FROM hcm.attendance_decision_receipt WHERE tenant_id=$1 AND case_id=$2 AND outcome='Accepted' LIMIT 1",
				[tenant, caseId, randomUUID(), randomUUID()],
			),
		).rejects.toMatchObject({ code: '23514' })

		await database.transaction(
			michael,
			/** RLS hides source proof after an explicitly foreign tenant binding. */ async (tx) => {
				await sql`SELECT set_config('hcm.tenant_id','foreign',true)`.execute(tx)
				expect(
					(await sql`SELECT id FROM hcm.attendance_decision_receipt`.execute(tx)).rows,
				).toEqual([])
				await expect(
					sources.bind(tx, tenant, 'Attendance').authorizeRead(michael, caseId),
				).rejects.toMatchObject({ code: 'forbidden' })
			},
		)
	} finally {
		await database.destroy()
		await directory.onApplicationShutdown()
	}
}
