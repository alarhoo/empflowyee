import { describe, expect, it } from 'vitest'
import {
	addDays,
	capacityDemand,
	changeEventType,
	executesOnApproval,
	requireApplicable,
	requireCancellable,
	requireEffectiveDateInRange,
	requireIndependentDecider,
	requireStatusTransition,
} from './employment-change-rules'

describe('employment change rules', /** DEC-HCM2-002 and DEC-HCM2-007. */ () => {
	it('allows 30 days of backdating, 90 for a Correction, and any future date', /** REQ-EMPLOYMENT-CHANGES-002. */ () => {
		const today = '2026-09-27'
		expect(
			/** Evaluate the rule. */ () =>
				requireEffectiveDateInRange('Transfer', addDays(today, -30), today),
		).not.toThrow()
		expect(
			/** Evaluate the rule. */ () =>
				requireEffectiveDateInRange('Transfer', addDays(today, -31), today),
		).toThrow(expect.objectContaining({ code: 'effective-date-out-of-range' }))
		expect(
			/** Evaluate the rule. */ () =>
				requireEffectiveDateInRange('Correction', addDays(today, -90), today),
		).not.toThrow()
		expect(
			/** Evaluate the rule. */ () =>
				requireEffectiveDateInRange('Correction', addDays(today, -91), today),
		).toThrow()
		expect(
			/** Evaluate the rule. */ () => requireEffectiveDateInRange('Promotion', '2027-06-01', today),
		).not.toThrow()
	})

	it('executes dated changes on approval and waits with future employment facts', /** REQ-EMPLOYMENT-CHANGES-003. */ () => {
		const today = '2026-09-27'
		expect(executesOnApproval('Transfer', { unitId: 'u' }, '2026-12-01', today)).toBe(true)
		expect(executesOnApproval('Rehire', { employmentType: 'Permanent' }, '2026-12-01', today)).toBe(
			true,
		)
		expect(executesOnApproval('Suspension', {}, '2026-12-01', today)).toBe(false)
		expect(executesOnApproval('Suspension', {}, today, today)).toBe(true)
		expect(executesOnApproval('Correction', { noticePeriodDays: 30 }, '2026-10-01', today)).toBe(
			false,
		)
		expect(
			/** Evaluate the rule. */ () => requireApplicable('Approved', '2026-10-01', today),
		).toThrow()
		expect(
			/** Evaluate the rule. */ () => requireApplicable('Approved', today, today),
		).not.toThrow()
		expect(/** Evaluate the rule. */ () => requireApplicable('Failed', today, today)).not.toThrow()
		expect(/** Evaluate the rule. */ () => requireApplicable('Completed', today, today)).toThrow()
	})

	it('cancels until execution and refuses self-approval', /** REQ-EMPLOYMENT-CHANGES-005. */ () => {
		for (const status of ['Draft', 'PendingApproval', 'Approved'] as const)
			expect(/** Evaluate the rule. */ () => requireCancellable(status)).not.toThrow()
		for (const status of ['Completed', 'Rejected', 'Cancelled', 'Executing', 'Failed'] as const)
			expect(/** Evaluate the rule. */ () => requireCancellable(status)).toThrow()
		expect(/** Evaluate the rule. */ () => requireIndependentDecider('toby', 'toby')).toThrow(
			expect.objectContaining({ code: 'self-approval-forbidden' }),
		)
		expect(/** Evaluate the rule. */ () => requireIndependentDecider('toby', 'david')).not.toThrow()
	})

	it('suspends only active and returns only suspended employments', /** REQ-EMPLOYMENT-CHANGES-001. */ () => {
		expect(
			/** Evaluate the rule. */ () => requireStatusTransition('Suspension', 'Active'),
		).not.toThrow()
		expect(
			/** Evaluate the rule. */ () => requireStatusTransition('Suspension', 'Suspended'),
		).toThrow()
		expect(
			/** Evaluate the rule. */ () => requireStatusTransition('ReturnToWork', 'Suspended'),
		).not.toThrow()
		expect(
			/** Evaluate the rule. */ () => requireStatusTransition('ReturnToWork', 'Active'),
		).toThrow()
		expect(/** Evaluate the rule. */ () => requireStatusTransition('Transfer', 'Ended')).toThrow()
	})

	it('asks capacity only for added seats or FTE', /** DEC-HCM2-007. */ () => {
		expect(capacityDemand({ positionId: 'a', fte: 1 }, { positionId: 'b', fte: 0.5 })).toEqual({
			positionId: 'b',
			headcount: 1,
			fte: 0.5,
		})
		expect(capacityDemand({ positionId: 'a', fte: 0.5 }, { positionId: 'a', fte: 0.8 })).toEqual({
			positionId: 'a',
			headcount: 0,
			fte: 0.3,
		})
		expect(capacityDemand({ positionId: 'a', fte: 1 }, { positionId: 'a', fte: 0.5 })).toBeNull()
		expect(capacityDemand({ positionId: 'a', fte: 1 }, { positionId: null, fte: 1 })).toBeNull()
	})

	it('records one event type per change type', /** workforce.foundation@4. */ () => {
		expect(changeEventType('Rehire')).toBe('REHIRED')
		expect(changeEventType('ReturnToWork')).toBe('RETURNED_TO_WORK')
	})
})
