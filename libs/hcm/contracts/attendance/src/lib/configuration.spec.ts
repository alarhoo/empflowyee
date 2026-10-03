import { parseHolidayDraftUpdate } from './configuration-commands'
import { expect, it } from 'vitest'
import { parseAttendancePolicyDraft, type AttendancePolicyDraft } from './attendance-policies'
import { parseHolidayDraft, type HolidayDraft } from './holidays'

/** Build an explicitly disabled test policy with no implied rest, rounding or source authority. */
function policy(): AttendancePolicyDraft {
	return {
		code: 'EXACT',
		name: ' Exact time ',
		effectiveFrom: '2026-01-01',
		graceInMinutes: 0,
		graceOutMinutes: 0,
		rounding: 'None',
		overtime: { enabled: false },
		approvalRules: [],
	}
}

/** Use a deliberately different actual/observed year to detect automatic date substitution. */
function calendar(): HolidayDraft {
	return {
		code: 'OFFICE',
		name: 'Office',
		effectiveFrom: '2026-01-01',
		effectiveTo: '2026-12-31',
		entries: [
			{
				date: '2025-12-31',
				observedDate: '2026-01-02',
				category: 'Substitute',
				name: 'Explicit observed date',
				priority: -1,
			},
		],
	}
}

it('retains exact policy settings with disabled overtime and no minimum-rest fallback', /** Defaults do not create authority, a cap or an eleven-hour minimum. */ () => {
	expect(parseAttendancePolicyDraft(policy())).toEqual(policy())
	for (const patch of [
		{ graceInMinutes: -1 },
		{ graceOutMinutes: 0.1 },
		{ minimumRestMode: 'Warn' },
		{ minimumRestMinutes: 660 },
		{ roundingDirection: 'Up' },
		{ rounding: 'Configured' },
		{ rounding: 'Configured', roundingDirection: 'Up', roundingIncrementMinutes: 0 },
		{ autoCloseAfterMinutes: 480 },
		{ requireLocation: true },
		{ tenantId: 'forged' },
	])
		expect(
			/** Reject unsupported policy and incomplete dependent fields at the API boundary. */ () =>
				parseAttendancePolicyDraft({ ...policy(), ...patch }),
		).toThrow()
	expect(
		parseAttendancePolicyDraft({
			...policy(),
			minimumRestMinutes: 0,
			minimumRestMode: 'Warn',
			rounding: 'Configured',
			roundingIncrementMinutes: 15,
			roundingDirection: 'Nearest',
		}),
	).toMatchObject({ minimumRestMinutes: 0, roundingIncrementMinutes: 15 })
})

it('cannot enable overtime without complete qualification and independent manager rules', /** Disabling preapproval never disables approval of actual qualifying evidence. */ () => {
	const overtime = {
		enabled: true,
		qualification: 'ScheduledExcess',
		capMinutes: 120,
		preapprovalRequired: false,
	}
	for (const value of [
		{ enabled: true },
		{ ...overtime, capMinutes: undefined },
		{ ...overtime, preapprovalRequired: undefined },
		{ ...overtime, capMinutes: 1.5 },
		{ enabled: false, capMinutes: 120 },
	])
		expect(
			/** No cap, approval default or hidden dormant setting may be guessed. */ () =>
				parseAttendancePolicyDraft({ ...policy(), overtime: value }),
		).toThrow()
	expect(
		/** A fully configured qualifier still needs an independent manager slot. */ () =>
			parseAttendancePolicyDraft({ ...policy(), overtime }),
	).toThrow()
	const approvalRules = [
		{
			subjectType: 'Overtime',
			stage: 1,
			independent: true,
			candidateRule: { source: 'LineManager' },
		},
	]
	expect(parseAttendancePolicyDraft({ ...policy(), overtime, approvalRules }).overtime).toEqual(
		overtime,
	)
	expect(
		/** A non-manager named user cannot replace the required manager selection. */ () =>
			parseAttendancePolicyDraft({
				...policy(),
				overtime,
				approvalRules: [
					{ ...approvalRules[0], candidateRule: { source: 'NamedUser', accountId: 'someone' } },
				],
			}),
	).toThrow()
})

it('rejects scripts, selector ambiguity, duplicated slots and skipped approval stages', /** Typed selectors preserve source ownership without manufacturing grants. */ () => {
	const rule = {
		subjectType: 'Adjustment',
		stage: 1,
		independent: true,
		candidateRule: { source: 'Function', functionCode: 'TIME_APPROVE' },
	}
	for (const approvalRules of [
		[{ ...rule, independent: false }],
		[{ ...rule, subjectType: 'Override', independent: false }],
		[{ ...rule, stage: 2 }],
		[rule, rule],
		[{ ...rule, candidateRule: { source: 'Script', script: 'allow()' } }],
		[{ ...rule, candidateRule: { source: 'ManagerLevel', managerLevel: 0 } }],
		[{ ...rule, candidateRule: { source: 'LineManager', accountId: 'forged' } }],
	])
		expect(
			/** Invalid source case requirements must not survive typed normalization. */ () =>
				parseAttendancePolicyDraft({ ...policy(), approvalRules }),
		).toThrow()
	expect(
		parseAttendancePolicyDraft({
			...policy(),
			approvalRules: [
				rule,
				{
					...rule,
					stage: 2,
					candidateRule: { source: 'NamedUser', accountId: 'current-candidate' },
				},
			],
		}).approvalRules,
	).toHaveLength(2)
})

it('requires an explicit observed date and preserves jurisdiction text and exact partial times', /** Actual dates may lie outside the observed version year; regional codes are never inferred. */ () => {
	expect(parseHolidayDraft(calendar())).toEqual(calendar())
	const entry = calendar().entries[0]
	const partial = {
		...entry,
		regionCode: 'Île-de-France',
		locationId: 'office',
		startTime: '01:00:00.001',
		endTime: '02:00',
		overlapOffset: { start: 'Later' },
	}
	expect(parseHolidayDraft({ ...calendar(), entries: [partial] }).entries[0]).toEqual(partial)
	for (const patch of [
		{ observedDate: undefined },
		{ observedDate: '2027-01-01' },
		{ date: '2026-02-29' },
		{ category: 'AutomaticSubstitute' },
		{ priority: 0.5 },
		{ priority: 2147483648 },
		{ startTime: '09:00' },
		{ startTime: '12:00', endTime: '09:00' },
		{ startTime: '09:00:00.0001', endTime: '12:00' },
		{ overlapOffset: { start: 'Earlier' } },
		{ regionCode: ' ' },
		{ regionCode: 'x'.repeat(121) },
	])
		expect(
			/** Reject impossible dates, partial pairs, precision loss and unsupported jurisdiction values. */ () =>
				parseHolidayDraft({ ...calendar(), entries: [{ ...entry, ...patch }] }),
		).toThrow()
})

it('validates whole holiday replacements without accepting persisted state or missing revision', /** Every update uses the same date and interval validator as create. */ () => {
	const draft = calendar()
	expect(parseHolidayDraftUpdate({ ...draft, expectedRevision: 2 })).toEqual({
		draft,
		expectedRevision: 2,
	})
	for (const patch of [
		{ expectedRevision: 0 },
		{ state: 'Published' },
		{ tenantId: 'other' },
		{ entries: [{ ...draft.entries[0], observedDate: undefined }] },
		{ entries: [{ ...draft.entries[0], startTime: '13:00', endTime: '12:00' }] },
	])
		expect(
			/** Reject malformed update content before persistence. */ () =>
				parseHolidayDraftUpdate({ ...draft, expectedRevision: 2, ...patch }),
		).toThrow()
})
