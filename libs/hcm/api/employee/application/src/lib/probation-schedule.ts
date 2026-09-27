import { finalReview } from '@empflowyee/hcm-api-employee-domain'
import type { EmployeeWork } from './employee-unit'

/**
 * DEC-HCM2-003: when an employment enters probation, the same transaction creates one Final review
 * due 14 days before the end date, without a reviewer; HR assigns the reviewer explicitly.
 */
export async function enterProbation(
	w: EmployeeWork,
	employmentId: string,
	periodStart: string,
	probationEndDate: string,
	requestId: string,
): Promise<string | null> {
	if (await w.probation.openFinalReview(employmentId)) return null
	const id = await w.probation.insertReview({
		employmentId,
		reviewType: 'Final',
		...finalReview(periodStart, probationEndDate),
		reviewerAccountId: null,
		reason: 'Scheduled when the employment entered probation.',
	})
	await w.audit.append({
		action: 'employee.probation-review-scheduled',
		category: 'business',
		targetType: 'probation-review',
		targetId: id,
		requestId,
		summary: {
			reason: null,
			changedFields: ['reviewType', 'dueDate'],
			fromState: null,
			toState: 'Scheduled',
		},
	})
	return id
}

/** Keep an open Final review on the employment's current probation end date. */
export async function alignFinalReview(
	w: EmployeeWork,
	employmentId: string,
	probationEndDate: string,
): Promise<void> {
	const review = await w.probation.openFinalReview(employmentId)
	if (!review || review.probationEndDate === probationEndDate) return
	const next = finalReview(review.periodStart, probationEndDate)
	await w.probation.updateReview(review.id, {
		periodEnd: next.periodEnd,
		probationEndDate: next.probationEndDate,
		dueDate: next.dueDate,
	})
}
