import {
	parseHolidayDraft,
	type HolidayDraft,
	type HolidayEntry,
} from '@empflowyee/hcm-attendance-contract'

export const HOLIDAY_ROUTE = '/attendance/holiday-calendars'
export const HOLIDAY_PERMISSION = 'hcm.attendance.holiday-calendars.'
export interface HolidayEntryForm {
	date: string
	observedDate: string
	category: string
	name: string
	priority: number
	regionCode: string
	locationId: string
	startTime: string
	endTime: string
	startOverlap: string
	endOverlap: string
}
export interface HolidayForm {
	code: string
	name: string
	effectiveFrom: string
	effectiveTo: string
	entries: HolidayEntryForm[]
}

/** Keep unentered dates and category empty; creating an editor row is not a business default. */
export function holidayEntryForm(entry?: HolidayEntry): HolidayEntryForm {
	return {
		date: entry?.date ?? '',
		observedDate: entry?.observedDate ?? '',
		category: entry?.category ?? '',
		name: entry?.name ?? '',
		priority: entry?.priority ?? Number.NaN,
		regionCode: entry?.regionCode ?? '',
		locationId: entry?.locationId ?? '',
		startTime: entry?.startTime ?? '',
		endTime: entry?.endTime ?? '',
		startOverlap: entry?.overlapOffset?.start ?? '',
		endOverlap: entry?.overlapOffset?.end ?? '',
	}
}

/** Convert a server draft into editable values without copying lifecycle metadata into a command. */
export function holidayForm(source?: HolidayDraft): HolidayForm {
	return {
		code: source?.code ?? '',
		name: source?.name ?? '',
		effectiveFrom: source?.effectiveFrom ?? '',
		effectiveTo: source?.effectiveTo ?? '',
		entries: source?.entries.map(holidayEntryForm) ?? [],
	}
}

/** Reuse authoritative validation without guessing observed dates, timezone, priority or partial intervals. */
export function holidayFromForm(model: HolidayForm): HolidayDraft {
	return parseHolidayDraft({
		code: model.code,
		name: model.name,
		effectiveFrom: model.effectiveFrom,
		...(model.effectiveTo ? { effectiveTo: model.effectiveTo } : {}),
		entries: model.entries.map(
			/** Omit only absent optional fields; preserve invalid partial input for contract validation. */ (
				entry,
			) => ({
				date: entry.date,
				observedDate: entry.observedDate,
				category: entry.category,
				name: entry.name,
				priority: entry.priority,
				...(entry.regionCode ? { regionCode: entry.regionCode } : {}),
				...(entry.locationId ? { locationId: entry.locationId } : {}),
				...(entry.startTime ? { startTime: entry.startTime } : {}),
				...(entry.endTime ? { endTime: entry.endTime } : {}),
				...(entry.startOverlap || entry.endOverlap
					? {
						overlapOffset: {
							...(entry.startOverlap ? { start: entry.startOverlap } : {}),
							...(entry.endOverlap ? { end: entry.endOverlap } : {}),
						},
					}
					: {}),
			}),
		),
	})
}
