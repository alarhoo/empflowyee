import { expect, it } from 'vitest'
import { emptyPolicyForm, policyFromForm, policyFormFromVersion } from './policy-form'

/** Deliberate test-only policy inputs exercise both independent time rules and disabled overtime. */
function validForm() {
	return {
		...emptyPolicyForm(),
		code: 'STANDARD',
		name: 'Standard time',
		effectiveFrom: '2026-10-05',
		graceInMinutes: '0',
		graceOutMinutes: '5',
		rounding: 'None',
		overtimeEnabled: 'false',
	}
}

it('rejects empty choices, blank numbers, unsafe integers and incomplete enabled rules', /** Form conversion cannot turn missing input into a business default. */ () => {
	expect(
		/** Exercise rejection without issuing a source command. */ () =>
			policyFromForm(emptyPolicyForm()),
	).toThrow()
	for (const patch of [
		{ graceInMinutes: '' },
		{ graceInMinutes: '1.5' },
		{ graceInMinutes: '9007199254740992' },
		{ graceOutMinutes: '-1' },
		{ rounding: 'Configured' },
		{ minimumRestEnabled: true },
		{ overtimeEnabled: 'true' },
	])
		expect(
			/** Exercise rejection without issuing a source command. */ () =>
				policyFromForm({ ...validForm(), ...patch }),
		).toThrow()
	expect(
		policyFromForm({ ...validForm(), graceInMinutes: '9007199254740991' }).graceInMinutes,
	).toBe(Number.MAX_SAFE_INTEGER)
})

it('retains every enabled typed rule across a persisted draft reload', /** Roundtrip includes exact candidate shapes, explicit independence and separate minimum-rest behavior. */ () => {
	const draft = policyFromForm({
		...validForm(),
		rounding: 'Configured',
		roundingIncrementMinutes: '15',
		roundingDirection: 'Nearest',
		minimumRestEnabled: true,
		minimumRestMinutes: '540',
		minimumRestMode: 'Warn',
		overtimeEnabled: 'true',
		qualification: 'ScheduledExcess',
		capMinutes: '120',
		preapprovalRequired: 'false',
		approvalRules: [
			{
				subjectType: 'Overtime',
				stage: '1',
				independent: 'true',
				source: 'ManagerLevel',
				managerLevel: '2',
				functionCode: '',
				accountId: '',
			},
		],
	})
	expect(
		policyFromForm(
			policyFormFromVersion({
				...draft,
				id: 'policy',
				versionId: 'version',
				versionNumber: 1,
				revision: 1,
				state: 'Draft',
			}),
		),
	).toEqual(draft)
})

it('revalidates independence, stage continuity and rule parameters when selections change', /** A corrected form becomes valid without suppressing source validation. */ () => {
	const rule = {
		subjectType: 'Correction',
		stage: '1',
		independent: 'false',
		source: 'LineManager',
		managerLevel: '',
		functionCode: '',
		accountId: '',
	}
	expect(
		/** Exercise rejection without issuing a source command. */ () =>
			policyFromForm({ ...validForm(), approvalRules: [rule] }),
	).toThrow()
	expect(
		policyFromForm({ ...validForm(), approvalRules: [{ ...rule, independent: 'true' }] })
			.approvalRules[0].independent,
	).toBe(true)
	expect(
		/** Exercise rejection without issuing a source command. */ () =>
			policyFromForm({
				...validForm(),
				approvalRules: [{ ...rule, independent: 'true', stage: '2' }],
			}),
	).toThrow()
	expect(
		/** Exercise rejection without issuing a source command. */ () =>
			policyFromForm({
				...validForm(),
				approvalRules: [{ ...rule, independent: 'true', source: 'NamedUser' }],
			}),
	).toThrow()
})
