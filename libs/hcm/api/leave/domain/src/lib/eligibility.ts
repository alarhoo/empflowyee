import type {
	LeaveEffectiveRange,
	LeaveEligibilityRule,
	LeavePolicyVersionView,
} from '@empflowyee/hcm-leave-contract'
import { dateValue } from '@empflowyee/hcm-runtime-contract'

/** Dated owner-supplied facts for exactly one employment; no reader may combine facts from different assignments. */
export interface LeaveEligibilityFacts {
	employmentId: string
	workDate: string
	employmentStatus: string
	employmentType: string
	hireDate: string
	employmentEndDate: string | null
	continuousServiceStartDate: string | null
	legalEntityId: string
	workerTypeId: string
	genderCode: string | null
	assignments: readonly { orgUnitId: string; departmentId: string | null; locationId: string }[]
}
export type LeaveEligibilityResult =
	| {
		state: 'Eligible' | 'Ineligible'
		basis: 'Version' | 'Assignment' | 'Rule' | 'NoMatch'
		ruleIds: string[]
	}
	| { state: 'Unavailable'; reason: 'MissingFacts' | 'StatutoryFloorUnavailable' }
type Match = 'Yes' | 'No' | 'Unknown'

/** Compare inclusive ISO date ranges without machine-local timezone conversion. */
function includesDate(range: LeaveEffectiveRange, date: string): boolean {
	return (
		range.effectiveFrom <= date && (range.effectiveTo === undefined || range.effectiveTo >= date)
	)
}

/** Count completed local calendar days from explicitly known continuous service, falling back to the actual hire date. */
function serviceDays(facts: LeaveEligibilityFacts): number {
	const start = dateValue(facts.continuousServiceStartDate ?? facts.hireDate, 'serviceStartDate')
	return (Date.parse(facts.workDate + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86_400_000
}

/** Match typed predicates against one employment and one whole assignment; missing gender is not a fabricated value. */
function matches(rule: LeaveEligibilityRule, facts: LeaveEligibilityFacts): Match {
	if (!includesDate(rule, facts.workDate)) return 'No'
	if (rule.legalEntityId !== undefined && rule.legalEntityId !== facts.legalEntityId) return 'No'
	if (rule.workerTypeId !== undefined && rule.workerTypeId !== facts.workerTypeId) return 'No'
	if (rule.employmentType !== undefined && rule.employmentType !== facts.employmentType) return 'No'
	if (rule.minimumServiceDays !== undefined && serviceDays(facts) < rule.minimumServiceDays)
		return 'No'
	if (
		rule.orgUnitId !== undefined ||
		rule.departmentId !== undefined ||
		rule.locationId !== undefined
	) {
		if (!facts.assignments.length) return 'Unknown'
		if (
			!facts.assignments.some(
				/** Every configured assignment dimension must match the same actual assignment. */ (
					assignment,
				) =>
					(rule.orgUnitId === undefined || rule.orgUnitId === assignment.orgUnitId) &&
					(rule.departmentId === undefined || rule.departmentId === assignment.departmentId) &&
					(rule.locationId === undefined || rule.locationId === assignment.locationId),
			)
		)
			return 'No'
	}
	if (rule.genderCode !== undefined) {
		if (facts.genderCode === null) return 'Unknown'
		if (rule.genderCode !== facts.genderCode) return 'No'
	}
	return 'Yes'
}

/** Evaluate published-version limits, explicit dated assignment and typed priority without inventing a statutory pack or default inclusion. */
export function evaluateLeaveEligibility(
	policy: LeavePolicyVersionView,
	facts: LeaveEligibilityFacts,
): LeaveEligibilityResult {
	dateValue(facts.workDate, 'workDate')
	if (policy.state !== 'Published' || !includesDate(policy, facts.workDate))
		return { state: 'Ineligible', basis: 'Version', ruleIds: [] }
	if (
		policy.eligibilityRules.some(
			/** Unratified floors cannot be silently ignored or overridden by exclusions. */ (rule) =>
				rule.statutoryFloorReference !== undefined,
		)
	)
		return { state: 'Unavailable', reason: 'StatutoryFloorUnavailable' }
	if (
		facts.workDate < facts.hireDate ||
		(facts.employmentEndDate !== null && facts.workDate > facts.employmentEndDate) ||
		!['Active', 'OnNotice'].includes(facts.employmentStatus)
	)
		return { state: 'Ineligible', basis: 'Version', ruleIds: [] }
	const base = policy.eligibility
	if (
		(base.workerTypes.length && !base.workerTypes.includes(facts.workerTypeId)) ||
		(base.legalEntityIds.length && !base.legalEntityIds.includes(facts.legalEntityId)) ||
		(base.minimumServiceDays !== undefined && serviceDays(facts) < base.minimumServiceDays)
	)
		return { state: 'Ineligible', basis: 'Version', ruleIds: [] }
	const assignments = policy.datedAssignments.filter(
		/** Select only this employment and the requested local date. */ (row) =>
			row.employmentId === facts.employmentId && includesDate(row, facts.workDate),
	)
	if (assignments.length > 1) return { state: 'Unavailable', reason: 'MissingFacts' }
	if (assignments.length === 1)
		return {
			state: assignments[0].effect === 'Include' ? 'Eligible' : 'Ineligible',
			basis: 'Assignment',
			ruleIds: [assignments[0].id],
		}
	const rules = policy.eligibilityRules.map(
		/** Retain unknown predicates to prevent a lower-priority include bypassing a possible exclusion. */ (
			rule,
		) => ({ rule, match: matches(rule, facts) }),
	)
	const priorities = [
		...new Set(rules.map(/** Evaluate each declared priority once. */ (row) => row.rule.priority)),
	].sort(/** Higher numeric priority wins. */ (left, right) => right - left)
	for (const priority of priorities) {
		const selected = rules.filter(
			/** Consider only candidates at this priority. */ (row) => row.rule.priority === priority,
		)
		const excluded = selected.filter(
			/** A definite exclusion wins all equal-priority includes. */ (row) =>
				row.match === 'Yes' && row.rule.effect === 'Exclude',
		)
		if (excluded.length)
			return {
				state: 'Ineligible',
				basis: 'Rule',
				ruleIds: excluded
					.map(/** Preserve the matching evidence IDs. */ (row) => row.rule.id)
					.sort(),
			}
		if (
			selected.some(
				/** Unknown exclusions cannot be treated as non-matches. */ (row) =>
					row.match === 'Unknown' && row.rule.effect === 'Exclude',
			)
		)
			return { state: 'Unavailable', reason: 'MissingFacts' }
		const included = selected.filter(
			/** Select explicit includes only after excluding all competing exclusions. */ (row) =>
				row.match === 'Yes' && row.rule.effect === 'Include',
		)
		if (included.length)
			return {
				state: 'Eligible',
				basis: 'Rule',
				ruleIds: included
					.map(
						/** Retain stable evidence independent of configured row order. */ (row) => row.rule.id,
					)
					.sort(),
			}
		if (
			selected.some(
				/** Missing inclusion facts cannot confer eligibility. */ (row) => row.match === 'Unknown',
			)
		)
			return { state: 'Unavailable', reason: 'MissingFacts' }
	}
	return { state: 'Ineligible', basis: 'NoMatch', ruleIds: [] }
}
