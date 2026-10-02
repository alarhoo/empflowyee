import { expect, it } from 'vitest'
import { holidayEntryForm, holidayForm, holidayFromForm } from './holiday-form'

/** Create explicit test input including a distinct actual date and precise repeated local time. */
function example() {
	return holidayForm({
		code: 'EXPLICIT',
		name: 'Explicit calendar',
		effectiveFrom: '2026-01-01',
		effectiveTo: '2026-12-31',
		entries: [
			{
				date: '2026-10-31',
				observedDate: '2026-11-01',
				name: 'Partial holiday',
				category: 'Company',
				priority: -2,
				startTime: '01:10:00.125',
				endTime: '02:30:00.250',
				overlapOffset: { start: 'Later' },
			},
		],
	})
}

it('preserves explicit observed dates, signed priority and exact partial intervals', /** Editor round trips must not infer dates, drop milliseconds or copy lifecycle metadata. */ () => {
	const model = example(),
		result = holidayFromForm(model)
	expect(result.entries[0]).toMatchObject({
		date: '2026-10-31',
		observedDate: '2026-11-01',
		priority: -2,
		startTime: '01:10:00.125',
		endTime: '02:30:00.250',
		overlapOffset: { start: 'Later' },
	})
	expect(result.entries[0]).not.toHaveProperty('regionCode')
	expect(result.entries[0]).not.toHaveProperty('locationId')
	expect(result).not.toHaveProperty('versionId')
})

it('keeps a new row incomplete until the user supplies every required business value', /** Blank native numeric input must not become an implicit zero priority. */ () => {
	const model = example()
	model.entries = [holidayEntryForm()]
	expect(Number.isNaN(model.entries[0].priority)).toBe(true)
	expect(/** An incomplete row cannot reach HTTP. */ () => holidayFromForm(model)).toThrow()
})

it('rejects malformed and one-sided intervals while allowing correction', /** Optional fields are omitted only when empty and retain invalid partial input for the contract validator. */ () => {
	const model = example()
	model.entries[0].endTime = ''
	expect(
		/** One endpoint cannot describe a partial holiday. */ () => holidayFromForm(model),
	).toThrow()
	model.entries[0].endTime = '02:30'
	expect(holidayFromForm(model).entries[0].endTime).toBe('02:30')
	model.entries[0].startTime = ''
	model.entries[0].endTime = ''
	expect(
		/** Repeated-time choices cannot survive conversion to a full-day holiday. */ () =>
			holidayFromForm(model),
	).toThrow()
	model.entries[0].startOverlap = ''
	expect(holidayFromForm(model).entries[0]).not.toHaveProperty('overlapOffset')
})

it('applies contract length, date and integer boundaries to pasted or programmatic input', /** Native limits alone never authorize invalid values. */ () => {
	const model = example()
	model.name = 'a'.repeat(120)
	model.entries[0].priority = -2147483648
	expect(holidayFromForm(model).name).toHaveLength(120)
	model.name += 'a'
	expect(
		/** Reject the first character beyond the contract maximum. */ () => holidayFromForm(model),
	).toThrow()
	model.name = 'Corrected'
	model.entries[0].priority = 2147483648
	expect(
		/** Reject an integer beyond PostgreSQL's admitted range. */ () => holidayFromForm(model),
	).toThrow()
	model.entries[0].priority = 0
	model.entries[0].observedDate = '2026-02-30'
	expect(
		/** A date-shaped string is not necessarily a real civil date. */ () => holidayFromForm(model),
	).toThrow()
	model.entries[0].observedDate = '2027-01-01'
	expect(
		/** Dates outside the version coverage cannot be silently clipped. */ () =>
			holidayFromForm(model),
	).toThrow()
})
