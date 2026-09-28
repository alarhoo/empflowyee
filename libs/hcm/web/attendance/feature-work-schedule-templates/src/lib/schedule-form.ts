import {
	parseScheduleDraft,
	wallMilliseconds,
	type ScheduleSeedDefaults,
	type ScheduleVersionView,
	type ScheduleDraft,
	type ScheduleSegment,
} from '@empflowyee/hcm-attendance-contract'
import { invalidField } from '@empflowyee/hcm-runtime-contract'

export const TEMPLATE_ROUTE = '/attendance/work-schedule-templates'
export const TEMPLATE_PERMISSION = 'hcm.attendance.work-schedule-templates.'
export const WEEKDAYS = [
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
	'Sunday',
] as const
export interface SegmentForm {
	startTime: string
	endTime: string
	endDayOffset: string
	kind: string
	startOverlap: string
	endOverlap: string
}
export interface DayForm {
	weekday: number
	kind: string
	unpaidMinutes: number
	proposalPending: boolean
	segments: SegmentForm[]
}
export interface ScheduleForm {
	code: string
	name: string
	description: string
	effectiveFrom: string
	effectiveTo: string
	timezoneMode: string
	fixedZone: string
	weekStartsOn: string
	minimumRestEnabled: boolean
	minimumRestMinutes: number
	minimumRestMode: string
	days: DayForm[]
}

/** Empty editing state is not a business proposal and cannot be saved. */
export function emptyScheduleForm(): ScheduleForm {
	return {
		code: '',
		name: '',
		description: '',
		effectiveFrom: '',
		effectiveTo: '',
		timezoneMode: '',
		fixedZone: '',
		weekStartsOn: '',
		minimumRestEnabled: false,
		minimumRestMinutes: 0,
		minimumRestMode: '',
		days: [],
	}
}

/** Preserve exact endpoint strings, including fractions and explicit overlap choices. */
export function segmentForm(segment?: ScheduleSegment): SegmentForm {
	return {
		startTime: segment?.startTime ?? '',
		endTime: segment?.endTime ?? '',
		endDayOffset: String(segment?.endDayOffset ?? 0),
		kind: segment?.kind ?? 'Work',
		startOverlap: segment?.overlapOffset?.start ?? '',
		endOverlap: segment?.overlapOffset?.end ?? '',
	}
}

/** Present persisted default envelopes without inventing break placement or a timezone. */
export function formFromDefaults(defaults: ScheduleSeedDefaults): ScheduleForm {
	return {
		...emptyScheduleForm(),
		code: defaults.code,
		name: defaults.name,
		weekStartsOn: String(defaults.weekStartsOn),
		days: defaults.days.map(
			/** Retain each proposal until the user places or changes its unpaid minutes. */ (day) => {
				const segments: SegmentForm[] = []
				if (day.kind === 'Work')
					segments.push(
						segmentForm({
							startTime: day.startTime ?? '',
							endTime: day.endTime ?? '',
							endDayOffset: day.endDayOffset ?? 0,
							kind: 'Work',
						}),
					)
				return {
					weekday: day.weekday,
					kind: day.kind,
					unpaidMinutes: day.unpaidBreakMinutes,
					proposalPending: true,
					segments,
				}
			},
		),
	}
}

/** Compute nominal configured unpaid minutes only; actual elapsed time is dated server evidence. */
export function nominalUnpaid(segments: readonly ScheduleSegment[]): number {
	let previousEnd = 0
	let unpaid = 0
	for (const segment of segments) {
		const start =
			wallMilliseconds(segment.startTime) + Math.floor(previousEnd / 86400000) * 86400000
		const end = wallMilliseconds(segment.endTime) + segment.endDayOffset * 86400000
		if (segment.kind === 'UnpaidBreak') unpaid += end - start
		previousEnd = end
	}
	return unpaid / 60000
}

/** Build the editable model from a complete server projection without serializing metadata back. */
export function formFromVersion(source: ScheduleVersionView): ScheduleForm {
	return {
		code: source.code,
		name: source.name,
		description: source.description ?? '',
		effectiveFrom: source.effectiveFrom,
		effectiveTo: source.effectiveTo ?? '',
		timezoneMode: source.timezoneMode,
		fixedZone: source.fixedZone ?? '',
		weekStartsOn: String(source.weekStartsOn),
		minimumRestEnabled: source.minimumRestMinutes !== undefined,
		minimumRestMinutes: source.minimumRestMinutes ?? 0,
		minimumRestMode: source.minimumRestMode ?? '',
		days: source.days.map(
			/** Derive the editing target from existing intervals without altering any endpoint. */ (
				day,
			) => ({
				weekday: day.weekday,
				kind: day.kind,
				unpaidMinutes: nominalUnpaid(day.segments),
				proposalPending: false,
				segments: day.segments.map(segmentForm),
			}),
		),
	}
}

/** Use the universal parser and require deliberate placement or modification of proposed unpaid time. */
export function scheduleFromForm(model: ScheduleForm): ScheduleDraft {
	const draft = parseScheduleDraft({
		code: model.code,
		name: model.name,
		isTemplate: true,
		effectiveFrom: model.effectiveFrom,
		timezoneMode: model.timezoneMode,
		weekStartsOn: Number(model.weekStartsOn),
		...(model.description ? { description: model.description } : {}),
		...(model.effectiveTo ? { effectiveTo: model.effectiveTo } : {}),
		...(model.timezoneMode === 'Fixed' ? { fixedZone: model.fixedZone } : {}),
		...(model.minimumRestEnabled
			? { minimumRestMinutes: model.minimumRestMinutes, minimumRestMode: model.minimumRestMode }
			: {}),
		days: model.days.map(
			/** Rest days have no work intervals; active days preserve the exact ordered input. */ (
				day,
			) => {
				const segments: unknown[] = []
				if (day.kind === 'Work')
					for (const segment of day.segments) {
						const overlapOffset: Record<string, string> = {}
						if (segment.startOverlap) overlapOffset['start'] = segment.startOverlap
						if (segment.endOverlap) overlapOffset['end'] = segment.endOverlap
						segments.push({
							startTime: segment.startTime,
							endTime: segment.endTime,
							endDayOffset: Number(segment.endDayOffset),
							kind: segment.kind,
							...(Object.keys(overlapOffset).length ? { overlapOffset } : {}),
						})
					}
				return { weekday: day.weekday, kind: day.kind, segments }
			},
		),
	})
	for (const [index, day] of draft.days.entries()) {
		const proposed = model.days[index].unpaidMinutes
		if (
			day.kind === 'Work' &&
			model.days[index].proposalPending &&
			(!Number.isFinite(proposed) ||
				proposed < 0 ||
				Math.abs(nominalUnpaid(day.segments) - proposed) > 0.000000001)
		)
			invalidField(`days.${index}.unpaidMinutes`, 'place-or-change-unpaid-break')
	}
	return draft
}
