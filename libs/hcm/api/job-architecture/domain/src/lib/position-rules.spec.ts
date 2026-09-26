import { describe, expect, it } from 'vitest'
import type { RequirementDto, VarianceDraft } from '@empflowyee/hcm-job-architecture-contract'
import {
	capacityDecision,
	effectiveRequirements,
	lifecycleTarget,
	remainingCapacity,
	requireCancellable,
	requireNoPositionCycle,
	requirePreviewValid,
	requireVariances,
} from './position-rules'

const capacity = { headcountCapacity: 2, fteCapacity: 1.5 }

/** A profile requirement. */
function requirement(code: string, extra: Partial<RequirementDto> = {}): RequirementDto {
	return {
		code,
		type: 'Experience',
		name: code,
		description: '',
		proficiency: '',
		minimumQuantity: 2,
		unit: 'Years',
		mandatory: true,
		sortOrder: 0,
		...extra,
	}
}

/** A variance draft. */
function variance(extra: Partial<VarianceDraft> & Pick<VarianceDraft, 'code'>): VarianceDraft {
	return {
		varianceType: 'Add',
		sourceCode: null,
		type: 'Experience',
		name: extra.code,
		description: '',
		proficiency: '',
		minimumQuantity: 2,
		unit: 'Years',
		mandatory: true,
		justification: null,
		...extra,
	}
}

describe('capacity (DEC-HCM2-007)', /** Case. */ () => {
	it('allows partial FTE within both capacities and refuses overfill', /** Case. */ () => {
		const occupancy = { headcount: 1, fte: 1, complete: true }
		expect(capacityDecision(capacity, occupancy, 1, 0.5)).toBe('allowed')
		expect(capacityDecision(capacity, occupancy, 1, 0.6)).toBe('capacity-exceeded')
		expect(capacityDecision(capacity, { headcount: 2, fte: 1, complete: true }, 1, 0.1)).toBe(
			'capacity-exceeded',
		)
		expect(remainingCapacity(capacity, occupancy)).toEqual({ headcount: 1, fte: 0.5 })
	})
	it('never treats unavailable occupancy as zero', /** Case. */ () => {
		const unknown = { headcount: null, fte: null, complete: false }
		expect(capacityDecision(capacity, unknown, 1, 0.1)).toBe('occupancy-unknown')
		expect(remainingCapacity(capacity, unknown)).toEqual({ headcount: null, fte: null })
		expect(/** Attempt. */ () => requireCancellable(unknown)).toThrow('occupancy-unknown')
		expect(
			/** Attempt. */ () => requireCancellable({ headcount: 1, fte: 1, complete: true }),
		).toThrow('invalid-state')
	})
})

describe('lifecycle', /** Case. */ () => {
	it('moves only along the documented transitions', /** Case. */ () => {
		expect(lifecycleTarget('Create', 'Planned')).toBe('Open')
		expect(lifecycleTarget('Freeze', 'Open')).toBe('Frozen')
		expect(lifecycleTarget('Reopen', 'Closed')).toBe('Open')
		expect(lifecycleTarget('Change', 'Frozen')).toBe('Frozen')
		expect(/** Attempt. */ () => lifecycleTarget('Freeze', 'Frozen')).toThrow('invalid-state')
		expect(/** Attempt. */ () => lifecycleTarget('Change', 'Closed')).toThrow('invalid-state')
		expect(/** Attempt. */ () => lifecycleTarget('Cancel', 'Cancelled')).toThrow('invalid-state')
	})
	it('refuses stale, expired and superseded previews', /** Case. */ () => {
		const now = new Date('2026-09-26T10:00:00Z')
		const ready = { status: 'Ready', expiresAt: '2026-09-26T10:10:00Z', sourceDigest: 'a' }
		expect(/** Attempt. */ () => requirePreviewValid(ready, now, 'a')).not.toThrow()
		expect(/** Attempt. */ () => requirePreviewValid(ready, now, 'b')).toThrow('preview-stale')
		expect(
			/** Attempt. */ () =>
				requirePreviewValid({ ...ready, expiresAt: '2026-09-26T09:59:00Z' }, now, 'a'),
		).toThrow('preview-stale')
		expect(
			/** Attempt. */ () => requirePreviewValid({ ...ready, status: 'Stale' }, now, 'a'),
		).toThrow('preview-stale')
		expect(/** Attempt. */ () => requirePreviewValid(undefined, now, 'a')).toThrow('preview-stale')
	})
	it('refuses reporting cycles', /** Case. */ () => {
		expect(/** Attempt. */ () => requireNoPositionCycle('p1', ['p2', 'p1'])).toThrow()
		expect(/** Attempt. */ () => requireNoPositionCycle('p1', ['p2'])).not.toThrow()
	})
})

describe('requirements (DEC-HCM2-009)', /** Case. */ () => {
	const profile = [requirement('SALES_EXP', { sortOrder: 1 }), requirement('DEGREE')]
	it('applies all four variances and keeps waived requirements visible', /** Case. */ () => {
		const result = effectiveRequirements(profile, [
			variance({ code: 'FORKLIFT', type: 'Licence', minimumQuantity: null, unit: null }),
			variance({
				code: 'SALES_EXP',
				varianceType: 'Strengthen',
				sourceCode: 'SALES_EXP',
				minimumQuantity: 5,
			}),
			variance({ code: 'DEGREE', varianceType: 'Waive', sourceCode: 'DEGREE' }),
		])
		expect(
			result.map(/** Summary. */ (item) => [item.code, item.source, item.variance, item.waived]),
		).toEqual([
			['DEGREE', 'Profile', 'Waive', true],
			['SALES_EXP', 'Position', 'Strengthen', false],
			['FORKLIFT', 'Position', 'Add', false],
		])
		expect(result[1]?.minimumQuantity).toBe(5)
	})
	it('refuses unknown sources, colliding additions and weakening', /** Case. */ () => {
		expect(
			/** Attempt. */ () => requireVariances([variance({ code: 'DEGREE' })], profile),
		).toThrow()
		expect(
			/** Attempt. */ () =>
				requireVariances(
					[variance({ code: 'NOPE', varianceType: 'Replace', sourceCode: 'NOPE' })],
					profile,
				),
		).toThrow()
		expect(
			/** Attempt. */ () =>
				requireVariances(
					[
						variance({
							code: 'SALES_EXP',
							varianceType: 'Strengthen',
							sourceCode: 'SALES_EXP',
							minimumQuantity: 1,
						}),
					],
					profile,
				),
		).toThrow()
		expect(
			/** Attempt. */ () =>
				requireVariances(
					[
						variance({
							code: 'DEGREE',
							varianceType: 'Replace',
							sourceCode: 'DEGREE',
							minimumQuantity: 0,
						}),
					],
					profile,
				),
		).not.toThrow()
	})
})
