import { Temporal } from '@js-temporal/polyfill'
import {
	attendanceZone,
	type ExactInterval,
	type ResolvedScheduleSegment,
	type ScheduleDay,
} from '@empflowyee/hcm-attendance-contract'
import { dateValue, invalidField } from '@empflowyee/hcm-runtime-contract'
import {
	resolveScheduleSegments,
	subtractIntervals,
	elapsedMilliseconds,
} from './hcm-api-attendance-domain'
import { resolveHolidays, type PublishedHoliday, type ResolvedHoliday } from './holiday-resolution'

export interface DatedWorkdayIntervals {
	workDate: string
	zone: string
	scheduleKind: 'Work' | 'Rest'
	scheduledSegments: ResolvedScheduleSegment[]
	holidaySegments: ResolvedHoliday[]
	expectedWorkIntervals: ExactInterval[]
	scheduledWorkMilliseconds: string
	breakMilliseconds: string
	expectedWorkMilliseconds: string
}

/** Compose exact schedule and holiday intervals for one start work date, retaining original planned work and break evidence separately. */
export function resolveDatedWorkday(
	workDate: string,
	zone: string,
	day: Pick<ScheduleDay, 'kind' | 'segments'>,
	holidayScope: { regionCode: string | null; locationId: string | null },
	holidays: readonly PublishedHoliday[],
): DatedWorkdayIntervals {
	dateValue(workDate, 'workDate')
	attendanceZone(zone)
	if (day.kind !== 'Work' && day.kind !== 'Rest') invalidField('kind')
	if (day.kind === 'Rest' && day.segments.length) invalidField('segments', 'rest-must-be-empty')
	const scheduledSegments =
		day.kind === 'Work' ? resolveScheduleSegments(workDate, zone, day.segments) : []
	const holidaySegments = resolveHolidays(workDate, zone, holidayScope, holidays)
	if (
		day.segments.some(
			/** Cross-midnight work also intersects the next civil date's explicit holidays. */ (
				segment,
			) => segment.endDayOffset === 1,
		)
	) {
		const nextDate = Temporal.PlainDate.from(workDate).add({ days: 1 }).toString()
		holidaySegments.push(...resolveHolidays(nextDate, zone, holidayScope, holidays))
	}
	const work = scheduledSegments.filter(
		/** Only Work contributes to the scheduled denominator; breaks remain separately visible. */ (
			segment,
		) => segment.kind === 'Work',
	)
	const breaks = scheduledSegments.filter(
		/** Preserve exact configured unpaid time without subtracting it twice. */ (segment) =>
			segment.kind === 'UnpaidBreak',
	)
	const expectedWorkIntervals = subtractIntervals(work, holidaySegments)
	return {
		workDate,
		zone,
		scheduleKind: day.kind,
		scheduledSegments,
		holidaySegments,
		expectedWorkIntervals,
		scheduledWorkMilliseconds: elapsedMilliseconds(work),
		breakMilliseconds: elapsedMilliseconds(breaks),
		expectedWorkMilliseconds: elapsedMilliseconds(expectedWorkIntervals),
	}
}
