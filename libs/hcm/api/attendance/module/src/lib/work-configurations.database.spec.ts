import { AssignedWorkdayResolver } from '@empflowyee/hcm-api-attendance-application'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { HcmTenantDatabase } from '@empflowyee/hcm-api-database-kysely'
import type { WorkloadAuditTables } from '@empflowyee/hcm-api-audit-infrastructure'
import { HcmWorkloadIssuer } from '@empflowyee/hcm-api-runtime-application'
import {
	HcmRuntimeStore,
	enqueueHcmWork,
	HcmDurableWorkStore,
	HcmTransactionalWorkerLane,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import {
	KyselyDatedConfigurationPreviewHandler,
	KyselyAttendanceResolveHandler,
	KyselyAttendanceConfigurationInputBinder,
	KyselyAttendanceWorkflowSourceBinder,
} from '@empflowyee/hcm-api-attendance-infrastructure'
import {
	KyselyWorkforceTimeContextBinder,
	KyselyWorkforceApprovalRoutingBinder,
} from '@empflowyee/hcm-api-workforce-foundation-infrastructure'
import { KyselyApprovalCandidateBinder } from '@empflowyee/hcm-api-access-control-infrastructure'
import {
	KyselyWorkflowIntakeBinder,
	KyselyWorkflowPlanHandler,
} from '@empflowyee/hcm-api-workflow-infrastructure'
import type {
	DatedConfigurationPreviewView,
	WorkAssignmentResult,
} from '@empflowyee/hcm-attendance-contract'
import type {
	ConfigurationPreviewView,
	ConfigurationCommandResult,
	ScheduleVersionView,
} from '@empflowyee/hcm-attendance-contract'
import type { HcmPage } from '@empflowyee/hcm-runtime-contract'
import type {
	AttendancePolicyDraft,
	AttendancePolicyVersionView,
	ShiftDraft,
	ShiftVersionView,
} from '@empflowyee/hcm-attendance-contract'
import { HcmAttendanceModule } from './hcm-api-attendance-module'
import {
	startHcmTestApi,
	HCM_TEST_TENANT as tenant,
	type HcmTestApi,
} from './attendance-test-harness'

let api: HcmTestApi

/** Test the real owner adapters and leased planner against a SQL-created pending source case; this is not production submission acceptance. */
async function verifyOverrideCoordination() {
	const connectionString = process.env['HCM_TEST_RUNTIME']
	if (!connectionString) throw new Error('Disposable database required')
	const database = new HcmTenantDatabase<WorkloadAuditTables>({
			connectionString,
			maxConnections: 2,
		}),
		directory = new HcmRuntimeStore(connectionString)
	const sources = new KyselyAttendanceWorkflowSourceBinder(
		new KyselyWorkforceTimeContextBinder(),
		new KyselyWorkforceApprovalRoutingBinder(),
		new KyselyApprovalCandidateBinder(),
	)
	try {
		const context = await new HcmWorkloadIssuer(directory, ['WorkflowPlan']).issue(
			tenant,
			'WorkflowPlan',
			randomUUID(),
			600000,
		)
		const before = await database.workloadTransaction(
			context,
			'WorkflowPlan',
			/** Read source-owned candidates before any decision grant exists. */ async (tx) =>
				sources.bind(tx, tenant, 'Attendance').candidates('override-case', 'override-slot-1'),
		)
		expect(before.accountIds).toEqual([])
		await api.admin.query(
			"INSERT INTO hcm.access_permission(tenant_id,code,description,kind) VALUES($1,'hcm.attendance.approve-attendance.decide','Approval test operation','business-operation')",
			[tenant],
		)
		await api.admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'manager','hcm.attendance.approve-attendance.decide')",
			[tenant],
		)
		const queued = await database.workloadTransaction(
			context,
			'WorkflowPlan',
			/** Intake uses the exact authoritative source graph and current candidate grants. */ async (
				tx,
			) => {
				const source = sources.bind(tx, tenant, 'Attendance'),
					manifest = await source.manifest('override-case')
				if (!manifest) throw new Error('Expected pending override manifest')
				expect(
					manifest.slots.map(
						/** Each stage has its own contiguous slot ordering. */ (slot) => [
							slot.stage,
							slot.ordinal,
						],
					),
				).toEqual([
					[1, 1],
					[2, 1],
				])
				expect(JSON.stringify(manifest)).not.toMatch(/reason|evidence|makerAccountId|personId/)
				expect((await source.candidates('override-case', 'override-slot-1')).accountIds).toEqual([
					'dunder-mifflin/account/michael',
				])
				expect(await sources.bind(tx, 'foreign', 'Attendance').manifest('override-case')).toBeNull()
				return new KyselyWorkflowIntakeBinder().bind(tx, tenant).enqueue(manifest)
			},
		)
		await api.admin.query(
			"UPDATE hcm.user_account SET enabled=false WHERE tenant_id=$1 AND id='dunder-mifflin/account/michael'",
			[tenant],
		)
		expect(
			(
				await database.workloadTransaction(
					context,
					'WorkflowPlan',
					/** Revoked accounts disappear from current routing before any action. */ async (tx) =>
						sources.bind(tx, tenant, 'Attendance').candidates('override-case', 'override-slot-1'),
				)
			).accountIds,
		).toEqual([])
		await api.admin.query(
			"UPDATE hcm.user_account SET enabled=true WHERE tenant_id=$1 AND id='dunder-mifflin/account/michael'",
			[tenant],
		)
		const lane = new HcmTransactionalWorkerLane(
			'WorkflowPlan',
			new HcmDurableWorkStore(database, { leaseMilliseconds: 60000, maximumAttempts: 3 }),
			[new KyselyWorkflowPlanHandler(sources)],
		)
		const work = await lane.claim(context)
		expect(work?.id).toBe(queued.operationId)
		if (!work) throw new Error('Expected source intake claim')
		await lane.complete(context, work)
		const tasks = (
			await api.admin.query(
				'SELECT t.state,t.stage,c.account_id AS candidate FROM hcm.workflow_task t JOIN hcm.workflow_planning_receipt r ON r.tenant_id=t.tenant_id AND r.instance_id=t.instance_id LEFT JOIN hcm.workflow_task_candidate c ON c.tenant_id=t.tenant_id AND c.task_id=t.id WHERE r.outbox_id=$1 ORDER BY t.stage',
				[queued.operationId],
			)
		).rows
		expect(tasks).toEqual([
			{ state: 'Ready', stage: 1, candidate: 'dunder-mifflin/account/michael' },
			{ state: 'Blocked', stage: 2, candidate: null },
		])
	} finally {
		await database.destroy()
		await directory.onApplicationShutdown()
	}
}

/** Obtain real source-owned review evidence and prove previews do not leave candidate assignments or work intents. */
async function reviewAssignment(
	path: string,
	command: import('@empflowyee/hcm-attendance-contract').WorkAssignmentCommand,
) {
	const counts =
		'SELECT (SELECT count(*) FROM hcm.work_schedule_assignment WHERE tenant_id=$1)::int AS schedules,(SELECT count(*) FROM hcm.attendance_policy_assignment WHERE tenant_id=$1)::int AS policies,(SELECT count(*) FROM hcm.attendance_outbox WHERE tenant_id=$1)::int AS work'
	const before = await api.admin.query(counts, [tenant])
	const key = randomUUID()
	const response = await api.send<
		import('@empflowyee/hcm-attendance-contract').WorkAssignmentReview
	>('david', 'POST', path + '/preview', command, { 'idempotency-key': key })
	expect(response.status).toBe(200)
	expect((await api.admin.query(counts, [tenant])).rows).toEqual(before.rows)
	expect(
		(await api.send('david', 'POST', path + '/preview', command, { 'idempotency-key': key })).body,
	).toEqual(response.body)
	expect((await api.send('jim', 'POST', path + '/preview', command)).status).toBe(403)
	return { ...command, previewId: response.body.previewId, digest: response.body.digest }
}

it('exposes only minimal authorized dated Workforce references under Work Schedules read authority', /** Calendar access is not an implicit dependency of this picker. */ async () => {
	const response = await api.send<{ items: { id: string; code: string; name: string }[] }>(
		'david',
		'GET',
		'attendance/work-schedules/references/workers?q=Jim&asOf=2026-10-05',
	)
	expect(response.status).toBe(200)
	expect(response.body.items.length).toBeGreaterThan(0)
	const item = response.body.items[0]
	expect(Object.keys(item).sort()).toEqual(['code', 'id', 'name'])
	const context = await api.send<{
		employments: { employmentId: string; legalEntityName: string | null }[]
	}>(
		'david',
		'GET',
		`attendance/work-schedules/references/workers/${encodeURIComponent(item.id)}/context?asOf=2026-10-05`,
	)
	expect(context.status).toBe(200)
	expect(context.body.employments.length).toBeGreaterThan(0)
	expect(
		(
			await api.send(
				'jim',
				'GET',
				'attendance/work-schedules/references/workers?q=Jim&asOf=2026-10-05',
			)
		).status,
	).toBe(403)
	expect(
		(
			await api.send(
				'david',
				'GET',
				'attendance/work-schedules/references/workers?q=Jim&asOf=2026-10-05&salary=true',
			)
		).status,
	).toBe(400)
})

/** Drain only actual AttendanceResolve intents using the same lease, handler and completion protocol as the worker. */
async function resolveAssignedDays(): Promise<void> {
	const connectionString = process.env['HCM_TEST_RUNTIME']
	if (!connectionString) throw new Error('Disposable database required')
	const database = new HcmTenantDatabase<WorkloadAuditTables>({
		connectionString,
		maxConnections: 3,
	})
	const directory = new HcmRuntimeStore(connectionString)
	try {
		const context = await new HcmWorkloadIssuer(directory, ['AttendanceResolve']).issue(
			tenant,
			'AttendanceResolve',
			randomUUID(),
			600000,
		)
		const lane = new HcmTransactionalWorkerLane(
			'AttendanceResolve',
			new HcmDurableWorkStore(database, { leaseMilliseconds: 60000, maximumAttempts: 3 }),
			[
				new KyselyDatedConfigurationPreviewHandler(new KyselyWorkforceTimeContextBinder()),
				new KyselyAttendanceResolveHandler(
					new KyselyAttendanceConfigurationInputBinder(new KyselyWorkforceTimeContextBinder()),
				),
			],
		)
		for (let count = 0; count < 20; count++) {
			const work = await lane.claim(context)
			if (!work) return
			await lane.complete(context, work)
		}
		throw new Error('Unexpected unbounded test work')
	} finally {
		await database.destroy()
		await directory.onApplicationShutdown()
	}
}
/** Provide explicit test policy parameters without introducing runtime defaults. */
function policy(code: string): AttendancePolicyDraft {
	return {
		code,
		name: 'Policy ' + code,
		effectiveFrom: '2026-01-01',
		graceInMinutes: 0,
		graceOutMinutes: 0,
		rounding: 'None',
		overtime: { enabled: false },
		approvalRules: [],
	}
}
/** Provide a precise cross-midnight shift whose break position is explicitly supplied. */
function shift(code: string): ShiftDraft {
	return {
		code,
		name: 'Shift ' + code,
		effectiveFrom: '2026-01-01',
		timezoneMode: 'Fixed',
		fixedZone: 'Europe/London',
		segments: [
			{ kind: 'Work', startTime: '22:00:00.125', endTime: '23:00:00.250', endDayOffset: 0 },
			{ kind: 'UnpaidBreak', startTime: '23:00:00.250', endTime: '00:00:00.375', endDayOffset: 1 },
			{ kind: 'Work', startTime: '00:00:00.375', endTime: '06:00:00.500', endDayOffset: 1 },
		],
	}
}
beforeAll(
	/** Start real Nest HTTP on a disposable migrated and canonically seeded PostgreSQL database. */ async () => {
		api = await startHcmTestApi(HcmAttendanceModule)
	},
)
afterAll(
	/** Drain only this suite's application and database connections. */ async () => {
		await api?.close()
	},
)

it('publishes only the actor-bound current policy preview and preserves encrypted lifecycle receipts', /** Stale, consumed and wrong-source review handles cannot authorize a different immutable version. */ async () => {
	const base = 'attendance/policies',
		input = policy('PUBLISH_POLICY')
	const source = (await api.send<AttendancePolicyVersionView>('david', 'POST', base, input)).body
	const path = `${base}/${source.id}/versions/${source.versionId}`
	const preview = await api.send<ConfigurationPreviewView<'Policy'>>(
		'david',
		'POST',
		path + '/preview',
		{ expectedRevision: 1, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' },
	)
	expect(preview.status).toBe(200)
	expect(preview.body).toMatchObject({
		state: 'Ready',
		affectedEmploymentCount: 0,
		affectedWorkdayCount: 0,
		inputRevisions: [{ sourceType: 'Policy', id: source.versionId, revision: 1 }],
	})
	expect(
		(
			await api.send('david', 'PATCH', path, {
				...input,
				name: 'Revised before publication',
				expectedRevision: 1,
			})
		).status,
	).toBe(200)
	expect(
		(
			await api.send('david', 'POST', path + '/publish', {
				expectedRevision: 2,
				previewId: preview.body.previewId,
				digest: preview.body.digest,
				reason: 'Stale preview',
			})
		).status,
	).toBe(409)
	const ready = (
		await api.send<ConfigurationPreviewView<'Policy'>>('david', 'POST', path + '/preview', {
			expectedRevision: 2,
			effectiveFrom: '2026-01-01',
		})
	).body
	const command = {
			expectedRevision: 2,
			previewId: ready.previewId,
			digest: ready.digest,
			reason: 'Private rule publication explanation',
		},
		key = randomUUID()
	expect((await api.send('jim', 'POST', path + '/publish', command)).status).toBe(403)
	const published = await api.send<ConfigurationCommandResult>(
		'david',
		'POST',
		path + '/publish',
		command,
		{ 'idempotency-key': key },
	)
	expect(published.status).toBe(200)
	expect(published.body).toMatchObject({ state: 'Published', revision: 3 })
	expect(
		(await api.send('david', 'POST', path + '/publish', command, { 'idempotency-key': key })).body,
	).toEqual(published.body)
	expect((await api.send('david', 'PATCH', path, { ...input, expectedRevision: 3 })).status).toBe(
		409,
	)
	const successor = await api.send<AttendancePolicyVersionView>(
		'david',
		'POST',
		`${base}/${source.id}/versions`,
		{
			sourceVersionId: source.versionId,
			expectedRevision: 3,
			reason: 'Revise rules independently',
		},
	)
	expect(successor.status).toBe(201)
	expect(successor.body).toMatchObject({
		versionNumber: 2,
		state: 'Draft',
		name: 'Revised before publication',
	})
	expect(
		(
			await api.send('david', 'POST', path + '/retire', {
				expectedRevision: 3,
				reason: 'Retain history',
			})
		).status,
	).toBe(200)
	const retired = await api.send<AttendancePolicyVersionView>('david', 'GET', path)
	expect(retired.body).toMatchObject({
		state: 'Retired',
		revision: 4,
		overtime: { enabled: false },
	})
	expect(JSON.stringify(retired.body)).not.toContain(command.reason)
})

it('exposes ordinary schedules through the existing exact-version draft service without template authority', /** Reusing storage does not merge schedule and template route families or permissions. */ async () => {
	const input = {
		code: 'ORDINARY_API',
		name: 'Ordinary weekly pattern',
		isTemplate: false,
		effectiveFrom: '2026-01-01',
		timezoneMode: 'Fixed',
		fixedZone: 'UTC',
		weekStartsOn: 1,
		days: Array.from(
			{ length: 7 },
			/** Explicit isolated test pattern includes configured weekend rest. */ (_, i) => ({
				weekday: i + 1,
				kind: i < 5 ? 'Work' : 'Rest',
				segments:
					i < 5 ? [{ kind: 'Work', startTime: '09:00', endTime: '17:00', endDayOffset: 0 }] : [],
			}),
		),
	}
	const base = 'attendance/work-schedules'
	expect((await api.send('david', 'GET', base + '/defaults')).status).toBe(200)
	expect((await api.send('jim', 'GET', base + '/defaults')).status).toBe(403)
	const made = await api.send<ScheduleVersionView>('david', 'POST', base, input)
	expect(made.status).toBe(201)
	const path = `${base}/${made.body.id}/versions/${made.body.versionId}`
	expect((await api.send('david', 'GET', path)).body).toEqual(made.body)
	expect(
		(await api.send('david', 'POST', base, { ...input, code: 'WRONG_TYPE', isTemplate: true }))
			.status,
	).toBe(400)
	expect(
		(
			await api.send(
				'david',
				'GET',
				`attendance/schedule-templates/${made.body.id}?version=${made.body.versionId}`,
			)
		).status,
	).toBe(404)
	expect(
		(
			await api.send('david', 'PATCH', path, {
				...input,
				expectedRevision: 1,
				name: 'Changed ordinary schedule',
			})
		).status,
	).toBe(200)
	expect(
		(await api.send<HcmPage<ScheduleVersionView>>('david', 'GET', base + '?id=' + made.body.id))
			.body.items[0].name,
	).toBe('Changed ordinary schedule')
})

it('persists explicit policy rules with replay, optimistic concurrency and same-tenant typed candidates', /** Every request crosses real HTTP, source authority, RLS and receipt storage. */ async () => {
	const base = 'attendance/policies',
		input = policy('POLICY_API'),
		key = randomUUID()
	const made = await api.send<AttendancePolicyVersionView>('david', 'POST', base, input, {
		'idempotency-key': key,
	})
	expect(made.status).toBe(201)
	expect(made.body).toMatchObject({ ...input, revision: 1, state: 'Draft' })
	expect((await api.send('david', 'POST', base, input, { 'idempotency-key': key })).body).toEqual(
		made.body,
	)
	expect(
		(await api.send('david', 'POST', base, { ...input, name: 'Other' }, { 'idempotency-key': key }))
			.status,
	).toBe(409)
	const path = `${base}/${made.body.id}/versions/${made.body.versionId}`
	expect((await api.send('david', 'GET', path)).body).toEqual(made.body)
	const changed = {
		...input,
		expectedRevision: 1,
		minimumRestMinutes: 660,
		minimumRestMode: 'Warn',
		rounding: 'Configured',
		roundingIncrementMinutes: 15,
		roundingDirection: 'Nearest',
		overtime: {
			enabled: true,
			qualification: 'ScheduledExcess',
			capMinutes: 120,
			preapprovalRequired: true,
		},
		approvalRules: [
			{
				subjectType: 'Overtime',
				stage: 1,
				independent: true,
				candidateRule: { source: 'LineManager' },
			},
			{
				subjectType: 'Override',
				stage: 1,
				independent: true,
				candidateRule: { source: 'NamedUser', accountId: 'dunder-mifflin/account/michael' },
			},
		],
	}
	const edited = await api.send<AttendancePolicyVersionView>('david', 'PATCH', path, changed)
	expect(edited.status).toBe(200)
	expect(edited.body).toMatchObject({
		revision: 2,
		minimumRestMinutes: 660,
		approvalRules: changed.approvalRules,
		overtime: changed.overtime,
	})
	expect((await api.send('david', 'PATCH', path, changed)).status).toBe(409)
	expect(
		(
			await api.send('david', 'PATCH', path, {
				...input,
				code: 'CHANGED_CODE',
				expectedRevision: 2,
			})
		).status,
	).toBe(400)
	expect(
		(
			await api.send('david', 'PATCH', path, {
				...input,
				expectedRevision: 2,
				approvalRules: [
					{
						subjectType: 'Override',
						stage: 1,
						independent: true,
						candidateRule: { source: 'NamedUser', accountId: 'foreign-actor' },
					},
				],
			})
		).status,
	).toBe(400)
	expect((await api.send('david', 'GET', path)).body).toEqual(edited.body)
	expect(
		(await api.send('david', 'POST', base, { ...policy('INVALID'), overtime: { enabled: true } }))
			.status,
	).toBe(400)
	expect(
		(
			await api.send('david', 'POST', base, {
				...policy('INDEPENDENCE'),
				approvalRules: [
					{
						subjectType: 'Adjustment',
						stage: 1,
						independent: false,
						candidateRule: { source: 'LineManager' },
					},
				],
			})
		).status,
	).toBe(400)
})

it('retains millisecond shift endpoints and immutable successor lineage', /** SQL lifecycle triggers enforce the same invariants as command revision checks. */ async () => {
	const base = 'attendance/shifts',
		input = shift('SHIFT_API')
	const made = await api.send<ShiftVersionView>('david', 'POST', base, input)
	expect(made.status).toBe(201)
	expect(made.body.segments[0].startTime).toBe('22:00:00.125')
	expect(made.body.segments[1].endTime).toBe('00:00:00.375')
	const path = `${base}/${made.body.id}/versions/${made.body.versionId}`
	const results = await Promise.all([
		api.send('david', 'PATCH', path, { ...input, name: 'Edit one', expectedRevision: 1 }),
		api.send('david', 'PATCH', path, { ...input, name: 'Edit two', expectedRevision: 1 }),
	])
	expect(
		results
			.map(/** Compare competing responses independently of arrival order. */ (r) => r.status)
			.sort(),
	).toEqual([200, 409])
	// The isolated arrangement exercises immutable-source draft commands independently
	// of publication acceptance; this is not evidence for the publication journey.
	await api.admin.query(
		"UPDATE hcm.shift_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id='dunder-mifflin/account/david',publication_digest=repeat('a',64) WHERE tenant_id=$1 AND id=$2",
		[tenant, made.body.versionId],
	)
	expect((await api.send('david', 'PATCH', path, { ...input, expectedRevision: 3 })).status).toBe(
		409,
	)
	const successor = await api.send<ShiftVersionView>(
		'david',
		'POST',
		`${base}/${made.body.id}/versions`,
		{
			sourceVersionId: made.body.versionId,
			expectedRevision: 3,
			reason: 'Private successor explanation',
		},
	)
	expect(successor.status).toBe(201)
	expect(successor.body).toMatchObject({
		versionNumber: 2,
		revision: 1,
		state: 'Draft',
		segments: made.body.segments,
	})
	expect(JSON.stringify(successor.body)).not.toMatch(
		/Private successor|tenantId|publicationDigest|createdBy/,
	)
	expect(
		(
			await api.send<HcmPage<ShiftVersionView>>(
				'david',
				'GET',
				`${base}?id=${made.body.id}&state=Published`,
			)
		).body.items,
	).toEqual([])
	expect((await api.send('david', 'GET', path + '?unknown=1')).status).toBe(400)
})

it('binds policy and shift cursors to their resource, current source revision and exact filters', /** Real generated foreign keys and persisted hash-only handles protect paging. */ async () => {
	for (const code of ['PAGE_A', 'PAGE_B', 'PAGE_C']) {
		expect((await api.send('david', 'POST', 'attendance/policies', policy(code))).status).toBe(201)
		expect((await api.send('david', 'POST', 'attendance/shifts', shift(code))).status).toBe(201)
	}
	const query = 'attendance/policies?code=PAGE_&limit=1&sort=name:desc'
	const page = await api.send<HcmPage<AttendancePolicyVersionView>>('david', 'GET', query)
	expect(page.body.items[0].code).toBe('PAGE_C')
	expect(page.body.nextCursor).toBeTruthy()
	expect(
		(
			await api.send<HcmPage<AttendancePolicyVersionView>>(
				'david',
				'GET',
				query + '&cursor=' + page.body.nextCursor,
			)
		).body.items[0].code,
	).toBe('PAGE_B')
	expect(
		(
			await api.send(
				'david',
				'GET',
				query.replace('policies', 'shifts') + '&cursor=' + page.body.nextCursor,
			)
		).status,
	).toBe(400)
	expect(
		(
			await api.send(
				'david',
				'GET',
				query.replace('PAGE_', 'PAGE_A') + '&cursor=' + page.body.nextCursor,
			)
		).status,
	).toBe(400)
	const shiftPage = await api.send<HcmPage<ShiftVersionView>>(
		'david',
		'GET',
		query.replace('policies', 'shifts'),
	)
	expect(shiftPage.body.nextCursor).toBeTruthy()
	expect(
		(
			await api.send<HcmPage<ShiftVersionView>>(
				'david',
				'GET',
				query.replace('policies', 'shifts') + '&cursor=' + shiftPage.body.nextCursor,
			)
		).body.items[0].code,
	).toBe('PAGE_B')
	await api.send('david', 'POST', 'attendance/policies', policy('PAGE_D'))
	expect((await api.send('david', 'GET', query + '&cursor=' + page.body.nextCursor)).status).toBe(
		400,
	)
})

it('denies unauthorized actors and rechecks revoked read authority before receipt replay', /** A stored successful reply never manufactures current permission. */ async () => {
	const base = 'attendance/policies',
		input = policy('REVOKE'),
		key = randomUUID()
	expect((await api.send('jim', 'GET', base)).status).toBe(403)
	expect((await api.send('jim', 'POST', base, input)).status).toBe(403)
	expect((await api.send('david', 'POST', base, input, { 'idempotency-key': key })).status).toBe(
		201,
	)
	await api.admin.query(
		"DELETE FROM hcm.role_permission WHERE tenant_id=$1 AND role_id='tenant-administrator' AND permission_code='hcm.attendance.work-schedules.read'",
		[tenant],
	)
	try {
		expect((await api.send('david', 'GET', base)).status).toBe(403)
		expect((await api.send('david', 'POST', base, input, { 'idempotency-key': key })).status).toBe(
			403,
		)
	} finally {
		await api.admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'tenant-administrator','hcm.attendance.work-schedules.read')",
			[tenant],
		)
	}
})

it('hides foreign configuration and candidate identities through HTTP and forced runtime RLS', /** Tenant-composite references reject a real foreign actor and roll back every attempted draft change. */ async () => {
	const foreign = 'work-config-foreign'
	await api.admin.query('BEGIN')
	try {
		await api.admin.query("SELECT set_config('hcm.tenant_id',$1,true)", [foreign])
		await api.admin.query(
			"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES($1,$1,'Other tenant','active')",
			[foreign],
		)
		await api.admin.query(
			"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES($1,'other-person','Other','Actor','Other Actor')",
			[foreign],
		)
		await api.admin.query(
			"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES($1,'other-actor','other-person','other@example.test')",
			[foreign],
		)
		await api.admin.query(
			"INSERT INTO hcm.attendance_policy(tenant_id,id,code,created_by_account_id) VALUES($1,'other-policy','OTHER_POLICY','other-actor')",
			[foreign],
		)
		await api.admin.query(
			"INSERT INTO hcm.attendance_policy_version(tenant_id,id,policy_id,version_number,name,effective_from,grace_in_minutes,grace_out_minutes,rounding,overtime_enabled,created_by_account_id) VALUES($1,'other-version','other-policy',1,'Other policy','2026-01-01',0,0,'None',false,'other-actor')",
			[foreign],
		)
		await api.admin.query('COMMIT')
	} catch (error) {
		await api.admin.query('ROLLBACK')
		throw error
	}
	expect(
		(await api.send('david', 'GET', 'attendance/policies/other-policy/versions/other-version'))
			.status,
	).toBe(404)
	expect(
		(
			await api.send<HcmPage<AttendancePolicyVersionView>>(
				'david',
				'GET',
				'attendance/policies?id=other-policy',
			)
		).body.items,
	).toEqual([])
	expect(
		(
			await api.send('david', 'PATCH', 'attendance/policies/other-policy/versions/other-version', {
				...policy('OTHER_POLICY'),
				expectedRevision: 1,
			})
		).status,
	).toBe(404)
	expect(
		(
			await api.send('david', 'POST', 'attendance/policies', {
				...policy('FOREIGN_CANDIDATE'),
				approvalRules: [
					{
						subjectType: 'Override',
						stage: 1,
						independent: true,
						candidateRule: { source: 'NamedUser', accountId: 'other-actor' },
					},
				],
			})
		).status,
	).toBe(400)
	expect(
		(
			await api.send<HcmPage<AttendancePolicyVersionView>>(
				'david',
				'GET',
				'attendance/policies?code=FOREIGN_CANDIDATE',
			)
		).body.items,
	).toEqual([])
	const runtime = new Client({ connectionString: process.env['HCM_TEST_RUNTIME'] })
	await runtime.connect()
	try {
		await runtime.query('BEGIN')
		await runtime.query("SELECT set_config('hcm.tenant_id',$1,true)", [tenant])
		expect(
			(
				await runtime.query('SELECT id FROM hcm.attendance_policy_version WHERE tenant_id=$1', [
					foreign,
				])
			).rows,
		).toEqual([])
		await expect(
			runtime.query(
				"INSERT INTO hcm.shift(tenant_id,id,code,created_by_account_id) VALUES($1,'cross-tenant-shift','CROSS_TENANT','other-actor')",
				[foreign],
			),
		).rejects.toMatchObject({ code: '42501' })
	} finally {
		await runtime.query('ROLLBACK')
		await runtime.end()
	}
})

it('assigns explicit policies and ordinary schedules and commits real durable workday production', /** Missing prerequisites remain unavailable; current source inputs produce immutable workdays through the real worker. */ async () => {
	const employmentId = 'dunder-mifflin/employment/jim'
	const source = (
		await api.send<AttendancePolicyVersionView>(
			'david',
			'POST',
			'attendance/policies',
			policy('ASSIGNED_POLICY'),
		)
	).body
	const path = `attendance/policies/${source.id}/versions/${source.versionId}`
	const ready = (
		await api.send<ConfigurationPreviewView<'Policy'>>('david', 'POST', path + '/preview', {
			expectedRevision: 1,
			effectiveFrom: '2027-02-01',
		})
	).body
	expect(
		(
			await api.send('david', 'POST', path + '/publish', {
				expectedRevision: 1,
				previewId: ready.previewId,
				digest: ready.digest,
				reason: 'Configure explicit policy inputs',
			})
		).status,
	).toBe(200)
	const assignmentInput = {
		versionId: source.versionId,
		expectedRevision: 2,
		employmentId,
		effectiveFrom: '2027-02-01',
		effectiveTo: '2027-02-28',
		resolutionFrom: '2027-02-01',
		resolutionTo: '2027-02-03',
		reason: 'Assign policy before completing schedule configuration',
	}
	const staleCommand = await reviewAssignment('attendance/policy-assignments', assignmentInput)
	await api.admin.query(
		"INSERT INTO hcm.attendance_period(tenant_id,id,month_start) VALUES($1,'assignment-review-period','2027-02-01')",
		[tenant],
	)
	expect(
		(await api.send('david', 'POST', 'attendance/policy-assignments', staleCommand)).status,
	).toBe(409)
	expect(
		(
			await api.admin.query(
				'SELECT count(*)::int AS count FROM hcm.attendance_policy_assignment WHERE tenant_id=$1 AND version_id=$2',
				[tenant, source.versionId],
			)
		).rows[0].count,
	).toBe(0)
	const command = await reviewAssignment('attendance/policy-assignments', assignmentInput)
	expect(
		(
			await api.send('david', 'POST', 'attendance/policy-assignments', {
				...command,
				digest: '0'.repeat(64),
			})
		).status,
	).toBe(409)
	const key = randomUUID()
	const assigned = await api.send<WorkAssignmentResult>(
		'david',
		'POST',
		'attendance/policy-assignments',
		command,
		{ 'idempotency-key': key },
	)
	expect(assigned.status).toBe(201)
	expect(assigned.body).toMatchObject({
		family: 'Policy',
		configurationId: source.id,
		queuedWorkdays: 0,
		unavailableWorkdays: 3,
	})
	expect(
		(
			await api.send('david', 'POST', 'attendance/policy-assignments', command, {
				'idempotency-key': key,
			})
		).body,
	).toEqual(assigned.body)
	expect((await api.send('david', 'POST', 'attendance/policy-assignments', command)).status).toBe(
		409,
	)
	expect((await api.send('jim', 'POST', 'attendance/policy-assignments', command)).status).toBe(403)
	// Arrange independent published prerequisites only in this disposable test. Their
	// publication UI and preview acceptance are exercised by their own suites.
	await api.admin.query(
		"INSERT INTO hcm.holiday_calendar(tenant_id,id,code,created_by_account_id) VALUES($1,'assignment-calendar','ASSIGNMENT_CALENDAR','dunder-mifflin/account/david')",
		[tenant],
	)
	await api.admin.query(
		"INSERT INTO hcm.holiday_calendar_version(tenant_id,id,calendar_id,version_number,name,effective_from,created_by_account_id) VALUES($1,'assignment-calendar-version','assignment-calendar',1,'No holidays in test range','2027-02-01','dunder-mifflin/account/david')",
		[tenant],
	)
	await api.admin.query(
		"UPDATE hcm.holiday_calendar_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id='dunder-mifflin/account/david',publication_digest=repeat('b',64) WHERE tenant_id=$1 AND id='assignment-calendar-version'",
		[tenant],
	)
	await api.admin.query(
		"INSERT INTO hcm.holiday_calendar_assignment(tenant_id,id,version_id,scope_kind,employment_id,effective_from,effective_to,created_by_account_id) VALUES($1,'assignment-calendar-coverage','assignment-calendar-version','Employment',$2,'2027-02-01','2027-02-28','dunder-mifflin/account/david')",
		[tenant, employmentId],
	)
	const schedule = await api.send<ScheduleVersionView>(
		'david',
		'POST',
		'attendance/work-schedules',
		{
			code: 'ASSIGNED_SCHEDULE',
			name: 'Dated weekly schedule',
			isTemplate: false,
			effectiveFrom: '2027-02-01',
			timezoneMode: 'Employment',
			weekStartsOn: 1,
			days: Array.from(
				{ length: 7 },
				/** Explicit test pattern deliberately defines weekends as rest. */ (_, i) => ({
					weekday: i + 1,
					kind: i < 5 ? 'Work' : 'Rest',
					segments:
						i < 5 ? [{ kind: 'Work', startTime: '09:00', endTime: '17:00', endDayOffset: 0 }] : [],
				}),
			),
		},
	)
	expect(schedule.status).toBe(201)
	const schedulePath = `attendance/work-schedules/${schedule.body.id}/versions/${schedule.body.versionId}`
	const pending = await api.send<DatedConfigurationPreviewView>(
		'david',
		'POST',
		schedulePath + '/preview',
		{ expectedRevision: 1, employmentId, effectiveFrom: '2027-02-01', effectiveTo: '2027-02-03' },
	)
	expect(pending.status).toBe(200)
	expect(pending.body.state).toBe('Running')
	await resolveAssignedDays()
	const reviewed = await api.send<DatedConfigurationPreviewView>(
		'david',
		'GET',
		schedulePath + '/previews/' + pending.body.previewId,
	)
	expect(reviewed.status).toBe(200)
	expect(reviewed.body).toMatchObject({
		state: 'Ready',
		conflicts: 0,
		affectedEmploymentCount: 1,
		affectedWorkdayCount: 3,
	})
	expect(
		(
			await api.send('david', 'POST', schedulePath + '/publish', {
				expectedRevision: 1,
				previewId: reviewed.body.previewId,
				digest: reviewed.body.digest,
				reason: 'Publish after real dated worker validation',
			})
		).status,
	).toBe(200)
	const production = await api.send<WorkAssignmentResult>(
		'david',
		'POST',
		'attendance/schedule-assignments',
		await reviewAssignment('attendance/schedule-assignments', {
			...assignmentInput,
			versionId: schedule.body.versionId,
			reason: 'Produce the explicit three day window',
		}),
	)
	expect(production.status).toBe(201)
	expect(production.body).toMatchObject({
		family: 'Schedule',
		queuedWorkdays: 3,
		unavailableWorkdays: 0,
	})
	await resolveAssignedDays()
	const days = await api.admin.query(
		'SELECT work_date::text AS date,zone,scheduled_work_milliseconds::text AS planned FROM hcm.published_workday WHERE tenant_id=$1 AND employment_id=$2 ORDER BY work_date',
		[tenant, employmentId],
	)
	expect(days.rows).toEqual([
		{ date: '2027-02-01', zone: 'America/New_York', planned: '28800000' },
		{ date: '2027-02-02', zone: 'America/New_York', planned: '28800000' },
		{ date: '2027-02-03', zone: 'America/New_York', planned: '28800000' },
	])
	const inspectPath =
		'attendance/workdays?employmentId=' +
		encodeURIComponent(employmentId) +
		'&from=2027-02-01&to=2027-02-04'
	const beforeRead = await api.admin.query(
		'SELECT count(*)::int AS count FROM hcm.attendance_outbox WHERE tenant_id=$1',
		[tenant],
	)
	const inspected = await api.send<import('@empflowyee/hcm-attendance-contract').WorkdayPage>(
		'david',
		'GET',
		inspectPath,
	)
	expect(inspected.status).toBe(200)
	expect(inspected.body.items).toHaveLength(4)
	expect(inspected.body.items[0]).toMatchObject({
		state: 'Published',
		workDate: '2027-02-01',
		zone: 'America/New_York',
		elapsedMilliseconds: '28800000',
		scheduledMilliseconds: '28800000',
		kind: 'Work',
	})
	const first = inspected.body.items[0]
	if (first.state !== 'Published') throw new Error('Expected stored workday')
	expect(
		first.sourceVersions
			.map(/** Verify each stored source family is explained. */ (source) => source.family)
			.sort(),
	).toEqual(['Holiday', 'Policy', 'Schedule'])
	expect(first.segments[0]).toMatchObject({
		kind: 'Work',
		startLocal: '2027-02-01T09:00:00.000',
		startInstant: '2027-02-01T14:00:00.000Z',
		startOffsetSeconds: -18000,
		elapsedMilliseconds: '28800000',
	})
	expect(first.rest?.state).toBe('NotRequired')
	expect(inspected.body.items[3]).toEqual({
		state: 'Unavailable',
		employmentId,
		workDate: '2027-02-04',
		unavailableCode: 'NotResolved',
	})
	expect(
		(
			await api.admin.query(
				'SELECT count(*)::int AS count FROM hcm.attendance_outbox WHERE tenant_id=$1',
				[tenant],
			)
		).rows,
	).toEqual(beforeRead.rows)
	expect((await api.send('jim', 'GET', inspectPath)).status).toBe(403)
	expect((await api.send('david', 'GET', inspectPath + '&tenantId=foreign')).status).toBe(400)
	expect(
		(
			await api.send(
				'david',
				'GET',
				'attendance/workdays?employmentId=foreign-employment&from=2027-02-01&to=2027-02-01',
			)
		).status,
	).toBe(404)
	const next = {
		...command,
		effectiveFrom: '2027-02-15',
		resolutionFrom: '2027-02-15',
		resolutionTo: '2027-02-16',
		supersedes: { id: assigned.body.id, expectedRevision: 99 },
	}
	expect((await api.send('david', 'POST', 'attendance/policy-assignments', next)).status).toBe(409)
	expect(
		(
			await api.send<WorkAssignmentResult>(
				'david',
				'GET',
				'attendance/policy-assignments?kind=Employment&id=' +
					encodeURIComponent(employmentId) +
					'&asOf=2027-02-16',
			)
		).body.id,
	).toBe(assigned.body.id)
	expect(
		(
			await api.send(
				'david',
				'POST',
				'attendance/policy-assignments',
				await reviewAssignment('attendance/policy-assignments', {
					...assignmentInput,
					effectiveFrom: next.effectiveFrom,
					resolutionFrom: next.resolutionFrom,
					resolutionTo: next.resolutionTo,
					supersedes: { id: assigned.body.id, expectedRevision: 1 },
				}),
			)
		).status,
	).toBe(201)
})

/** Materialize a test-arranged dated source through real typed input selection and the leased worker. */
async function materializeDatedSource(workDate: string) {
	const connectionString = process.env['HCM_TEST_RUNTIME']
	if (!connectionString) throw new Error('Disposable PostgreSQL required')
	const database = new HcmTenantDatabase<WorkloadAuditTables>({
		connectionString,
		maxConnections: 2,
	})
	const directory = new HcmRuntimeStore(connectionString)
	try {
		const context = await new HcmWorkloadIssuer(directory, ['AttendanceResolve']).issue(
			tenant,
			'AttendanceResolve',
			randomUUID(),
			600000,
		)
		const result = await database.workloadTransaction(
			context,
			'AttendanceResolve',
			/** Test-only producer uses the exact same digest and durable protocol as owning commands. */ async (
				transaction,
			) => {
				const employmentId = 'dunder-mifflin/employment/jim'
				const result = await new AssignedWorkdayResolver(
					new KyselyAttendanceConfigurationInputBinder(new KyselyWorkforceTimeContextBinder()).bind(
						transaction,
						tenant,
					),
					366,
				).resolve(employmentId, workDate)
				if (result.state !== 'Available')
					throw new Error('Test dated source unavailable: ' + result.reason)
				await enqueueHcmWork(transaction, tenant, {
					workload: 'AttendanceResolve',
					kind: 'attendance.workday.resolve',
					schemaVersion: 1,
					businessKey: randomUUID(),
					payload: { employmentId, workDate, inputDigest: result.inputDigest },
				})
				return result
			},
		)
		await resolveAssignedDays()
		return result
	} finally {
		await database.destroy()
		await directory.onApplicationShutdown()
	}
}

it('creates and previews real override drafts without approving or materializing them', /** Actor-bound receipts retain private reasons and review never leaves proposed state or work behind. */ async () => {
	const input = {
		employmentId: 'dunder-mifflin/employment/jim',
		workDate: '2027-02-03',
		workdayRevision: 1,
		zone: 'America/New_York',
		segments: [],
		evidenceIds: [],
		reason: 'Private override reason retained encrypted',
	}
	const key = randomUUID(),
		base = 'attendance/overrides'
	expect((await api.send('jim', 'POST', base, input)).status).toBe(403)
	expect((await api.send('david', 'POST', base, { ...input, workdayRevision: 999 })).status).toBe(
		409,
	)
	expect(
		(await api.send('david', 'POST', base, { ...input, evidenceIds: ['unvalidated-evidence'] }))
			.status,
	).toBe(409)
	const created = await api.send<
		import('@empflowyee/hcm-attendance-contract').AttendanceOverrideView
	>('david', 'POST', base, input, { 'idempotency-key': key })
	expect(created.status).toBe(201)
	expect(created.body).toMatchObject({
		state: 'Draft',
		revision: 1,
		workdayRevision: 1,
		segments: [],
	})
	expect(created.body).not.toHaveProperty('reason')
	expect(created.body).not.toHaveProperty('evidenceIds')
	expect((await api.send('david', 'POST', base, input, { 'idempotency-key': key })).body).toEqual(
		created.body,
	)
	expect(
		(
			await api.send(
				'david',
				'POST',
				base,
				{ ...input, reason: 'Changed retry' },
				{ 'idempotency-key': key },
			)
		).status,
	).toBe(409)
	const path = base + '/' + created.body.id
	expect((await api.send('david', 'GET', path)).body).toEqual(created.body)
	expect((await api.send('jim', 'GET', path)).status).toBe(403)
	expect((await api.send('david', 'GET', base + '/foreign-override')).status).toBe(404)
	const counts =
		'SELECT (SELECT count(*) FROM hcm.published_workday WHERE tenant_id=$1)::int AS days,(SELECT count(*) FROM hcm.attendance_outbox WHERE tenant_id=$1)::int AS jobs'
	const before = (await api.admin.query(counts, [tenant])).rows
	const command = { expectedRevision: 1, reason: 'Review nonworking date' },
		previewKey = randomUUID()
	const preview = await api.send<
		import('@empflowyee/hcm-attendance-contract').AttendanceOverrideReview
	>('david', 'POST', path + '/preview', command, { 'idempotency-key': previewKey })
	expect(preview.status).toBe(200)
	expect(preview.body).toMatchObject({
		sourceRevision: 1,
		workdayRevision: 1,
		scheduledMilliseconds: '0',
		expectedMilliseconds: '0',
		approvalRequired: false,
	})
	expect(
		(await api.send('david', 'POST', path + '/preview', command, { 'idempotency-key': previewKey }))
			.body,
	).toEqual(preview.body)
	expect((await api.send('david', 'GET', path)).body).toEqual(created.body)
	expect((await api.admin.query(counts, [tenant])).rows).toEqual(before)
	const receipt = (
		await api.admin.query(
			'SELECT encrypted_reason,reason_key_version,response,schedule_override_id FROM hcm.attendance_command_receipt WHERE tenant_id=$1 AND idempotency_key=$2',
			[tenant, key],
		)
	).rows[0]
	expect(receipt.schedule_override_id).toBe(created.body.id)
	expect(Buffer.isBuffer(receipt.encrypted_reason)).toBe(true)
	expect(receipt.encrypted_reason.toString('utf8')).not.toContain(input.reason)
	expect(JSON.stringify(receipt.response)).not.toContain(input.reason)
	expect(
		(await api.send('david', 'POST', path + '/preview', { ...command, expectedRevision: 2 }))
			.status,
	).toBe(409)
	const custom = await api.send<
		import('@empflowyee/hcm-attendance-contract').AttendanceOverrideView
	>('david', 'POST', base, {
		...input,
		segments: [
			{ kind: 'Work', startTime: '22:00:00.125', endTime: '02:00:00.375', endDayOffset: 1 },
		],
	})
	expect(custom.status).toBe(201)
	const reviewed = await api.send(
		'david',
		'POST',
		base + '/' + custom.body.id + '/preview',
		command,
	)
	expect(reviewed.status).toBe(200)
	expect(reviewed.body['scheduledMilliseconds']).toBe('14400250')
	expect((await api.admin.query(counts, [tenant])).rows).toEqual(before)
})

it('persists complete independent source slots and rejects skipped or unaccompanied decisions', /** Restricted SQL preserves source-case history; these fixtures do not claim a production submit or Workflow integration. */ async () => {
	const source = (
		await api.send<AttendancePolicyVersionView>('david', 'POST', 'attendance/policies', {
			...policy('OVERRIDE_CASE_POLICY'),
			approvalRules: [
				{
					subjectType: 'Override',
					stage: 1,
					independent: true,
					candidateRule: { source: 'NamedUser', accountId: 'dunder-mifflin/account/michael' },
				},
				{
					subjectType: 'Override',
					stage: 2,
					independent: true,
					candidateRule: { source: 'NamedUser', accountId: 'dunder-mifflin/account/toby' },
				},
			],
		})
	).body
	await expect(
		api.admin.query(
			"INSERT INTO hcm.attendance_approval_rule(tenant_id,id,version_id,ordinal,subject_type,stage,independent,candidate_source,account_id) VALUES($1,'non-independent-override',$2,3,'Override',1,false,'NamedUser','dunder-mifflin/account/david')",
			[tenant, source.versionId],
		),
	).rejects.toMatchObject({ code: '23514', constraint: 'attendance_override_independent' })

	const policyPath = `attendance/policies/${source.id}/versions/${source.versionId}`
	const review = (
		await api.send<ConfigurationPreviewView<'Policy'>>('david', 'POST', policyPath + '/preview', {
			expectedRevision: 1,
			effectiveFrom: '2027-02-03',
		})
	).body
	expect(
		(
			await api.send('david', 'POST', policyPath + '/publish', {
				expectedRevision: 1,
				previewId: review.previewId,
				digest: review.digest,
				reason: 'Publish independent override source rules',
			})
		).status,
	).toBe(200)
	const draft = (
		await api.send<import('@empflowyee/hcm-attendance-contract').AttendanceOverrideView>(
			'david',
			'POST',
			'attendance/overrides',
			{
				employmentId: 'dunder-mifflin/employment/jim',
				workDate: '2027-02-03',
				workdayRevision: 1,
				zone: 'America/New_York',
				segments: [{ kind: 'Work', startTime: '09:00', endTime: '17:00', endDayOffset: 0 }],
				reason: 'Independent review fixture',
				evidenceIds: [],
			},
		)
	).body
	const createCase =
		"INSERT INTO hcm.attendance_approval_case(tenant_id,id,subject_type,schedule_override_id,employment_id,work_date,attendance_policy_version_id,subject_revision,generation,input_digest,routing_digest,requested_by_account_id) VALUES($1,'override-case','Override',$2,'dunder-mifflin/employment/jim','2027-02-03',$3,1,1,repeat('a',64),repeat('b',64),'dunder-mifflin/account/david')"
	await expect(
		api.admin.query(createCase, [tenant, draft.id, source.versionId]),
	).rejects.toMatchObject({ code: '23514' })
	await api.admin.query('BEGIN')
	try {
		await api.admin.query(createCase, [tenant, draft.id, source.versionId])
		await api.admin.query(
			"INSERT INTO hcm.attendance_approval_slot(tenant_id,id,case_id,attendance_policy_version_id,rule_id,stage,ordinal,independent,distinct_actors) SELECT tenant_id,'override-slot-'||stage,'override-case',version_id,id,stage,ordinal,true,true FROM hcm.attendance_approval_rule WHERE tenant_id=$1 AND version_id=$2",
			[tenant, source.versionId],
		)
		await api.admin.query('COMMIT')
	} catch (error) {
		await api.admin.query('ROLLBACK')
		throw error
	}
	await expect(
		api.admin.query(
			"UPDATE hcm.attendance_approval_case SET state='Approved',revision=revision+1 WHERE tenant_id=$1 AND id='override-case'",
			[tenant],
		),
	).rejects.toMatchObject({ code: '23514' })
	await expect(
		api.admin.query(
			'DELETE FROM hcm.schedule_override_segment WHERE tenant_id=$1 AND override_id=$2',
			[tenant, draft.id],
		),
	).rejects.toMatchObject({ code: '23514' })
	await expect(
		api.admin.query(
			"UPDATE hcm.schedule_override SET zone='Europe/London',revision=revision+1 WHERE tenant_id=$1 AND id=$2",
			[tenant, draft.id],
		),
	).rejects.toMatchObject({ code: '23514' })
	const insertDecision =
		"INSERT INTO hcm.attendance_decision(tenant_id,id,case_id,slot_id,actor_account_id,action,case_revision,slot_revision,subject_revision,generation,command_key,input_digest,encrypted_reason,reason_key_version) VALUES($1,$2,'override-case',$3,$4,'Approve',$5,1,1,1,$6,repeat('c',64),$7,1)"
	const reason = Buffer.alloc(48, 2)
	await verifyOverrideCoordination()
	await expect(
		api.admin.query(insertDecision, [
			tenant,
			'skip-stage',
			'override-slot-2',
			'dunder-mifflin/account/toby',
			1,
			randomUUID(),
			reason,
		]),
	).rejects.toMatchObject({ code: '23514' })
	await expect(
		api.admin.query(insertDecision, [
			tenant,
			'maker',
			'override-slot-1',
			'dunder-mifflin/account/david',
			1,
			randomUUID(),
			reason,
		]),
	).rejects.toMatchObject({ code: '23514' })
	await expect(
		api.admin.query(insertDecision, [
			tenant,
			'decision-alone',
			'override-slot-1',
			'dunder-mifflin/account/michael',
			1,
			randomUUID(),
			reason,
		]),
	).rejects.toMatchObject({ code: '23514' })
	for (const stage of [1, 2]) {
		const actor = 'dunder-mifflin/account/' + (stage === 1 ? 'michael' : 'toby')
		await api.admin.query('BEGIN')
		try {
			await api.admin.query(insertDecision, [
				tenant,
				'accepted-' + stage,
				'override-slot-' + stage,
				actor,
				stage,
				randomUUID(),
				reason,
			])
			await api.admin.query(
				"UPDATE hcm.attendance_approval_slot SET state='Approved',revision=revision+1,decided_by_account_id=$3,decided_at=now() WHERE tenant_id=$1 AND id=$2",
				[tenant, 'override-slot-' + stage, actor],
			)
			await api.admin.query(
				"UPDATE hcm.attendance_approval_case SET state=$2,revision=revision+1 WHERE tenant_id=$1 AND id='override-case'",
				[tenant, stage === 1 ? 'Pending' : 'Approved'],
			)
			await api.admin.query('COMMIT')
		} catch (error) {
			await api.admin.query('ROLLBACK')
			throw error
		}
		if (stage === 1) {
			await expect(
				api.admin.query(insertDecision, [
					tenant,
					'reuse-checker',
					'override-slot-2',
					actor,
					2,
					randomUUID(),
					reason,
				]),
			).rejects.toMatchObject({ code: '23514' })
			await expect(
				api.admin.query(insertDecision, [
					tenant,
					'stale-case',
					'override-slot-2',
					'dunder-mifflin/account/toby',
					1,
					randomUUID(),
					reason,
				]),
			).rejects.toMatchObject({ code: '23514' })
		}
	}
	expect(
		(
			await api.admin.query(
				"SELECT state,revision FROM hcm.attendance_approval_case WHERE tenant_id=$1 AND id='override-case'",
				[tenant],
			)
		).rows[0],
	).toEqual({ state: 'Approved', revision: 3 })
	expect(
		(
			await api.admin.query(
				"SELECT count(*)::int AS count FROM hcm.attendance_decision WHERE tenant_id=$1 AND case_id='override-case'",
				[tenant],
			)
		).rows[0].count,
	).toBe(2)
	const connectionString = process.env['HCM_TEST_RUNTIME']
	if (!connectionString) throw new Error('Disposable runtime required')
	const restricted = new Client({ connectionString })
	await restricted.connect()
	try {
		await restricted.query("SELECT set_config('hcm.tenant_id',$1,false)", ['work-config-foreign'])
		for (const table of [
			'attendance_approval_case',
			'attendance_approval_slot',
			'attendance_decision',
		])
			expect(
				(await restricted.query(`SELECT count(*)::int AS count FROM hcm.${table}`)).rows[0].count,
			).toBe(0)
		await restricted.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		await expect(
			restricted.query("UPDATE hcm.attendance_decision SET action='Reject' WHERE tenant_id=$1", [
				tenant,
			]),
		).rejects.toMatchObject({ code: '42501' })
		await expect(
			restricted.query('DELETE FROM hcm.attendance_approval_slot WHERE tenant_id=$1', [tenant]),
		).rejects.toMatchObject({ code: '42501' })
	} finally {
		await restricted.end()
	}
})

it('resolves published roster then approved override with typed immutable workday references', /** Real SQL selection, precedence and worker publication preserve history without fabricating schedule identities. */ async () => {
	const employment = 'dunder-mifflin/employment/jim',
		actor = 'dunder-mifflin/account/david'
	const source = (
		await api.send<ShiftVersionView>('david', 'POST', 'attendance/shifts', shift('ROSTER_BASIS'))
	).body
	const path = `attendance/shifts/${source.id}/versions/${source.versionId}`
	const pending = (
		await api.send<DatedConfigurationPreviewView>('david', 'POST', path + '/preview', {
			expectedRevision: 1,
			employmentId: employment,
			effectiveFrom: '2027-02-02',
		})
	).body
	await resolveAssignedDays()
	const preview = (
		await api.send<DatedConfigurationPreviewView>(
			'david',
			'GET',
			path + '/previews/' + pending.previewId,
		)
	).body
	expect(preview.state).toBe('Ready')
	expect(
		(
			await api.send('david', 'POST', path + '/publish', {
				expectedRevision: 1,
				previewId: preview.previewId,
				digest: preview.digest,
				reason: 'Publish real roster test source',
			})
		).status,
	).toBe(200)
	// Only this disposable test arranges a roster; no unadmitted roster UI or production fixture is introduced.
	await api.admin.query(
		"INSERT INTO hcm.shift_roster(tenant_id,id,code,name,from_date,to_date,created_by_account_id) VALUES($1,'dated-roster','DATED_ROSTER','Dated roster','2027-02-02','2027-02-02',$2)",
		[tenant, actor],
	)
	await api.admin.query(
		"INSERT INTO hcm.shift_roster_entry(tenant_id,id,roster_id,employment_id,work_date,shift_version_id) VALUES($1,'dated-entry','dated-roster',$2,'2027-02-02',$3)",
		[tenant, employment, source.versionId],
	)
	await api.admin.query(
		"UPDATE hcm.shift_roster SET state='Published',revision=revision+1,publication_digest=repeat('a',64),published_at=now(),published_by_account_id=$2 WHERE tenant_id=$1 AND id='dated-roster'",
		[tenant, actor],
	)
	const roster = await materializeDatedSource('2027-02-02')
	expect(roster.scheduleVersionId).toBeNull()
	expect(roster.datedSources).toEqual({
		scheduleVersionId: null,
		shiftVersionId: source.versionId,
		rosterEntryId: 'dated-entry',
		overrideId: null,
	})
	expect(roster.resolution.zone).toBe('Europe/London')
	expect(roster.resolution.scheduledWorkMilliseconds).toBe('25200250')
	const basis = (
		await api.admin.query(
			"SELECT id,revision FROM hcm.published_workday WHERE tenant_id=$1 AND employment_id=$2 AND work_date='2027-02-02' ORDER BY revision DESC LIMIT 1",
			[tenant, employment],
		)
	).rows[0]
	expect(basis.revision).toBe(2)
	await expect(
		api.admin.query("DELETE FROM hcm.shift_roster_entry WHERE tenant_id=$1 AND id='dated-entry'", [
			tenant,
		]),
	).rejects.toMatchObject({ code: '23514' })
	await api.admin.query(
		"INSERT INTO hcm.schedule_override(tenant_id,id,employment_id,work_date,basis_workday_id,zone,kind,created_by_account_id) VALUES($1,'dated-override',$2,'2027-02-02',$3,'Europe/London','Rest',$4)",
		[tenant, employment, basis.id, actor],
	)
	const draft = await materializeDatedSource('2027-02-02')
	expect(draft.datedSources?.rosterEntryId).toBe('dated-entry')
	await api.admin.query(
		"UPDATE hcm.schedule_override SET state='Approved',revision=revision+1,approval_digest=repeat('b',64),approved_at=now(),approved_by_account_id=$2 WHERE tenant_id=$1 AND id='dated-override'",
		[tenant, actor],
	)
	const override = await materializeDatedSource('2027-02-02')
	expect(override.datedSources?.overrideId).toBe('dated-override')
	expect(override.resolution).toMatchObject({
		scheduleKind: 'Rest',
		expectedWorkMilliseconds: '0',
		scheduledSegments: [],
	})
	expect(
		(
			await api.admin.query(
				'SELECT revision,shift_roster_entry_id AS "roster",schedule_override_id AS "override" FROM hcm.published_workday WHERE tenant_id=$1 AND employment_id=$2 AND work_date=\'2027-02-02\' ORDER BY revision',
				[tenant, employment],
			)
		).rows,
	).toEqual([
		{ revision: 1, roster: null, override: null },
		{ revision: 2, roster: 'dated-entry', override: null },
		{ revision: 3, roster: null, override: 'dated-override' },
	])
	const inspected = await api.send<import('@empflowyee/hcm-attendance-contract').WorkdayPage>(
		'david',
		'GET',
		'attendance/workdays?employmentId=' +
			encodeURIComponent(employment) +
			'&from=2027-02-02&to=2027-02-02',
	)
	expect(inspected.status).toBe(200)
	expect(inspected.body.items[0]).toMatchObject({
		kind: 'NonWorkingOverride',
		revision: 3,
		datedSources: [{ family: 'Override', id: 'dated-override', revision: 2 }],
	})
	await expect(
		api.admin.query(
			"INSERT INTO hcm.shift_roster(tenant_id,id,code,name,from_date,to_date,created_by_account_id) VALUES($1,'foreign-actor-roster','FOREIGN_ROSTER','Denied','2027-02-02','2027-02-02','other-actor')",
			[tenant],
		),
	).rejects.toMatchObject({ code: '23503' })
	const runtime = new Client({ connectionString: process.env['HCM_TEST_RUNTIME'] })
	await runtime.connect()
	try {
		await runtime.query('BEGIN')
		await runtime.query("SELECT set_config('hcm.tenant_id','work-config-foreign',true)")
		for (const table of [
			'shift_roster',
			'shift_roster_entry',
			'schedule_override',
			'schedule_override_segment',
		]) {
			expect(
				(await runtime.query('SELECT id FROM hcm.' + table + ' WHERE tenant_id=$1', [tenant])).rows,
			).toEqual([])
		}
		await expect(
			runtime.query(
				"INSERT INTO hcm.shift_roster(tenant_id,id,code,name,from_date,to_date,created_by_account_id) VALUES($1,'denied-roster','DENIED','Denied','2027-02-02','2027-02-02',$2)",
				[tenant, actor],
			),
		).rejects.toMatchObject({ code: '42501' })
	} finally {
		await runtime.query('ROLLBACK')
		await runtime.end()
	}
	await expect(
		api.admin.query(
			"UPDATE hcm.schedule_override SET zone='Asia/Kolkata',revision=revision+1 WHERE tenant_id=$1 AND id='dated-override'",
			[tenant],
		),
	).rejects.toMatchObject({ code: '23514' })
})

it('validates shifts in the real worker and invalidates reviewed publication when policy inputs change', /** A ready response is evidence to recheck, never permission to publish against retired inputs. */ async () => {
	const employmentId = 'dunder-mifflin/employment/jim'
	const input = shift('DATED_SHIFT')
	const created = await api.send<ShiftVersionView>('david', 'POST', 'attendance/shifts', input)
	expect(created.status).toBe(201)
	const path = `attendance/shifts/${created.body.id}/versions/${created.body.versionId}`
	const pending = await api.send<DatedConfigurationPreviewView>(
		'david',
		'POST',
		path + '/preview',
		{ expectedRevision: 1, employmentId, effectiveFrom: '2027-02-02' },
	)
	expect(pending.status).toBe(200)
	expect(
		(
			await api.send('david', 'POST', path + '/publish', {
				expectedRevision: 1,
				previewId: pending.body.previewId,
				digest: 'a'.repeat(64),
				reason: 'Still running',
			})
		).status,
	).toBe(409)
	await resolveAssignedDays()
	const ready = (
		await api.send<DatedConfigurationPreviewView>(
			'david',
			'GET',
			path + '/previews/' + pending.body.previewId,
		)
	).body
	expect(ready).toMatchObject({ state: 'Ready', conflicts: 0, lockedImpact: false })
	expect((await api.send('jim', 'GET', path + '/previews/' + ready.previewId)).status).toBe(403)
	const command = {
			expectedRevision: 1,
			previewId: ready.previewId,
			digest: ready.digest,
			reason: 'Reviewed exact dated shift',
		},
		key = randomUUID()
	const published = await api.send<ShiftVersionView>('david', 'POST', path + '/publish', command, {
		'idempotency-key': key,
	})
	expect(published.status).toBe(200)
	expect(published.body).toMatchObject({
		state: 'Published',
		revision: 2,
		segments: created.body.segments,
	})
	expect(
		(await api.send('david', 'POST', path + '/publish', command, { 'idempotency-key': key })).body,
	).toEqual(published.body)
	const next = await api.send<ShiftVersionView>(
		'david',
		'POST',
		`attendance/shifts/${created.body.id}/versions`,
		{
			sourceVersionId: created.body.versionId,
			expectedRevision: 2,
			reason: 'Prepare next version',
		},
	)
	expect(next.status).toBe(201)
	const nextPath = `attendance/shifts/${created.body.id}/versions/${next.body.versionId}`
	const nextPending = await api.send<DatedConfigurationPreviewView>(
		'david',
		'POST',
		nextPath + '/preview',
		{ expectedRevision: 1, employmentId, effectiveFrom: '2027-02-02' },
	)
	await resolveAssignedDays()
	const nextReady = (
		await api.send<DatedConfigurationPreviewView>(
			'david',
			'GET',
			nextPath + '/previews/' + nextPending.body.previewId,
		)
	).body
	expect(nextReady.state).toBe('Ready')
	const policies = await api.send<HcmPage<AttendancePolicyVersionView>>(
		'david',
		'GET',
		'attendance/policies?code=ASSIGNED_POLICY',
	)
	const assignedPolicy = policies.body.items[0]
	expect(
		(
			await api.send(
				'david',
				'POST',
				`attendance/policies/${assignedPolicy.id}/versions/${assignedPolicy.versionId}/retire`,
				{ expectedRevision: 2, reason: 'Change a reviewed dated dependency' },
			)
		).status,
	).toBe(200)
	expect(
		(
			await api.send('david', 'POST', nextPath + '/publish', {
				expectedRevision: 1,
				previewId: nextReady.previewId,
				digest: nextReady.digest,
				reason: 'Stale dependent policy',
			})
		).status,
	).toBe(409)
	expect((await api.send<ShiftVersionView>('david', 'GET', nextPath)).body.state).toBe('Draft')
	const changed = await api.send<DatedConfigurationPreviewView>(
		'david',
		'POST',
		nextPath + '/preview',
		{ expectedRevision: 1, employmentId, effectiveFrom: '2027-02-02' },
	)
	expect(
		(
			await api.send('david', 'PATCH', nextPath, {
				...input,
				name: 'Changed before worker review',
				expectedRevision: 1,
			})
		).status,
	).toBe(200)
	await resolveAssignedDays()
	expect(
		(
			await api.send<DatedConfigurationPreviewView>(
				'david',
				'GET',
				nextPath + '/previews/' + changed.body.previewId,
			)
		).body,
	).toMatchObject({ state: 'Failed', failureCode: 'SourceChanged' })
})
