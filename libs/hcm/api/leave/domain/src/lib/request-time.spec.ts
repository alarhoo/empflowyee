import { expect, it } from 'vitest'
import type { LeaveRequestDayInput } from '@empflowyee/hcm-leave-contract'
import { resolveLeaveRequestPortion } from './request-time'

/** Specify both day offsets so the test never relies on machine date or timezone. */
function hour(workDate = '2026-10-05'): Extract<LeaveRequestDayInput, { portion: 'Hourly' }> {
	return {
		workDate,
		portion: 'Hourly',
		startTime: '09:00',
		endTime: '10:00',
		startDayOffset: 0,
		endDayOffset: 0,
	}
}
it('resolves ordinary and after-midnight windows in the published zone', /** Explicit ownership survives a civil-date rollover and fractional seconds. */ () => {
	expect(resolveLeaveRequestPortion(hour(), 'Asia/Kolkata')).toEqual({
		state: 'Available',
		request: {
			portion: 'Hourly',
			startInstant: '2026-10-05T03:30:00.000Z',
			endInstant: '2026-10-05T04:30:00.000Z',
		},
	})
	expect(
		resolveLeaveRequestPortion(
			{
				...hour(),
				startDayOffset: 1,
				endDayOffset: 1,
				startTime: '00:30:00.125',
				endTime: '01:30:00.375',
			},
			'UTC',
		),
	).toEqual({
		state: 'Available',
		request: {
			portion: 'Hourly',
			startInstant: '2026-10-06T00:30:00.125Z',
			endInstant: '2026-10-06T01:30:00.375Z',
		},
	})
})
it('requires independent matching offsets for repeated endpoints', /** A decreasing wall clock can still describe a positive elapsed interval in the fallback hour. */ () => {
	const repeated = { ...hour('2026-11-01'), startTime: '01:45', endTime: '01:15' }
	expect(
		/** Neither repeated endpoint may silently choose the first occurrence. */ () =>
			resolveLeaveRequestPortion(repeated, 'America/New_York'),
	).toThrow()
	expect(
		/** Supplying only one repeated endpoint leaves the other unresolved. */ () =>
			resolveLeaveRequestPortion({ ...repeated, offset: { start: '-04:00' } }, 'America/New_York'),
	).toThrow()
	expect(
		resolveLeaveRequestPortion(
			{ ...repeated, offset: { start: '-04:00', end: '-05:00' } },
			'America/New_York',
		),
	).toEqual({
		state: 'Available',
		request: {
			portion: 'Hourly',
			startInstant: '2026-11-01T05:45:00.000Z',
			endInstant: '2026-11-01T06:15:00.000Z',
		},
	})
})
it('rejects gaps, mismatched offsets and nonpositive real windows', /** Neither a DST adjustment nor implicit next-day rollover can repair an invalid request. */ () => {
	for (const day of [
		{ ...hour('2026-03-08'), startTime: '02:15', endTime: '03:15' },
		{ ...hour(), offset: { start: '-05:00' } },
		{ ...hour(), startTime: '11:00', endTime: '10:00' },
		{ ...hour(), endTime: '09:00' },
	])
		expect(
			/** Fail closed for each impossible or contradictory endpoint. */ () =>
				resolveLeaveRequestPortion(day, 'America/New_York'),
		).toThrow()
})
it('compares numeric offsets including optional zero seconds', /** Equivalent wire representations must select the same real occurrence. */ () => {
	expect(
		resolveLeaveRequestPortion(
			{ ...hour(), offset: { start: '+05:30:00', end: '+05:30' } },
			'Asia/Kolkata',
		),
	).toEqual(resolveLeaveRequestPortion(hour(), 'Asia/Kolkata'))
})
it('does not resolve the pending half-day rounding decision by default', /** Structurally valid halves remain unavailable until authoritative behavior is selected. */ () => {
	expect(resolveLeaveRequestPortion({ workDate: '2026-10-05', portion: 'Full' }, 'UTC')).toEqual({
		state: 'Available',
		request: { portion: 'Full' },
	})
	for (const portion of ['FirstHalf', 'SecondHalf'] as const)
		expect(resolveLeaveRequestPortion({ workDate: '2026-10-05', portion }, 'UTC')).toEqual({
			state: 'Unavailable',
			reason: 'HalfDayDecisionPending',
		})
})
