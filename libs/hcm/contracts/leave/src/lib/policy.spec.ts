import { describe, expect, it } from 'vitest'
import { leavePolicyPublicationErrors, readLeavePolicyDraft, type LeavePolicyDraft } from './policy'

/** Supply explicit test configuration without introducing production policy defaults. */
function draft(): LeavePolicyDraft {
	return {
		code: 'VAC',
		name: 'Vacation',
		leaveTypeId: 'type-vac',
		effectiveFrom: '2026-01-01',
		trackingMode: 'Balance',
		unit: 'Day',
		eligibility: { workerTypes: [], legalEntityIds: [] },
		eligibilityRules: [],
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
describe('Leave policy configuration', /** Exercise incomplete drafts, funding boundaries and closed configuration input. */ () => {
	it('keeps seed amounts explicit while refusing incomplete publication', /** Annual and monthly amounts cannot invent a posting schedule. */ () => {
		const input = draft()
		input.accrual = { enabled: true, unitsPerYear: '24', unitsPerMonth: '2' }
		input.name = '  Vacation  '
		const parsed = readLeavePolicyDraft(input)
		expect(parsed.name).toBe('  Vacation  ')
		expect(parsed.accrual).toEqual(input.accrual)
		expect(leavePolicyPublicationErrors(parsed)).toEqual(
			expect.arrayContaining([
				{ field: 'accrual.timing', code: 'required' },
				{ field: 'accrual.proration', code: 'required' },
				{ field: 'maximumAdvanceDays', code: 'required' },
			]),
		)
		expect(parsed.maximumAdvanceDays).toBeUndefined()
	})
	it('accepts a complete explicit policy and zero waiting or advance days', /** Zero is a configured restriction rather than an absent value. */ () => {
		const input = {
			...draft(),
			allowHalfDay: true,
			allowHourly: true,
			hourlyIncrementMinutes: 30,
			maximumBackdatedDays: 0,
			maximumAdvanceDays: 0,
			accrual: {
				enabled: true,
				frequency: 'Monthly',
				timing: 'Arrears',
				proration: 'None',
				unitsPerOccurrence: '2',
				waitingPeriodDays: 0,
			},
		}
		expect(leavePolicyPublicationErrors(readLeavePolicyDraft(input))).toEqual([])
	})
	it('rejects Unpaid funding and client authority or consumer injection', /** LOP cannot acquire an account funding rule through a hidden field. */ () => {
		for (const rule of ['accrual', 'carryForward', 'compOff'] as const)
			expect(
				/** Enabled funding must fail even before publication. */ () =>
					readLeavePolicyDraft({ ...draft(), trackingMode: 'Unpaid', [rule]: { enabled: true } }),
			).toThrow()
		expect(
			/** Encashment cannot fund Unpaid. */ () =>
				readLeavePolicyDraft({
					...draft(),
					trackingMode: 'Unpaid',
					encashment: { configured: true, annualOnly: true },
				}),
		).toThrow()
		expect(
			/** Tenant selection comes from authenticated context. */ () =>
				readLeavePolicyDraft({ ...draft(), tenantId: 'foreign' }),
		).toThrow()
		expect(
			/** A configuration document cannot admit a consumer. */ () =>
				readLeavePolicyDraft({
					...draft(),
					encashment: { configured: false, annualOnly: true, consumerAdmission: true },
				}),
		).toThrow()
	})
	it('rejects precision loss, malformed windows and duplicate dates', /** Exercise shared form/API field boundaries. */ () => {
		for (const value of [2, '2.0000001', '0', '-1'])
			expect(
				/** Funding amounts are exact positive decimal strings. */ () =>
					readLeavePolicyDraft({ ...draft(), accrual: { enabled: false, unitsPerMonth: value } }),
			).toThrow()
		expect(
			/** An impossible local date cannot enter a policy. */ () =>
				readLeavePolicyDraft({ ...draft(), effectiveFrom: '2026-02-30' }),
		).toThrow()
		expect(
			/** Effective ends cannot precede starts. */ () =>
				readLeavePolicyDraft({ ...draft(), effectiveTo: '2025-12-31' }),
		).toThrow()
		expect(
			/** A blackout date appears once. */ () =>
				readLeavePolicyDraft({ ...draft(), blackoutDates: ['2026-02-01', '2026-02-01'] }),
		).toThrow()
		expect(
			/** Invalid top-level counters identify the exact form field. */ () =>
				readLeavePolicyDraft({ ...draft(), maximumAdvanceDays: -1 }),
		).toThrowError(
			expect.objectContaining({ fieldErrors: [{ field: 'maximumAdvanceDays', code: 'invalid' }] }),
		)
	})
	it('preserves required routing and bounds every source graph', /** Role labels never substitute for explicit current-authority routing. */ () => {
		const input = draft()
		input.approvalRules = [
			{ id: 'manager', stage: 1, roleCode: 'MANAGER', subjectType: 'Leave', independent: true },
		]
		expect(leavePolicyPublicationErrors(readLeavePolicyDraft(input))).toContainEqual({
			field: 'approvalRules.0.source',
			code: 'required',
		})
		expect(
			/** An adjustment must be independently decided. */ () =>
				readLeavePolicyDraft({
					...input,
					approvalRules: [
						{ ...input.approvalRules[0], subjectType: 'Adjustment', independent: false },
					],
				}),
		).toThrow()
		expect(
			/** A manager route rejects an injected named-account selector. */ () =>
				readLeavePolicyDraft({
					...input,
					approvalRules: [{ ...input.approvalRules[0], source: 'LineManager', accountId: 'other' }],
				}),
		).toThrow()
		input.approvalRules = Array.from(
			{ length: 6 },
			/** Create six distinct required slots in one stage. */ (_, i) => ({
				id: `slot-${i}`,
				stage: 1,
				roleCode: `SLOT_${i}`,
				subjectType: 'Leave',
				independent: true,
				source: 'LineManager',
			}),
		)
		expect(
			/** The coordinator cannot silently truncate a sixth required slot. */ () =>
				readLeavePolicyDraft(input),
		).toThrow()
	})
})
