import { HcmDomainError, invalidField } from '@empflowyee/hcm-runtime-contract'
import {
	MAX_FAMILY_DEPTH,
	type ArchitectureStatus,
} from '@empflowyee/hcm-job-architecture-contract'

/** Only draft versions and their children change (business rule 2). */
export function requireDraft(status: ArchitectureStatus): void {
	if (status !== 'Draft') throw new HcmDomainError('invalid-state')
}

/** The lifecycle steps a command may take: submit a draft, publish a reviewed version. */
export function requireTransition(from: ArchitectureStatus, to: 'InReview' | 'Published'): void {
	if ((to === 'InReview' && from !== 'Draft') || (to === 'Published' && from !== 'InReview'))
		throw new HcmDomainError('invalid-state')
}

/** The ISO calendar date one day before a timezone-free date. */
export function dayBefore(date: string): string {
	const value = new Date(`${date}T00:00:00Z`)
	value.setUTCDate(value.getUTCDate() - 1)
	return value.toISOString().slice(0, 10)
}

/**
 * A successor takes effect after the version it replaces started, so the replaced range can close
 * the day before without becoming empty (business rule 3).
 */
export function requireEffectiveAfter(currentFrom: string | null, effectiveFrom: string): void {
	if (currentFrom !== null && effectiveFrom <= currentFrom)
		invalidField('effectiveFrom', 'not-after-current')
}

/** A family's parent must be a root: families are at most two levels deep (DEC-HCM2-005). */
export function requireFamilyParent(parentDepth: number | null): void {
	if (parentDepth !== null && parentDepth + 1 > MAX_FAMILY_DEPTH)
		invalidField('parentId', 'too-deep')
}

/** Allowed grades are unique and carry exactly one default (business rule 7). */
export function requireAllowedGrades(
	grades: readonly { gradeId: string; isDefault: boolean }[],
): void {
	if (!grades.length) invalidField('allowedGrades', 'required')
	if (new Set(grades.map(/** Grade id. */ (grade) => grade.gradeId)).size !== grades.length)
		invalidField('allowedGrades', 'duplicate')
	if (grades.filter(/** Default. */ (grade) => grade.isDefault).length !== 1)
		invalidField('allowedGrades', 'one-default')
}

/** Codes are unique within one collection (business rule 8). */
export function requireUniqueCodes(items: readonly { code: string }[], field: string): void {
	if (new Set(items.map(/** Code. */ (item) => item.code)).size !== items.length)
		invalidField(field, 'duplicate')
}
