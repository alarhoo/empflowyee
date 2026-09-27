import type { ProbationOutcome, ReviewState, ReviewType } from '@empflowyee/hcm-employee-contract'

export const REVIEW_PERMISSION = 'hcm.employee.probation.review'
export const BASE_ROUTE = '/employee/probation-review'

type Semantic = 'positive' | 'critical' | 'negative' | 'informative' | 'neutral'
type Presented = { label: string; status: Semantic }

export const REVIEW_TYPE_LABELS: Record<ReviewType, string> = {
	Final: 'Final review',
	AdHoc: 'Ad-hoc review',
}

export const RECOMMENDATION_LABELS: Record<ProbationOutcome, string> = {
	Confirm: 'Confirm',
	Extend: 'Extend',
	Fail: 'Fail',
	NoChange: 'No change',
}

const STATE: Record<ReviewState, Presented> = {
	Scheduled: { label: 'Awaiting assessment', status: 'informative' },
	AssessmentSubmitted: { label: 'Assessment submitted', status: 'informative' },
	Decided: { label: 'Decided', status: 'positive' },
	Cancelled: { label: 'Cancelled', status: 'neutral' },
	Overdue: { label: 'Overdue', status: 'negative' },
	Escalated: { label: 'Escalated', status: 'negative' },
}

/** Semantic presentation of a review state. */
export function reviewState(value: ReviewState): Presented {
	return STATE[value]
}
