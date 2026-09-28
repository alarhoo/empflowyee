import { Temporal } from '@js-temporal/polyfill'
import { dateValue } from '@empflowyee/hcm-runtime-contract'
import type { ExactInterval, HolidayEntry } from '@empflowyee/hcm-attendance-contract'
import { resolveWallTime, AttendanceTimeError } from './hcm-api-attendance-domain'

/** Safe source references for a calendar entry already selected from published tenant configuration. */
export interface PublishedHoliday extends HolidayEntry {
	id: string
	versionId: string
}
export interface ResolvedHoliday extends ExactInterval {
	holidayId: string
	versionId: string
	category: HolidayEntry['category']
	priority: number
}
export class HolidayCollisionError extends Error {
	/** Return only colliding source IDs to the authorized preview, never silently break a policy tie. */
	constructor(readonly holidayIds: readonly string[]) {
		super('HolidayPriorityCollision')
	}
}

/** Resolve matching explicit observed dates and split their exact intervals by greatest priority. */
export function resolveHolidays(
	observedDate: string,
	zone: string,
	scope: { regionCode: string | null; locationId: string | null },
	entries: readonly PublishedHoliday[],
): ResolvedHoliday[] {
	dateValue(observedDate, 'observedDate')
	const intervals: ResolvedHoliday[] = []
	for (const entry of entries) {
		if (
			entry.observedDate !== observedDate ||
			(entry.regionCode !== undefined && entry.regionCode !== scope.regionCode) ||
			(entry.locationId !== undefined && entry.locationId !== scope.locationId)
		)
			continue
		const fullDay = entry.startTime === undefined && entry.endTime === undefined
		const nextDate = Temporal.PlainDate.from(observedDate).add({ days: 1 }).toString()
		const start = resolveWallTime(
			observedDate,
			entry.startTime ?? '00:00',
			zone,
			entry.overlapOffset?.start,
		)
		const end = resolveWallTime(
			fullDay ? nextDate : observedDate,
			entry.endTime ?? '00:00',
			zone,
			entry.overlapOffset?.end,
		)
		if (end.epochMilliseconds <= start.epochMilliseconds)
			throw new AttendanceTimeError('InvalidInterval')
		intervals.push({
			startMilliseconds: start.epochMilliseconds,
			endMilliseconds: end.epochMilliseconds,
			holidayId: entry.id,
			versionId: entry.versionId,
			category: entry.category,
			priority: entry.priority,
		})
	}
	for (let i = 0; i < intervals.length; i++) {
		for (let j = i + 1; j < intervals.length; j++) {
			const left = intervals[i],
				right = intervals[j]
			if (
				left.priority === right.priority &&
				left.startMilliseconds < right.endMilliseconds &&
				right.startMilliseconds < left.endMilliseconds
			)
				throw new HolidayCollisionError([left.holidayId, right.holidayId])
		}
	}
	const boundaries = [
		...new Set(
			intervals.flatMap(
				/** Every source endpoint can change the winning policy. */ (item) => [
					item.startMilliseconds,
					item.endMilliseconds,
				],
			),
		),
	].sort(/** Instant order remains numeric for dates before or after the epoch. */ (a, b) => a - b)
	const result: ResolvedHoliday[] = []
	for (let index = 0; index + 1 < boundaries.length; index++) {
		const startMilliseconds = boundaries[index],
			endMilliseconds = boundaries[index + 1]
		let winner: ResolvedHoliday | undefined
		for (const entry of intervals) {
			if (
				entry.startMilliseconds <= startMilliseconds &&
				entry.endMilliseconds >= endMilliseconds &&
				(!winner || entry.priority > winner.priority)
			)
				winner = entry
		}
		if (!winner) continue
		const previous = result.at(-1)
		if (
			previous?.holidayId === winner.holidayId &&
			previous.versionId === winner.versionId &&
			previous.endMilliseconds === startMilliseconds
		)
			previous.endMilliseconds = endMilliseconds
		else result.push({ ...winner, startMilliseconds, endMilliseconds })
	}
	return result
}
