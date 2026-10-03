import { dateValue, idValue, invalidField } from '@empflowyee/hcm-runtime-contract'

export interface AttendanceWorkdayQuery {
	employmentId: string
	from: string
	to: string
}
export interface WorkdaySourceView {
	family: 'Schedule' | 'Policy' | 'Holiday' | 'Shift'
	id: string
	versionId: string
	versionNumber: number
	name: string
}
export interface WorkdayDatedSourceView {
	family: 'Override' | 'Roster'
	id: string
	name: string
	revision: number | null
}
export interface WorkdaySegmentView {
	kind: 'Work' | 'UnpaidBreak' | 'Holiday' | 'ExpectedWork'
	startInstant: string
	endInstant: string
	startLocal: string
	endLocal: string
	startOffsetSeconds: number
	endOffsetSeconds: number
	elapsedMilliseconds: string
	holidayId: string | null
	holidayName: string | null
}
export interface WorkdayRestRuleView {
	source: 'Schedule' | 'Policy'
	versionId: string
	minutes: number | null
	mode: 'Warn' | 'Block' | null
	outcome: 'Disabled' | 'Satisfied' | 'Warn' | 'Block' | null
	elapsedMilliseconds: string | null
}
export interface WorkdayRestView {
	state: 'NotRequired' | 'NoPriorEmploymentWork' | 'Compared'
	previousWorkDate: string | null
	previousEnd: string | null
	currentStart: string | null
	rules: WorkdayRestRuleView[]
}
export type WorkdayView =
	| {
		state: 'Published'
		employmentId: string
		workDate: string
		id: string
		revision: number
		digest: string
		kind: 'Work' | 'Rest' | 'Holiday' | 'NonWorkingOverride'
		zone: string
		resolvedAt: string
		scheduledMilliseconds: string
		breakMilliseconds: string
		elapsedMilliseconds: string
		supersedesId: string | null
		sourceVersions: WorkdaySourceView[]
		datedSources: WorkdayDatedSourceView[]
		segments: WorkdaySegmentView[]
		rest: WorkdayRestView | null
	}
	| {
		state: 'Unavailable'
		employmentId: string
		workDate: string
		unavailableCode: 'NotResolved' | 'ResolutionPending' | 'ResolutionFailed' | string
	}
export interface WorkdayPage {
	items: WorkdayView[]
	nextCursor: null
}

/** Exact quantity inputs shared by persisted workdays and explicitly proposed impact calculations. */
export type WorkdayQuantityBasis = Pick<
	Extract<WorkdayView, { state: 'Published' }>,
	'kind' | 'scheduledMilliseconds' | 'elapsedMilliseconds'
> & {
	segments: Pick<
		WorkdaySegmentView,
		'kind' | 'startInstant' | 'endInstant' | 'elapsedMilliseconds'
	>[]
}

/** A bounded single-employment agenda is date-ordered on the server and never silently picks an employment. */
export function parseWorkdayQuery(params: URLSearchParams): AttendanceWorkdayQuery {
	for (const key of params.keys()) {
		if (!['employmentId', 'from', 'to'].includes(key)) invalidField(key, 'unknown')
		if (params.getAll(key).length !== 1) invalidField(key, 'duplicate')
	}
	const employmentId = idValue(params.get('employmentId'), 'employmentId'),
		from = dateValue(params.get('from'), 'from'),
		to = dateValue(params.get('to'), 'to')
	if (to < from || Date.parse(to) - Date.parse(from) > 365 * 86400000) invalidField('to')
	return { employmentId, from, to }
}
