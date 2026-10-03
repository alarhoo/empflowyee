import { it, expect } from 'vitest'
import { parseWorkflowActionCommand } from './actions'

it('rejects authority injection, unknown actions and unbounded or absent decision reasons', /** Browser input cannot supply source slot identity or substitute for verified actor authority. */ () => {
	const valid = {
		expectedRevision: 1,
		expectedSourceRevision: 2,
		expectedSubjectRevision: 3,
		generation: 1,
		action: 'Approve',
		reason: 'Reviewed the dated source',
	}
	expect(parseWorkflowActionCommand(valid)).toEqual(valid)
	for (const invalid of [
		{ ...valid, actorAccountId: 'another-user' },
		{ ...valid, slotId: 'another-slot' },
		{ ...valid, authorityReference: 'injected' },
		{ ...valid, action: 'AutoApprove' },
		{ ...valid, reason: '' },
		{ ...valid, reason: 'x'.repeat(2001) },
		{ ...valid, expectedSourceRevision: 0 },
		{ ...valid, generation: 1.5 },
	])
		expect(
			/** Each rejected command must fail before persistence or source authorization. */ () =>
				parseWorkflowActionCommand(invalid),
		).toThrow()
})
