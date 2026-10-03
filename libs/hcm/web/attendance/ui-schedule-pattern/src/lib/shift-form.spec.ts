import { expect, it } from 'vitest'
import { emptyShiftForm, formFromShift, shiftFromForm } from './shift-form'

it('keeps a shift independent of any weekly pattern and preserves millisecond overlap choices', /** Exact local endpoints survive both UI conversion directions. */ () => {
	const model = {
		...emptyShiftForm(),
		code: 'NIGHT',
		name: 'Night shift',
		effectiveFrom: '2026-11-01',
		timezoneMode: 'Fixed',
		fixedZone: 'America/New_York',
		minimumRestEnabled: true,
		minimumRestMinutes: 600,
		minimumRestMode: 'Block',
		days: [
			{
				weekday: 1,
				kind: 'Work',
				unpaidMinutes: 0,
				proposalPending: false,
				segments: [
					{
						startTime: '01:15:00.123',
						endTime: '01:45:00.789',
						endDayOffset: '0',
						kind: 'Work',
						startOverlap: 'Earlier',
						endOverlap: 'Later',
					},
				],
			},
		],
	}
	const draft = shiftFromForm(model)
	expect(draft).not.toHaveProperty('days')
	expect(draft).not.toHaveProperty('weekStartsOn')
	expect(
		shiftFromForm(
			formFromShift({
				...draft,
				id: 'shift',
				versionId: 'version',
				versionNumber: 1,
				revision: 1,
				state: 'Draft',
			}),
		),
	).toEqual(draft)
	expect(
		/** Exercise rejection without issuing a source command. */ () =>
			shiftFromForm(emptyShiftForm()),
	).toThrow()
})
