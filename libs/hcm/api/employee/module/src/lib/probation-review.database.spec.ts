import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type {
	ProbationReviewDto,
	ReviewerReviewDto,
	ReviewerReviewPage,
} from '@empflowyee/hcm-employee-contract'
import { HcmEmployeeModule } from './hcm-api-employee-module'
import { startHcmTestApi, type HcmTestApi } from './employee-test-harness'

let api: HcmTestApi
const base = 'employee/me/probation-reviews'
const REVIEW = 'dunder-mifflin/probation-review/andy-final'
type Reply = ReviewerReviewDto & { code?: string; fieldErrors?: { field: string; code: string }[] }

beforeAll(
	/** Start the real module over the migrated and seeded disposable database. */ async () => {
		api = await startHcmTestApi(HcmEmployeeModule)
	},
)
afterAll(
	/** Release the application and connections. */ async () => {
		await api?.close()
	},
)

/** The seeded review path. */
function path(op = ''): string {
	return `${base}/${encodeURIComponent(REVIEW)}${op ? '/' + op : ''}`
}

/** A valid assessment at a revision. */
function assessment(expectedRevision: number, overrides: Record<string, unknown> = {}) {
	return {
		recommendation: 'Confirm',
		overallRating: 4,
		strengths: 'Builds rapport with clients quickly',
		concerns: 'Paperwork is sometimes late',
		recommendationReason: 'Meets the expectations of the role',
		expectedRevision,
		...overrides,
	}
}

describe('Probation Review', /** Probation Review FDD. */ () => {
	it('lists only reviews whose stored reviewer is the actor', /** REQ-PROBATION-REVIEW-001. */ async () => {
		const mine = await api.send<ReviewerReviewPage>('michael', 'GET', base)
		expect(mine.status).toBe(200)
		expect(mine.cache).toBe('no-store')
		expect(mine.body.items).toEqual([
			{
				id: REVIEW,
				workerName: 'Andy Bernard',
				reviewType: 'Final',
				dueDate: '2026-12-17',
				status: 'Scheduled',
				state: 'Scheduled',
			},
		])
		for (const persona of ['jim', 'toby', 'david'])
			expect((await api.send(persona, 'GET', base)).status).toBe(403)
		// Managing Andy is not enough: without the stored reviewer, Michael sees nothing.
		await api.admin.query(
			'UPDATE hcm.probation_review SET primary_reviewer_account_id=NULL WHERE id=$1',
			[REVIEW],
		)
		try {
			expect((await api.send<ReviewerReviewPage>('michael', 'GET', base)).body.items).toEqual([])
			expect((await api.send('michael', 'GET', path())).status).toBe(404)
			expect((await api.send('michael', 'POST', path('assessments'), assessment(1))).status).toBe(
				404,
			)
		} finally {
			await api.admin.query(
				"UPDATE hcm.probation_review SET primary_reviewer_account_id='dunder-mifflin/account/michael' WHERE id=$1",
				[REVIEW],
			)
		}
	})

	it('shows minimal context without personal data', /** REQ-PROBATION-REVIEW-004. */ async () => {
		const review = await api.send<ReviewerReviewDto>('michael', 'GET', path())
		expect(review.status).toBe(200)
		expect(review.body.context).toEqual({
			workerName: 'Andy Bernard',
			workerNumber: 'DM-ANDY',
			designation: 'Sales Representative',
			unit: 'Scranton Branch',
			hireDate: '2026-07-01',
			probationEndDate: '2026-12-31',
			probationStatus: 'InProgress',
		})
		expect(JSON.stringify(review.body)).not.toMatch(
			/birth|email|phone|address|family|gender|nationality/i,
		)
		expect(review.body).toMatchObject({
			assessments: [],
			previousDecisions: [],
			actions: { assess: true },
		})
	})

	it('supersedes assessments until HR decides, then locks them', /** REQ-PROBATION-REVIEW-002, -003. */ async () => {
		const start = (await api.send<ReviewerReviewDto>('michael', 'GET', path())).body
		for (const bad of [
			{ overallRating: 0 },
			{ overallRating: 6 },
			{ overallRating: 3.5 },
			{ recommendation: 'Promote' },
		])
			expect(
				(await api.send('michael', 'POST', path('assessments'), assessment(start.revision, bad)))
					.status,
			).toBe(400)
		const missing = assessment(start.revision) as Record<string, unknown>
		delete missing['recommendationReason']
		expect((await api.send('michael', 'POST', path('assessments'), missing)).status).toBe(400)
		const first = await api.send<Reply>(
			'michael',
			'POST',
			path('assessments'),
			assessment(start.revision),
		)
		expect(first.status, JSON.stringify(first.body)).toBe(201)
		expect(first.body).toMatchObject({
			status: 'AssessmentSubmitted',
			assessments: [{ versionNumber: 1, current: true, overallRating: 4 }],
		})
		const second = await api.send<Reply>(
			'michael',
			'POST',
			path('assessments'),
			assessment(first.body.revision, {
				recommendation: 'Extend',
				overallRating: 3,
				recommendationReason: 'Needs another quarter',
			}),
		)
		expect(second.status, JSON.stringify(second.body)).toBe(201)
		expect(
			second.body.assessments.map(
				/** Version. */ (item) => [item.versionNumber, item.current, item.recommendation],
			),
		).toEqual([
			[2, true, 'Extend'],
			[1, false, 'Confirm'],
		])
		const stale = await api.send<Reply>(
			'michael',
			'POST',
			path('assessments'),
			assessment(first.body.revision),
		)
		expect(stale.status).toBe(409)

		// HR sees the current assessment and decides; the assessment then locks.
		const hr = await api.send<ProbationReviewDto>(
			'toby',
			'GET',
			`employee/probation/reviews/${encodeURIComponent(REVIEW)}`,
		)
		expect(hr.body.assessments[0]).toMatchObject({
			versionNumber: 2,
			current: true,
			reviewer: { name: 'Michael Scott' },
		})
		const decided = await api.send<ProbationReviewDto>(
			'toby',
			'POST',
			`employee/probation/reviews/${encodeURIComponent(REVIEW)}/decision`,
			{
				outcome: 'Confirm',
				effectiveDate: '2026-12-17',
				reason: 'Strong first months',
				expectedRevision: hr.body.revision,
			},
		)
		expect(decided.status, JSON.stringify(decided.body)).toBe(200)
		const locked = await api.send<ReviewerReviewDto>('michael', 'GET', path())
		expect(locked.body).toMatchObject({
			status: 'Decided',
			actions: { assess: false },
			previousDecisions: [{ outcome: 'Confirm', effectiveDate: '2026-12-17' }],
		})
		expect(JSON.stringify(locked.body.previousDecisions)).not.toContain('Strong first months')
		const late = await api.send<Reply>(
			'michael',
			'POST',
			path('assessments'),
			assessment(locked.body.revision),
		)
		expect(late.status).toBe(409)
		const audit = await api.admin.query(
			"SELECT count(*)::int AS n FROM hcm.audit_event WHERE action='employee.probation-assessment-submitted' AND target_id=$1",
			[REVIEW],
		)
		expect(audit.rows[0].n).toBe(2)
	})
})
