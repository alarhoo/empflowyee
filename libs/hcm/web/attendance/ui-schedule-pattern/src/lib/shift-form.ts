import {
	parseShiftDraft,
	type ShiftVersionView,
	type ShiftDraft,
} from '@empflowyee/hcm-attendance-contract'
import { emptyScheduleForm, segmentForm, nominalUnpaid, type ScheduleForm } from './schedule-form'

/** A reusable shift contains one interval group and no weekly business pattern. */
export function emptyShiftForm(): ScheduleForm {
	return {
		...emptyScheduleForm(),
		days: [{ weekday: 1, kind: 'Work', unpaidMinutes: 0, proposalPending: false, segments: [] }],
	}
}
/** Project exact shift endpoints into the maintained interval controls without introducing schedule metadata. */
export function formFromShift(source: ShiftVersionView): ScheduleForm {
	return {
		...emptyShiftForm(),
		code: source.code,
		name: source.name,
		description: source.description ?? '',
		effectiveFrom: source.effectiveFrom,
		effectiveTo: source.effectiveTo ?? '',
		timezoneMode: source.timezoneMode,
		fixedZone: source.fixedZone ?? '',
		minimumRestEnabled: source.minimumRestMinutes !== undefined,
		minimumRestMinutes: source.minimumRestMinutes ?? 0,
		minimumRestMode: source.minimumRestMode ?? '',
		days: [
			{
				weekday: 1,
				kind: 'Work',
				unpaidMinutes: nominalUnpaid(source.segments),
				proposalPending: false,
				segments: source.segments.map(segmentForm),
			},
		],
	}
}
/** Serialize only Shift fields and validate exact endpoints with the shared universal parser. */
export function shiftFromForm(model: ScheduleForm): ShiftDraft {
	return parseShiftDraft({
		code: model.code,
		name: model.name,
		effectiveFrom: model.effectiveFrom,
		timezoneMode: model.timezoneMode,
		...(model.description ? { description: model.description } : {}),
		...(model.effectiveTo ? { effectiveTo: model.effectiveTo } : {}),
		...(model.timezoneMode === 'Fixed' ? { fixedZone: model.fixedZone } : {}),
		...(model.minimumRestEnabled
			? { minimumRestMinutes: model.minimumRestMinutes, minimumRestMode: model.minimumRestMode }
			: {}),
		segments: (model.days[0]?.segments ?? []).map(
			/** Retain explicit overlap choices and all fractional seconds. */ (segment) => {
				const overlapOffset = {
					...(segment.startOverlap ? { start: segment.startOverlap } : {}),
					...(segment.endOverlap ? { end: segment.endOverlap } : {}),
				}
				return {
					startTime: segment.startTime,
					endTime: segment.endTime,
					endDayOffset: Number(segment.endDayOffset),
					kind: segment.kind,
					...(Object.keys(overlapOffset).length ? { overlapOffset } : {}),
				}
			},
		),
	})
}
