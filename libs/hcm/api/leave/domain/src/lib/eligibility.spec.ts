import { expect, it } from 'vitest'
import type { LeavePolicyVersionView } from '@empflowyee/hcm-leave-contract'
import { evaluateLeaveEligibility, type LeaveEligibilityFacts } from './eligibility'

/** Build a complete test policy with explicit inclusion; empty rules never imply universal enrollment. */
function policy(): LeavePolicyVersionView {
	return {
		id: 'policy',
		versionId: 'version',
		version: 1,
		revision: 2,
		state: 'Published',
		validation: [],
		code: 'TEST',
		name: 'Test',
		leaveTypeId: 'type',
		effectiveFrom: '2026-01-01',
		effectiveTo: '2026-12-31',
		trackingMode: 'Balance',
		unit: 'Day',
		eligibility: { workerTypes: [], legalEntityIds: [] },
		eligibilityRules: [{ id: 'all', priority: 0, effect: 'Include', effectiveFrom: '2026-01-01' }],
		datedAssignments: [],
		rounding: { scale: 6, mode: 'Nearest' },
		accrual: { enabled: false },
		carryForward: { enabled: false },
		noticeMode: 'Warning',
		approvalRules: [],
		compOff: { enabled: false },
		encashment: { configured: false, annualOnly: true },
		bridgeRule: 'None',
		blackoutDates: [],
		allowOverlap: false,
		negativeBalanceAllowed: false,
		postingPoint: 'OnApproval',
	}
}
/** Keep employment and assignment facts explicit so scope cannot be assembled from unrelated rows. */
function facts(): LeaveEligibilityFacts {
	return {
		employmentId: 'employment',
		workDate: '2026-04-01',
		employmentStatus: 'Active',
		employmentType: 'Permanent',
		hireDate: '2026-01-01',
		employmentEndDate: null,
		continuousServiceStartDate: null,
		legalEntityId: 'employer',
		workerTypeId: 'worker-type',
		genderCode: null,
		assignments: [
			{ orgUnitId: 'sales', departmentId: 'sales-team', locationId: 'scranton' },
			{ orgUnitId: 'support', departmentId: 'support-team', locationId: 'new-york' },
		],
	}
}

it('requires an effective published version and explicit positive eligibility', /** Empty selectors are constraints, never an implicit inclusion or entitlement. */ () => {
	const current = policy()
	expect(evaluateLeaveEligibility(current, facts()).state).toBe('Eligible')
	expect(evaluateLeaveEligibility({ ...current, state: 'Draft' }, facts()).state).toBe('Ineligible')
	expect(evaluateLeaveEligibility(current, { ...facts(), workDate: '2027-01-01' }).state).toBe(
		'Ineligible',
	)
	expect(evaluateLeaveEligibility({ ...current, eligibilityRules: [] }, facts())).toEqual({
		state: 'Ineligible',
		basis: 'NoMatch',
		ruleIds: [],
	})
	current.eligibility.minimumServiceDays = 91
	expect(evaluateLeaveEligibility(current, facts()).state).toBe('Ineligible')
	current.eligibility.minimumServiceDays = 90
	expect(evaluateLeaveEligibility(current, facts()).state).toBe('Eligible')
})

it('gives dated employment assignments precedence without escaping the published version', /** Explicit exceptions apply only to their employment, date and version eligibility boundary. */ () => {
	const current = policy()
	current.eligibilityRules[0].effect = 'Exclude'
	current.datedAssignments = [
		{
			id: 'explicit',
			employmentId: 'employment',
			effect: 'Include',
			effectiveFrom: '2026-04-01',
			effectiveTo: '2026-04-01',
		},
	]
	expect(evaluateLeaveEligibility(current, facts())).toEqual({
		state: 'Eligible',
		basis: 'Assignment',
		ruleIds: ['explicit'],
	})
	expect(
		evaluateLeaveEligibility(current, { ...facts(), employmentId: 'second-employment' }).state,
	).toBe('Ineligible')
	expect(evaluateLeaveEligibility(current, { ...facts(), workDate: '2026-04-02' }).state).toBe(
		'Ineligible',
	)
	current.eligibility.legalEntityIds = ['other-employer']
	expect(evaluateLeaveEligibility(current, facts())).toEqual({
		state: 'Ineligible',
		basis: 'Version',
		ruleIds: [],
	})
})

it('never pools assignment dimensions and makes exclusion win equal priority', /** A matching unit on one assignment cannot combine with another assignment location. */ () => {
	const current = policy()
	current.eligibilityRules = [
		{
			id: 'combined',
			priority: 1,
			effect: 'Include',
			effectiveFrom: '2026-01-01',
			orgUnitId: 'sales',
			locationId: 'new-york',
		},
	]
	expect(evaluateLeaveEligibility(current, facts()).state).toBe('Ineligible')
	current.eligibilityRules[0].locationId = 'scranton'
	expect(evaluateLeaveEligibility(current, facts()).state).toBe('Eligible')
	current.eligibilityRules.push({
		id: 'exclude',
		priority: 1,
		effect: 'Exclude',
		effectiveFrom: '2026-01-01',
	})
	expect(evaluateLeaveEligibility(current, facts())).toEqual({
		state: 'Ineligible',
		basis: 'Rule',
		ruleIds: ['exclude'],
	})
	current.eligibilityRules[0].priority = 2
	expect(evaluateLeaveEligibility(current, facts()).state).toBe('Eligible')
})

it('does not let missing protected facts bypass a higher-priority exclusion', /** Unknown gender or a statutory reference is explicitly unavailable, not guessed or silently ignored. */ () => {
	const current = policy()
	current.eligibilityRules.push({
		id: 'gender-rule',
		priority: 1,
		effect: 'Exclude',
		genderCode: 'configured-code',
		effectiveFrom: '2026-01-01',
	})
	expect(evaluateLeaveEligibility(current, facts())).toEqual({
		state: 'Unavailable',
		reason: 'MissingFacts',
	})
	expect(evaluateLeaveEligibility(current, { ...facts(), genderCode: 'other-code' }).state).toBe(
		'Eligible',
	)
	expect(
		evaluateLeaveEligibility(current, { ...facts(), genderCode: 'configured-code' }).state,
	).toBe('Ineligible')
	current.eligibilityRules[0].statutoryFloorReference = 'unadmitted-pack'
	expect(evaluateLeaveEligibility(current, facts())).toEqual({
		state: 'Unavailable',
		reason: 'StatutoryFloorUnavailable',
	})
})
