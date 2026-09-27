import type { ProbationOutcome, ReviewState, ReviewType } from '@empflowyee/hcm-employee-contract'

export const MANAGE_PERMISSION = 'hcm.employee.probation.manage'
export const BASE_ROUTE = '/employee/probation-management'

type Semantic = 'positive' | 'critical' | 'negative' | 'informative' | 'neutral'
type Presented = { label: string; status: Semantic }

export const REVIEW_TYPE_LABELS: Record<ReviewType, string> = {
	Final: 'Final review',
	AdHoc: 'Ad-hoc review',
}

export const OUTCOME_LABELS: Record<ProbationOutcome, string> = {
	Confirm: 'Confirm',
	Extend: 'Extend',
	Fail: 'Fail',
	NoChange: 'No change',
}

const STATE: Record<ReviewState, Presented> = {
	Scheduled: { label: 'Scheduled', status: 'informative' },
	AssessmentSubmitted: { label: 'Assessment submitted', status: 'informative' },
	Decided: { label: 'Decided', status: 'positive' },
	Cancelled: { label: 'Cancelled', status: 'neutral' },
	Overdue: { label: 'Overdue', status: 'negative' },
	Escalated: { label: 'Escalated', status: 'negative' },
}

const PROBATION: Record<string, Presented> = {
	InProgress: { label: 'In probation', status: 'informative' },
	Extended: { label: 'Extended', status: 'critical' },
	Confirmed: { label: 'Confirmed', status: 'positive' },
	Failed: { label: 'Failed', status: 'negative' },
	NotApplicable: { label: 'Not applicable', status: 'neutral' },
}

/** Semantic presentation of a review state; Overdue and Escalated are Negative. */
export function reviewState(value: ReviewState): Presented {
	return STATE[value]
}

/** Semantic presentation of an employment's probation status. */
export function probationStatus(value: string): Presented {
	return PROBATION[value] ?? { label: value, status: 'neutral' }
}

/** Semantic presentation of an HR decision. */
export function outcomeStatus(value: ProbationOutcome): Presented {
	const map: Record<ProbationOutcome, Semantic> = {
		Confirm: 'positive',
		Extend: 'critical',
		Fail: 'negative',
		NoChange: 'neutral',
	}
	return { label: OUTCOME_LABELS[value], status: map[value] }
}

/** Today in ISO form, in the browser's zone; the server remains the authority for dates. */
export function isoToday(): string {
	const now = new Date()
	return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
