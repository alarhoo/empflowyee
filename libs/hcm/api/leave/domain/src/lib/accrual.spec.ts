import { expect, it } from 'vitest'
import type { LeaveAccrualRule } from '@empflowyee/hcm-leave-contract'
import { calculateLeaveAccrualQuantity, type LeaveAccrualQuantityBasis } from './accrual'

/** Supply an explicit monthly occurrence, independent of any production period/default seed. */
function rule(): LeaveAccrualRule {
	return {
		enabled: true,
		unitsPerOccurrence: '2',
		frequency: 'Monthly',
		timing: 'Arrears',
		proration: 'CalendarDays',
		waitingPeriodDays: 0,
	}
}
/** Provide verified occurrence counts, retaining unavailable working-day facts explicitly. */
function basis(): LeaveAccrualQuantityBasis {
	return {
		trackingMode: 'Balance',
		serviceDays: 90,
		calendarDays: 31,
		eligibleCalendarDays: 17,
		workingDays: null,
		eligibleWorkingDays: null,
		postedUnits: '0',
	}
}
const rounding = { scale: 6, mode: 'Nearest' } as const

it('prorates exact occurrence quantities and never uses an annual amount as a second grant', /** Calendar proration rounds once to the published precision. */ () => {
	expect(
		calculateLeaveAccrualQuantity(
			{ ...rule(), unitsPerYear: '24', unitsPerMonth: '2' },
			rounding,
			basis(),
		),
	).toEqual({ state: 'Credit', units: '1.096774', beforeCapUnits: '1.096774' })
	expect(
		calculateLeaveAccrualQuantity({ ...rule(), proration: 'None' }, rounding, basis()),
	).toEqual({ state: 'Credit', units: '2', beforeCapUnits: '2' })
	expect(calculateLeaveAccrualQuantity(rule(), { scale: 2, mode: 'Up' }, basis())).toEqual({
		state: 'Credit',
		units: '1.1',
		beforeCapUnits: '1.1',
	})
})

it('does not turn missing workdays or incomplete rules into entitlement', /** Working-day proration requires genuine source counts and no fallback denominator. */ () => {
	const working = { ...rule(), proration: 'WorkingDays' as const }
	expect(calculateLeaveAccrualQuantity(working, rounding, basis())).toEqual({
		state: 'Unavailable',
		reason: 'WorkdaysUnavailable',
	})
	expect(
		calculateLeaveAccrualQuantity(working, rounding, {
			...basis(),
			workingDays: 23,
			eligibleWorkingDays: 12,
		}),
	).toEqual({ state: 'Credit', units: '1.043478', beforeCapUnits: '1.043478' })
	expect(
		calculateLeaveAccrualQuantity({ enabled: true, unitsPerYear: '24' }, rounding, basis()),
	).toEqual({ state: 'Unavailable', reason: 'IncompleteRule' })
	expect(
		/** Eligible workdays cannot exceed actual eligible calendar dates. */ () =>
			calculateLeaveAccrualQuantity(working, rounding, {
				...basis(),
				workingDays: 23,
				eligibleWorkingDays: 20,
			}),
	).toThrow()
})

it('preserves Unpaid, waiting periods, explicit caps and exact overflow protection', /** Available balance or reservations cannot manufacture additional accrual capacity. */ () => {
	expect(
		calculateLeaveAccrualQuantity(rule(), rounding, { ...basis(), trackingMode: 'Unpaid' }),
	).toEqual({ state: 'Skip', reason: 'Unpaid' })
	expect(
		calculateLeaveAccrualQuantity({ ...rule(), waitingPeriodDays: 91 }, rounding, basis()),
	).toEqual({ state: 'Skip', reason: 'WaitingPeriod' })
	expect(
		calculateLeaveAccrualQuantity({ ...rule(), maximumAccruedBalanceUnits: '5' }, rounding, {
			...basis(),
			postedUnits: '4.999999',
		}),
	).toEqual({ state: 'Credit', units: '0.000001', beforeCapUnits: '1.096774' })
	expect(
		calculateLeaveAccrualQuantity({ ...rule(), maximumAccruedBalanceUnits: '5' }, rounding, {
			...basis(),
			postedUnits: '5',
		}),
	).toEqual({ state: 'Skip', reason: 'BalanceCap' })
	expect(
		/** A posting must remain representable by SQL numeric(18,6). */ () =>
			calculateLeaveAccrualQuantity(rule(), rounding, {
				...basis(),
				postedUnits: '999999999999.999999',
			}),
	).toThrow()
})
