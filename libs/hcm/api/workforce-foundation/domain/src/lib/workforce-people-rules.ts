import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'

/**
 * Build the person search projection: lower-case, accent-free names with single spaces. It holds
 * names only, never identifiers, and is maintained by the writer on every name change.
 */
export function personSearchText(...names: readonly string[]): string {
	return names
		.join(' ')
		.normalize('NFD')
		.replace(/\p{M}+/gu, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 400)
}

/** Render the display name from the preferred or given name and the family name. */
export function personDisplayName(given: string, preferred: string, family: string): string {
	return `${(preferred || given).trim()} ${family.trim()}`.trim()
}

/** Normalize a legal name for duplicate matching: case, accents and repeated spaces are ignored. */
export function matchName(given: string, family: string): string {
	return personSearchText(given, family)
}

/** An assignment must start within its employment's period. */
export function requireWithinEmployment(
	hireDate: string,
	endDate: string | null,
	effectiveFrom: string,
	field = 'effectiveFrom',
): void {
	if (effectiveFrom < hireDate || (endDate !== null && effectiveFrom > endDate))
		throw new HcmDomainError('effective-date-out-of-range', [{ field, code: 'outside-employment' }])
}

/** A successor dated row must start after the row it supersedes. */
export function requireAfter(currentFrom: string, nextFrom: string, field = 'effectiveFrom'): void {
	if (nextFrom <= currentFrom)
		throw new HcmDomainError('overlapping-effective-period', [
			{ field, code: 'after-current-version' },
		])
}

/** Reject a primary reporting line whose manager chain already reaches the reporting assignment. */
export function requireNoReportingCycle(
	assignmentId: string,
	managerChain: readonly string[],
): void {
	if (managerChain.includes(assignmentId))
		throw new HcmDomainError('invalid-request', [{ field: 'managerAssignmentId', code: 'cycle' }])
}

/** Employment statuses in which the worker is currently engaged. */
export const ENGAGED_STATUSES = ['Pending', 'Active', 'OnNotice', 'Suspended'] as const

/** Report whether an employment status keeps the worker engaged. */
export function isEngaged(status: string): boolean {
	return (ENGAGED_STATUSES as readonly string[]).includes(status)
}
