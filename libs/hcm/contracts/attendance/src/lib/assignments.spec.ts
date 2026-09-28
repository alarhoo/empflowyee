import { it, expect } from 'vitest'
import { parseAttendanceAssignment } from './assignments'

const fields = {
	versionId: 'published-version',
	effectiveFrom: '2026-01-01',
	reason: ' Explicit assignment ',
}

it('requires exactly one explicit scope and never accepts browser tenant ownership', /** An absent selector cannot silently become a tenant-wide assignment. */ () => {
	expect(parseAttendanceAssignment({ ...fields, tenantScope: true }).target).toEqual({
		kind: 'Tenant',
	})
	expect(parseAttendanceAssignment({ ...fields, employmentId: 'employment-one' })).toMatchObject({
		reason: fields.reason,
		target: { kind: 'Employment', id: 'employment-one' },
	})
	for (const scope of [
		{},
		{ tenantScope: false },
		{ tenantScope: true, employmentId: 'one' },
		{ employmentId: 'one', locationId: 'office' },
		{ tenantId: 'forged', tenantScope: true },
		{ employmentId: '' },
	])
		expect(
			/** Reject ambiguous or forged scope before any database operation. */ () =>
				parseAttendanceAssignment({ ...fields, ...scope }),
		).toThrow()
})

it('rejects invalid effective coverage, reasons and expected revisions', /** Date and revision fields are neither coerced nor truncated. */ () => {
	for (const extra of [
		{ effectiveTo: '2025-12-31' },
		{ effectiveFrom: '2026-02-29' },
		{ expectedRevision: 0 },
		{ expectedRevision: '1' },
		{ reason: ' ' },
		{ reason: 'x'.repeat(2001) },
	])
		expect(
			/** Direct commands obey the same constraints as assignment forms. */ () =>
				parseAttendanceAssignment({ ...fields, tenantScope: true, ...extra }),
		).toThrow()
})
