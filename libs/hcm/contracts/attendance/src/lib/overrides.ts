import {
	dateValue,
	idValue,
	invalidField,
	readBody,
	revisionValue,
} from '@empflowyee/hcm-runtime-contract'
import {
	attendanceZone,
	parseAttendanceSegments,
	type ScheduleSegment,
} from './hcm-attendance-contract'
import { configurationText } from './configuration-validation'

export interface AttendanceOverrideDraft {
	employmentId: string
	workDate: string
	workdayRevision: number
	segments: ScheduleSegment[]
	zone: string
	reason: string
	evidenceIds: string[]
}
/** Safe source projection deliberately excludes private narrative and attachment identities. */
export interface AttendanceOverrideView {
	id: string
	revision: number
	state: 'Draft' | 'Approved' | 'Cancelled' | 'Superseded'
	employmentId: string
	workDate: string
	workdayRevision: number
	segments: ScheduleSegment[]
	zone: string
	approval?: {
		caseId: string
		revision: number
		generation: number
		state: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled' | 'Invalidated'
		requiredSlots: number
		pendingSlots: number
	}
}
export interface AttendanceOverrideReview {
	previewId: string
	digest: string
	expiresAt: string
	sourceRevision: number
	workdayRevision: number
	scheduledMilliseconds: string
	expectedMilliseconds: string
	approvalRequired: boolean
}
/** Submission acknowledges persisted independent approval work; it never reports an unexecuted approval as successful. */
export interface AttendanceOverrideSubmission {
	id: string
	revision: number
	state: 'PendingApproval'
	caseId: string
	caseRevision: number
	generation: number
	operationId: string
}

/** Parse a complete dated override; an explicitly empty segment list means nonworking, never missing configuration. */
export function parseAttendanceOverrideDraft(value: unknown): AttendanceOverrideDraft {
	const input = readBody(value, [
		'employmentId',
		'workDate',
		'workdayRevision',
		'segments',
		'zone',
		'reason',
		'evidenceIds',
	])
	if (!Array.isArray(input['segments'])) invalidField('segments')
	if (!Array.isArray(input['evidenceIds'])) invalidField('evidenceIds')
	const evidenceIds = input['evidenceIds'].map(
		/** Validate each opaque evidence identity without accepting a storage path or coercing a number. */ (
			id,
			index,
		) => idValue(id, `evidenceIds.${index}`),
	)
	if (new Set(evidenceIds).size !== evidenceIds.length) invalidField('evidenceIds', 'duplicate')
	return {
		employmentId: idValue(input['employmentId'], 'employmentId'),
		workDate: dateValue(input['workDate'], 'workDate'),
		workdayRevision: revisionValue(input['workdayRevision']),
		segments: input['segments'].length ? parseAttendanceSegments(input['segments']) : [],
		zone: attendanceZone(input['zone'], 'zone'),
		reason: configurationText(input['reason'], 'reason', 2000),
		evidenceIds,
	}
}
