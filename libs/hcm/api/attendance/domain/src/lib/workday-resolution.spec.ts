import { it, expect } from 'vitest'
import type { AttendanceScopeTarget, ScheduleSegment } from '@empflowyee/hcm-attendance-contract'
import {
	selectAttendanceConfiguration,
	type DatedConfigurationAssignment,
} from './configuration-selection'
import { resolveDatedWorkday } from './dated-workday'
import type { PublishedHoliday } from './holiday-resolution'

const scope = {
	employmentId: 'employment',
	legalEntityId: 'employer',
	assignments: [
		{ id: 'assignment', orgUnitId: 'unit', departmentId: 'department', locationId: 'office' },
	],
}

/** Provide a dated source assignment that has already passed tenant ownership and publication checks. */
function assignment(id: string, target: AttendanceScopeTarget): DatedConfigurationAssignment {
	return {
		id,
		revision: 1,
		versionId: id + '-version',
		target,
		effectiveFrom: '2026-01-01',
		effectiveTo: '2026-12-31',
	}
}

it('applies every approved scope precedence without combining employments', /** The most specific single matching assignment wins independently of array order. */ () => {
	const assignments = [
		assignment('tenant', { kind: 'Tenant' }),
		assignment('employer', { kind: 'LegalEntity', id: 'employer' }),
		assignment('unit', { kind: 'OrgUnit', id: 'unit' }),
		assignment('department', { kind: 'Department', id: 'department' }),
		assignment('office', { kind: 'Location', id: 'office' }),
		assignment('assignment', { kind: 'Assignment', id: 'assignment' }),
		assignment('employment', { kind: 'Employment', id: 'employment' }),
	]
	for (let count = 1; count <= assignments.length; count++)
		expect(
			selectAttendanceConfiguration('2026-06-30', scope, assignments.slice(0, count).reverse()),
		).toMatchObject({ state: 'Selected', assignment: { id: assignments[count - 1].id } })
	expect(
		selectAttendanceConfiguration(
			'2026-06-30',
			{ ...scope, employmentId: 'another-employment', assignments: [] },
			[assignments[6]],
		),
	).toEqual({ state: 'Unavailable', reason: 'MissingConfiguration' })
})

it('rejects equal-precedence targets and respects inclusive effective dates', /** Two active assignments at different locations cannot be resolved by arbitrary row ordering. */ () => {
	const first = assignment('office-one', { kind: 'Location', id: 'office' })
	const second = assignment('office-two', { kind: 'Location', id: 'other-office' })
	const context = {
		...scope,
		assignments: [
			...scope.assignments,
			{ ...scope.assignments[0], id: 'second-assignment', locationId: 'other-office' },
		],
	}
	expect(selectAttendanceConfiguration('2026-01-01', context, [first, second])).toEqual({
		state: 'Unavailable',
		reason: 'EqualPrecedenceConflict',
	})
	expect(selectAttendanceConfiguration('2026-12-31', scope, [first])).toMatchObject({
		state: 'Selected',
	})
	expect(selectAttendanceConfiguration('2027-01-01', scope, [first])).toMatchObject({
		state: 'Unavailable',
	})
	expect(selectAttendanceConfiguration('2025-12-31', scope, [first])).toMatchObject({
		state: 'Unavailable',
	})
	expect(
		selectAttendanceConfiguration('2026-01-01', context, [
			first,
			second,
			assignment('specific', { kind: 'Employment', id: 'employment' }),
		]),
	).toMatchObject({ state: 'Selected', assignment: { id: 'specific' } })
})

it('preserves scheduled denominator and subtracts a partial holiday overlapping a break only once', /** Leave receives exact expected intervals while original work/break evidence stays available. */ () => {
	const segments: ScheduleSegment[] = [
		{ startTime: '09:00', endTime: '12:00', endDayOffset: 0, kind: 'Work' },
		{ startTime: '12:00', endTime: '13:00', endDayOffset: 0, kind: 'UnpaidBreak' },
		{ startTime: '13:00', endTime: '18:00', endDayOffset: 0, kind: 'Work' },
	]
	const holiday: PublishedHoliday = {
		id: 'partial',
		versionId: 'calendar',
		date: '2026-06-01',
		observedDate: '2026-06-01',
		category: 'Company',
		name: 'Partial',
		priority: 1,
		startTime: '11:30',
		endTime: '13:30',
	}
	const result = resolveDatedWorkday(
		'2026-06-01',
		'UTC',
		{ kind: 'Work', segments },
		{ regionCode: null, locationId: 'office' },
		[holiday],
	)
	expect(result).toMatchObject({
		scheduledWorkMilliseconds: '28800000',
		breakMilliseconds: '3600000',
		expectedWorkMilliseconds: '25200000',
	})
	expect(result.scheduledSegments).toHaveLength(3)
	expect(result.expectedWorkIntervals).toHaveLength(2)
})

it('keeps cross-midnight work on its start date and applies the following year holiday', /** The next civil date is evaluated without moving the employment work-date key. */ () => {
	const result = resolveDatedWorkday(
		'2026-12-31',
		'UTC',
		{
			kind: 'Work',
			segments: [{ startTime: '22:00', endTime: '06:00', endDayOffset: 1, kind: 'Work' }],
		},
		{ regionCode: null, locationId: null },
		[
			{
				id: 'new-year',
				versionId: 'next-calendar',
				date: '2027-01-01',
				observedDate: '2027-01-01',
				category: 'Public',
				name: 'New year',
				priority: 1,
			},
		],
	)
	expect(result).toMatchObject({
		workDate: '2026-12-31',
		scheduledWorkMilliseconds: '28800000',
		expectedWorkMilliseconds: '7200000',
	})
})

it('retains weekly rest and validates context even when no intervals exist', /** A declared rest day is zero; an invalid zone is not converted into a legitimate zero-work result. */ () => {
	expect(
		resolveDatedWorkday(
			'2026-06-07',
			'UTC',
			{ kind: 'Rest', segments: [] },
			{ regionCode: null, locationId: null },
			[],
		),
	).toMatchObject({
		scheduleKind: 'Rest',
		scheduledWorkMilliseconds: '0',
		expectedWorkMilliseconds: '0',
	})
	expect(
		/** Missing timezone authority remains invalid even on a rest day. */ () =>
			resolveDatedWorkday(
				'2026-06-07',
				'Not/AZone',
				{ kind: 'Rest', segments: [] },
				{ regionCode: null, locationId: null },
				[],
			),
	).toThrow()
})
