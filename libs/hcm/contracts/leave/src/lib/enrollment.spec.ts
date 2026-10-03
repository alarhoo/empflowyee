import { expect, it } from 'vitest'
import { readLeaveEnrollmentCommand } from './enrollment'

it('accepts explicit dated enrollment while preserving the reason', /** No caller-controlled tenant, account or entitlement reaches the command. */ () => {
	const input = {
		employmentId: 'employment',
		policyVersionId: 'version',
		effectiveFrom: '2026-01-01',
		effectiveTo: '2026-12-31',
		reason: '  Reviewed eligibility  ',
	}
	expect(readLeaveEnrollmentCommand(input)).toEqual(input)
	for (const change of [
		{ tenantId: 'foreign' },
		{ units: '24' },
		{ reason: '' },
		{ reason: 'a'.repeat(2001) },
		{ effectiveFrom: '2026-02-30' },
		{ effectiveTo: '2025-12-31' },
		{ employmentId: '' },
	])
		expect(
			/** Invalid enrollment changes must fail before admission. */ () =>
				readLeaveEnrollmentCommand({ ...input, ...change }),
		).toThrow()
})
