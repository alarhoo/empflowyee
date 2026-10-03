import {
	enumValue,
	readBody,
	revisionValue,
	preservedTextValue,
} from '@empflowyee/hcm-runtime-contract'

export interface AttendanceDecisionCommand {
	expectedRevision: number
	expectedSubjectRevision: number
	generation: number
	action: 'Approve' | 'Reject'
	reason: string
}
export interface AttendanceApprovalCaseView {
	id: string
	revision: number
	subjectType: 'Override'
	subjectId: string
	subjectRevision: number
	generation: number
	state: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled' | 'Invalidated'
	workDate: string
	slots: {
		id: string
		revision: number
		stage: number
		state: 'Pending' | 'Approved' | 'Rejected'
		allowedActions: ('Approve' | 'Reject')[]
	}[]
}

/** Parse the approved source decision shape; task, actor, authority and slot identity never come from the body. */
export function parseAttendanceDecision(value: unknown): AttendanceDecisionCommand {
	const body = readBody(value, [
		'expectedRevision',
		'expectedSubjectRevision',
		'generation',
		'action',
		'reason',
	])
	return {
		expectedRevision: revisionValue(body['expectedRevision']),
		expectedSubjectRevision: revisionValue(
			body['expectedSubjectRevision'],
			'expectedSubjectRevision',
		),
		generation: revisionValue(body['generation'], 'generation'),
		action: enumValue(body['action'], 'action', ['Approve', 'Reject']),
		reason: preservedTextValue(body['reason'], 'reason', 2000),
	}
}
