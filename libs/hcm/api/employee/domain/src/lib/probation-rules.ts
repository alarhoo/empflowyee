import {
	ESCALATION_DAYS,
	FINAL_REVIEW_LEAD_DAYS,
	MAX_EXTENSION_DAYS,
	type ProbationOutcome,
	type ReviewState,
	type ReviewStatus,
} from '@empflowyee/hcm-employee-contract'
import { addDays } from './employment-change-rules'

/** Whether a review still waits for an HR decision. */
export function undecided(status: ReviewStatus): boolean {
	return status === 'Scheduled' || status === 'AssessmentSubmitted'
}

/** DEC-HCM2-003: the Final review covering a probation period, due 14 days before its end. */
export function finalReview(periodStart: string, probationEndDate: string) {
	const due = addDays(probationEndDate, -FINAL_REVIEW_LEAD_DAYS)
	return {
		periodStart,
		periodEnd: probationEndDate,
		probationEndDate,
		// A probation shorter than the lead time is reviewed on its first day.
		dueDate: due < periodStart ? periodStart : due,
	}
}

/** The state a review shows today: undecided reviews become Overdue after the due date and Escalated 7 days later. */
export function reviewState(status: ReviewStatus, dueDate: string, today: string): ReviewState {
	if (!undecided(status) || today <= dueDate) return status
	return today > addDays(dueDate, ESCALATION_DAYS) ? 'Escalated' : 'Overdue'
}

/**
 * DEC-HCM2-003: the latest end date one extension may set, or null when the employment was
 * already extended. The limit counts from the original end date, the earliest reviewed one.
 */
export function maxExtendedEnd(originalEndDate: string, extensions: number): string | null {
	return extensions > 0 ? null : addDays(originalEndDate, MAX_EXTENSION_DAYS)
}

/** Why an extension is refused, or null when it is allowed. */
export function extensionProblem(
	currentEndDate: string,
	originalEndDate: string,
	extensions: number,
	newEndDate: string,
): 'already-extended' | 'not-later' | 'too-long' | null {
	const max = maxExtendedEnd(originalEndDate, extensions)
	if (!max) return 'already-extended'
	if (newEndDate <= currentEndDate) return 'not-later'
	if (newEndDate > max) return 'too-long'
	return null
}

/** The employment facts a decision sets; Fail never ends employment and NoChange sets nothing. */
export function decisionFacts(
	outcome: ProbationOutcome,
	effectiveDate: string,
	extendedEndDate: string | null,
): {
	probationStatus?: 'Confirmed' | 'Extended' | 'Failed'
	confirmedOn?: string
	probationEndDate?: string
} {
	if (outcome === 'Confirm') return { probationStatus: 'Confirmed', confirmedOn: effectiveDate }
	if (outcome === 'Extend')
		return { probationStatus: 'Extended', probationEndDate: extendedEndDate ?? undefined }
	if (outcome === 'Fail') return { probationStatus: 'Failed' }
	return {}
}

/** The worker event a decision records, or null for NoChange. */
export function decisionEvent(outcome: ProbationOutcome): string | null {
	const events: Record<ProbationOutcome, string | null> = {
		Confirm: 'CONFIRMED',
		Extend: 'PROBATION_EXTENDED',
		Fail: 'PROBATION_FAILED',
		NoChange: null,
	}
	return events[outcome]
}
