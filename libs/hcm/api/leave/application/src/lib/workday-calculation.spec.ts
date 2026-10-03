import { expect, it, vi } from 'vitest'
import type { WorkdayView } from '@empflowyee/hcm-attendance-contract'
import { calculateLeaveWorkdays, type LeaveCalculationAdmission } from './workday-calculation'

/** Arrange explicit dates and source versions without relying on a seeded period or inferred entitlement. */
function admission(): LeaveCalculationAdmission {
	return {
		enrollment: {
			id: 'enrollment',
			revision: 1,
			employmentId: 'employment',
			policyVersionId: 'version',
			periodId: 'period',
			effectiveFrom: '2026-10-01',
			effectiveTo: '2026-10-31',
			trackingMode: 'Balance',
			state: 'Active',
			accountId: 'account',
		},
		period: {
			id: 'period',
			revision: 2,
			state: 'Open',
			code: 'OCT',
			name: 'October',
			startDate: '2026-10-01',
			endDate: '2026-10-31',
		},
		policy: {
			id: 'policy',
			versionId: 'version',
			version: 1,
			revision: 2,
			state: 'Published',
			validation: [],
			code: 'TEST',
			name: 'Test',
			leaveTypeId: 'type',
			effectiveFrom: '2026-10-01',
			effectiveTo: '2026-10-31',
			trackingMode: 'Balance',
			unit: 'Day',
			eligibility: { workerTypes: [], legalEntityIds: [] },
			eligibilityRules: [],
			datedAssignments: [],
			rounding: { scale: 6, mode: 'Nearest' },
			allowHourly: true,
			hourlyIncrementMinutes: 30,
			allowHalfDay: false,
			maximumAdvanceDays: 365,
			maximumBackdatedDays: 0,
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
		},
	}
}
/** Provide one exact published hour for an isolated owner-port orchestration test. */
function workday(workDate = '2026-10-05'): Extract<WorkdayView, { state: 'Published' }> {
	return {
		state: 'Published',
		employmentId: 'employment',
		workDate,
		id: `workday-${workDate}`,
		revision: 1,
		digest: 'a'.repeat(64),
		kind: 'Work',
		zone: 'UTC',
		resolvedAt: '2026-10-01T00:00:00Z',
		scheduledMilliseconds: '3600000',
		elapsedMilliseconds: '3600000',
		breakMilliseconds: '0',
		supersedesId: null,
		sourceVersions: [],
		datedSources: [],
		rest: null,
		segments: (['Work', 'ExpectedWork'] as const).map(
			/** The same hour is both scheduled and expected on a nonholiday. */ (kind) => ({
				kind,
				startInstant: `${workDate}T09:00:00Z`,
				endInstant: `${workDate}T10:00:00Z`,
				startLocal: `${workDate}T09:00:00`,
				endLocal: `${workDate}T10:00:00`,
				startOffsetSeconds: 0,
				endOffsetSeconds: 0,
				elapsedMilliseconds: '3600000',
				holidayId: null,
				holidayName: null,
			}),
		),
	}
}
/** Supply a read-only unit-test port; production composes the transaction-bound Attendance owner. */
function port(items: WorkdayView[]) {
	return {
		read: vi.fn(
			/** Return only the test's explicit owner projection. */ async () => ({
				items,
				nextCursor: null,
			}),
		),
	}
}
const full = [{ workDate: '2026-10-05', request: { portion: 'Full' as const } }]

it('uses one selected employment and sums exact dated quantities with source evidence', /** Mixed portions use their own date denominator and survive deterministic source binding. */ async () => {
	const source = port([workday(), workday('2026-10-06')])
	const result = await calculateLeaveWorkdays(source, admission(), [
		...full,
		{
			workDate: '2026-10-06',
			request: {
				portion: 'Hourly',
				startInstant: '2026-10-06T09:00:00Z',
				endInstant: '2026-10-06T09:30:00Z',
			},
		},
	])
	expect(source.read).toHaveBeenCalledExactlyOnceWith({
		employmentId: 'employment',
		from: '2026-10-05',
		to: '2026-10-06',
	})
	expect(result).toMatchObject({
		state: 'Available',
		units: '1.5',
		digest: expect.stringMatching(/^[a-f0-9]{64}$/),
	})
	expect(result.days[0].workday).toEqual({
		id: 'workday-2026-10-05',
		revision: 1,
		digest: 'a'.repeat(64),
	})
})
it('rejects cross-period, version and enrollment ranges before reading another domain', /** Admission is one immutable version in one explicit open period. */ async () => {
	const source = port([workday()])
	for (const change of [
		{ period: { ...admission().period, endDate: '2026-10-04' } },
		{ policy: { ...admission().policy, effectiveTo: '2026-10-04' } },
		{ enrollment: { ...admission().enrollment, effectiveTo: '2026-10-04' } },
		{ enrollment: { ...admission().enrollment, policyVersionId: 'another-version' } },
		{ enrollment: { ...admission().enrollment, periodId: 'another-period' } },
		{ period: { ...admission().period, state: 'Closing' as const } },
		{ policy: { ...admission().policy, state: 'Draft' as const } },
	])
		await expect(
			calculateLeaveWorkdays(source, { ...admission(), ...change }, full),
		).rejects.toThrow()
	expect(source.read).not.toHaveBeenCalled()
})
it('does not give a request total when one published day is missing or stale', /** Partial facts never become zero charged units or a fallback entitlement. */ async () => {
	for (const items of [
		[],
		[
			{
				state: 'Unavailable' as const,
				employmentId: 'employment',
				workDate: '2026-10-05',
				unavailableCode: 'SourceChanged',
			},
		],
	]) {
		const result = await calculateLeaveWorkdays(port(items), admission(), full)
		expect(result).toMatchObject({
			state: 'Unavailable',
			days: [{ quantity: { state: 'Unavailable', reason: 'WorkdayUnavailable' } }],
		})
		expect(result).not.toHaveProperty('units')
		expect(result).not.toHaveProperty('digest')
	}
})
it('rejects duplicate dates and mismatched owner projections', /** A duplicate or different employment cannot be silently selected or charged twice. */ async () => {
	await expect(
		calculateLeaveWorkdays(port([workday()]), admission(), [...full, ...full]),
	).rejects.toThrow()
	await expect(calculateLeaveWorkdays(port([]), admission(), [])).rejects.toThrow()
	for (const items of [
		[workday(), workday()],
		[{ ...workday(), employmentId: 'another-employment' }],
		[workday('2026-10-06')],
	])
		await expect(calculateLeaveWorkdays(port(items), admission(), full)).rejects.toThrow()
})
it('changes its fingerprint when a source revision changes even if units are equal', /** Revalidation must detect material source replacement independently of the display quantity. */ async () => {
	const before = await calculateLeaveWorkdays(port([workday()]), admission(), full)
	const after = await calculateLeaveWorkdays(
		port([{ ...workday(), revision: 2, digest: 'b'.repeat(64) }]),
		admission(),
		full,
	)
	if (before.state !== 'Available' || after.state !== 'Available')
		throw new Error('Expected available test calculations')
	expect(after.units).toBe(before.units)
	expect(after.digest).not.toBe(before.digest)
})
it('calculates Unpaid units without requiring or manufacturing an account', /** Tracking mode affects funding orchestration, not the approved workday quantity. */ async () => {
	const input = admission()
	input.enrollment.trackingMode = 'Unpaid'
	delete input.enrollment.accountId
	input.policy.trackingMode = 'Unpaid'
	expect(await calculateLeaveWorkdays(port([workday()]), input, full)).toMatchObject({
		state: 'Available',
		units: '1',
	})
	expect(input.enrollment).not.toHaveProperty('accountId')
})
