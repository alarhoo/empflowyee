import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type {
	ProbationCasePage,
	ProbationOptionPage,
	ProbationReviewDto,
	ProbationReviewPage,
} from '@empflowyee/hcm-employee-contract'
import { HcmEmployeeModule } from './hcm-api-employee-module'
import { startHcmTestApi, type HcmTestApi } from './employee-test-harness'

let api: HcmTestApi
let today = ''
const base = 'employee/probation'
const ANDY = 'dunder-mifflin/employment/andy'
const REVIEW = 'dunder-mifflin/probation-review/andy-final'
const MICHAEL = 'dunder-mifflin/account/michael'
type Reply = ProbationReviewDto & { code?: string; fieldErrors?: { field: string; code: string }[] }

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

/** An encoded review path. */
function review(id: string, op = ''): string {
	return `${base}/reviews/${encodeURIComponent(id)}${op ? '/' + op : ''}`
}

/** Read one review as Toby. */
async function read(id: string): Promise<ProbationReviewDto> {
	const reply = await api.send<ProbationReviewDto>('toby', 'GET', review(id))
	expect(reply.status, JSON.stringify(reply.body)).toBe(200)
	return reply.body
}

/** Andy's employment probation facts. */
async function facts() {
	const { rows } = await api.admin.query(
		`SELECT probation_status AS status,to_char(probation_end_date,'YYYY-MM-DD') AS "end",employment_status AS employment,
			to_char(confirmed_on,'YYYY-MM-DD') AS confirmed FROM hcm.employment WHERE id=$1`,
		[ANDY],
	)
	return rows[0]
}

describe('Probation Management', /** Probation Management FDD. */ () => {
	it('lists cases in probation for HR only, with views and read-time states', /** REQ-PROBATION-MANAGEMENT-001, -004, -005. */ async () => {
		const all = await api.send<ProbationCasePage>('toby', 'GET', `${base}/cases`)
		expect(all.status).toBe(200)
		expect(all.cache).toBe('no-store')
		expect(all.body.items.map(/** Worker. */ (item) => item.workerName)).toEqual(['Andy Bernard'])
		expect(all.body.items[0]).toMatchObject({
			employmentId: ANDY,
			designation: 'Sales Representative',
			probationStatus: 'InProgress',
			probationEndDate: '2026-12-31',
			nextReview: { id: REVIEW, reviewType: 'Final', dueDate: '2026-12-17' },
		})
		for (const persona of ['jim', 'michael', 'david'])
			expect((await api.send(persona, 'GET', `${base}/cases`)).status).toBe(403)
		// Escalation is computed at read time 7 days after the due date; no notification is made.
		await api.admin.query('UPDATE hcm.probation_review SET due_date=$1 WHERE id=$2', [
			day(-8),
			REVIEW,
		])
		try {
			const overdue = await api.send<ProbationCasePage>('toby', 'GET', `${base}/cases?view=overdue`)
			expect(overdue.body.items[0]).toMatchObject({
				overdue: true,
				nextReview: { state: 'Escalated' },
			})
			const reviews = await api.send<ProbationReviewPage>(
				'toby',
				'GET',
				`${base}/reviews?status=Scheduled`,
			)
			expect(reviews.body.items[0]).toMatchObject({ id: REVIEW, state: 'Escalated' })
			await api.admin.query('UPDATE hcm.probation_review SET due_date=$1 WHERE id=$2', [
				day(-3),
				REVIEW,
			])
			expect((await read(REVIEW)).state).toBe('Overdue')
		} finally {
			await api.admin.query("UPDATE hcm.probation_review SET due_date='2026-12-17' WHERE id=$1", [
				REVIEW,
			])
		}
		expect(
			(await api.send<ProbationCasePage>('toby', 'GET', `${base}/cases?view=overdue`)).body.items,
		).toEqual([])
		expect((await api.send('toby', 'GET', `${base}/cases?view=later`)).status).toBe(400)
	})

	it('shows the review with minimal context, the suggested reviewer and the extension limit', /** REQ-PROBATION-MANAGEMENT-002. */ async () => {
		const detail = await read(REVIEW)
		expect(detail).toMatchObject({
			status: 'Scheduled',
			state: 'Scheduled',
			reviewer: { accountId: MICHAEL, name: 'Michael Scott' },
			owner: { name: 'Toby Flenderson' },
			suggestedReviewer: { accountId: MICHAEL },
			context: { workerName: 'Andy Bernard', unit: 'Scranton Branch', hireDate: '2026-07-01' },
			maxExtendedEndDate: '2027-03-31',
			actions: { assignReviewer: true, cancel: true, decide: true },
			assessments: [],
			decision: null,
		})
		expect(JSON.stringify(detail)).not.toMatch(/birth|personalEmail|address/i)
		const reviewers = await api.send<ProbationOptionPage>(
			'toby',
			'GET',
			`${base}/options/reviewers?q=mich`,
		)
		expect(reviewers.body.items.map(/** Id. */ (item) => item.id)).toEqual([MICHAEL])
		/** Reassign the seeded review. */
		const assign = (reviewerAccountId: string) =>
			api.send<Reply>('toby', 'POST', review(REVIEW, 'reviewer'), {
				reviewerAccountId,
				expectedRevision: detail.revision,
				reason: 'Reassign',
			})
		expect((await assign('dunder-mifflin/account/toby')).body.fieldErrors?.[0]).toEqual({
			field: 'reviewerAccountId',
			code: 'not-reviewer',
		})
		expect((await assign(MICHAEL)).body.fieldErrors?.[0]?.code).toBe('unchanged')
	})

	it('schedules and cancels an ad-hoc review, refusing a second open Final review', /** REQ-PROBATION-MANAGEMENT-002. */ async () => {
		const body = {
			employmentId: ANDY,
			reviewType: 'AdHoc',
			periodStart: '2026-07-01',
			periodEnd: day(0),
			dueDate: day(14),
			reviewerAccountId: MICHAEL,
			reason: 'Check in after the first quarter',
		}
		const key = randomUUID()
		const created = await api.send<Reply>('toby', 'POST', `${base}/reviews`, body, {
			'idempotency-key': key,
		})
		expect(created.status, JSON.stringify(created.body)).toBe(201)
		expect(created.body).toMatchObject({
			reviewType: 'AdHoc',
			sequenceNumber: 2,
			reviewer: { accountId: MICHAEL },
		})
		const replay = await api.send<Reply>('toby', 'POST', `${base}/reviews`, body, {
			'idempotency-key': key,
		})
		expect(replay.body.id).toBe(created.body.id)
		const conflict = await api.send<Reply>(
			'toby',
			'POST',
			`${base}/reviews`,
			{ ...body, reason: 'Other' },
			{ 'idempotency-key': key },
		)
		expect(conflict.status).toBe(409)
		const final = await api.send<Reply>('toby', 'POST', `${base}/reviews`, {
			...body,
			reviewType: 'Final',
		})
		expect(final.body.fieldErrors?.[0]).toEqual({ field: 'reviewType', code: 'duplicate' })
		const cancelled = await api.send<Reply>('toby', 'POST', review(created.body.id, 'cancel'), {
			expectedRevision: created.body.revision,
			reason: 'Covered by the Final review',
		})
		expect(cancelled.body).toMatchObject({
			status: 'Cancelled',
			cancelReason: 'Covered by the Final review',
		})
		const late = await api.send<Reply>('toby', 'POST', review(created.body.id, 'decision'), {
			outcome: 'NoChange',
			effectiveDate: today,
			reason: 'Too late',
			expectedRevision: cancelled.body.revision,
		})
		expect(late.status).toBe(409)
		expect((await api.send('michael', 'POST', `${base}/reviews`, body)).status).toBe(403)
	})

	it('extends once within 90 days, schedules the next review and keeps the prior decision', /** REQ-PROBATION-MANAGEMENT-003. */ async () => {
		const detail = await read(REVIEW)
		/** Decide the seeded review. */
		const decide = (body: Record<string, unknown>) =>
			api.send<Reply>('toby', 'POST', review(REVIEW, 'decision'), {
				effectiveDate: '2026-12-17',
				reason: 'Needs more time with key accounts',
				expectedRevision: detail.revision,
				...body,
			})
		expect(
			(await decide({ outcome: 'Extend', extendedProbationEndDate: '2027-04-01' })).body
				.fieldErrors?.[0],
		).toEqual({
			field: 'extendedProbationEndDate',
			code: 'too-long',
		})
		expect((await decide({ outcome: 'Extend' })).status).toBe(400)
		expect(
			(await decide({ outcome: 'Confirm', extendedProbationEndDate: '2027-01-31' })).status,
		).toBe(400)
		const extended = await decide({ outcome: 'Extend', extendedProbationEndDate: '2027-02-28' })
		expect(extended.status, JSON.stringify(extended.body)).toBe(200)
		expect(extended.body).toMatchObject({
			status: 'Decided',
			decision: {
				outcome: 'Extend',
				previousProbationEndDate: '2026-12-31',
				extendedProbationEndDate: '2027-02-28',
			},
			actions: { decide: false, cancel: false },
			maxExtendedEndDate: null,
		})
		expect(await facts()).toMatchObject({
			status: 'Extended',
			end: '2027-02-28',
			employment: 'Active',
		})
		const next = extended.body.history.find(
			/** The new Final review. */ (item) => item.sequenceNumber === 3,
		)
		expect(next).toMatchObject({
			reviewType: 'Final',
			dueDate: '2027-02-14',
			status: 'Scheduled',
			reviewer: { accountId: MICHAEL },
		})
		const events = await api.admin.query(
			"SELECT e.new_value_summary AS summary FROM hcm.worker_event e JOIN hcm.worker_event_type t ON t.tenant_id=e.tenant_id AND t.id=e.worker_event_type_id WHERE e.employment_id=$1 AND t.code='PROBATION_EXTENDED'",
			[ANDY],
		)
		expect(events.rows).toEqual([{ summary: 'Probation ends 2027-02-28' }])
		// A second extension is refused; the prior decision stays in history.
		const second = await read(next?.id ?? '')
		const again = await api.send<Reply>('toby', 'POST', review(second.id, 'decision'), {
			outcome: 'Extend',
			effectiveDate: '2027-02-14',
			extendedProbationEndDate: '2027-03-15',
			reason: 'Still not ready',
			expectedRevision: second.revision,
		})
		expect(again.body.fieldErrors?.[0]).toEqual({
			field: 'extendedProbationEndDate',
			code: 'already-extended',
		})
		expect(second.history.find(/** Prior. */ (item) => item.id === REVIEW)?.decision?.outcome).toBe(
			'Extend',
		)

		// Fail never ends employment or creates an exit.
		const failed = await api.send<Reply>('toby', 'POST', review(second.id, 'decision'), {
			outcome: 'Fail',
			effectiveDate: '2027-02-14',
			reason: 'Targets not met',
			expectedRevision: second.revision,
		})
		expect(failed.status, JSON.stringify(failed.body)).toBe(200)
		expect(await facts()).toMatchObject({
			status: 'Failed',
			end: '2027-02-28',
			employment: 'Active',
		})
		const exits = await api.admin.query(
			'SELECT count(*)::int AS n FROM hcm.employment WHERE id=$1 AND (employment_end_date IS NOT NULL OR last_working_date IS NOT NULL)',
			[ANDY],
		)
		expect(exits.rows[0].n).toBe(0)
		expect((await api.send<ProbationCasePage>('toby', 'GET', `${base}/cases`)).body.items).toEqual(
			[],
		)
		const audit = await api.admin.query<{ action: string }>(
			"SELECT action FROM hcm.audit_event WHERE target_type='probation-review' AND action='employee.probation-decided'",
		)
		expect(audit.rows).toHaveLength(2)
	})
})
