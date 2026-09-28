import { it, expect } from 'vitest'
import { parseShiftDraft, type ShiftDraft } from './shifts'

const draft: ShiftDraft = {
	code: 'NIGHT',
	name: 'Night',
	effectiveFrom: '2026-01-01',
	timezoneMode: 'Fixed',
	fixedZone: 'Asia/Kolkata',
	segments: [
		{ startTime: '22:00', endTime: '00:00', endDayOffset: 1, kind: 'Work' },
		{ startTime: '00:00', endTime: '00:30', endDayOffset: 1, kind: 'UnpaidBreak' },
		{ startTime: '00:30', endTime: '06:00', endDayOffset: 1, kind: 'Work' },
	],
}

it('preserves an explicit cross-midnight shift without adding a weekly pattern or rest rule', /** A shift is reusable dated configuration, not a fabricated schedule assignment. */ () => {
	expect(parseShiftDraft(draft)).toEqual(draft)
	expect(
		parseShiftDraft({ ...draft, minimumRestMinutes: 0, minimumRestMode: 'Warn' })
			.minimumRestMinutes,
	).toBe(0)
})

it('rejects split shifts, guessed zones and incomplete rest configuration', /** Shift and schedule endpoints share authoritative validation. */ () => {
	for (const patch of [
		{ segments: [] },
		{ segments: [draft.segments[0], draft.segments[2]] },
		{ fixedZone: undefined },
		{ minimumRestMinutes: 660 },
		{ minimumRestMode: 'Block' },
		{ days: [] },
		{ weekStartsOn: 1 },
		{ name: 'x'.repeat(121) },
	])
		expect(
			/** Invalid input must fail without inserting missing breaks or default fields. */ () =>
				parseShiftDraft({ ...draft, ...patch }),
		).toThrow()
})
