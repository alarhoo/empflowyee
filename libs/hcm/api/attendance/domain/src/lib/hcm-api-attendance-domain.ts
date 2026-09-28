import { Temporal } from '@js-temporal/polyfill'
import { dateValue, invalidField } from '@empflowyee/hcm-runtime-contract'
import {
	attendanceZone,
	wallMilliseconds,
	validateScheduleSegments,
	type OverlapChoice,
	type ScheduleSegment,
	type ResolvedScheduleSegment,
	type ExactInterval,
} from '@empflowyee/hcm-attendance-contract'

export class AttendanceTimeError extends Error {
	/** Report an explicit resolution outcome without silently shifting an invalid or ambiguous wall time. */
	constructor(readonly code: 'DstGap' | 'DstOverlap' | 'InvalidOffset' | 'InvalidInterval') {
		super(code)
	}
}
export interface ResolvedWallTime {
	instant: string
	epochMilliseconds: number
	offset: string
}

/** Resolve a real IANA wall time, rejecting gaps and requiring an explicit occurrence when the clock repeats. */
export function resolveWallTime(
	date: string,
	time: string,
	zone: string,
	choice?: OverlapChoice,
	expectedOffset?: string,
): ResolvedWallTime {
	dateValue(date, 'date')
	wallMilliseconds(time)
	attendanceZone(zone)
	if (choice !== undefined && choice !== 'Earlier' && choice !== 'Later')
		invalidField('overlapOffset')
	const wall = Temporal.PlainDateTime.from(`${date}T${time}`, { overflow: 'reject' })
	const earlier = wall.toZonedDateTime(zone, { disambiguation: 'earlier' })
	const later = wall.toZonedDateTime(zone, { disambiguation: 'later' })
	if (!earlier.toPlainDateTime().equals(wall) || !later.toPlainDateTime().equals(wall))
		throw new AttendanceTimeError('DstGap')
	if (earlier.epochNanoseconds !== later.epochNanoseconds && !choice)
		throw new AttendanceTimeError('DstOverlap')
	const selected = choice === 'Later' ? later : earlier
	if (expectedOffset !== undefined && expectedOffset !== selected.offset)
		throw new AttendanceTimeError('InvalidOffset')
	return {
		instant: selected.toInstant().toString({ smallestUnit: 'millisecond' }),
		epochMilliseconds: selected.epochMilliseconds,
		offset: selected.offset,
	}
}

/** Resolve one contiguous configured shift onto its start work date, preserving both endpoint offsets and exact elapsed time. */
export function resolveScheduleSegments(
	workDate: string,
	zone: string,
	segments: readonly ScheduleSegment[],
): ResolvedScheduleSegment[] {
	dateValue(workDate, 'workDate')
	attendanceZone(zone)
	validateScheduleSegments(segments)
	const day = Temporal.PlainDate.from(workDate)
	const result: ResolvedScheduleSegment[] = []
	let startDayOffset = 0
	for (const segment of segments) {
		const start = resolveWallTime(
			day.add({ days: startDayOffset }).toString(),
			segment.startTime,
			zone,
			segment.overlapOffset?.start,
		)
		const end = resolveWallTime(
			day.add({ days: segment.endDayOffset }).toString(),
			segment.endTime,
			zone,
			segment.overlapOffset?.end,
		)
		if (
			end.epochMilliseconds <= start.epochMilliseconds ||
			(result.length && result.at(-1)?.endMilliseconds !== start.epochMilliseconds)
		)
			throw new AttendanceTimeError('InvalidInterval')
		result.push({
			kind: segment.kind,
			startMilliseconds: start.epochMilliseconds,
			endMilliseconds: end.epochMilliseconds,
			startInstant: start.instant,
			endInstant: end.instant,
			startOffset: start.offset,
			endOffset: end.offset,
			elapsedMilliseconds: String(BigInt(end.epochMilliseconds) - BigInt(start.epochMilliseconds)),
		})
		startDayOffset = segment.endDayOffset
	}
	return result
}

/** Reject malformed intervals before union/subtraction so no invalid or overflowed duration becomes evidence. */
function interval(value: ExactInterval): ExactInterval {
	if (
		!Number.isSafeInteger(value.startMilliseconds) ||
		!Number.isSafeInteger(value.endMilliseconds) ||
		value.endMilliseconds <= value.startMilliseconds
	)
		throw new AttendanceTimeError('InvalidInterval')
	return { ...value }
}

/** Union half-open intervals once; overlapping exclusions cannot subtract the same millisecond twice. */
export function unionIntervals(values: readonly ExactInterval[]): ExactInterval[] {
	const ordered = values
		.map(interval)
		.sort(
			/** Use deterministic instant order without mutating the caller's evidence. */ (
				left,
				right,
			) =>
				left.startMilliseconds - right.startMilliseconds ||
				left.endMilliseconds - right.endMilliseconds,
		)
	const result: ExactInterval[] = []
	for (const value of ordered) {
		const last = result.at(-1)
		if (last && value.startMilliseconds <= last.endMilliseconds)
			last.endMilliseconds = Math.max(last.endMilliseconds, value.endMilliseconds)
		else result.push(value)
	}
	return result
}

/** Subtract configured break or approved absence expectations from intervals without converting absence into worked time. */
export function subtractIntervals(
	values: readonly ExactInterval[],
	exclusions: readonly ExactInterval[],
): ExactInterval[] {
	const excluded = unionIntervals(exclusions)
	const result: ExactInterval[] = []
	for (const value of unionIntervals(values)) {
		let cursor = value.startMilliseconds
		for (const cut of excluded) {
			if (cut.endMilliseconds <= cursor || cut.startMilliseconds >= value.endMilliseconds) continue
			if (cut.startMilliseconds > cursor)
				result.push({
					startMilliseconds: cursor,
					endMilliseconds: Math.min(cut.startMilliseconds, value.endMilliseconds),
				})
			cursor = Math.min(value.endMilliseconds, Math.max(cursor, cut.endMilliseconds))
			if (cursor >= value.endMilliseconds) break
		}
		if (cursor < value.endMilliseconds)
			result.push({ startMilliseconds: cursor, endMilliseconds: value.endMilliseconds })
	}
	return result
}

/** Preserve exact decimal-string elapsed milliseconds rather than rounding individual segments or totals to minutes. */
export function elapsedMilliseconds(values: readonly ExactInterval[]): string {
	return unionIntervals(values)
		.reduce(
			/** Sum exact differences after overlap normalization. */ (total, value) =>
				total + BigInt(value.endMilliseconds) - BigInt(value.startMilliseconds),
			0n,
		)
		.toString()
}

export type MinimumRestResult =
	{ state: 'Disabled' } | { state: 'Satisfied' | 'Warn' | 'Block'; elapsedMilliseconds: string }

/** Evaluate only explicitly configured minimum rest, using instants across midnight and DST with no universal fallback. */
export function minimumRest(
	previousEnd: number,
	nextStart: number,
	minutes: number | null,
	mode?: 'Warn' | 'Block',
): MinimumRestResult {
	if (minutes === null) return { state: 'Disabled' }
	if (
		!Number.isSafeInteger(minutes) ||
		minutes < 0 ||
		!Number.isSafeInteger(previousEnd) ||
		!Number.isSafeInteger(nextStart) ||
		(mode !== 'Warn' && mode !== 'Block')
	)
		invalidField('minimumRest')
	const elapsed = BigInt(nextStart) - BigInt(previousEnd)
	return {
		state: elapsed >= BigInt(minutes) * 60000n ? 'Satisfied' : mode,
		elapsedMilliseconds: elapsed.toString(),
	}
}
