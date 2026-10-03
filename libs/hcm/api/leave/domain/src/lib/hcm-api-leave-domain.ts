import {
	formatLeaveUnits,
	leaveUnits,
	leaveUnitsScaled,
	type LeaveRounding,
	type LeaveUnits,
} from '@empflowyee/hcm-leave-contract'
import { invalidField } from '@empflowyee/hcm-runtime-contract'

/** Round a nonnegative rational quantity once using the published policy's decimal rule. */
export function roundLeaveRatio(
	numerator: bigint,
	denominator: bigint,
	rounding: LeaveRounding,
): LeaveUnits {
	if (numerator < 0n || denominator <= 0n) invalidField('units')
	if (
		!Number.isInteger(rounding.scale) ||
		rounding.scale < 0 ||
		rounding.scale > 6 ||
		!['Up', 'Down', 'Nearest'].includes(rounding.mode)
	)
		invalidField('rounding')
	const dividend = numerator * 10n ** BigInt(rounding.scale)
	let quotient = dividend / denominator
	const remainder = dividend % denominator
	if (
		(rounding.mode === 'Up' && remainder > 0n) ||
		(rounding.mode === 'Nearest' && remainder * 2n >= denominator)
	)
		quotient += 1n
	return formatLeaveUnits(quotient * 10n ** BigInt(6 - rounding.scale))
}

/** Sum already-rounded rows without introducing a second rounding operation. */
export function sumLeaveUnits(rows: readonly LeaveUnits[]): LeaveUnits {
	return formatLeaveUnits(
		rows.reduce(
			/** Accumulate signed integer millionths. */ (total, row) => total + leaveUnitsScaled(row),
			0n,
		),
	)
}

/** Subtract active reservations exactly, retaining a negative result for command validation. */
export function availableLeaveUnits(posted: LeaveUnits, reserved: LeaveUnits): LeaveUnits {
	leaveUnits(reserved, 'reserved', 'nonnegative')
	return formatLeaveUnits(leaveUnitsScaled(posted) - leaveUnitsScaled(reserved))
}
