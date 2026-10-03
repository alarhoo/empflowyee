import {
	formatLeaveUnits,
	leaveUnits,
	leaveUnitsScaled,
	type LeaveAccrualRule,
	type LeaveRounding,
	type LeaveTrackingMode,
	type LeaveUnits,
} from '@empflowyee/hcm-leave-contract'
import { invalidField } from '@empflowyee/hcm-runtime-contract'
import { roundLeaveRatio } from './hcm-api-leave-domain'

/** Owner-computed counts for one explicit accrual occurrence; unavailable workdays are never treated as nonworking days. */
export interface LeaveAccrualQuantityBasis {
	trackingMode: LeaveTrackingMode
	serviceDays: number
	calendarDays: number
	eligibleCalendarDays: number
	workingDays: number | null
	eligibleWorkingDays: number | null
	postedUnits: LeaveUnits
}
export type LeaveAccrualQuantity =
	| { state: 'Credit'; units: LeaveUnits; beforeCapUnits: LeaveUnits }
	| {
		state: 'Skip'
		reason:
				'Unpaid' | 'Disabled' | 'WaitingPeriod' | 'NoEligibleDays' | 'RoundedToZero' | 'BalanceCap'
	}
	| { state: 'Unavailable'; reason: 'IncompleteRule' | 'WorkdaysUnavailable' }

/** Reject malformed count evidence rather than converting incomplete schedule facts into a grant. */
function count(value: number, field: string, minimum: number): void {
	if (!Number.isSafeInteger(value) || value < minimum || value > 2_147_483_647) invalidField(field)
}

/** Calculate one positive occurrence exactly, applying the explicit proration/rounding and existing posted-balance cap. */
export function calculateLeaveAccrualQuantity(
	rule: LeaveAccrualRule,
	rounding: LeaveRounding,
	basis: LeaveAccrualQuantityBasis,
): LeaveAccrualQuantity {
	if (basis.trackingMode === 'Unpaid') return { state: 'Skip', reason: 'Unpaid' }
	if (!rule.enabled) return { state: 'Skip', reason: 'Disabled' }
	if (
		rule.unitsPerOccurrence === undefined ||
		rule.proration === undefined ||
		rule.waitingPeriodDays === undefined ||
		rule.frequency === undefined ||
		rule.timing === undefined
	)
		return { state: 'Unavailable', reason: 'IncompleteRule' }
	leaveUnits(rule.unitsPerOccurrence, 'unitsPerOccurrence', 'positive')
	leaveUnits(basis.postedUnits, 'postedUnits', 'nonnegative')
	count(basis.serviceDays, 'serviceDays', 0)
	count(rule.waitingPeriodDays, 'waitingPeriodDays', 0)
	count(basis.calendarDays, 'calendarDays', 1)
	count(basis.eligibleCalendarDays, 'eligibleCalendarDays', 0)
	if (basis.eligibleCalendarDays > basis.calendarDays) invalidField('eligibleCalendarDays')
	if (basis.serviceDays < rule.waitingPeriodDays) return { state: 'Skip', reason: 'WaitingPeriod' }
	if (basis.eligibleCalendarDays === 0) return { state: 'Skip', reason: 'NoEligibleDays' }
	let numerator = 1n,
		denominator = 1n
	if (rule.proration === 'CalendarDays') {
		numerator = BigInt(basis.eligibleCalendarDays)
		denominator = BigInt(basis.calendarDays)
	} else if (rule.proration === 'WorkingDays') {
		if (basis.workingDays === null || basis.eligibleWorkingDays === null)
			return { state: 'Unavailable', reason: 'WorkdaysUnavailable' }
		count(basis.workingDays, 'workingDays', 0)
		count(basis.eligibleWorkingDays, 'eligibleWorkingDays', 0)
		if (
			basis.workingDays > basis.calendarDays ||
			basis.eligibleWorkingDays > basis.workingDays ||
			basis.eligibleWorkingDays > basis.eligibleCalendarDays
		)
			invalidField('eligibleWorkingDays')
		if (basis.workingDays === 0 || basis.eligibleWorkingDays === 0)
			return { state: 'Skip', reason: 'NoEligibleDays' }
		numerator = BigInt(basis.eligibleWorkingDays)
		denominator = BigInt(basis.workingDays)
	}
	const beforeCapUnits = roundLeaveRatio(
		leaveUnitsScaled(rule.unitsPerOccurrence) * numerator,
		1_000_000n * denominator,
		rounding,
	)
	let credited = leaveUnitsScaled(beforeCapUnits)
	if (credited === 0n) return { state: 'Skip', reason: 'RoundedToZero' }
	if (rule.maximumAccruedBalanceUnits !== undefined) {
		leaveUnits(rule.maximumAccruedBalanceUnits, 'maximumAccruedBalanceUnits', 'positive')
		const capacity =
			leaveUnitsScaled(rule.maximumAccruedBalanceUnits) - leaveUnitsScaled(basis.postedUnits)
		if (capacity <= 0n) return { state: 'Skip', reason: 'BalanceCap' }
		if (credited > capacity) credited = capacity
	}
	// Overflow is rejected before a worker can append an unrepresentable balance.
	formatLeaveUnits(leaveUnitsScaled(basis.postedUnits) + credited)
	return { state: 'Credit', units: formatLeaveUnits(credited), beforeCapUnits }
}
