import { expect, it } from 'vitest'
import { parseHolidayAssignment, parseHolidayAssignmentQuery } from './holiday-assignments'

const command = {
	versionId: 'calendar-v1',
	expectedRevision: 2,
	employmentId: 'employment-1',
	effectiveFrom: '2026-01-01',
	resolutionFrom: '2026-01-01',
	resolutionTo: '2026-12-31',
	reason: 'Assign explicit coverage',
}

it('keeps an open-ended assignment distinct from its bounded materialization window', /** An execution safety bound must not silently become business lifespan. */ () => {
	expect(parseHolidayAssignment(command)).toMatchObject({
		target: { kind: 'Employment', id: 'employment-1' },
		resolutionTo: '2026-12-31',
	})
	expect(parseHolidayAssignment(command).effectiveTo).toBeUndefined()
	expect(
		/** The worker window must remain bounded. */ () =>
			parseHolidayAssignment({ ...command, resolutionTo: '2027-01-02' }),
	).toThrow()
	expect(
		/** Materialization cannot extend beyond assignment coverage. */ () =>
			parseHolidayAssignment({ ...command, effectiveTo: '2026-06-01' }),
	).toThrow()
})
it('rejects ambiguous targets, stale-shaped revisions and incomplete supersession', /** Every changed scope and predecessor must be explicit and closed. */ () => {
	for (const invalid of [
		{ ...command, tenantScope: true },
		{ ...command, expectedRevision: 0 },
		{ ...command, supersedes: { id: 'old' } },
		{ ...command, supersedes: { id: 'old', expectedRevision: 1, overwrite: true } },
		{ ...command, reason: ' ' },
		{ ...command, reason: 'a'.repeat(2001) },
	])
		expect(
			/** Reject this malformed scope or evidence shape. */ () => parseHolidayAssignment(invalid),
		).toThrow()
	expect(
		parseHolidayAssignment({ ...command, supersedes: { id: 'old', expectedRevision: 3 } })
			.supersedes,
	).toEqual({ id: 'old', expectedRevision: 3 })
})
it('bounds assignment lookup to exactly one typed target and date', /** A read cannot admit unknown filters, duplicate values or a tenant identifier supplied by the browser. */ () => {
	expect(parseHolidayAssignmentQuery(new URLSearchParams('kind=Tenant&asOf=2026-01-01'))).toEqual({
		target: { kind: 'Tenant' },
		asOf: '2026-01-01',
	})
	for (const query of [
		'kind=Tenant&id=foreign&asOf=2026-01-01',
		'kind=Employment&asOf=2026-01-01',
		'kind=Tenant&asOf=2026-01-01&asOf=2027-01-01',
		'kind=Tenant&asOf=2026-01-01&limit=100',
	])
		expect(
			/** Reject an ambiguous or undeclared lookup parameter. */ () =>
				parseHolidayAssignmentQuery(new URLSearchParams(query)),
		).toThrow()
})
