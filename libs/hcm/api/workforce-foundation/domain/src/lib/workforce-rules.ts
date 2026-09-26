import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'

/** Reject a write against a stale optimistic revision. */
export function requireRevision(current: number, expected: number): void {
	if (current !== expected) throw new HcmDomainError('revision-conflict')
}

/** Return the ISO calendar date one day before the supplied timezone-free date. */
export function dayBefore(date: string): string {
	const value = new Date(`${date}T00:00:00Z`)
	value.setUTCDate(value.getUTCDate() - 1)
	return value.toISOString().slice(0, 10)
}

/** Return the ISO calendar date one day after the supplied timezone-free date. */
export function dayAfter(date: string): string {
	const value = new Date(`${date}T00:00:00Z`)
	value.setUTCDate(value.getUTCDate() + 1)
	return value.toISOString().slice(0, 10)
}

/** Return today's calendar date in an IANA time zone. */
export function todayIn(timeZone: string, now = new Date()): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(now)
	/** Read one formatted date part. */
	const get = (type: string) =>
		parts.find(/** Select one date part. */ (part) => part.type === type)?.value
	return `${get('year')}-${get('month')}-${get('day')}`
}

export interface DatedVersion {
	effectiveFrom: string
	effectiveTo: string | null
}

/**
 * A new version may only follow the latest open version; it closes that version the day before.
 * Retired units (latest version already closed) cannot receive new versions.
 */
export function successorWindow(
	latest: DatedVersion,
	effectiveFrom: string,
): { closeLatestOn: string } {
	if (latest.effectiveTo !== null) throw new HcmDomainError('invalid-state')
	if (effectiveFrom <= latest.effectiveFrom)
		throw new HcmDomainError('overlapping-effective-period', [
			{ field: 'effectiveFrom', code: 'after-current-version' },
		])
	return { closeLatestOn: dayBefore(effectiveFrom) }
}

/** Retirement must not end before the latest version starts. */
export function retirementDate(latest: DatedVersion, effectiveTo: string): string {
	if (latest.effectiveTo !== null) throw new HcmDomainError('invalid-state')
	if (effectiveTo < latest.effectiveFrom)
		throw new HcmDomainError('effective-date-out-of-range', [
			{ field: 'effectiveTo', code: 'before-version' },
		])
	return effectiveTo
}

export interface UnitTypeRule {
	id: string
	parentTypeId: string | null
	enabled: boolean
	legalEntityBearing: boolean
	allowMultiplePerParent: boolean
}

/**
 * Enforce the configured type chain: a root unit uses a root type, a child's parent must have the
 * child's parent type, and legal entities are set exactly on legal-entity-bearing levels.
 */
export function requireUnitPlacement(input: {
	type: UnitTypeRule
	parentTypeId: string | null
	parentId: string | null
	legalEntityId: string | null
	siblingOfSameTypeExists: boolean
}): void {
	const { type } = input
	if (!type.enabled)
		throw new HcmDomainError('invalid-request', [{ field: 'unitTypeId', code: 'disabled' }])
	if (type.parentTypeId === null && input.parentId !== null)
		throw new HcmDomainError('invalid-request', [{ field: 'parentId', code: 'root-type' }])
	if (
		type.parentTypeId !== null &&
		(input.parentId === null || input.parentTypeId !== type.parentTypeId)
	)
		throw new HcmDomainError('invalid-request', [{ field: 'parentId', code: 'type-chain' }])
	if (type.legalEntityBearing !== (input.legalEntityId !== null))
		throw new HcmDomainError('invalid-request', [{ field: 'legalEntityId', code: 'bearing-level' }])
	if (!type.allowMultiplePerParent && input.siblingOfSameTypeExists)
		throw new HcmDomainError('invalid-request', [
			{ field: 'unitTypeId', code: 'single-per-parent' },
		])
}

/** Reject self-references and cycles from a candidate parent's ancestor chain. */
export function requireNoCycle(
	id: string,
	candidateParentAncestors: readonly string[],
	field = 'parentId',
): void {
	if (candidateParentAncestors.includes(id))
		throw new HcmDomainError('invalid-request', [{ field, code: 'cycle' }])
}
