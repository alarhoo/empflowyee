import { expect, it } from 'vitest'
import { evaluateAttendanceRest } from './rest-rules'
import { resolveWallTime } from './hcm-api-attendance-domain'

it('retains independent Warn and Block outcomes across the DST gap with exact sub-minute evidence', /** A policy Block cannot be overridden by a schedule Warn, nor the reverse. */ () => {
	const end = resolveWallTime('2026-03-08', '00:00:00.250', 'America/New_York').epochMilliseconds
	const start = resolveWallTime('2026-03-08', '09:00:00.125', 'America/New_York').epochMilliseconds
	for (const mode of ['Warn', 'Block'] as const) {
		const result = evaluateAttendanceRest(
			end,
			start,
			{ source: 'Schedule', versionId: 's1', minutes: 600, mode },
			{ source: 'Policy', versionId: 'p1', minutes: 480, mode: mode === 'Warn' ? 'Block' : 'Warn' },
		)
		expect(result.blocked).toBe(true)
		expect(result.outcomes[0]).toMatchObject({
			versionId: 's1',
			result: { state: mode, elapsedMilliseconds: '28799875' },
		})
		expect(result.outcomes[1].result).toEqual({
			state: mode === 'Warn' ? 'Block' : 'Warn',
			elapsedMilliseconds: '28799875',
		})
	}
})

it('keeps inactive, satisfied and warning sources distinct without a universal threshold', /** Disabled rules add no 11-hour minimum; exact threshold equality satisfies a configured rule. */ () => {
	const schedule = { source: 'Schedule' as const, versionId: 's1', minutes: null }
	expect(
		evaluateAttendanceRest(0, 0, schedule, { source: 'Policy', versionId: 'p1', minutes: null }),
	).toMatchObject({
		blocked: false,
		outcomes: [{ result: { state: 'Disabled' } }, { result: { state: 'Disabled' } }],
	})
	expect(
		evaluateAttendanceRest(0, 60000, schedule, {
			source: 'Policy',
			versionId: 'p1',
			minutes: 1,
			mode: 'Block',
		}).outcomes[1].result.state,
	).toBe('Satisfied')
	expect(
		evaluateAttendanceRest(0, 59999, schedule, {
			source: 'Policy',
			versionId: 'p1',
			minutes: 1,
			mode: 'Warn',
		}),
	).toMatchObject({
		blocked: false,
		outcomes: [{ result: { state: 'Disabled' } }, { result: { state: 'Warn' } }],
	})
})
