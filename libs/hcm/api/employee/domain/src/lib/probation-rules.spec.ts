import { describe, expect, it } from 'vitest'
import { addDays } from './employment-change-rules'
import {
	decisionEvent,
	decisionFacts,
	extensionProblem,
	finalReview,
	maxExtendedEnd,
	reviewState,
} from './probation-rules'

describe('probation rules', /** DEC-HCM2-003 defaults. */ () => {
	it('schedules the Final review 14 days before the end date', /** Due date. */ () => {
		expect(finalReview('2026-01-01', '2026-07-01')).toEqual({
			periodStart: '2026-01-01',
			periodEnd: '2026-07-01',
			probationEndDate: '2026-07-01',
			dueDate: '2026-06-17',
		})
		expect(finalReview('2026-01-01', '2026-01-10').dueDate).toBe('2026-01-01')
	})

	it('shows Overdue after the due date and Escalated 7 days later', /** Read-time state. */ () => {
		expect(reviewState('Scheduled', '2026-03-01', '2026-03-01')).toBe('Scheduled')
		expect(reviewState('Scheduled', '2026-03-01', '2026-03-02')).toBe('Overdue')
		expect(reviewState('AssessmentSubmitted', '2026-03-01', '2026-03-08')).toBe('Overdue')
		expect(reviewState('AssessmentSubmitted', '2026-03-01', '2026-03-09')).toBe('Escalated')
		expect(reviewState('Decided', '2026-03-01', '2026-04-01')).toBe('Decided')
	})

	it('allows one extension of at most 90 days beyond the original end', /** Extension. */ () => {
		expect(maxExtendedEnd('2026-07-01', 0)).toBe(addDays('2026-07-01', 90))
		expect(maxExtendedEnd('2026-07-01', 1)).toBeNull()
		expect(extensionProblem('2026-07-01', '2026-07-01', 0, '2026-08-01')).toBeNull()
		expect(extensionProblem('2026-07-01', '2026-07-01', 0, '2026-07-01')).toBe('not-later')
		expect(extensionProblem('2026-07-01', '2026-07-01', 0, '2026-09-30')).toBe('too-long')
		expect(extensionProblem('2026-08-01', '2026-07-01', 1, '2026-08-15')).toBe('already-extended')
	})

	it('maps decisions to facts and events without ending employment', /** Decision. */ () => {
		expect(decisionFacts('Confirm', '2026-07-01', null)).toEqual({
			probationStatus: 'Confirmed',
			confirmedOn: '2026-07-01',
		})
		expect(decisionFacts('Extend', '2026-07-01', '2026-08-01')).toEqual({
			probationStatus: 'Extended',
			probationEndDate: '2026-08-01',
		})
		expect(decisionFacts('Fail', '2026-07-01', null)).toEqual({ probationStatus: 'Failed' })
		expect(decisionFacts('NoChange', '2026-07-01', null)).toEqual({})
		expect(decisionEvent('Confirm')).toBe('CONFIRMED')
		expect(decisionEvent('NoChange')).toBeNull()
	})
})
