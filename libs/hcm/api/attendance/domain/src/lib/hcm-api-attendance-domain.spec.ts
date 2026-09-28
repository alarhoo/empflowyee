import { it, expect } from 'vitest'
import {
	resolveWallTime,
	resolveScheduleSegments,
	elapsedMilliseconds,
	subtractIntervals,
	minimumRest,
} from './hcm-api-attendance-domain'

it('rejects a spring DST gap even when an occurrence preference is supplied', /** Missing wall time never becomes a silently shifted punch or schedule boundary. */ () => {
	for (const choice of [undefined, 'Earlier', 'Later'] as const)
		expect(
			/** Neither disambiguation preference may manufacture the nonexistent 02:30. */ () =>
				resolveWallTime('2026-03-08', '02:30', 'America/New_York', choice),
		).toThrow('DstGap')
})

it('requires a fall overlap choice and preserves each actual offset', /** Both valid occurrences differ by exactly an hour and a supplied impossible offset is rejected. */ () => {
	expect(
		/** Ambiguity is an explicit resolution outcome until the configuration chooses. */ () =>
			resolveWallTime('2026-11-01', '01:30', 'America/New_York'),
	).toThrow('DstOverlap')
	expect(resolveWallTime('2026-11-01', '01:30', 'America/New_York', 'Earlier')).toMatchObject({
		instant: '2026-11-01T05:30:00.000Z',
		offset: '-04:00',
	})
	expect(resolveWallTime('2026-11-01', '01:30', 'America/New_York', 'Later')).toMatchObject({
		instant: '2026-11-01T06:30:00.000Z',
		offset: '-05:00',
	})
	expect(
		/** Offset evidence must agree with the chosen actual occurrence. */ () =>
			resolveWallTime('2026-11-01', '01:30', 'America/New_York', 'Earlier', '-05:00'),
	).toThrow('InvalidOffset')
})

it('handles non-hour transitions and a skipped civil date', /** DST code must not assume every gap or fold lasts sixty minutes. */ () => {
	const early = resolveWallTime('2026-04-05', '01:45', 'Australia/Lord_Howe', 'Earlier')
	const late = resolveWallTime('2026-04-05', '01:45', 'Australia/Lord_Howe', 'Later')
	expect(late.epochMilliseconds - early.epochMilliseconds).toBe(1800000)
	expect(
		/** Samoa skipped this entire local calendar date. */ () =>
			resolveWallTime('2011-12-30', '12:00', 'Pacific/Apia'),
	).toThrow('DstGap')
})

it('resolves cross-midnight year rollover and an explicitly placed unpaid break', /** Work belongs to the start date while endpoints retain their following-year instants. */ () => {
	const result = resolveScheduleSegments('2026-12-31', 'Asia/Kolkata', [
		{ startTime: '22:00', endTime: '00:00', endDayOffset: 1, kind: 'Work' },
		{ startTime: '00:00', endTime: '00:30', endDayOffset: 1, kind: 'UnpaidBreak' },
		{ startTime: '00:30', endTime: '06:00', endDayOffset: 1, kind: 'Work' },
	])
	expect(result[2].endInstant).toBe('2027-01-01T00:30:00.000Z')
	expect(
		elapsedMilliseconds(
			result.filter(
				/** Count only actual planned work segments while keeping break evidence separate. */ (
					segment,
				) => segment.kind === 'Work',
			),
		),
	).toBe('27000000')
})

it('uses real elapsed time across a DST change rather than nominal wall hours', /** Midnight-to-four is three elapsed hours on this spring transition date. */ () => {
	const result = resolveScheduleSegments('2026-03-08', 'America/New_York', [
		{ startTime: '00:00', endTime: '04:00', endDayOffset: 0, kind: 'Work' },
	])
	expect(result[0].elapsedMilliseconds).toBe('10800000')
	expect(result[0]).toMatchObject({ startOffset: '-05:00', endOffset: '-04:00' })
})

it('can represent an interval crossing both occurrences of a repeated clock hour', /** An earlier end wall time is valid only when independently chosen occurrences make the actual interval positive. */ () => {
	const segments = [
		{
			startTime: '01:50',
			endTime: '01:10',
			endDayOffset: 0,
			kind: 'Work',
			overlapOffset: { start: 'Earlier', end: 'Later' },
		},
	] as const
	expect(
		resolveScheduleSegments('2026-11-01', 'America/New_York', segments)[0].elapsedMilliseconds,
	).toBe('1200000')
	expect(
		/** The same wall pattern on an ordinary date must not be treated as a positive shift. */ () =>
			resolveScheduleSegments('2026-11-02', 'America/New_York', segments),
	).toThrow('InvalidInterval')
})

it('retains exact milliseconds and counts overlapping exclusions only once', /** Break and absence overlap reduces expectations once without rounding retained evidence. */ () => {
	expect(resolveWallTime('2028-02-29', '09:00:00.123', 'UTC').instant).toBe(
		'2028-02-29T09:00:00.123Z',
	)
	const remaining = subtractIntervals(
		[{ startMilliseconds: 0, endMilliseconds: 100001 }],
		[
			{ startMilliseconds: 10000, endMilliseconds: 30000 },
			{ startMilliseconds: 20000, endMilliseconds: 50000 },
			{ startMilliseconds: 90000, endMilliseconds: 200000 },
		],
	)
	expect(remaining).toEqual([
		{ startMilliseconds: 0, endMilliseconds: 10000 },
		{ startMilliseconds: 50000, endMilliseconds: 90000 },
	])
	expect(elapsedMilliseconds([{ startMilliseconds: 0, endMilliseconds: 100001 }])).toBe('100001')
	expect(elapsedMilliseconds(remaining)).toBe('50000')
})

it('leaves minimum rest disabled unless a threshold and mode are configured', /** No implicit eleven-hour rule or fabricated mandatory warning exists. */ () => {
	expect(minimumRest(0, 1, null)).toEqual({ state: 'Disabled' })
	expect(minimumRest(0, 60000, 2, 'Warn')).toEqual({ state: 'Warn', elapsedMilliseconds: '60000' })
	expect(minimumRest(0, 60000, 2, 'Block')).toMatchObject({ state: 'Block' })
	expect(minimumRest(0, 120000, 2, 'Block')).toMatchObject({ state: 'Satisfied' })
	expect(
		/** A threshold without an explicit policy outcome is incomplete. */ () =>
			minimumRest(0, 60000, 2),
	).toThrow()
})
