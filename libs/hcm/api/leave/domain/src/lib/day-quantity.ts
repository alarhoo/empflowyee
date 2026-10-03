import { Temporal } from '@js-temporal/polyfill'
import type { WorkdayView, WorkdayQuantityBasis } from '@empflowyee/hcm-attendance-contract'
import type { LeavePolicyDraft, LeaveUnits } from '@empflowyee/hcm-leave-contract'
import { invalidField } from '@empflowyee/hcm-runtime-contract'
import { roundLeaveRatio } from './hcm-api-leave-domain'

/** An hourly window has already passed the owner's local-time/offset resolution; this calculator never guesses a DST instant. */
export type LeaveResolvedPortion =
	{ portion: 'Full' } | { portion: 'Hourly'; startInstant: string; endInstant: string }
export type LeaveDayQuantity =
	| {
		state: 'Available'
		units: LeaveUnits
		scheduledMilliseconds: string
		requestedMilliseconds: string
		intervals: { startInstant: string; endInstant: string }[]
	}
	| {
		state: 'Unavailable'
		reason: 'WorkdayUnavailable' | 'IncompleteHourlyRule' | 'InvalidWorkday'
	}
type Rule = Pick<LeavePolicyDraft, 'unit' | 'rounding' | 'allowHourly' | 'hourlyIncrementMinutes'>
interface Interval {
	start: bigint
	end: bigint
}

/** Require exact millisecond instants, retaining integer arithmetic across DST and local midnight. */
function instant(value: string, field: string): bigint {
	try {
		const nanos = Temporal.Instant.from(value).epochNanoseconds
		if (nanos % 1_000_000n !== 0n) invalidField(field)
		return nanos / 1_000_000n
	} catch {
		return invalidField(field)
	}
}
/** Sum disjoint half-open intervals without counting gaps, breaks or holidays as work. */
function duration(intervals: readonly Interval[]): bigint {
	return intervals.reduce(
		/** Accumulate exact elapsed milliseconds. */ (total, interval) =>
			total + interval.end - interval.start,
		0n,
	)
}
/** Read one authoritative interval kind and reject reversed, overlapping or inconsistent source evidence. */
function intervals(day: WorkdayQuantityBasis, kind: 'Work' | 'ExpectedWork'): Interval[] {
	const result = day.segments
		.filter(/** Select the owner-defined interval set. */ (segment) => segment.kind === kind)
		.map(
			/** Preserve actual UTC duration rather than subtracting local wall clocks. */ (segment) => {
				const start = instant(segment.startInstant, 'workday'),
					end = instant(segment.endInstant, 'workday')
				if (end <= start || (end - start).toString() !== segment.elapsedMilliseconds)
					invalidField('workday')
				return { start, end }
			},
		)
		.sort(
			/** Establish chronological order without lossy bigint conversion. */ (left, right) => {
				if (left.start === right.start) return 0
				return left.start < right.start ? -1 : 1
			},
		)
	for (let index = 1; index < result.length; index++)
		if (result[index].start < result[index - 1].end) invalidField('workday')
	return result
}
/** Intersect one already resolved request window with disjoint expected-work segments. */
function overlap(expected: readonly Interval[], window: Interval): Interval[] {
	return expected
		.map(
			/** Clip each work segment to the request's exact instants. */ (segment) => ({
				start: segment.start > window.start ? segment.start : window.start,
				end: segment.end < window.end ? segment.end : window.end,
			}),
		)
		.filter(/** Adjacent endpoints consume no time. */ (segment) => segment.end > segment.start)
}

/** Calculate a Full or resolved Hourly row from current published Attendance evidence; half-day apportionment is deliberately outside this entry point. */
export function calculateLeaveDayQuantity(
	day: WorkdayView,
	request: LeaveResolvedPortion,
	rule: Rule,
): LeaveDayQuantity {
	if (day.state !== 'Published') return { state: 'Unavailable', reason: 'WorkdayUnavailable' }
	return calculateLeaveDayBasis(day, request, rule)
}

/** Calculate a proposed workday's quantity without inventing a published ID, revision or successful persistence state. */
export function calculateLeaveDayBasis(
	day: WorkdayQuantityBasis,
	request: LeaveResolvedPortion,
	rule: Rule,
): LeaveDayQuantity {
	let window: Interval | undefined
	let increment: bigint | undefined
	if (request.portion === 'Hourly') {
		if (rule.allowHourly !== true) invalidField('portion', 'hourly-disabled')
		const minutes = rule.hourlyIncrementMinutes
		if (minutes === undefined || !Number.isSafeInteger(minutes) || minutes <= 0)
			return { state: 'Unavailable', reason: 'IncompleteHourlyRule' }
		increment = BigInt(minutes) * 60_000n
		window = {
			start: instant(request.startInstant, 'startInstant'),
			end: instant(request.endInstant, 'endInstant'),
		}
		if (window.end <= window.start) invalidField('endInstant', 'invalid-range')
	}
	let scheduled: Interval[], expected: Interval[]
	try {
		scheduled = intervals(day, 'Work')
		expected = intervals(day, 'ExpectedWork')
		if (duration(scheduled).toString() !== day.scheduledMilliseconds) invalidField('workday')
		if (duration(expected).toString() !== day.elapsedMilliseconds) invalidField('workday')
		if (day.kind === 'Work' && scheduled.length === 0) invalidField('workday')
		for (const segment of expected)
			if (duration(overlap(scheduled, segment)) !== segment.end - segment.start)
				invalidField('workday')
		if (day.kind !== 'Work' && expected.length) invalidField('workday')
	} catch {
		return { state: 'Unavailable', reason: 'InvalidWorkday' }
	}
	const selected = window ? overlap(expected, window) : expected
	const requested = duration(selected),
		denominator = duration(scheduled)
	if (increment !== undefined && requested % increment !== 0n)
		invalidField('portion', 'hourly-increment')
	const units =
		requested === 0n
			? '0'
			: roundLeaveRatio(requested, rule.unit === 'Hour' ? 3_600_000n : denominator, rule.rounding)
	return {
		state: 'Available',
		units,
		scheduledMilliseconds: denominator.toString(),
		requestedMilliseconds: requested.toString(),
		intervals: selected.map(
			/** Return precise consumed spans for overlap checking and immutable request-day evidence. */ (
				segment,
			) => ({
				startInstant: Temporal.Instant.fromEpochMilliseconds(Number(segment.start)).toString({
					smallestUnit: 'millisecond',
				}),
				endInstant: Temporal.Instant.fromEpochMilliseconds(Number(segment.end)).toString({
					smallestUnit: 'millisecond',
				}),
			}),
		),
	}
}
