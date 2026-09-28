import { it, expect } from 'vitest'
import {
	parseScheduleDraft,
	wallMilliseconds,
	type ScheduleDraft,
	type ScheduleSegment,
} from './hcm-attendance-contract'

/** Provide an explicit test-only configured pattern; this is not an automatically published tenant default. */
function draft(): ScheduleDraft {
	const segments: ScheduleSegment[] = [
		{ startTime: '09:00', endTime: '12:00', endDayOffset: 0, kind: 'Work' },
		{ startTime: '12:00', endTime: '13:00', endDayOffset: 0, kind: 'UnpaidBreak' },
		{ startTime: '13:00', endTime: '18:00', endDayOffset: 0, kind: 'Work' },
	]
	return {
		code: 'DAY',
		name: 'Configured day',
		isTemplate: false,
		effectiveFrom: '2026-01-01',
		timezoneMode: 'Fixed',
		fixedZone: 'America/New_York',
		weekStartsOn: 1,
		days: Array.from(
			{ length: 7 },
			/** Supply all weekdays once and an explicitly placed test break. */ (_, index) => ({
				weekday: index + 1,
				kind: index < 5 ? 'Work' : 'Rest',
				segments: index < 5 ? structuredClone(segments) : [],
			}),
		),
	}
}

it('preserves configured text and leaves minimum rest inactive when omitted', /** Valid input is not trimmed, rounded or supplemented with an eleven-hour policy. */ () => {
	const input = { ...draft(), name: '  Configured name  ', description: ' Original evidence ' }
	expect(parseScheduleDraft(input)).toEqual(input)
	expect(parseScheduleDraft(input).minimumRestMinutes).toBeUndefined()
	expect(wallMilliseconds('09:00:00.001')).toBe(32400001)
})

it('rejects hidden ownership, unknown fields, impossible dates and over-limit text', /** Browser-side affordances cannot replace exact authoritative payload checks. */ () => {
	for (const extra of [
		{ tenantId: 'forged' },
		{ name: ' '.repeat(3) },
		{ name: 'x'.repeat(121) },
		{ code: 'a' },
		{ code: 'A'.repeat(41) },
		{ effectiveFrom: '2026-02-29' },
		{ effectiveTo: '2025-12-31' },
		{ fixedZone: '+05:30' },
		{ description: 'x'.repeat(2001) },
	])
		expect(
			/** Every invalid field must be rejected without silently rewriting the draft. */ () =>
				parseScheduleDraft({ ...draft(), ...extra }),
		).toThrow()
})

it('enforces dependent zone and minimum-rest fields without guessing missing configuration', /** Switching a selector must clear or supply its dependent inputs explicitly. */ () => {
	for (const extra of [
		{ timezoneMode: 'Employment' },
		{ minimumRestMinutes: 660 },
		{ minimumRestMode: 'Warn' },
		{ minimumRestMinutes: -1, minimumRestMode: 'Block' },
		{ minimumRestMinutes: 1.5, minimumRestMode: 'Warn' },
	])
		expect(
			/** Test a conditionally invalid payload rather than a UI-only disabled state. */ () =>
				parseScheduleDraft({ ...draft(), ...extra }),
		).toThrow()
	expect(
		parseScheduleDraft({ ...draft(), minimumRestMinutes: 0, minimumRestMode: 'Warn' })
			.minimumRestMinutes,
	).toBe(0)
})

it('rejects missing, duplicated and disguised rest weekdays', /** A published weekly pattern cannot omit a date category or hide work inside a rest day. */ () => {
	const input = draft()
	expect(
		/** Six days cannot silently receive a default seventh day. */ () =>
			parseScheduleDraft({ ...input, days: input.days.slice(0, 6) }),
	).toThrow()
	expect(
		/** Duplicate weekdays must not replace each other during normalization. */ () =>
			parseScheduleDraft({ ...input, days: [...input.days.slice(0, 6), input.days[0]] }),
	).toThrow()
	input.days[5].segments = input.days[0].segments
	expect(
		/** Rest-day work requires an explicit changed pattern. */ () => parseScheduleDraft(input),
	).toThrow()
})

it('rejects split shifts, overlapping breaks and unsupported endpoint data', /** Explicit break segments fill the continuous envelope rather than being double-counted inside work. */ () => {
	for (const segments of [
		[
			{ startTime: '09:00', endTime: '12:00', endDayOffset: 0, kind: 'Work' },
			{ startTime: '14:00', endTime: '18:00', endDayOffset: 0, kind: 'Work' },
		],
		[
			{ startTime: '09:00', endTime: '18:00', endDayOffset: 0, kind: 'Work' },
			{ startTime: '12:00', endTime: '13:00', endDayOffset: 0, kind: 'UnpaidBreak' },
		],
		[{ startTime: '24:00', endTime: '06:00', endDayOffset: 1, kind: 'Work' }],
		[{ startTime: '09:00:00.0001', endTime: '18:00', endDayOffset: 0, kind: 'Work' }],
		[
			{
				startTime: '09:00',
				endTime: '18:00',
				endDayOffset: 0,
				kind: 'Work',
				overlapOffset: { script: 'choose' },
			},
		],
	]) {
		const input = draft()
		input.days[0].segments = segments as ScheduleSegment[]
		expect(
			/** Invalid segment geometry or shape cannot pass draft validation. */ () =>
				parseScheduleDraft(input),
		).toThrow()
	}
})

it('preserves a cross-midnight break and independently chosen overlap endpoints', /** After-midnight segments belong to the original work date and require explicit end-day offsets. */ () => {
	const input = draft()
	input.days[0].segments = [
		{ startTime: '22:00', endTime: '00:00', endDayOffset: 1, kind: 'Work' },
		{ startTime: '00:00', endTime: '00:30', endDayOffset: 1, kind: 'UnpaidBreak' },
		{
			startTime: '00:30',
			endTime: '06:00',
			endDayOffset: 1,
			kind: 'Work',
			overlapOffset: { start: 'Earlier', end: 'Later' },
		},
	]
	expect(parseScheduleDraft(input).days[0].segments).toEqual(input.days[0].segments)
})
