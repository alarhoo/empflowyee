import {
	dateValue,
	enumValue,
	idValue,
	intValue,
	invalidField,
	readBody,
} from '@empflowyee/hcm-runtime-contract'
import { configurationIdentity, configurationText } from './configuration-validation'
import {
	wallMilliseconds,
	type AttendanceConfigurationState,
	type OverlapChoice,
} from './hcm-attendance-contract'

export interface HolidayEntry {
	date: string
	observedDate: string
	category: 'Public' | 'Company' | 'Regional' | 'Substitute'
	name: string
	priority: number
	regionCode?: string
	locationId?: string
	startTime?: string
	endTime?: string
	overlapOffset?: { start?: OverlapChoice; end?: OverlapChoice }
}
export interface HolidayDraft {
	code: string
	name: string
	effectiveFrom: string
	effectiveTo?: string
	entries: HolidayEntry[]
}
export interface HolidayVersionView extends HolidayDraft {
	id: string
	versionId: string
	versionNumber: number
	revision: number
	state: AttendanceConfigurationState
}

/** Parse explicit actual and observed dates, preserving regional labels rather than guessing a jurisdiction. */
function holidayEntry(value: unknown, field: string): HolidayEntry {
	const input = readBody(
		value,
		['date', 'observedDate', 'category', 'name', 'priority'],
		['regionCode', 'locationId', 'startTime', 'endTime', 'overlapOffset'],
	)
	const result: HolidayEntry = {
		date: dateValue(input['date'], `${field}.date`),
		observedDate: dateValue(input['observedDate'], `${field}.observedDate`),
		category: enumValue(input['category'], `${field}.category`, [
			'Public',
			'Company',
			'Regional',
			'Substitute',
		]),
		name: configurationText(input['name'], `${field}.name`, 120),
		priority: intValue(input['priority'], `${field}.priority`, -2147483648, 2147483647),
	}
	if (input['regionCode'] !== undefined)
		result.regionCode = configurationText(input['regionCode'], `${field}.regionCode`, 120)
	if (input['locationId'] !== undefined)
		result.locationId = idValue(input['locationId'], `${field}.locationId`)
	if (input['startTime'] !== undefined || input['endTime'] !== undefined) {
		const start = wallMilliseconds(input['startTime'], `${field}.startTime`)
		const end = wallMilliseconds(input['endTime'], `${field}.endTime`)
		if (end <= start) invalidField(`${field}.endTime`, 'ordered-interval-required')
		result.startTime = input['startTime'] as string
		result.endTime = input['endTime'] as string
		if (input['overlapOffset'] !== undefined) {
			const offset = readBody(input['overlapOffset'], [], ['start', 'end'])
			if (!Object.keys(offset).length) invalidField(`${field}.overlapOffset`)
			result.overlapOffset = {}
			if (offset['start'] !== undefined)
				result.overlapOffset.start = enumValue<OverlapChoice>(
					offset['start'],
					`${field}.overlapOffset.start`,
					['Earlier', 'Later'],
				)
			if (offset['end'] !== undefined)
				result.overlapOffset.end = enumValue<OverlapChoice>(
					offset['end'],
					`${field}.overlapOffset.end`,
					['Earlier', 'Later'],
				)
		}
	} else if (input['overlapOffset'] !== undefined)
		invalidField(`${field}.overlapOffset`, 'not-applicable')
	return result
}

/** Validate a whole calendar; dated zone/scope intersections are checked by the server publication preview. */
export function parseHolidayDraft(value: unknown): HolidayDraft {
	const input = readBody(value, ['code', 'name', 'effectiveFrom', 'entries'], ['effectiveTo'])
	if (!Array.isArray(input['entries'])) invalidField('entries')
	const identity = configurationIdentity(input)
	const entries = input['entries'].map(
		/** Associate nested validation with its exact form row without replacing observed dates. */ (
			entry,
			index,
		) => holidayEntry(entry, `entries.${index}`),
	)
	for (const [index, entry] of entries.entries()) {
		if (
			entry.observedDate < identity.effectiveFrom ||
			(identity.effectiveTo !== undefined && entry.observedDate > identity.effectiveTo)
		)
			invalidField(`entries.${index}.observedDate`, 'outside-effective-period')
	}
	return { ...identity, entries }
}
