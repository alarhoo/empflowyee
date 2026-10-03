import { describe, expect, it } from 'vitest'
import type { WorkdayView, WorkdaySegmentView } from '@empflowyee/hcm-attendance-contract'
import { calculateLeaveDayQuantity } from './day-quantity'
import { sumLeaveUnits } from './hcm-api-leave-domain'

const rule = {
	unit: 'Day',
	rounding: { scale: 6, mode: 'Nearest' },
	allowHourly: true,
	hourlyIncrementMinutes: 30,
} as const
/** Construct precise source segments for independent arithmetic examples; production reads the Attendance owner port. */
function segment(
	kind: WorkdaySegmentView['kind'],
	startInstant: string,
	endInstant: string,
): WorkdaySegmentView {
	return {
		kind,
		startInstant,
		endInstant,
		startLocal: startInstant,
		endLocal: endInstant,
		startOffsetSeconds: 0,
		endOffsetSeconds: 0,
		elapsedMilliseconds: String(Date.parse(endInstant) - Date.parse(startInstant)),
		holidayId: null,
		holidayName: null,
	}
}
/** Build a published start-date-owned source with an eight-hour denominator, one unpaid lunch and a two-hour afternoon holiday. */
function day(): Extract<WorkdayView, { state: 'Published' }> {
	return {
		state: 'Published',
		employmentId: 'employment',
		workDate: '2026-10-05',
		id: 'workday',
		revision: 1,
		digest: 'a'.repeat(64),
		kind: 'Work',
		zone: 'UTC',
		resolvedAt: '2026-10-01T00:00:00Z',
		scheduledMilliseconds: '28800000',
		breakMilliseconds: '3600000',
		elapsedMilliseconds: '21600000',
		supersedesId: null,
		sourceVersions: [],
		datedSources: [],
		rest: null,
		segments: [
			segment('Work', '2026-10-05T09:00:00Z', '2026-10-05T12:00:00Z'),
			segment('UnpaidBreak', '2026-10-05T12:00:00Z', '2026-10-05T13:00:00Z'),
			segment('Work', '2026-10-05T13:00:00Z', '2026-10-05T18:00:00Z'),
			segment('Holiday', '2026-10-05T15:00:00Z', '2026-10-05T17:00:00Z'),
			segment('ExpectedWork', '2026-10-05T09:00:00Z', '2026-10-05T12:00:00Z'),
			segment('ExpectedWork', '2026-10-05T13:00:00Z', '2026-10-05T15:00:00Z'),
			segment('ExpectedWork', '2026-10-05T17:00:00Z', '2026-10-05T18:00:00Z'),
		],
	}
}

describe('published Leave day quantities', /** Prove exact overlap independently of persistence or UI defaults. */ () => {
	it('excludes lunch and a partial holiday without changing the scheduled denominator', /** Six chargeable hours out of eight scheduled hours are three quarters of a day. */ () => {
		expect(calculateLeaveDayQuantity(day(), { portion: 'Full' }, rule)).toMatchObject({
			state: 'Available',
			units: '0.75',
			scheduledMilliseconds: '28800000',
			requestedMilliseconds: '21600000',
		})
		expect(
			calculateLeaveDayQuantity(day(), { portion: 'Full' }, { ...rule, unit: 'Hour' }),
		).toMatchObject({ units: '6' })
	})
	it('clips hourly requests to work and applies increments to chargeable time', /** A noon-spanning request consumes work on either side of lunch, never the break itself. */ () => {
		const result = calculateLeaveDayQuantity(
			day(),
			{
				portion: 'Hourly',
				startInstant: '2026-10-05T11:30:00Z',
				endInstant: '2026-10-05T13:30:00Z',
			},
			rule,
		)
		expect(result).toEqual({
			state: 'Available',
			units: '0.125',
			scheduledMilliseconds: '28800000',
			requestedMilliseconds: '3600000',
			intervals: [
				{ startInstant: '2026-10-05T11:30:00.000Z', endInstant: '2026-10-05T12:00:00.000Z' },
				{ startInstant: '2026-10-05T13:00:00.000Z', endInstant: '2026-10-05T13:30:00.000Z' },
			],
		})
	})
	it('retains start-date ownership across local midnight and DST', /** A fallback overnight shift has nine elapsed hours, with both repeated hours consumed distinctly. */ () => {
		const source = {
			...day(),
			workDate: '2026-10-31',
			zone: 'America/New_York',
			scheduledMilliseconds: '32400000',
			elapsedMilliseconds: '32400000',
			segments: [
				segment('Work', '2026-11-01T02:00:00Z', '2026-11-01T11:00:00Z'),
				segment('ExpectedWork', '2026-11-01T02:00:00Z', '2026-11-01T11:00:00Z'),
			],
		}
		expect(calculateLeaveDayQuantity(source, { portion: 'Full' }, rule)).toMatchObject({
			units: '1',
			requestedMilliseconds: '32400000',
		})
		expect(
			calculateLeaveDayQuantity(
				source,
				{
					portion: 'Hourly',
					startInstant: '2026-11-01T01:00:00-04:00',
					endInstant: '2026-11-01T02:00:00-05:00',
				},
				{ ...rule, unit: 'Hour' },
			),
		).toMatchObject({ units: '2' })
		expect(source.workDate).toBe('2026-10-31')
	})
	it('uses exact fractional seconds and rounds each row once', /** Three separately rounded one-third days retain the six-decimal sum rather than rounding the combined ratio. */ () => {
		const source = {
			...day(),
			scheduledMilliseconds: '900',
			elapsedMilliseconds: '300',
			segments: [
				segment('Work', '2026-10-05T09:00:00.000Z', '2026-10-05T09:00:00.900Z'),
				segment('ExpectedWork', '2026-10-05T09:00:00.000Z', '2026-10-05T09:00:00.300Z'),
			],
		}
		const result = calculateLeaveDayQuantity(source, { portion: 'Full' }, rule)
		expect(result).toMatchObject({ units: '0.333333', requestedMilliseconds: '300' })
		if (result.state !== 'Available') throw new Error('Expected valid exact duration')
		expect(sumLeaveUnits([result.units, result.units, result.units])).toBe('0.999999')
	})
	it('distinguishes real nonworking dates from unavailable projections', /** A rest day is zero, but a failed resolver cannot be replaced by a standard day or zero. */ () => {
		for (const kind of ['Rest', 'Holiday', 'NonWorkingOverride'] as const)
			expect(
				calculateLeaveDayQuantity(
					{ ...day(), kind, scheduledMilliseconds: '0', elapsedMilliseconds: '0', segments: [] },
					{ portion: 'Full' },
					rule,
				),
			).toMatchObject({ state: 'Available', units: '0', intervals: [] })
		expect(
			calculateLeaveDayQuantity(
				{
					state: 'Unavailable',
					employmentId: 'employment',
					workDate: '2026-10-05',
					unavailableCode: 'SourceChanged',
				},
				{ portion: 'Full' },
				rule,
			),
		).toEqual({ state: 'Unavailable', reason: 'WorkdayUnavailable' })
	})
	it('counts neither an unpaid break nor an adjacent endpoint', /** Half-open interval boundaries cannot create a fractional charge. */ () => {
		for (const [startInstant, endInstant] of [
			['2026-10-05T12:00:00Z', '2026-10-05T13:00:00Z'],
			['2026-10-05T18:00:00Z', '2026-10-05T19:00:00Z'],
		])
			expect(
				calculateLeaveDayQuantity(day(), { portion: 'Hourly', startInstant, endInstant }, rule),
			).toMatchObject({ units: '0', requestedMilliseconds: '0', intervals: [] })
	})
	it('denies unsupported hourly choices and incomplete configuration', /** No implicit increment or permissive range can be manufactured by a caller. */ () => {
		const request = {
			portion: 'Hourly',
			startInstant: '2026-10-05T09:00:00Z',
			endInstant: '2026-10-05T09:15:00Z',
		} as const
		expect(
			/** Fifteen chargeable minutes violate the explicit half-hour increment. */ () =>
				calculateLeaveDayQuantity(day(), request, rule),
		).toThrow()
		expect(
			/** Disabled hourly policy is authoritative. */ () =>
				calculateLeaveDayQuantity(day(), request, { ...rule, allowHourly: false }),
		).toThrow()
		expect(
			calculateLeaveDayQuantity(day(), request, { ...rule, hourlyIncrementMinutes: undefined }),
		).toEqual({ state: 'Unavailable', reason: 'IncompleteHourlyRule' })
		expect(
			/** Zero-length intervals are not hourly requests. */ () =>
				calculateLeaveDayQuantity(day(), { ...request, endInstant: request.startInstant }, rule),
		).toThrow()
		expect(
			/** Sub-millisecond input cannot be rounded into a valid source interval. */ () =>
				calculateLeaveDayQuantity(
					day(),
					{ ...request, startInstant: '2026-10-05T09:00:00.0001Z' },
					rule,
				),
		).toThrow()
	})
	it('refuses overlapping or contradictory owner evidence', /** Inconsistent projection data cannot inflate a denominator or charge work outside the schedule. */ () => {
		const source = day()
		for (const corrupt of [
			{ ...source, scheduledMilliseconds: '1' },
			{ ...source, segments: [...source.segments, source.segments[0]] },
			{
				...source,
				segments: [
					...source.segments,
					segment('ExpectedWork', '2026-10-05T12:00:00Z', '2026-10-05T13:00:00Z'),
				],
			},
			{ ...source, kind: 'Rest' as const },
		])
			expect(calculateLeaveDayQuantity(corrupt, { portion: 'Full' }, rule)).toEqual({
				state: 'Unavailable',
				reason: 'InvalidWorkday',
			})
	})
})
