import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'
import {
	CHANGE_TYPE_RULES,
	EMPLOYMENT_TARGETS,
	backdatingLimit,
	type ChangeStatus,
	type ChangeTargets,
	type ChangeType,
} from '@empflowyee/hcm-employee-contract'

/** The ISO date some days after another; negative days go back. */
export function addDays(date: string, days: number): string {
	const value = new Date(`${date}T00:00:00Z`)
	value.setUTCDate(value.getUTCDate() + days)
	return value.toISOString().slice(0, 10)
}

/**
 * DEC-HCM2-002: the effective date may lie at most 30 days before today, or 90 for a Correction.
 * Future dates are allowed. Checked at submission and again at approval.
 */
export function requireEffectiveDateInRange(
	type: ChangeType,
	effectiveDate: string,
	today: string,
): void {
	if (effectiveDate < addDays(today, -backdatingLimit(type)))
		throw new HcmDomainError('effective-date-out-of-range', [
			{ field: 'effectiveDate', code: 'out-of-range' },
		])
}

/** Whether a request changes undated employment-level facts, which never apply before their date. */
export function changesEmploymentFacts(type: ChangeType, targets: ChangeTargets): boolean {
	// A rehire creates an employment dated by its hire date; a future one starts Pending.
	if (type === 'Rehire') return false
	if (CHANGE_TYPE_RULES[type].status) return true
	return EMPLOYMENT_TARGETS.some(/** Present target. */ (field) => targets[field] !== undefined)
}

/**
 * Final approval executes at once when every changed fact is dated, or the effective date has
 * come; otherwise the request stays Approved until HR applies it on or after that date.
 */
export function executesOnApproval(
	type: ChangeType,
	targets: ChangeTargets,
	effectiveDate: string,
	today: string,
): boolean {
	return !changesEmploymentFacts(type, targets) || effectiveDate <= today
}

/** Require that a request may still be edited or submitted. */
export function requireDraft(status: ChangeStatus): void {
	if (status !== 'Draft') throw new HcmDomainError('invalid-state')
}

/** The requester may cancel a request until it has executed; a failed execution changed nothing. */
export function requireCancellable(status: ChangeStatus): void {
	if (!['Draft', 'PendingApproval', 'Approved', 'Failed'].includes(status))
		throw new HcmDomainError('invalid-state')
}

/** Apply runs an approved request on or after its date, or retries a failed execution. */
export function requireApplicable(
	status: ChangeStatus,
	effectiveDate: string,
	today: string,
): void {
	if (status !== 'Approved' && status !== 'Failed') throw new HcmDomainError('invalid-state')
	if (effectiveDate > today)
		throw new HcmDomainError('invalid-state', [
			{ field: 'effectiveDate', code: 'not-yet-effective' },
		])
}

/** DEC-HCM2-002: the requester never decides their own request. */
export function requireIndependentDecider(requester: string, decider: string): void {
	if (requester === decider) throw new HcmDomainError('self-approval-forbidden')
}

/** The employment status a Suspension or Return to work requires before it runs. */
export function requireStatusTransition(type: ChangeType, current: string | null): void {
	const required: Partial<Record<ChangeType, string>> = {
		Suspension: 'Active',
		ReturnToWork: 'Suspended',
	}
	const needed = required[type]
	if (needed && current !== needed)
		throw new HcmDomainError('invalid-state', [{ field: 'changeType', code: 'status-mismatch' }])
	if (!needed && type !== 'Rehire' && type !== 'Correction' && current === 'Ended')
		throw new HcmDomainError('invalid-state', [{ field: 'employmentId', code: 'ended' }])
}

/**
 * Headcount and FTE an assignment change adds to a position on its date (DEC-HCM2-007). Moving
 * into a position adds a seat and the new FTE; staying adds only the FTE increase. Null when the
 * change adds nothing, so no capacity decision is needed.
 */
export function capacityDemand(
	current: { positionId: string | null; fte: number | null },
	target: { positionId: string | null; fte: number },
): { positionId: string; headcount: number; fte: number } | null {
	if (!target.positionId) return null
	if (current.positionId !== target.positionId)
		return { positionId: target.positionId, headcount: 1, fte: target.fte }
	const increase = Math.round((target.fte - (current.fte ?? 0)) * 100) / 100
	return increase > 0 ? { positionId: target.positionId, headcount: 0, fte: increase } : null
}

/** The worker event type an executed change records. */
export function changeEventType(type: ChangeType): string {
	const codes: Record<ChangeType, string> = {
		Rehire: 'REHIRED',
		Transfer: 'TRANSFERRED',
		Promotion: 'PROMOTED',
		Demotion: 'DEMOTED',
		LocationChange: 'LOCATION_CHANGED',
		ManagerChange: 'MANAGER_CHANGED',
		HoursChange: 'HOURS_CHANGED',
		EmploymentTypeChange: 'EMPLOYMENT_TYPE_CHANGED',
		Suspension: 'SUSPENDED',
		ReturnToWork: 'RETURNED_TO_WORK',
		Correction: 'CORRECTED',
	}
	return codes[type]
}
