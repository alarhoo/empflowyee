import { invalidField } from '@empflowyee/hcm-runtime-contract'

export type LeaveUnits = string
export type LeaveTrackingMode = 'Balance' | 'Unpaid'
export type LeaveUnit = 'Day' | 'Hour'
export type LeaveRoundingMode = 'Up' | 'Down' | 'Nearest'
export interface LeaveRounding {
	scale: number
	mode: LeaveRoundingMode
}
export const LEAVE_UNITS_FACTOR = 1_000_000n
export const LEAVE_UNITS_MAX_SCALED = 999_999_999_999_999_999n

/** Validate the exact numeric(18,6) wire representation without coercion or rounding. */
export function leaveUnits(
	value: unknown,
	field: string,
	constraint: 'signed' | 'nonnegative' | 'positive' | 'nonzero' = 'signed',
): LeaveUnits {
	if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(value))
		invalidField(field)
	const negative = value.startsWith('-')
	const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.')
	const magnitude = BigInt(whole) * LEAVE_UNITS_FACTOR + BigInt(fraction.padEnd(6, '0'))
	if ((constraint === 'nonnegative' || constraint === 'positive') && negative) invalidField(field)
	if ((constraint === 'positive' || constraint === 'nonzero') && magnitude === 0n)
		invalidField(field)
	return value
}

/** Convert validated units to integer millionths for exact arithmetic. */
export function leaveUnitsScaled(value: LeaveUnits): bigint {
	leaveUnits(value, 'units')
	const negative = value.startsWith('-')
	const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.')
	const magnitude = BigInt(whole) * LEAVE_UNITS_FACTOR + BigInt(fraction.padEnd(6, '0'))
	return negative ? -magnitude : magnitude
}

/** Format integer millionths as a canonical decimal and reject storage overflow. */
export function formatLeaveUnits(value: bigint): LeaveUnits {
	const magnitude = value < 0n ? -value : value
	if (magnitude > LEAVE_UNITS_MAX_SCALED) invalidField('units', 'overflow')
	const whole = magnitude / LEAVE_UNITS_FACTOR
	const fraction = (magnitude % LEAVE_UNITS_FACTOR).toString().padStart(6, '0').replace(/0+$/, '')
	return `${value < 0n ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}
