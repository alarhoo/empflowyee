import {
	parseHolidayAssignment,
	parseHolidayAssignmentQuery,
	type HolidayAssignmentCommand,
	type ParsedHolidayAssignment,
} from './holiday-assignments'
import type { AttendanceScopeTarget } from './assignments'
import { idValue, readBody, invalidField } from '@empflowyee/hcm-runtime-contract'

export type WorkAssignmentFamily = 'Schedule' | 'Policy'
export type WorkAssignmentCommand = HolidayAssignmentCommand
export type ParsedWorkAssignment = ParsedHolidayAssignment
export interface WorkAssignmentLeaveImpact {
	digest: string
	affectedRequestCount: number
	changedRequestCount: number
	unavailableRequestCount: number
}
export interface WorkAssignmentReview {
	/** Safe source-owned recalculation evidence; historical receipts may predate this projection. */
	leaveImpact?: WorkAssignmentLeaveImpact
	previewId: string
	digest: string
	expiresAt: string
	affectedEmploymentCount: number
	affectedWorkdayCount: number
	queuedWorkdays: number
	unavailableWorkdays: number
}
export type ReviewedWorkAssignmentCommand = WorkAssignmentCommand & {
	previewId: string
	digest: string
}

/** Separate actor-bound review evidence from the unchanged assignment input contract. */
export function parseReviewedWorkAssignment(value: unknown) {
	const body = readBody(
		value,
		['previewId', 'digest'],
		[
			'versionId',
			'effectiveFrom',
			'effectiveTo',
			'reason',
			'expectedRevision',
			'resolutionFrom',
			'resolutionTo',
			'supersedes',
			'tenantScope',
			'legalEntityId',
			'orgUnitId',
			'departmentId',
			'locationId',
			'assignmentId',
			'employmentId',
		],
	)
	const { previewId, digest, ...assignment } = body
	if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) invalidField('digest')
	return {
		input: parseWorkAssignment(assignment),
		previewId: idValue(previewId, 'previewId'),
		digest,
	}
}
export interface WorkAssignmentView {
	id: string
	family: WorkAssignmentFamily
	configurationId: string
	configurationName: string
	versionId: string
	revision: number
	target: AttendanceScopeTarget
	effectiveFrom: string
	effectiveTo: string | null
}
export interface WorkAssignmentResult extends WorkAssignmentView {
	leaveImpact?: WorkAssignmentLeaveImpact
	resolutionFrom: string
	resolutionTo: string
	queuedWorkdays: number
	unavailableWorkdays: number
}
/** Reuse the closed seven-scope assignment, exact revision and bounded materialization contract. */
export function parseWorkAssignment(value: unknown): ParsedWorkAssignment {
	return parseHolidayAssignment(value)
}
/** Read only one exact authorized target/date, using the same maintained scope restrictions. */
export function parseWorkAssignmentQuery(params: URLSearchParams) {
	return parseHolidayAssignmentQuery(params)
}
