import { Temporal } from '@js-temporal/polyfill'
import { HcmDomainError, dateValue } from '@empflowyee/hcm-runtime-contract'
import type { AttendanceConfigurationInputPort } from './configuration-inputs'
import { AssignedWorkdayResolver, type AssignedWorkdayResult } from './assigned-workday'

/** Review the changed date and its first following scheduled workday, retaining intervening rest-day dependencies. */
export async function evaluateOverrideWorkdayImpact(
	inputs: AttendanceConfigurationInputPort,
	employmentId: string,
	workDate: string,
	requireDate: (date: string) => Promise<void>,
) {
	dateValue(workDate, 'workDate')
	const resolver = new AssignedWorkdayResolver(inputs, 366)
	const days: {
		workDate: string
		result: Extract<AssignedWorkdayResult, { state: 'Available' }>
	}[] = []
	let date = Temporal.PlainDate.from(workDate)
	for (let index = 0; index < 366; index++) {
		const selected = date.toString()
		await requireDate(selected)
		const result = await resolver.resolve(employmentId, selected)
		if (result.state !== 'Available')
			throw new HcmDomainError(
				['MinimumRestBlocked', 'HolidayPriorityCollision'].includes(result.reason)
					? 'invalid-state'
					: 'record-incomplete',
			)
		days.push({ workDate: selected, result })
		if (index > 0 && result.resolution.scheduleKind === 'Work') return days
		if (selected === '9999-12-31') break
		date = date.add({ days: 1 })
	}
	throw new HcmDomainError('record-incomplete')
}
