import { expect, it } from 'vitest'
import { readLeaveRequestDraft, readLeaveRequestDay } from './requests'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'

/** Supply explicit request fields, preserving ordinary narrative whitespace. */
function draft() {
	return {
		employmentId: 'employment',
		enrollmentId: 'enrollment',
		days: [{ workDate: '2026-10-05', portion: 'Full' }],
		reason: '  family event\n',
		evidenceIds: [],
	}
}
it('locates missing and unknown fields inside their exact request row', /** Accessible server feedback must identify the nested field rather than an unrelated top-level input. */ () => {
	for (const [day, field] of [
		[{ portion: 'Full' }, 'days.0.workDate'],
		[{ workDate: '2026-10-05', portion: 'Full', unknown: true }, 'days.0.unknown'],
		[
			{
				workDate: '2026-10-05',
				portion: 'Hourly',
				startTime: '09:00',
				endTime: '10:00',
				startDayOffset: 0,
				endDayOffset: 0,
				offset: { unknown: '+00:00' },
			},
			'days.0.offset.unknown',
		],
	] as const) {
		try {
			readLeaveRequestDraft({ ...draft(), days: [day] })
			throw new Error('Invalid nested field was accepted')
		} catch (error) {
			expect(error).toBeInstanceOf(HcmDomainError)
			expect((error as HcmDomainError).fieldErrors).toEqual(
				expect.arrayContaining([expect.objectContaining({ field })]),
			)
		}
	}
})
it('preserves request text and admits only explicit portion fields', /** Client inputs cannot carry tenant, state, units or another account into the source command. */ () => {
	expect(readLeaveRequestDraft(draft())).toEqual(draft())
	for (const field of ['tenantId', 'state', 'totalUnits', 'accountId', 'actorAccountId'])
		expect(
			/** Reject every caller authority or calculation override. */ () =>
				readLeaveRequestDraft({ ...draft(), [field]: 'override' }),
		).toThrow()
	for (const portion of ['Full', 'FirstHalf', 'SecondHalf']) {
		expect(readLeaveRequestDay({ workDate: '2026-10-05', portion })).toEqual({
			workDate: '2026-10-05',
			portion,
		})
		for (const field of ['startTime', 'endTime', 'startDayOffset', 'endDayOffset', 'offset'])
			expect(
				/** A nonhourly row cannot smuggle in an explicit time window. */ () =>
					readLeaveRequestDay({ workDate: '2026-10-05', portion, [field]: 0 }),
			).toThrow()
	}
})
it('requires bounded exact hourly endpoints without guessing day rollover', /** Overnight and repeated-hour rows retain all supplied wall-time evidence. */ () => {
	const day = {
		workDate: '2026-11-01',
		portion: 'Hourly',
		startTime: '01:45:00.125',
		endTime: '01:15:00.375',
		startDayOffset: 0,
		endDayOffset: 0,
		offset: { start: '-04:00', end: '-05:00' },
	}
	expect(readLeaveRequestDay(day)).toEqual(day)
	for (const field of ['startTime', 'endTime', 'startDayOffset', 'endDayOffset']) {
		const incomplete: Record<string, unknown> = { ...day }
		delete incomplete[field]
		expect(
			/** Missing endpoint facts never receive an implicit midnight or day offset. */ () =>
				readLeaveRequestDay(incomplete),
		).toThrow()
	}
	for (const change of [
		{ startTime: '24:00' },
		{ endTime: '12:00:00.0001' },
		{ endDayOffset: 2 },
		{ startDayOffset: 1, endDayOffset: 0 },
		{ offset: {} },
		{ offset: { start: 'America/New_York' } },
		{ offset: { start: '+24:00' } },
	])
		expect(
			/** Reject unsupported time, offset and day-range forms. */ () =>
				readLeaveRequestDay({ ...day, ...change }),
		).toThrow()
})
it('bounds dates and reason while rejecting duplicate evidence', /** Exact limits are shared with API parsing and native form validation. */ () => {
	expect(readLeaveRequestDraft({ ...draft(), reason: 'r'.repeat(2000) }).reason).toHaveLength(2000)
	for (const reason of ['', '  ', 'r'.repeat(2001), 42])
		expect(
			/** Narrative must remain nonblank bounded text. */ () =>
				readLeaveRequestDraft({ ...draft(), reason }),
		).toThrow()
	for (const days of [
		[],
		[...draft().days, ...draft().days],
		[{ workDate: '2026-02-30', portion: 'Full' }],
		[
			{ workDate: '2026-01-01', portion: 'Full' },
			{ workDate: '2027-01-02', portion: 'Full' },
		],
	])
		expect(
			/** Reject invalid, duplicate or unbounded local-date collections. */ () =>
				readLeaveRequestDraft({ ...draft(), days }),
		).toThrow()
	expect(
		/** A document cannot appear twice under the same request. */ () =>
			readLeaveRequestDraft({ ...draft(), evidenceIds: ['document', 'document'] }),
	).toThrow()
})
