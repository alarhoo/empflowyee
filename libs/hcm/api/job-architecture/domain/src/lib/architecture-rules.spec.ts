import { describe, expect, it } from 'vitest'
import {
	dayBefore,
	requireAllowedGrades,
	requireDraft,
	requireEffectiveAfter,
	requireFamilyParent,
	requireTransition,
	requireUniqueCodes,
} from './architecture-rules'

/** Run a rule and report 'ok' or the classification it throws. */
function outcome<A extends unknown[]>(rule: (...args: A) => void, ...args: A): string {
	try {
		rule(...args)
		return 'ok'
	} catch (error) {
		return (error as Error).message
	}
}

describe('job architecture rules', /** Business rules 2, 3, 5, 7 and 8 and DEC-HCM2-005. */ () => {
	it('lets only drafts change and walks the lifecycle one step at a time', /** Rule 2. */ () => {
		expect(outcome(requireDraft, 'Draft')).toBe('ok')
		for (const status of ['InReview', 'Published', 'Superseded', 'Retired'] as const)
			expect(outcome(requireDraft, status)).toBe('invalid-state')
		expect(outcome(requireTransition, 'Draft', 'InReview')).toBe('ok')
		expect(outcome(requireTransition, 'InReview', 'Published')).toBe('ok')
		expect(outcome(requireTransition, 'Draft', 'Published')).toBe('invalid-state')
		expect(outcome(requireTransition, 'Published', 'InReview')).toBe('invalid-state')
	})

	it('publishes successors after the current start date', /** Rule 3. */ () => {
		expect(dayBefore('2026-03-01')).toBe('2026-02-28')
		expect(outcome(requireEffectiveAfter, null, '2026-01-01')).toBe('ok')
		expect(outcome(requireEffectiveAfter, '2026-01-01', '2026-01-02')).toBe('ok')
		expect(outcome(requireEffectiveAfter, '2026-01-01', '2026-01-01')).toBe('invalid-request')
	})

	it('keeps families two levels deep', /** DEC-HCM2-005. */ () => {
		expect(outcome(requireFamilyParent, null)).toBe('ok')
		expect(outcome(requireFamilyParent, 1)).toBe('ok')
		expect(outcome(requireFamilyParent, 2)).toBe('invalid-request')
	})

	it('requires allowed grades with exactly one default and unique codes', /** Rules 7 and 8. */ () => {
		const g3 = { gradeId: 'g3', isDefault: true }
		expect(outcome(requireAllowedGrades, [g3])).toBe('ok')
		expect(outcome(requireAllowedGrades, [])).toBe('invalid-request')
		expect(outcome(requireAllowedGrades, [g3, { gradeId: 'g4', isDefault: true }])).toBe(
			'invalid-request',
		)
		expect(outcome(requireAllowedGrades, [{ gradeId: 'g3', isDefault: false }])).toBe(
			'invalid-request',
		)
		expect(outcome(requireAllowedGrades, [g3, { gradeId: 'g3', isDefault: false }])).toBe(
			'invalid-request',
		)
		expect(outcome(requireUniqueCodes, [{ code: 'A' }, { code: 'A' }], 'requirements')).toBe(
			'invalid-request',
		)
	})
})
