import { describe, expect, it } from 'vitest'
import { formatLeaveUnits, leaveUnits, leaveUnitsScaled } from '@empflowyee/hcm-leave-contract'
import { availableLeaveUnits, roundLeaveRatio, sumLeaveUnits } from './hcm-api-leave-domain'

describe('exact Leave quantities', /** Verify storage boundaries and policy arithmetic. */ () => {
	it('retains precision and rejects coercion or values outside numeric(18,6)', /** Exercise exact endpoints and malformed wire quantities. */ () => {
		expect(formatLeaveUnits(leaveUnitsScaled('999999999999.999999'))).toBe('999999999999.999999')
		expect(formatLeaveUnits(leaveUnitsScaled('-0.000001'))).toBe('-0.000001')
		for (const value of [1, '1e2', ' 1', '1.0000001', '1000000000000', 'NaN', '+1', '01'])
			expect(
				/** Reject each unsupported representation. */ () => leaveUnits(value, 'units'),
			).toThrow()
		expect(
			/** Zero cannot represent a nonzero ledger posting. */ () =>
				leaveUnits('-0', 'units', 'nonzero'),
		).toThrow()
		expect(
			/** Entitlement magnitudes must be positive. */ () => leaveUnits('-1', 'units', 'positive'),
		).toThrow()
	})
	it('rounds rational rows once before exact summation', /** Distinguish all rounding modes and per-row totals. */ () => {
		expect(roundLeaveRatio(1n, 3n, { scale: 6, mode: 'Down' })).toBe('0.333333')
		expect(roundLeaveRatio(1n, 3n, { scale: 6, mode: 'Up' })).toBe('0.333334')
		expect(roundLeaveRatio(1n, 2n, { scale: 0, mode: 'Nearest' })).toBe('1')
		expect(roundLeaveRatio(1n, 2n, { scale: 0, mode: 'Down' })).toBe('0')
		expect(sumLeaveUnits(['0.333333', '0.333333', '0.333333'])).toBe('0.999999')
		expect(
			/** Missing duration never becomes a synthetic denominator. */ () =>
				roundLeaveRatio(1n, 0n, { scale: 6, mode: 'Down' }),
		).toThrow()
	})
	it('preserves shortfall evidence and rejects overflow', /** Keep availability exact through reservation subtraction. */ () => {
		expect(availableLeaveUnits('2', '0.000001')).toBe('1.999999')
		expect(availableLeaveUnits('1', '2')).toBe('-1')
		expect(
			/** Summation cannot exceed the persisted decimal range. */ () =>
				sumLeaveUnits(['999999999999.999999', '0.000001']),
		).toThrow()
	})
})
