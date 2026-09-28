import { describe, expect, it } from 'vitest'
import type { ScheduleSeedDefaults, ScheduleVersionView } from '@empflowyee/hcm-attendance-contract'
import { formFromDefaults, formFromVersion, scheduleFromForm, segmentForm } from './schedule-form'

/** Deliberately incomplete persisted-proposal shape for form boundary tests only. */
function proposal(): ScheduleSeedDefaults {
	return {
		id: 'proposal',
		revision: 1,
		state: 'DraftDefaults',
		code: 'STANDARD',
		name: 'Standard',
		weekStartsOn: 1,
		days: Array.from(
			{ length: 7 },
			/** One explicit workday keeps this boundary fixture small. */ (_, index) => {
				if (index === 0)
					return {
						weekday: 1,
						kind: 'Work',
						startTime: '09:00',
						endTime: '18:00',
						endDayOffset: 0,
						unpaidBreakMinutes: 60,
					}
				return { weekday: index + 1, kind: 'Rest', unpaidBreakMinutes: 0 }
			},
		),
	}
}

describe('schedule editor contract boundaries', /** Preserve incomplete proposals and exact explicit patterns. */ () => {
	it('requires an explicit date, zone policy and break placement or proposal change', /** Default envelopes cannot silently become nine paid hours. */ () => {
		const model = formFromDefaults(proposal())
		expect(model.timezoneMode).toBe('')
		expect(model.effectiveFrom).toBe('')
		expect(
			/** Exercise validation without changing the submitted model. */ () =>
				scheduleFromForm(model),
		).toThrow()
		model.effectiveFrom = '2026-09-28'
		model.timezoneMode = 'Employment'
		expect(
			/** Exercise validation without changing the submitted model. */ () =>
				scheduleFromForm(model),
		).toThrow()
		model.days[0].unpaidMinutes = 0
		expect(scheduleFromForm(model).days[0].segments).toHaveLength(1)
		expect(scheduleFromForm(model).minimumRestMinutes).toBeUndefined()
	})
	it('requires complete contiguous breaks and validates optional minimum rest without adding a floor', /** Contract rules apply equally on input and submit. */ () => {
		const model = formFromDefaults(proposal())
		model.effectiveFrom = '2026-09-28'
		model.timezoneMode = 'Fixed'
		model.fixedZone = 'UTC'
		model.days[0].segments = [
			segmentForm({ startTime: '09:00', endTime: '12:00', endDayOffset: 0, kind: 'Work' }),
			segmentForm({ startTime: '12:00', endTime: '13:00', endDayOffset: 0, kind: 'UnpaidBreak' }),
			segmentForm({ startTime: '13:00', endTime: '18:00', endDayOffset: 0, kind: 'Work' }),
		]
		expect(scheduleFromForm(model).days[0].segments).toHaveLength(3)
		model.minimumRestEnabled = true
		expect(
			/** Exercise validation without changing the submitted model. */ () =>
				scheduleFromForm(model),
		).toThrow()
		model.minimumRestMode = 'Warn'
		model.minimumRestMinutes = 1
		expect(scheduleFromForm(model).minimumRestMinutes).toBe(1)
		model.days[0].segments[1].startTime = '12:01'
		expect(
			/** Exercise validation without changing the submitted model. */ () =>
				scheduleFromForm(model),
		).toThrow()
	})
	it('round-trips exact fractional endpoints, cross-midnight offsets and independent fold choices', /** Editing unrelated text cannot round existing configured times. */ () => {
		const model = formFromDefaults(proposal())
		model.effectiveFrom = '2026-09-28'
		model.timezoneMode = 'Location'
		model.days[0].unpaidMinutes = 0
		model.days[0].segments = [
			segmentForm({
				startTime: '23:00:01.125',
				endTime: '06:00:00.250',
				endDayOffset: 1,
				kind: 'Work',
				overlapOffset: { start: 'Earlier', end: 'Later' },
			}),
		]
		const draft = scheduleFromForm(model)
		const source: ScheduleVersionView = {
			...draft,
			id: 'source',
			versionId: 'version',
			versionNumber: 1,
			revision: 3,
			state: 'Draft',
		}
		expect(scheduleFromForm(formFromVersion(source))).toEqual(draft)
	})
	it('rejects excessive text, malformed dates, wrong zones and unsupported enum choices', /** Direct model updates cannot bypass native input affordances. */ () => {
		const model = formFromDefaults(proposal())
		model.effectiveFrom = '2026-09-28'
		model.timezoneMode = 'Employment'
		model.days[0].unpaidMinutes = 0
		for (const patch of [
			{ name: ' '.repeat(5) },
			{ code: 'lower' },
			{ description: 'x'.repeat(2001) },
			{ effectiveFrom: '2026-02-30' },
			{ timezoneMode: 'Fixed', fixedZone: 'invented/zone' },
			{ weekStartsOn: '8' },
		])
			expect(
				/** Exercise validation without changing the submitted model. */ () =>
					scheduleFromForm({ ...model, ...patch }),
			).toThrow()
		expect(
			scheduleFromForm({
				...model,
				code: 'A'.repeat(40),
				name: 'x'.repeat(120),
				description: 'x'.repeat(2000),
			}),
		).toBeDefined()
	})
})
