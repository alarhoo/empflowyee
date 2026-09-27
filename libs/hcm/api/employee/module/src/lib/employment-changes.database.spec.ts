import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type {
	EmploymentChangePage,
	EmploymentChangeRequestDto,
	WorkerChangeContextDto,
} from '@empflowyee/hcm-employee-contract'
import { HcmEmployeeModule } from './hcm-api-employee-module'
import { startHcmTestApi, type HcmTestApi } from './employee-test-harness'

let api: HcmTestApi
let today = ''
const base = 'employee/changes'
const P = 'dunder-mifflin/'
type Reply = EmploymentChangeRequestDto & {
	code?: string
	fieldErrors?: { field: string; code: string }[]
}

beforeAll(
	/** Start the real module over the migrated and seeded disposable database. */ async () => {
		api = await startHcmTestApi(HcmEmployeeModule)
		const { rows } = await api.admin.query<{ today: string }>(
			"SELECT to_char((now() AT TIME ZONE 'America/New_York')::date,'YYYY-MM-DD') AS today",
		)
		today = rows[0]?.today ?? ''
	},
)
afterAll(
	/** Release the application and connections. */ async () => {
		await api?.close()
	},
)

/** An ISO date some days from today. */
function day(offset: number): string {
	const value = new Date(`${today}T00:00:00Z`)
	value.setUTCDate(value.getUTCDate() + offset)
	return value.toISOString().slice(0, 10)
}

/** An encoded path segment. */
function seg(id: string): string {
	return encodeURIComponent(id)
}

/** Create a request as a persona. */
function create(body: Record<string, unknown>, persona = 'toby', key = randomUUID()) {
	return api.send<Reply>(persona, 'POST', base, body, { 'idempotency-key': key })
}

/** A command on a request. */
function act(persona: string, id: string, op: string, body: Record<string, unknown>) {
	return api.send<Reply>(persona, 'POST', `${base}/${seg(id)}/${op}`, body)
}

/** Create and submit a request, returning the pending request. */
async function pending(body: Record<string, unknown>): Promise<Reply> {
	const created = await create(body)
	expect(created.status, JSON.stringify(created.body)).toBe(201)
	const submitted = await act('toby', created.body.id, 'submit', {
		expectedRevision: created.body.revision,
	})
	expect(submitted.status, JSON.stringify(submitted.body)).toBe(200)
	return submitted.body
}

/** Approve a pending request as David. */
function approve(request: Reply, reason = 'Budget confirmed') {
	return act('david', request.id, 'decide', {
		slotCode: 'hr-approver',
		decision: 'Approved',
		reason,
		expectedRevision: request.revision,
	})
}

/** A worker's current facts as Toby. */
async function context(workerId: string): Promise<WorkerChangeContextDto> {
	return (await api.send<WorkerChangeContextDto>('toby', 'GET', `${base}/context/${seg(workerId)}`))
		.body
}

describe('Employment Changes', /** Employment Changes FDD. */ () => {
	it('transfers a worker after an independent approval and records steps, event and audit', /** REQ-EMPLOYMENT-CHANGES-001, -002, -003, -008. */ async () => {
		const jim = await context(P + 'worker/jim')
		expect(jim.assignments[0]).toMatchObject({
			assignmentId: P + 'assignment/jim',
			position: { id: P + 'position/SCR-SALES-REP' },
			manager: { id: P + 'worker/michael' },
		})
		const request = await pending({
			workerId: P + 'worker/jim',
			employmentId: P + 'employment/jim',
			changeType: 'Transfer',
			effectiveDate: day(7),
			targets: {
				departmentId: P + 'department/management',
				jobTitle: 'Assistant to the Regional Manager',
			},
			reasonCode: 'BUSINESS_NEED',
			reasonDetail: 'Covering management',
		})
		expect(request).toMatchObject({
			status: 'PendingApproval',
			approvalPolicy: { code: 'employment-change', version: 1 },
			slots: [{ code: 'hr-approver', status: 'Pending' }],
			actions: { submit: false, decide: false, cancel: true },
		})
		expect(request.comparison).toContainEqual({
			field: 'jobTitle',
			current: 'Sales Representative',
			proposed: 'Assistant to the Regional Manager',
		})
		// Toby cannot approve at all; he lacks the approve grant.
		const byToby = await act('toby', request.id, 'decide', {
			slotCode: 'hr-approver',
			decision: 'Approved',
			reason: 'Mine',
			expectedRevision: request.revision,
		})
		expect(byToby.status).toBe(403)
		const awaiting = await api.send<EmploymentChangePage>(
			'david',
			'GET',
			`${base}?view=awaiting-my-decision`,
		)
		expect(awaiting.body.items.map(/** Id. */ (item) => item.id)).toContain(request.id)
		const approved = await approve(request)
		expect(approved.status, JSON.stringify(approved.body)).toBe(200)
		expect(approved.body).toMatchObject({
			status: 'Completed',
			approvals: [{ decision: 'Approved', decidedByMe: true, reason: 'Budget confirmed' }],
			slots: [{ status: 'Approved' }],
		})
		expect(
			approved.body.execution.map(/** Step. */ (item) => [item.stepCode, item.status]),
		).toEqual([
			['supersede-assignment', 'Succeeded'],
			['record-event', 'Succeeded'],
		])
		const after = await context(P + 'worker/jim')
		expect(after.assignments).toContainEqual(
			expect.objectContaining({
				effectiveFrom: day(7),
				jobTitle: 'Assistant to the Regional Manager',
				department: expect.objectContaining({ id: P + 'department/management' }),
				position: expect.objectContaining({ id: P + 'position/SCR-SALES-REP' }),
			}),
		)
		const events = await api.admin.query(
			`SELECT t.code FROM hcm.worker_event e JOIN hcm.worker_event_type t ON t.tenant_id=e.tenant_id AND t.id=e.worker_event_type_id
			 WHERE e.worker_id=$1 AND e.effective_date=$2`,
			[P + 'worker/jim', day(7)],
		)
		expect(events.rows).toEqual([{ code: 'TRANSFERRED' }])
		const audit = await api.admin.query(
			'SELECT action FROM hcm.audit_event WHERE target_id=$1 ORDER BY occurred_at,id',
			[request.id],
		)
		// Events of one transaction share a timestamp, so their order is not asserted.
		expect(audit.rows.map(/** Action. */ (row) => row.action).sort()).toEqual([
			'employee.change-approved',
			'employee.change-executed',
			'employee.change-requested',
			'employee.change-submitted',
		])
	})

	it('refuses invalid targets, overlaps, stale revisions, backdating and self-approval', /** REQ-EMPLOYMENT-CHANGES-001, -002. */ async () => {
		const body = {
			workerId: P + 'worker/pam',
			employmentId: P + 'employment/pam',
			changeType: 'HoursChange',
			effectiveDate: day(10),
			targets: { fullTimeEquivalent: 0.8, standardHoursPerWeek: 32 },
			reasonCode: 'EMPLOYEE_REQUEST',
			reasonDetail: 'Part-time request',
		}
		const invalid = await create({ ...body, targets: { unitId: P + 'organisation/scranton' } })
		expect(invalid.body.fieldErrors).toEqual([{ field: 'targets.unitId', code: 'unknown' }])
		expect((await create({ ...body, reasonCode: 'MERIT' })).body.fieldErrors).toEqual([
			{ field: 'reasonCode', code: 'unknown' },
		])
		const draft = await create(body)
		expect(draft.status).toBe(201)
		expect((await create(body)).body.code).toBe('duplicate-code')
		const stale = await api.send<Reply>('toby', 'PUT', `${base}/${seg(draft.body.id)}`, {
			targets: body.targets,
			effectiveDate: day(10),
			reasonCode: 'EMPLOYEE_REQUEST',
			reasonDetail: 'Part-time request',
			expectedRevision: draft.body.revision + 1,
		})
		expect(stale.body.code).toBe('revision-conflict')
		const late = await create({ ...body, effectiveDate: day(-31) })
		expect(late.status).toBe(201)
		const refused = await act('toby', late.body.id, 'submit', {
			expectedRevision: late.body.revision,
		})
		expect(refused.status).toBe(400)
		expect(refused.body.code).toBe('effective-date-out-of-range')
		const correction = {
			...body,
			changeType: 'Correction',
			reasonCode: 'DATA_ENTRY_ERROR',
			effectiveDate: day(-90),
		}
		const corrected = await create(correction)
		expect((await act('toby', corrected.body.id, 'submit', { expectedRevision: 1 })).status).toBe(
			200,
		)
		const tooLate = await create({ ...correction, effectiveDate: day(-91) })
		expect((await act('toby', tooLate.body.id, 'submit', { expectedRevision: 1 })).body.code).toBe(
			'effective-date-out-of-range',
		)
		// An account holding both grants still never approves its own request.
		await api.admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES ('local-dunder-mifflin','tenant-administrator','hcm.employee.changes.request')",
		)
		try {
			const own = await create({ ...body, effectiveDate: day(20) }, 'david')
			const submitted = await act('david', own.body.id, 'submit', { expectedRevision: 1 })
			const self = await act('david', own.body.id, 'decide', {
				slotCode: 'hr-approver',
				decision: 'Approved',
				reason: 'Mine',
				expectedRevision: submitted.body.revision,
			})
			expect(self.status).toBe(403)
			expect(self.body.code).toBe('self-approval-forbidden')
		} finally {
			await api.admin.query(
				"DELETE FROM hcm.role_permission WHERE tenant_id='local-dunder-mifflin' AND role_id='tenant-administrator' AND permission_code='hcm.employee.changes.request'",
			)
		}
	})

	it('suspends only on its date, returns to work, and keeps future employment facts until Apply', /** REQ-EMPLOYMENT-CHANGES-003. */ async () => {
		const body = {
			workerId: P + 'worker/angela',
			employmentId: P + 'employment/angela',
			changeType: 'Suspension',
			targets: {},
			reasonCode: 'INVESTIGATION',
			reasonDetail: 'Cat incident',
		}
		const future = await approve(await pending({ ...body, effectiveDate: day(5) }))
		expect(future.body).toMatchObject({ status: 'Approved', actions: { apply: false } })
		expect(
			(await act('toby', future.body.id, 'apply', { expectedRevision: future.body.revision })).body
				.code,
		).toBe('invalid-state')
		const cancelled = await act('toby', future.body.id, 'cancel', {
			expectedRevision: future.body.revision,
			reason: 'Investigation brought forward',
		})
		expect(cancelled.body.status).toBe('Cancelled')
		const now = await approve(await pending({ ...body, effectiveDate: today }))
		expect(now.body.status).toBe('Completed')
		expect((await context(P + 'worker/angela')).employments[0]?.employmentStatus).toBe('Suspended')
		const back = await approve(
			await pending({
				...body,
				changeType: 'ReturnToWork',
				reasonCode: 'SUSPENSION_ENDED',
				effectiveDate: day(1),
			}),
		)
		expect(back.body.status).toBe('Approved')
		expect(
			(await api.send<Reply>('toby', 'GET', `${base}/${seg(back.body.id)}`)).body.comparison,
		).toContainEqual({ field: 'employmentStatus', current: 'Suspended', proposed: 'Active' })
	})

	it('fails safely beyond position capacity and changes no fact', /** DEC-HCM2-007. */ async () => {
		const request = await pending({
			workerId: P + 'worker/pam',
			employmentId: P + 'employment/pam',
			changeType: 'Promotion',
			effectiveDate: day(3),
			targets: { positionId: P + 'position/SCR-ASST-RM', jobTitle: 'Assistant Regional Manager' },
			reasonCode: 'MERIT',
			reasonDetail: 'Moving to sales',
		})
		const decided = await approve(request)
		expect(decided.status).toBe(200)
		expect(decided.body).toMatchObject({
			status: 'Failed',
			failureCode: 'capacity-exceeded',
			approvals: [{ decision: 'Approved' }],
			execution: [{ stepCode: 'execute', status: 'Failed', failureCode: 'capacity-exceeded' }],
			actions: { cancel: false },
		})
		const pam = await context(P + 'worker/pam')
		expect(pam.assignments.map(/** Position. */ (item) => item.position)).toEqual([null])
		const cancelled = await api.send<Reply>('toby', 'POST', `${base}/${seg(request.id)}/cancel`, {
			expectedRevision: decided.body.revision,
			reason: 'No seat available',
		})
		expect(cancelled.body.status, JSON.stringify(cancelled.body)).toBe('Cancelled')
	})

	it('rehires an ended worker as a new employment, never a new person', /** REQ-EMPLOYMENT-CHANGES-004. */ async () => {
		await api.admin.query(
			"UPDATE hcm.employment SET employment_status='Ended',employment_end_date='2026-01-31',is_eligible_for_rehire=true WHERE tenant_id='local-dunder-mifflin' AND id=$1",
			[P + 'employment/oscar'],
		)
		await api.admin.query(
			"UPDATE hcm.assignment SET effective_to='2026-01-31' WHERE tenant_id='local-dunder-mifflin' AND id=$1",
			[P + 'assignment/oscar'],
		)
		const people = await api.admin.query('SELECT count(*)::int AS n FROM hcm.person')
		const oscar = await context(P + 'worker/oscar')
		expect(oscar).toMatchObject({ rehireAllowed: true, employments: [{ eligibleForRehire: true }] })
		const request = await pending({
			workerId: P + 'worker/oscar',
			changeType: 'Rehire',
			effectiveDate: day(14),
			targets: {
				legalEntityId: P + 'legal-entity/dmpc',
				employmentType: 'Permanent',
				unitId: P + 'organisation/scranton',
				locationId: P + 'location/scranton',
				departmentId: P + 'department/accounting',
				jobTitle: 'Accountant',
				workMode: 'OnSite',
				fullTimeEquivalent: 1,
				managerWorkerId: P + 'worker/angela',
			},
			reasonCode: 'RETURNING_EMPLOYEE',
			reasonDetail: 'Returning after a break',
		})
		const done = await approve(request)
		expect(done.body.status, JSON.stringify(done.body)).toBe('Completed')
		expect(done.body.resultEmploymentId).toEqual(expect.any(String))
		const again = await context(P + 'worker/oscar')
		expect(again.employments.map(/** Status. */ (item) => item.employmentStatus)).toEqual([
			'Ended',
			'Pending',
		])
		expect(again.assignments).toContainEqual(
			expect.objectContaining({
				effectiveFrom: day(14),
				manager: { id: P + 'worker/angela', name: 'Angela Martin' },
			}),
		)
		expect((await api.admin.query('SELECT count(*)::int AS n FROM hcm.person')).rows).toEqual(
			people.rows,
		)
		expect(
			(await create({ ...request, targets: request.targets, effectiveDate: day(30) })).status,
		).toBe(400)
	})

	it('replays a command with the same key and refuses a different payload', /** REQ-EMPLOYMENT-CHANGES-008. */ async () => {
		const key = randomUUID()
		const body = {
			workerId: P + 'worker/dwight',
			employmentId: P + 'employment/dwight',
			changeType: 'ManagerChange',
			effectiveDate: day(12),
			targets: { managerWorkerId: P + 'worker/david' },
			reasonCode: 'REORGANISATION',
			reasonDetail: 'Reports to corporate',
		}
		const first = await create(body, 'toby', key)
		const replay = await create(body, 'toby', key)
		expect(replay.body.id).toBe(first.body.id)
		expect((await create({ ...body, effectiveDate: day(13) }, 'toby', key)).body.code).toBe(
			'idempotency-conflict',
		)
		expect(first.body.comparison).toEqual([
			{ field: 'managerWorkerId', current: 'Michael Scott', proposed: 'David Wallace' },
		])
		const mine = await api.send<EmploymentChangePage>(
			'toby',
			'GET',
			`${base}?view=mine&changeType=ManagerChange`,
		)
		expect(mine.body.items.map(/** Id. */ (item) => item.id)).toEqual([first.body.id])
		expect((await api.send('jim', 'GET', base)).status).toBe(403)
	})
})
