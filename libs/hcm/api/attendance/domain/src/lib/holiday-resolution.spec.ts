import { expect, it } from 'vitest'
import { resolveHolidays, type PublishedHoliday } from './holiday-resolution'

/** Provide a published test source with an observed date independent of its actual date. */
function holiday(id: string, patch: Partial<PublishedHoliday> = {}): PublishedHoliday {
	return {
		id,
		versionId: 'calendar-v1',
		name: id,
		category: 'Company',
		date: '2026-01-01',
		observedDate: '2026-03-08',
		priority: 1,
		...patch,
	}
}
const scope = { regionCode: 'REGION', locationId: 'location-one' }

it('splits a DST-shortened full day around higher-priority partial intervals without double counting', /** Day length comes from actual instants; a lower-priority holiday resumes after an override ends. */ () => {
	const result = resolveHolidays('2026-03-08', 'America/New_York', scope, [
		holiday('full'),
		holiday('partial', { priority: 2, startTime: '03:00', endTime: '04:00' }),
	])
	expect(
		result.map(
			/** Inspect selected source ownership across interval boundaries. */ (item) => item.holidayId,
		),
	).toEqual(['full', 'partial', 'full'])
	expect(
		result.reduce(
			/** Each disjoint result contributes its exact elapsed duration once. */ (total, item) =>
				total + item.endMilliseconds - item.startMilliseconds,
			0,
		),
	).toBe(23 * 3600000)
	expect(result[1].endMilliseconds - result[1].startMilliseconds).toBe(3600000)
})

it('rejects matching equal-priority overlap even when another entry would win', /** Ties cannot be hidden by insertion order or by a covering high-priority holiday. */ () => {
	const entries = [
		holiday('first'),
		holiday('second', { startTime: '12:00', endTime: '13:00' }),
		holiday('highest', { priority: 3 }),
	]
	expect(
		/** A publication preview must surface the two conflicting lower-priority sources. */ () =>
			resolveHolidays('2026-03-08', 'UTC', scope, entries),
	).toThrow('HolidayPriorityCollision')
	const adjacent = [
		holiday('morning', { startTime: '09:00', endTime: '12:00' }),
		holiday('afternoon', { startTime: '12:00', endTime: '13:00' }),
	]
	expect(resolveHolidays('2026-03-08', 'UTC', scope, adjacent)).toHaveLength(2)
})

it('matches all explicit scope selectors and observed date only', /** Regional and location selectors intersect, and an actual date does not create another holiday. */ () => {
	const entries = [
		holiday('matched', { regionCode: 'REGION', locationId: 'location-one' }),
		holiday('other-region', { regionCode: 'OTHER' }),
		holiday('other-location', { locationId: 'location-two' }),
		holiday('other-date', { observedDate: '2026-03-09' }),
	]
	expect(
		resolveHolidays('2026-03-08', 'UTC', scope, entries).map(
			/** Verify filtering before priority evaluation. */ (item) => item.holidayId,
		),
	).toEqual(['matched'])
	expect(resolveHolidays('2026-01-01', 'UTC', scope, entries)).toEqual([])
	expect(
		resolveHolidays('2026-03-08', 'UTC', { regionCode: null, locationId: null }, [entries[0]]),
	).toEqual([])
})

it('rejects gaps and unresolved overlaps in partial holiday endpoints', /** A holiday does not get a privileged silent DST normalization path. */ () => {
	expect(
		/** A nonexistent local interval must remain a preview conflict. */ () =>
			resolveHolidays('2026-03-08', 'America/New_York', scope, [
				holiday('gap', { startTime: '02:30', endTime: '04:00' }),
			]),
	).toThrow('DstGap')
	const repeated = holiday('fold', {
		observedDate: '2026-11-01',
		startTime: '01:00',
		endTime: '01:30',
	})
	expect(
		/** Both endpoint occurrences must be explicit when ambiguous. */ () =>
			resolveHolidays('2026-11-01', 'America/New_York', scope, [repeated]),
	).toThrow('DstOverlap')
	const result = resolveHolidays('2026-11-01', 'America/New_York', scope, [
		{ ...repeated, overlapOffset: { start: 'Earlier', end: 'Later' } },
	])
	expect(result[0].endMilliseconds - result[0].startMilliseconds).toBe(90 * 60000)
})
