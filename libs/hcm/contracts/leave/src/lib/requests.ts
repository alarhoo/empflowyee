import {
	dateValue,
	enumValue,
	idValue,
	intValue,
	invalidField,
	preservedTextValue,
	readBody,
	HcmDomainError,
} from '@empflowyee/hcm-runtime-contract'
import { wallMilliseconds } from '@empflowyee/hcm-attendance-contract'
import type { LeaveTrackingMode, LeaveUnits } from './hcm-leave-contract'

export type LeaveRequestDayInput =
	| { workDate: string; portion: 'Full' | 'FirstHalf' | 'SecondHalf' }
	| {
		workDate: string
		portion: 'Hourly'
		startTime: string
		endTime: string
		startDayOffset: 0 | 1
		endDayOffset: 0 | 1
		offset?: { start?: string; end?: string }
	}
export interface LeaveRequestDraft {
	employmentId: string
	enrollmentId: string
	days: LeaveRequestDayInput[]
	reason: string
	evidenceIds: string[]
}
/** Safe reload evidence excludes private reasons, evidence identities and workforce eligibility facts. */
export interface LeaveRequestView {
	id: string
	revision: number
	state: 'Draft'
	employmentId: string
	enrollmentId: string
	policyVersionId: string
	periodId: string
	trackingMode: LeaveTrackingMode
	totalUnits: LeaveUnits
	days: {
		input: LeaveRequestDayInput
		workdayRevision: number
		zone: string
		scheduledMilliseconds: string
		requestedMilliseconds: string
		units: LeaveUnits
	}[]
	approvalProgress: null
	allowedActions: string[]
}

/** Validate a numeric UTC offset without coercing or silently removing precision. */
function offset(value: unknown, field: string): string {
	if (typeof value !== 'string' || !/^[+-](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value))
		invalidField(field)
	return value
}
/** Retain nested unknown/missing-field locations for the same accessible form feedback used by authoritative parsing. */
function object(value: unknown, field: string, required: string[], optional: string[]) {
	try {
		return readBody(value, required, optional)
	} catch (error) {
		if (error instanceof HcmDomainError)
			for (const issue of error.fieldErrors ?? []) issue.field = `${field}.${issue.field}`
		throw error
	}
}
/** Parse one local-day portion; only an hourly row may carry wall times, day offsets or DST evidence. */
export function readLeaveRequestDay(value: unknown, field = 'day'): LeaveRequestDayInput {
	const body = object(
		value,
		field,
		['workDate', 'portion'],
		['startTime', 'endTime', 'startDayOffset', 'endDayOffset', 'offset'],
	)
	const workDate = dateValue(body['workDate'], `${field}.workDate`),
		portion = enumValue(body['portion'], `${field}.portion`, [
			'Full',
			'FirstHalf',
			'SecondHalf',
			'Hourly',
		])
	if (portion !== 'Hourly') {
		for (const key of ['startTime', 'endTime', 'startDayOffset', 'endDayOffset', 'offset'])
			if (key in body) invalidField(`${field}.${key}`, 'not-applicable')
		return { workDate, portion }
	}
	const startTime = body['startTime'],
		endTime = body['endTime']
	wallMilliseconds(startTime, `${field}.startTime`)
	wallMilliseconds(endTime, `${field}.endTime`)
	const startDayOffset = intValue(body['startDayOffset'], `${field}.startDayOffset`, 0, 1) as 0 | 1
	const endDayOffset = intValue(body['endDayOffset'], `${field}.endDayOffset`, 0, 1) as 0 | 1
	if (endDayOffset < startDayOffset) invalidField(`${field}.endDayOffset`, 'invalid-range')
	let selected: { start?: string; end?: string } | undefined
	if ('offset' in body) {
		const offsets = object(body['offset'], `${field}.offset`, [], ['start', 'end'])
		if (Object.keys(offsets).length === 0) invalidField(`${field}.offset`)
		selected = {
			...('start' in offsets ? { start: offset(offsets['start'], `${field}.offset.start`) } : {}),
			...('end' in offsets ? { end: offset(offsets['end'], `${field}.offset.end`) } : {}),
		}
	}
	return {
		workDate,
		portion,
		startTime: startTime as string,
		endTime: endTime as string,
		startDayOffset,
		endDayOffset,
		...(selected ? { offset: selected } : {}),
	}
}
/** Share closed request fields and structural bounds between native Signal Forms and authoritative commands. */
export function readLeaveRequestDraft(value: unknown): LeaveRequestDraft {
	const body = readBody(value, ['employmentId', 'enrollmentId', 'days', 'reason', 'evidenceIds'])
	if (!Array.isArray(body['days']) || body['days'].length < 1 || body['days'].length > 366)
		invalidField('days')
	const days = body['days'].map(
		/** Preserve nested field identity and submitted ordering. */ (day, index) =>
			readLeaveRequestDay(day, `days.${index}`),
	)
	const dates = days
		.map(/** Compare ISO local dates without machine-zone conversion. */ (day) => day.workDate)
		.sort()
	if (new Set(dates).size !== dates.length) invalidField('days', 'duplicate')
	if (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0]) > 365 * 86_400_000)
		invalidField('days', 'range-too-large')
	if (!Array.isArray(body['evidenceIds'])) invalidField('evidenceIds')
	const evidenceIds = body['evidenceIds'].map(
		/** Validate opaque document identities without accepting a storage path. */ (id, index) =>
			idValue(id, `evidenceIds.${index}`),
	)
	if (new Set(evidenceIds).size !== evidenceIds.length) invalidField('evidenceIds', 'duplicate')
	return {
		employmentId: idValue(body['employmentId'], 'employmentId'),
		enrollmentId: idValue(body['enrollmentId'], 'enrollmentId'),
		days,
		reason: preservedTextValue(body['reason'], 'reason', 2000),
		evidenceIds,
	}
}
