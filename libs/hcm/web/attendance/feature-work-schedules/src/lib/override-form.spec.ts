import { expect, it } from 'vitest'
import { emptyOverrideForm, overrideFromForm } from './override-form'

const basis = { employmentId: 'employment', workDate: '2026-10-05', workdayRevision: 2 }
it('requires explicit replacement choice, timezone and bounded reason', /** Incomplete native form state cannot become a successful API draft. */ () => {
	const initial = emptyOverrideForm('UTC')
	expect(
		/** No replacement is implied by opening the editor. */ () => overrideFromForm(initial, basis),
	).toThrow()
	for (const reason of ['', ' ', 'r'.repeat(2001)])
		expect(
			/** Reject required-text boundary violations before HTTP. */ () =>
				overrideFromForm({ ...initial, kind: 'Rest', reason }, basis),
		).toThrow()
	expect(
		overrideFromForm({ ...initial, kind: 'Rest', reason: 'r'.repeat(2000) }, basis),
	).toMatchObject({ ...basis, segments: [], reason: 'r'.repeat(2000) })
	expect(
		/** Native timezone choices do not replace contract validation. */ () =>
			overrideFromForm(
				{ ...initial, kind: 'Rest', reason: 'Rest date', zone: 'invalid/zone' },
				basis,
			),
	).toThrow()
})
it('retains exact intervals and explicit overlap choices with no implicit rollover', /** Shared interval controls preserve fractional milliseconds and reject invalid work patterns. */ () => {
	const model = {
		...emptyOverrideForm('America/New_York'),
		kind: 'Work',
		reason: '  revised night shift\n',
		segments: [
			{
				kind: 'Work',
				startTime: '22:00:00.125',
				endTime: '02:00:00.375',
				endDayOffset: '1',
				startOverlap: '',
				endOverlap: 'Later',
			},
		],
	}
	expect(overrideFromForm(model, basis)).toMatchObject({
		reason: model.reason,
		segments: [
			{
				startTime: '22:00:00.125',
				endTime: '02:00:00.375',
				endDayOffset: 1,
				overlapOffset: { end: 'Later' },
			},
		],
	})
	for (const segments of [
		[],
		[{ ...model.segments[0], endDayOffset: '' }],
		[{ ...model.segments[0], endDayOffset: '2' }],
		[{ ...model.segments[0], startTime: '24:00' }],
	])
		expect(
			/** Incomplete or malformed work intervals remain invalid after editing. */ () =>
				overrideFromForm({ ...model, segments }, basis),
		).toThrow()
	expect(overrideFromForm({ ...model, kind: 'Rest' }, basis).segments).toEqual([])
})

it('retains admitted evidence references and rejects duplicates or an oversized collection', /** Native draft submission preserves server references without trusting client file state. */ () => {
	const value = {
		...emptyOverrideForm('UTC'),
		kind: 'Rest',
		reason: 'Changed workday',
		evidenceIds: ['verified-a', 'verified-b'],
	}
	expect(overrideFromForm(value, basis).evidenceIds).toEqual(value.evidenceIds)
	expect(
		/** The same evidence cannot occupy two attachment slots. */ () =>
			overrideFromForm({ ...value, evidenceIds: ['a', 'a'] }, basis),
	).toThrow()
	expect(
		/** Keep source input and metadata projection within the documented technical bound. */ () =>
			overrideFromForm(
				{
					...value,
					evidenceIds: Array.from(
						{ length: 101 },
						/** Give each reference a distinct bounded identity. */ (_, index) =>
							'evidence-' + index,
					),
				},
				basis,
			),
	).toThrow()
})
