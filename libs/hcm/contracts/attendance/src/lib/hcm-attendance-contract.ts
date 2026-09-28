import { dateValue, invalidField, readBody } from '@empflowyee/hcm-runtime-contract'

export type AttendanceConfigurationState = 'Draft' | 'Published' | 'Retired'
export type OverlapChoice = 'Earlier' | 'Later'
export type AttendanceSegmentKind = 'Work' | 'UnpaidBreak'

/** A configured wall interval; day offsets are relative to the owning start work date. */
export interface ScheduleSegment {
	startTime: string
	endTime: string
	endDayOffset: 0 | 1
	kind: AttendanceSegmentKind
	overlapOffset?: { start?: OverlapChoice; end?: OverlapChoice }
}
export interface ScheduleDay {
	weekday: number
	kind: 'Work' | 'Rest'
	segments: ScheduleSegment[]
}
export interface ScheduleDraft {
	code: string
	name: string
	description?: string
	isTemplate: boolean
	effectiveFrom: string
	effectiveTo?: string
	timezoneMode: 'Employment' | 'Location' | 'Fixed'
	fixedZone?: string
	weekStartsOn: number
	minimumRestMinutes?: number
	minimumRestMode?: 'Warn' | 'Block'
	days: ScheduleDay[]
}
export interface ExactInterval {
	startMilliseconds: number
	endMilliseconds: number
}
export interface ResolvedScheduleSegment extends ExactInterval {
	kind: AttendanceSegmentKind
	startInstant: string
	endInstant: string
	startOffset: string
	endOffset: string
	elapsedMilliseconds: string
}

/** Preserve submitted text exactly; validation never trims a business value into validity. */
function text(value: unknown, field: string, maximum: number, required = true): string {
	if (
		typeof value !== 'string' ||
		value.length > maximum ||
		(required && !value.trim()) ||
		/\p{Cc}/u.test(value.replace(/[\n\r\t]/g, ''))
	)
		invalidField(field)
	return value
}

/** Parse one member of a closed enum without coercion. */
function choice<const Value extends string>(
	value: unknown,
	values: readonly Value[],
	field: string,
): Value {
	if (typeof value !== 'string' || !values.includes(value as Value)) invalidField(field)
	return value as Value
}

/** Require exact integer values and reject floating point or overflow before scheduling calculations. */
function integer(value: unknown, minimum: number, maximum: number, field: string): number {
	if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum)
		invalidField(field)
	return Number(value)
}

/** Accept millisecond-precision ISO wall time without a timezone, leap second or implicit day rollover. */
export function wallMilliseconds(value: unknown, field = 'time'): number {
	if (
		typeof value !== 'string' ||
		!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/.test(value)
	)
		invalidField(field)
	const [hours, minutes, seconds = '0'] = value.split(':')
	const [wholeSeconds, fraction = ''] = seconds.split('.')
	return (
		Number(hours) * 3600000 +
		Number(minutes) * 60000 +
		Number(wholeSeconds) * 1000 +
		Number(fraction.padEnd(3, '0'))
	)
}

/** Resolve only a named IANA timezone; fixed numeric offsets are insufficient schedule authority. */
export function attendanceZone(value: unknown, field = 'timezone'): string {
	if (
		typeof value !== 'string' ||
		value.length > 100 ||
		!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(value)
	)
		invalidField(field)
	try {
		new Intl.DateTimeFormat('en', { timeZone: value }).format(0)
	} catch {
		invalidField(field)
	}
	return value
}

/** Parse one segment with independent choices for an ambiguous start and end, preserving exact configured wall time. */
function segment(value: unknown, field: string): ScheduleSegment {
	const item = readBody(value, ['startTime', 'endTime', 'endDayOffset', 'kind'], ['overlapOffset'])
	wallMilliseconds(item['startTime'], `${field}.startTime`)
	wallMilliseconds(item['endTime'], `${field}.endTime`)
	let overlapOffset: ScheduleSegment['overlapOffset']
	if (item['overlapOffset'] !== undefined) {
		const offset = readBody(item['overlapOffset'], [], ['start', 'end'])
		if (!Object.keys(offset).length) invalidField(`${field}.overlapOffset`)
		overlapOffset = {}
		if (offset['start'] !== undefined)
			overlapOffset.start = choice(
				offset['start'],
				['Earlier', 'Later'],
				`${field}.overlapOffset.start`,
			)
		if (offset['end'] !== undefined)
			overlapOffset.end = choice(offset['end'], ['Earlier', 'Later'], `${field}.overlapOffset.end`)
	}
	return {
		startTime: item['startTime'] as string,
		endTime: item['endTime'] as string,
		endDayOffset: integer(item['endDayOffset'], 0, 1, `${field}.endDayOffset`) as 0 | 1,
		kind: choice(item['kind'], ['Work', 'UnpaidBreak'], `${field}.kind`),
		...(overlapOffset ? { overlapOffset } : {}),
	}
}

/** Validate a single continuous shift envelope; a configured unpaid break fills a gap rather than overlapping a work segment. */
export function validateScheduleSegments(
	segments: readonly ScheduleSegment[],
	field = 'segments',
): void {
	if (!segments.length || segments[0].kind !== 'Work' || segments.at(-1)?.kind !== 'Work')
		invalidField(field, 'single-shift-required')
	let previousEnd: number | null = null
	for (const item of segments) {
		const startTime = wallMilliseconds(item.startTime)
		const start =
			startTime + (previousEnd === null ? 0 : Math.floor(previousEnd / 86400000) * 86400000)
		const end = wallMilliseconds(item.endTime) + item.endDayOffset * 86400000
		const explicitFold =
			item.overlapOffset?.start === 'Earlier' && item.overlapOffset?.end === 'Later'
		if ((end <= start && !explicitFold) || (previousEnd !== null && start !== previousEnd))
			invalidField(field, 'ordered-contiguous-shift-required')
		previousEnd = end
	}
}

/** Parse the complete seven-day draft shared by browser forms and authoritative API commands. */
export function parseScheduleDraft(value: unknown): ScheduleDraft {
	const input = readBody(
		value,
		['code', 'name', 'isTemplate', 'effectiveFrom', 'timezoneMode', 'weekStartsOn', 'days'],
		['description', 'effectiveTo', 'fixedZone', 'minimumRestMinutes', 'minimumRestMode'],
	)
	const code = text(input['code'], 'code', 40)
	if (!/^[A-Z][A-Z0-9_-]*$/.test(code)) invalidField('code')
	if (typeof input['isTemplate'] !== 'boolean') invalidField('isTemplate')
	const effectiveFrom = dateValue(input['effectiveFrom'], 'effectiveFrom')
	const effectiveTo =
		input['effectiveTo'] === undefined ? undefined : dateValue(input['effectiveTo'], 'effectiveTo')
	if (effectiveTo !== undefined && effectiveTo < effectiveFrom) invalidField('effectiveTo')
	const timezoneMode = choice(
		input['timezoneMode'],
		['Employment', 'Location', 'Fixed'],
		'timezoneMode',
	)
	let fixedZone: string | undefined
	if (timezoneMode === 'Fixed') fixedZone = attendanceZone(input['fixedZone'], 'fixedZone')
	else if (input['fixedZone'] !== undefined) invalidField('fixedZone', 'not-applicable')
	let minimumRestMinutes: number | undefined
	let minimumRestMode: ScheduleDraft['minimumRestMode']
	if (input['minimumRestMinutes'] !== undefined) {
		minimumRestMinutes = integer(
			input['minimumRestMinutes'],
			0,
			Number.MAX_SAFE_INTEGER,
			'minimumRestMinutes',
		)
		minimumRestMode = choice(input['minimumRestMode'], ['Warn', 'Block'], 'minimumRestMode')
	} else if (input['minimumRestMode'] !== undefined)
		invalidField('minimumRestMode', 'not-applicable')
	if (!Array.isArray(input['days']) || input['days'].length !== 7)
		invalidField('days', 'seven-days-required')
	const seen = new Set<number>()
	const days = input['days'].map(
		/** Parse each weekday exactly once and reject rest days that secretly contain work. */ (
			day,
			index,
		): ScheduleDay => {
			const field = `days.${index}`
			const item = readBody(day, ['weekday', 'kind', 'segments'])
			const weekday = integer(item['weekday'], 1, 7, `${field}.weekday`)
			if (seen.has(weekday)) invalidField(`${field}.weekday`, 'duplicate')
			seen.add(weekday)
			const kind = choice(item['kind'], ['Work', 'Rest'], `${field}.kind`)
			if (!Array.isArray(item['segments'])) invalidField(`${field}.segments`)
			const segments = item['segments'].map(
				/** Retain the caller's explicit segment order and classify errors by its form position. */ (
					entry,
					i,
				) => segment(entry, `${field}.segments.${i}`),
			)
			if (kind === 'Rest' && segments.length)
				invalidField(`${field}.segments`, 'rest-must-be-empty')
			if (kind === 'Work') validateScheduleSegments(segments, `${field}.segments`)
			return { weekday, kind, segments }
		},
	)
	return {
		code,
		name: text(input['name'], 'name', 120),
		isTemplate: input['isTemplate'],
		effectiveFrom,
		timezoneMode,
		weekStartsOn: integer(input['weekStartsOn'], 1, 7, 'weekStartsOn'),
		days,
		...(input['description'] !== undefined
			? { description: text(input['description'], 'description', 2000, false) }
			: {}),
		...(effectiveTo !== undefined ? { effectiveTo } : {}),
		...(fixedZone !== undefined ? { fixedZone } : {}),
		...(minimumRestMinutes !== undefined ? { minimumRestMinutes, minimumRestMode } : {}),
	}
}
