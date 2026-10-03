import { expect, it } from 'vitest'
import { parseAttendanceOverrideDraft } from './overrides'

/** Supply explicit valid source inputs without runtime defaults. */
function draft() {
	return {
		employmentId: 'employment-1',
		workDate: '2027-02-03',
		workdayRevision: 1,
		segments: [],
		zone: 'America/New_York',
		reason: 'Planned nonworking override',
		evidenceIds: [],
	}
}
it('distinguishes an explicit nonworking date from missing interval configuration', /** Empty is meaningful only when explicitly supplied. */ () => {
	expect(parseAttendanceOverrideDraft(draft()).segments).toEqual([])
	expect(
		/** Exercise the authoritative rejection path. */ () =>
			parseAttendanceOverrideDraft({ ...draft(), segments: undefined }),
	).toThrow()
})
it('rejects state injection, invalid source references and malformed local time', /** The client cannot choose approval or bypass exact shared interval validation. */ () => {
	for (const value of [
		{ ...draft(), state: 'Approved' },
		{ ...draft(), zone: '+05:30' },
		{ ...draft(), workdayRevision: 0 },
		{ ...draft(), workDate: '2027-02-30' },
		{ ...draft(), reason: ' ' },
		{ ...draft(), reason: 'x'.repeat(2001) },
		{ ...draft(), evidenceIds: ['evidence-1', 'evidence-1'] },
		{
			...draft(),
			segments: [{ startTime: '24:00', endTime: '01:00', endDayOffset: 1, kind: 'Work' }],
		},
	])
		expect(
			/** Exercise the authoritative rejection path. */ () => parseAttendanceOverrideDraft(value),
		).toThrow()
})
it('preserves cross-midnight milliseconds and endpoint overlap choices', /** No rounding or guessed timezone offset is permitted. */ () => {
	const segment = {
		startTime: '23:00:00.125',
		endTime: '02:30:00.375',
		endDayOffset: 1,
		kind: 'Work',
		overlapOffset: { end: 'Later' },
	}
	expect(parseAttendanceOverrideDraft({ ...draft(), segments: [segment] }).segments).toEqual([
		segment,
	])
})
