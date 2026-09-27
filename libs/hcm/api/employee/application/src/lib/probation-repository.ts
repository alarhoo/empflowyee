import type { HcmPage } from '@empflowyee/hcm-runtime-contract'
import type {
	ProbationAccountRef,
	ProbationAssessmentDto,
	ProbationContextDto,
	ProbationDecisionDto,
	ProbationOptionDto,
	ProbationOutcome,
	ProbationView,
	ReviewStatus,
	ReviewType,
} from '@empflowyee/hcm-employee-contract'

/** An employment in or around probation, with the facts reviews need. */
export interface ProbationEmploymentRow extends ProbationContextDto {
	employmentId: string
	workerId: string
	employmentStatus: string | null
	revision: number
}

export interface ProbationCaseRow extends ProbationEmploymentRow {
	nextReview: { id: string; reviewType: ReviewType; dueDate: string; status: ReviewStatus } | null
}

export interface ProbationReviewRow {
	id: string
	employmentId: string
	workerName: string
	workerNumber: string
	sequenceNumber: number
	reviewType: ReviewType
	periodStart: string
	periodEnd: string
	probationEndDate: string
	dueDate: string
	status: ReviewStatus
	reviewer: ProbationAccountRef | null
	owner: ProbationAccountRef
	scheduleReason: string
	cancelReason: string | null
	revision: number
}

export interface NewProbationReview {
	employmentId: string
	reviewType: ReviewType
	periodStart: string
	periodEnd: string
	probationEndDate: string
	dueDate: string
	reviewerAccountId: string | null
	reason: string
}

/** Review changes a command applies; omitted properties keep their value. */
export interface ProbationReviewPatch {
	status?: ReviewStatus
	reviewerAccountId?: string | null
	cancelReason?: string
	decided?: boolean
	periodEnd?: string
	probationEndDate?: string
	dueDate?: string
}

export interface NewProbationAssessment {
	reviewId: string
	recommendation: ProbationOutcome
	overallRating: number
	strengths: string
	concerns: string
	recommendationReason: string
}

export interface NewProbationDecision {
	reviewId: string
	employmentId: string
	outcome: ProbationOutcome
	effectiveDate: string
	previousProbationEndDate: string
	extendedProbationEndDate: string | null
	assessmentId: string | null
	reason: string
	evidenceReference: string | null
}

/** Employee-owned probation persistence in the caller's transaction. */
export interface ProbationRepository {
	/** Employments in probation, with their next open review, for a view. */
	cases(
		query: { limit: number; cursor?: string; q: string; view: ProbationView; unitId?: string },
		today: string,
		dueSoonUntil: string,
	): Promise<HcmPage<ProbationCaseRow>>
	/** Reviews of every employment, due first. */
	reviews(query: {
		limit: number
		cursor?: string
		status?: ReviewStatus
		reviewType?: ReviewType
		reviewerAccountId?: string
	}): Promise<HcmPage<ProbationReviewRow>>
	/** One review, optionally locked; `reviewerAccountId` restricts it to that reviewer. */
	review(
		id: string,
		options?: { lock?: boolean; reviewerAccountId?: string },
	): Promise<ProbationReviewRow | undefined>
	/** Every review of an employment, in sequence. */
	employmentReviews(employmentId: string): Promise<ProbationReviewRow[]>
	/** The open Final review of an employment, if any. */
	openFinalReview(employmentId: string): Promise<ProbationReviewRow | undefined>
	/** An employment's probation facts and minimal context. */
	employment(employmentId: string): Promise<ProbationEmploymentRow | undefined>
	insertReview(review: NewProbationReview): Promise<string>
	updateReview(id: string, patch: ProbationReviewPatch): Promise<void>
	/** Assessments of a review, newest first. */
	assessments(reviewId: string): Promise<ProbationAssessmentDto[]>
	/** Add the actor's assessment and supersede the current one. */
	insertAssessment(assessment: NewProbationAssessment): Promise<string>
	/** Decisions of an employment, oldest first. */
	decisions(employmentId: string): Promise<ProbationDecisionDto[]>
	insertDecision(decision: NewProbationDecision): Promise<string>
	/** Whether an enabled account holds the reviewer grant. */
	canReview(accountId: string): Promise<boolean>
	/** The account of the employment's current primary manager, when it can review. */
	managerReviewer(employmentId: string, today: string): Promise<ProbationAccountRef | null>
	/** Accounts that can review, or employments in probation, filtered by name. */
	options(
		kind: 'employments' | 'reviewers',
		query: { q: string; limit: number; cursor?: string },
	): Promise<HcmPage<ProbationOptionDto>>
}
