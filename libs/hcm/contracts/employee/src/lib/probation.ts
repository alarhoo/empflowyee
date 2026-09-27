import {
	dateValue,
	enumValue,
	idValue,
	intValue,
	invalidField,
	readBody,
	readListQuery,
	revisionValue,
	textValue,
	type HcmPage,
} from '@empflowyee/hcm-runtime-contract'

/**
 * Probation vocabulary (Probation Management and Probation Review TDD#API, DEC-HCM2-003): one
 * Final review due 14 days before the probation end date, reviewer assessments with a 1-5 rating
 * and a recommendation, and an HR decision that updates employment probation facts. Overdue and
 * escalated states are computed at read time in the organisation time zone.
 */

export const REVIEW_TYPES = ['Final', 'AdHoc'] as const
export type ReviewType = (typeof REVIEW_TYPES)[number]
export const REVIEW_STATUSES = ['Scheduled', 'AssessmentSubmitted', 'Decided', 'Cancelled'] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]
export const PROBATION_OUTCOMES = ['Confirm', 'Extend', 'Fail', 'NoChange'] as const
export type ProbationOutcome = (typeof PROBATION_OUTCOMES)[number]
export const PROBATION_VIEWS = ['due-soon', 'overdue', 'all'] as const
export type ProbationView = (typeof PROBATION_VIEWS)[number]
/** Probation statuses of an employment in probation. */
export const IN_PROBATION = ['InProgress', 'Extended'] as const
export const PROBATION_OPTION_KINDS = ['employments', 'reviewers'] as const
export type ProbationOptionKind = (typeof PROBATION_OPTION_KINDS)[number]

/** DEC-HCM2-003 defaults. */
export const FINAL_REVIEW_LEAD_DAYS = 14
export const MAX_EXTENSION_DAYS = 90
export const ESCALATION_DAYS = 7
/** Reviews due within this many days count as due soon. */
export const DUE_SOON_DAYS = 30

/** A review's state as shown: its stored status, or Overdue/Escalated when undecided past due. */
export type ReviewState = ReviewStatus | 'Overdue' | 'Escalated'

export interface ProbationAccountRef {
	accountId: string
	name: string
}

export interface ProbationCaseDto {
	employmentId: string
	workerId: string
	workerName: string
	workerNumber: string
	designation: string | null
	unit: string | null
	hireDate: string
	probationEndDate: string | null
	probationStatus: string
	nextReview: { id: string; reviewType: ReviewType; dueDate: string; state: ReviewState } | null
	overdue: boolean
}

export type ProbationCasePage = HcmPage<ProbationCaseDto>

export interface ProbationReviewSummaryDto {
	id: string
	employmentId: string
	workerName: string
	workerNumber: string
	sequenceNumber: number
	reviewType: ReviewType
	dueDate: string
	status: ReviewStatus
	state: ReviewState
	reviewer: ProbationAccountRef | null
}

export type ProbationReviewPage = HcmPage<ProbationReviewSummaryDto>

export interface ProbationAssessmentDto {
	id: string
	versionNumber: number
	reviewer: ProbationAccountRef
	recommendation: ProbationOutcome
	overallRating: number
	strengths: string
	concerns: string
	recommendationReason: string
	current: boolean
	submittedAt: string
}

export interface ProbationDecisionDto {
	id: string
	reviewId: string
	outcome: ProbationOutcome
	effectiveDate: string
	previousProbationEndDate: string
	extendedProbationEndDate: string | null
	reason: string
	evidenceReference: string | null
	decidedBy: string
	decidedAt: string
}

/** Minimal worker context shared by HR and reviewers; it carries no personal data. */
export interface ProbationContextDto {
	workerName: string
	workerNumber: string
	designation: string | null
	unit: string | null
	hireDate: string
	probationEndDate: string | null
	probationStatus: string
}

/** HR view of one review. */
export interface ProbationReviewDto extends ProbationReviewSummaryDto {
	context: ProbationContextDto
	periodStart: string
	periodEnd: string
	probationEndDate: string
	scheduleReason: string
	cancelReason: string | null
	owner: ProbationAccountRef
	/** The worker's current primary manager, when they can review, to prefill reassignment. */
	suggestedReviewer: ProbationAccountRef | null
	assessments: ProbationAssessmentDto[]
	decision: ProbationDecisionDto | null
	/** Every review of the employment, in sequence, with its decision. */
	history: (ProbationReviewSummaryDto & { decision: ProbationDecisionDto | null })[]
	/** Latest date an extension may reach, or null when no extension is allowed. */
	maxExtendedEndDate: string | null
	actions: { assignReviewer: boolean; cancel: boolean; decide: boolean }
	revision: number
}

/** Reviewer view of one assigned review. */
export interface ReviewerReviewDto {
	id: string
	reviewType: ReviewType
	dueDate: string
	status: ReviewStatus
	state: ReviewState
	periodStart: string
	periodEnd: string
	context: ProbationContextDto
	assessments: ProbationAssessmentDto[]
	/** Earlier decisions on the same employment. */
	previousDecisions: { outcome: ProbationOutcome; effectiveDate: string; decidedAt: string }[]
	actions: { assess: boolean }
	revision: number
}

export interface ReviewerReviewSummaryDto {
	id: string
	workerName: string
	reviewType: ReviewType
	dueDate: string
	status: ReviewStatus
	state: ReviewState
}

export type ReviewerReviewPage = HcmPage<ReviewerReviewSummaryDto>

export interface ProbationOptionDto {
	id: string
	name: string
	detail: string
}

export type ProbationOptionPage = HcmPage<ProbationOptionDto>

// Commands and queries.

export interface ScheduleReviewCommand {
	employmentId: string
	reviewType: ReviewType
	periodStart: string
	periodEnd: string
	dueDate: string
	reviewerAccountId: string | null
	reason: string
}

export interface DecisionCommand {
	outcome: ProbationOutcome
	effectiveDate: string
	extendedProbationEndDate: string | null
	reason: string
	evidenceReference: string | null
	expectedRevision: number
}

export interface AssessmentCommand {
	recommendation: ProbationOutcome
	overallRating: number
	strengths: string
	concerns: string
	recommendationReason: string
	expectedRevision: number
}

/** An optional trimmed text, or null when absent or blank. */
function optional(value: unknown, field: string, max: number): string | null {
	if (value === undefined || value === null) return null
	const text = textValue(value, field, max, false).trim()
	return text || null
}

/** Parse a review to schedule. */
export function parseScheduleReview(body: unknown): ScheduleReviewCommand {
	const v = readBody(
		body,
		['employmentId', 'reviewType', 'periodStart', 'periodEnd', 'dueDate', 'reason'],
		['reviewerAccountId'],
	)
	const periodStart = dateValue(v['periodStart'], 'periodStart')
	const periodEnd = dateValue(v['periodEnd'], 'periodEnd')
	if (periodEnd < periodStart) invalidField('periodEnd', 'before-start')
	return {
		employmentId: idValue(v['employmentId'], 'employmentId'),
		reviewType: enumValue(v['reviewType'], 'reviewType', REVIEW_TYPES),
		periodStart,
		periodEnd,
		dueDate: dateValue(v['dueDate'], 'dueDate'),
		reviewerAccountId:
			v['reviewerAccountId'] === undefined || v['reviewerAccountId'] === null
				? null
				: idValue(v['reviewerAccountId'], 'reviewerAccountId'),
		reason: textValue(v['reason'], 'reason', 500),
	}
}

/** Parse a reviewer assignment. */
export function parseAssignReviewer(body: unknown): {
	reviewerAccountId: string
	expectedRevision: number
	reason: string
} {
	const v = readBody(body, ['reviewerAccountId', 'expectedRevision', 'reason'])
	return {
		reviewerAccountId: idValue(v['reviewerAccountId'], 'reviewerAccountId'),
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: textValue(v['reason'], 'reason', 500),
	}
}

/** Parse a review cancellation. */
export function parseCancelReview(body: unknown): { expectedRevision: number; reason: string } {
	const v = readBody(body, ['expectedRevision', 'reason'])
	return {
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: textValue(v['reason'], 'reason', 500),
	}
}

/** Parse an HR decision; the extended end date belongs to Extend only. */
export function parseDecision(body: unknown): DecisionCommand {
	const v = readBody(
		body,
		['outcome', 'effectiveDate', 'reason', 'expectedRevision'],
		['extendedProbationEndDate', 'evidenceReference'],
	)
	const outcome = enumValue(v['outcome'], 'outcome', PROBATION_OUTCOMES)
	const extended =
		v['extendedProbationEndDate'] === undefined || v['extendedProbationEndDate'] === null
			? null
			: dateValue(v['extendedProbationEndDate'], 'extendedProbationEndDate')
	if (outcome === 'Extend' && !extended) invalidField('extendedProbationEndDate', 'required')
	if (outcome !== 'Extend' && extended) invalidField('extendedProbationEndDate', 'not-allowed')
	return {
		outcome,
		effectiveDate: dateValue(v['effectiveDate'], 'effectiveDate'),
		extendedProbationEndDate: extended,
		reason: textValue(v['reason'], 'reason', 1000),
		evidenceReference: optional(v['evidenceReference'], 'evidenceReference', 200),
		expectedRevision: revisionValue(v['expectedRevision']),
	}
}

/** Parse a reviewer assessment; the rating is an integer from 1 to 5. */
export function parseAssessment(body: unknown): AssessmentCommand {
	const v = readBody(
		body,
		['recommendation', 'overallRating', 'recommendationReason', 'expectedRevision'],
		['strengths', 'concerns'],
	)
	return {
		recommendation: enumValue(v['recommendation'], 'recommendation', PROBATION_OUTCOMES),
		overallRating: intValue(v['overallRating'], 'overallRating', 1, 5),
		strengths: optional(v['strengths'], 'strengths', 2000) ?? '',
		concerns: optional(v['concerns'], 'concerns', 2000) ?? '',
		recommendationReason: textValue(v['recommendationReason'], 'recommendationReason', 2000),
		expectedRevision: revisionValue(v['expectedRevision']),
	}
}

/** Parse a case page query. */
export function parseCaseQuery(params: URLSearchParams) {
	const query = readListQuery(params, ['dueDate:asc'], ['view', 'unitId'])
	return {
		limit: query.limit,
		q: query.q,
		view: query.filters['view']
			? enumValue(query.filters['view'], 'view', PROBATION_VIEWS)
			: ('all' as ProbationView),
		...(query.cursor ? { cursor: query.cursor } : {}),
		...(query.filters['unitId'] ? { unitId: idValue(query.filters['unitId'], 'unitId') } : {}),
	}
}

/** Parse an HR review page query. */
export function parseReviewQuery(params: URLSearchParams) {
	const query = readListQuery(params, ['dueDate:asc'], ['status', 'reviewType'])
	return {
		limit: query.limit,
		...(query.cursor ? { cursor: query.cursor } : {}),
		...(query.filters['status']
			? { status: enumValue(query.filters['status'], 'status', REVIEW_STATUSES) }
			: {}),
		...(query.filters['reviewType']
			? { reviewType: enumValue(query.filters['reviewType'], 'reviewType', REVIEW_TYPES) }
			: {}),
	}
}

/** Parse a reviewer's own review page query. */
export function parseReviewerQuery(params: URLSearchParams) {
	const query = readListQuery(params, ['dueDate:asc'], ['status'])
	return {
		limit: query.limit,
		...(query.cursor ? { cursor: query.cursor } : {}),
		...(query.filters['status']
			? { status: enumValue(query.filters['status'], 'status', REVIEW_STATUSES) }
			: {}),
	}
}

/** Parse an option query. */
export function parseProbationOptionQuery(params: URLSearchParams) {
	const query = readListQuery(params, ['name:asc'])
	return { q: query.q, limit: query.limit, ...(query.cursor ? { cursor: query.cursor } : {}) }
}
