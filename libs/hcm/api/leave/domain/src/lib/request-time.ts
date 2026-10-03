import { Temporal } from '@js-temporal/polyfill'
import type { LeaveRequestDayInput } from '@empflowyee/hcm-leave-contract'
import { readLeaveRequestDay } from '@empflowyee/hcm-leave-contract'
import { attendanceZone } from '@empflowyee/hcm-attendance-contract'
import { invalidField } from '@empflowyee/hcm-runtime-contract'
import type { LeaveResolvedPortion } from './day-quantity'

/** Resolve an endpoint against the actual published IANA zone, selecting a repeated occurrence only with explicit matching offset evidence. */
function resolveEndpoint(
	date: string,
	time: string,
	zone: string,
	offset: string | undefined,
	field: string,
): Temporal.Instant {
	const local = Temporal.PlainDateTime.from(`${date}T${time}`)
	const earlier = local.toZonedDateTime(zone, { disambiguation: 'earlier' }),
		later = local.toZonedDateTime(zone, { disambiguation: 'later' })
	if (!earlier.toPlainDateTime().equals(local) || !later.toPlainDateTime().equals(local))
		invalidField(field, 'dst-gap')
	const repeated = earlier.epochNanoseconds !== later.epochNanoseconds
	if (repeated && offset === undefined) invalidField(field, 'offset-required')
	if (offset !== undefined) {
		const [hours, minutes, seconds = '0'] = offset.slice(1).split(':')
		const nanos =
			(Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) *
			1_000_000_000 *
			(offset.startsWith('-') ? -1 : 1)
		const candidates = [earlier, later].filter(
			/** A numeric offset must identify an actual occurrence at this local endpoint. */ (
				candidate,
			) => candidate.offsetNanoseconds === nanos,
		)
		if (!candidates.length) invalidField(field, 'offset-mismatch')
		return candidates[0].toInstant()
	}
	return earlier.toInstant()
}

/** Admit Full or Hourly local portions for quantity calculation without choosing the pending half-day rounding behavior. */
export function resolveLeaveRequestPortion(
	input: LeaveRequestDayInput,
	zone: string,
):
	| { state: 'Available'; request: LeaveResolvedPortion }
	| { state: 'Unavailable'; reason: 'HalfDayDecisionPending' } {
	const day = readLeaveRequestDay(input)
	attendanceZone(zone)
	if (day.portion === 'Full') return { state: 'Available', request: { portion: 'Full' } }
	if (day.portion !== 'Hourly') return { state: 'Unavailable', reason: 'HalfDayDecisionPending' }
	const date = Temporal.PlainDate.from(day.workDate)
	const start = resolveEndpoint(
		date.add({ days: day.startDayOffset }).toString(),
		day.startTime,
		zone,
		day.offset?.start,
		'startTime',
	)
	const end = resolveEndpoint(
		date.add({ days: day.endDayOffset }).toString(),
		day.endTime,
		zone,
		day.offset?.end,
		'endTime',
	)
	if (end.epochNanoseconds <= start.epochNanoseconds) invalidField('endTime', 'invalid-range')
	return {
		state: 'Available',
		request: {
			portion: 'Hourly',
			startInstant: start.toString({ smallestUnit: 'millisecond' }),
			endInstant: end.toString({ smallestUnit: 'millisecond' }),
		},
	}
}
