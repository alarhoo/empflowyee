import { expect, it } from 'vitest'
import type { WorkforceTimeContext } from '@empflowyee/hcm-api-workforce-foundation-application'
import { workdayLocation, workdayZone } from './workday-location'
import { AssignedWorkdayResolver } from './assigned-workday'
import { evaluateOverrideWorkdayImpact } from './override-impact'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'
import {
	AttendanceConfigurationInputs,
	type AttendanceConfigurationFamily,
	type AttendanceConfigurationVersions,
} from './configuration-inputs'
import { commandHash } from '@empflowyee/hcm-api-runtime-application'

/** Supply minimal dated Workforce facts solely for pure selection tests. */
function locationFacts(): WorkforceTimeContext {
	return {
		employmentId: 'employment',
		employmentRevision: 1,
		workerId: 'worker',
		workerRevision: 1,
		workerTypeId: 'type',
		workerTypeRevision: 1,
		legalEntityId: 'employer',
		legalEntityRevision: 1,
		employmentType: 'Permanent',
		employmentStatus: 'Active',
		hireDate: '2026-01-01',
		employmentEndDate: null,
		continuousServiceStartDate: null,
		workDate: '2026-09-28',
		inputDigest: 'a'.repeat(64),
		assignments: [
			{
				id: 'primary',
				revision: 1,
				isPrimary: true,
				effectiveFrom: '2026-01-01',
				effectiveTo: null,
				orgUnitId: 'unit',
				orgUnitRevision: 1,
				departmentId: null,
				departmentRevision: null,
				locationId: 'east',
				locationRevision: 1,
				timezone: 'America/New_York',
				countryCode: 'US',
				region: 'PA',
			},
		],
	}
}

it('uses the unique primary for Employment and an explicit target only for Location', /** DEC-HCM3-023 distinguishes schedule authority from arbitrary row order. */ () => {
	const facts = locationFacts()
	facts.assignments = [
		{
			...facts.assignments[0],
			id: 'other',
			isPrimary: false,
			locationId: 'west',
			timezone: 'America/Los_Angeles',
			region: 'CA',
		},
		...facts.assignments,
	]
	expect(
		workdayZone({ timezoneMode: 'Employment' }, facts, { kind: 'Assignment', id: 'other' }),
	).toBe('America/New_York')
	expect(
		workdayZone({ timezoneMode: 'Location' }, facts, { kind: 'Assignment', id: 'other' }),
	).toBe('America/Los_Angeles')
	expect(workdayZone({ timezoneMode: 'Location' }, facts, { kind: 'Location', id: 'west' })).toBe(
		'America/Los_Angeles',
	)
	expect(
		workdayZone({ timezoneMode: 'Location' }, facts, { kind: 'Department', id: 'department' }),
	).toBe('America/New_York')
	expect(
		workdayZone({ timezoneMode: 'Fixed', fixedZone: 'Asia/Kolkata' }, facts, {
			kind: 'Location',
			id: 'west',
		}),
	).toBe('Asia/Kolkata')
})

/** Compose the real application selector against test-only source ports with independently mutable dated inputs. */
function resolverFixture() {
	const versions: AttendanceConfigurationVersions = {
		Schedule: {
			id: 'schedule',
			versionId: 'schedule-v1',
			versionNumber: 1,
			revision: 2,
			state: 'Published',
			code: 'NIGHT',
			name: 'Night',
			effectiveFrom: '2026-01-01',
			isTemplate: false,
			timezoneMode: 'Employment',
			weekStartsOn: 1,
			days: [1, 2, 3, 4, 5, 6, 7].map(
				/** Explicit overnight test pattern with no inferred break. */ (weekday) => ({
					weekday,
					kind: 'Work',
					segments: [{ startTime: '22:00', endTime: '06:00', endDayOffset: 1, kind: 'Work' }],
				}),
			),
		},
		Policy: {
			id: 'policy',
			versionId: 'policy-v1',
			versionNumber: 1,
			revision: 2,
			state: 'Published',
			code: 'EXACT',
			name: 'Exact',
			effectiveFrom: '2026-01-01',
			graceInMinutes: 0,
			graceOutMinutes: 0,
			rounding: 'None',
			overtime: { enabled: false },
			approvalRules: [],
		},
		Holiday: {
			id: 'calendar',
			versionId: 'calendar-v1',
			versionNumber: 1,
			revision: 2,
			state: 'Published',
			code: 'CAL',
			name: 'Calendar',
			effectiveFrom: '2026-01-01',
			entries: [],
		},
	}
	const facts = locationFacts()
	const missing = new Set<string>(),
		reads: string[] = []
	const overrides = new Map<string, AttendanceConfigurationVersions['Holiday']>()
	const port = new AttendanceConfigurationInputs(
		'tenant',
		{
			/** Keep test workforce digests date-sensitive just like the real owner projection. */
			async read(employmentId, workDate) {
				if (employmentId !== facts.employmentId)
					return { state: 'Unavailable', reason: 'employment-unavailable' }
				return {
					state: 'Available',
					context: {
						...facts,
						workDate,
						inputDigest: commandHash('test-workforce', { facts, workDate }),
					},
				}
			},
		},
		{
			/** Select one published tenant assignment or an explicit missing input for the test date. */
			async matching(family, date) {
				reads.push(`${family}:${date}`)
				if (missing.has(`${family}:${date}`)) return []
				const selectedHoliday = family === 'Holiday' ? overrides.get(date) : undefined
				return [
					{
						id: `${family}-assignment`,
						revision: 1,
						versionId: selectedHoliday?.versionId ?? versions[family].versionId,
						target: { kind: 'Tenant' },
						effectiveFrom: '2026-01-01',
						effectiveTo: null,
					},
				]
			},
			/** Read the immutable version selected by the source assignment rather than a latest-version shortcut. */
			async version<Family extends AttendanceConfigurationFamily>(
				family: Family,
				versionId: string,
			): Promise<AttendanceConfigurationVersions[Family] | null> {
				if (versions[family].versionId === versionId) return versions[family]
				for (const version of overrides.values())
					if (version.versionId === versionId)
						return version as AttendanceConfigurationVersions[Family]
				return null
			},
		},
	)
	return {
		versions,
		facts,
		missing,
		reads,
		overrides,
		resolver: new AssignedWorkdayResolver(port, 10),
		port,
	}
}

it('retains following workday impact across intervening rest dates', /** The first future scheduled shift completes a single-date override review even after a weekend. */ async () => {
	const f = resolverFixture(),
		authorized: string[] = []
	f.versions.Schedule.days = f.versions.Schedule.days.map(
		/** Explicit rest rows remain dependencies rather than ending the forward review. */ (day) =>
			day.weekday >= 6 ? { ...day, kind: 'Rest', segments: [] } : day,
	)
	const days = await evaluateOverrideWorkdayImpact(
		f.port,
		'employment',
		'2026-10-30',
		/** Observe the required dated authorization before each source read. */ async (date) => {
			authorized.push(date)
		},
	)
	expect(days.map(/** Read reviewed local dates. */ (day) => day.workDate)).toEqual([
		'2026-10-30',
		'2026-10-31',
		'2026-11-01',
		'2026-11-02',
	])
	expect(authorized).toEqual(
		days.map(/** Retain the same scope as the evidence. */ (day) => day.workDate),
	)
})
it('blocks next-shift rest violations and preserves independent warning outcomes', /** Extending the prior shift can invalidate the following day even though its own start has adequate prior rest. */ async () => {
	const f = resolverFixture()
	f.versions.Schedule.days[4].segments = [
		{ kind: 'Work', startTime: '22:00', endTime: '15:00', endDayOffset: 1 },
	]
	f.versions.Schedule.minimumRestMinutes = 480
	f.versions.Schedule.minimumRestMode = 'Warn'
	f.versions.Policy.minimumRestMinutes = 660
	f.versions.Policy.minimumRestMode = 'Block'
	/** This pure algorithm test supplies an already authorized fixture scope. */
	const allow = async () => undefined
	expect((await f.resolver.resolve('employment', '2026-10-30')).state).toBe('Available')
	await expect(
		evaluateOverrideWorkdayImpact(f.port, 'employment', '2026-10-30', allow),
	).rejects.toMatchObject({ code: 'invalid-state' })
	f.versions.Policy.minimumRestMode = 'Warn'
	const days = await evaluateOverrideWorkdayImpact(f.port, 'employment', '2026-10-30', allow)
	expect(days[1].result.rest).toMatchObject({
		state: 'Compared',
		previousWorkDate: '2026-10-30',
		outcomes: [
			{ source: 'Schedule', result: { state: 'Warn' } },
			{ source: 'Policy', result: { state: 'Warn' } },
		],
	})
})
it('refuses missing or unauthorized following-day inputs', /** Neither absent future configuration nor a dated grant gap is treated as harmless rest. */ async () => {
	const f = resolverFixture()
	f.missing.add('Schedule:2026-10-31')
	await expect(
		evaluateOverrideWorkdayImpact(
			f.port,
			'employment',
			'2026-10-30',
			/** The missing-source case begins with complete test authority. */ async () => undefined,
		),
	).rejects.toMatchObject({ code: 'record-incomplete' })
	f.missing.clear()
	f.reads.length = 0
	await expect(
		evaluateOverrideWorkdayImpact(
			f.port,
			'employment',
			'2026-10-30',
			/** Reject the future date before any source inspection for that shift. */ async (date) => {
				if (date === '2026-10-31') throw new HcmDomainError('forbidden')
			},
		),
	).rejects.toMatchObject({ code: 'forbidden' })
	expect(f.reads).not.toContain('Policy:2026-10-31')
})

it('resolves overnight DST work with each civil date’s selected calendar and exact source IDs', /** A next-date version switch must not apply the old calendar's next-date holiday or duplicate entries. */ async () => {
	const f = resolverFixture()
	f.versions.Holiday.entries = [
		{
			id: 'first',
			versionId: 'calendar-v1',
			date: '2026-10-31',
			observedDate: '2026-10-31',
			category: 'Company',
			name: 'Partial',
			priority: 1,
			startTime: '23:30',
			endTime: '23:45',
		},
		{
			id: 'not-selected',
			versionId: 'calendar-v1',
			date: '2026-11-01',
			observedDate: '2026-11-01',
			category: 'Public',
			name: 'Old next date',
			priority: 1,
		},
	]
	f.overrides.set('2026-11-01', {
		...f.versions.Holiday,
		versionId: 'calendar-v2',
		entries: [
			{
				id: 'next',
				versionId: 'calendar-v2',
				date: '2026-11-01',
				observedDate: '2026-11-01',
				category: 'Regional',
				regionCode: 'PA',
				name: 'Fold',
				priority: 1,
				startTime: '01:30',
				endTime: '02:00',
				overlapOffset: { start: 'Earlier' },
			},
		],
	})
	const result = await f.resolver.resolve('employment', '2026-10-31')
	expect(result).toMatchObject({
		state: 'Available',
		holidayCalendarVersionIds: ['calendar-v1', 'calendar-v2'],
		resolution: {
			scheduledWorkMilliseconds: '32400000',
			expectedWorkMilliseconds: '26100000',
			holidaySegments: [{ holidayId: 'first' }, { holidayId: 'next' }],
		},
		rest: { state: 'NotRequired' },
	})
	expect(
		f.reads.filter(
			/** Disabled rest rules require no historical schedule reads. */ (item) =>
				item.startsWith('Schedule:'),
		),
	).toEqual(['Schedule:2026-10-31'])
	if (result.state !== 'Available') throw new Error('Expected exact result')
	f.versions.Holiday.revision++
	const changed = await f.resolver.resolve('employment', '2026-10-31')
	if (changed.state !== 'Available') throw new Error('Expected changed result')
	expect(changed.inputDigest).not.toBe(result.inputDigest)
})

it('distinguishes real Rest from missing schedule, policy, next-date calendar and prior history', /** No unavailable source may turn into a fabricated zero-day or assumed elapsed rest. */ async () => {
	for (const key of ['Schedule:2026-10-31', 'Policy:2026-10-31', 'Holiday:2026-11-01']) {
		const f = resolverFixture()
		f.missing.add(key)
		expect(await f.resolver.resolve('employment', '2026-10-31')).toMatchObject({
			state: 'Unavailable',
			reason: 'MissingConfiguration',
		})
	}
	const f = resolverFixture()
	f.versions.Schedule.days[5] = { weekday: 6, kind: 'Rest', segments: [] }
	expect(await f.resolver.resolve('employment', '2026-10-31')).toMatchObject({
		state: 'Available',
		resolution: { scheduleKind: 'Rest', scheduledWorkMilliseconds: '0' },
	})
	f.versions.Schedule.minimumRestMinutes = 60
	f.versions.Schedule.minimumRestMode = 'Warn'
	f.missing.add('Schedule:2026-10-31')
	expect(await f.resolver.resolve('employment', '2026-11-01')).toMatchObject({
		state: 'Unavailable',
		reason: 'MissingConfiguration',
		dependency: { family: 'Schedule', date: '2026-10-31' },
	})
})

it('preserves independent rest warnings and blocks then stops at the real employment boundary', /** Schedule and policy compare identical exact instants; a first employment workday has no fabricated prior end. */ async () => {
	const f = resolverFixture()
	f.versions.Schedule.minimumRestMinutes = 1080
	f.versions.Schedule.minimumRestMode = 'Warn'
	f.versions.Policy.minimumRestMinutes = 1020
	f.versions.Policy.minimumRestMode = 'Block'
	expect(await f.resolver.resolve('employment', '2026-10-31')).toMatchObject({
		state: 'Unavailable',
		reason: 'MinimumRestBlocked',
		rest: {
			state: 'Compared',
			outcomes: [
				{ source: 'Schedule', result: { state: 'Warn', elapsedMilliseconds: '57600000' } },
				{ source: 'Policy', result: { state: 'Block', elapsedMilliseconds: '57600000' } },
			],
		},
	})
	f.versions.Policy.minimumRestMinutes = 960
	expect(await f.resolver.resolve('employment', '2026-10-31')).toMatchObject({
		state: 'Available',
		rest: {
			state: 'Compared',
			outcomes: [{ result: { state: 'Warn' } }, { result: { state: 'Satisfied' } }],
		},
	})
	f.facts.hireDate = '2026-10-31'
	expect(await f.resolver.resolve('employment', '2026-10-31')).toMatchObject({
		state: 'Available',
		rest: { state: 'NoPriorEmploymentWork' },
	})
})

it('rejects unresolved DST endpoints and budget exhaustion without truncating history into success', /** An operational limit never manufactures a rest-rule pass; source defects stay explicit. */ async () => {
	const f = resolverFixture()
	f.versions.Schedule.days[6].segments = [
		{ startTime: '01:30', endTime: '04:00', endDayOffset: 0, kind: 'Work' },
	]
	expect(await f.resolver.resolve('employment', '2026-11-01')).toMatchObject({
		state: 'Unavailable',
		reason: 'DstOverlap',
	})
	f.versions.Schedule.days[6].segments[0].startTime = '02:30'
	expect(await f.resolver.resolve('employment', '2026-03-08')).toMatchObject({
		state: 'Unavailable',
		reason: 'DstGap',
	})
	f.versions.Schedule.days[5] = { weekday: 6, kind: 'Rest', segments: [] }
	f.versions.Schedule.days[6] = { weekday: 7, kind: 'Rest', segments: [] }
	f.versions.Policy.minimumRestMinutes = 3000
	f.versions.Policy.minimumRestMode = 'Warn'
	expect(
		await new AssignedWorkdayResolver(f.port, 1).resolve('employment', '2026-11-02'),
	).toMatchObject({ state: 'Unavailable', reason: 'ResolutionBudgetExceeded' })
	expect(await f.resolver.resolve('employment', '2026-11-02')).toMatchObject({
		state: 'Available',
		rest: { state: 'Compared', previousWorkDate: '2026-10-30' },
	})
})

it('rejects missing and ambiguous matches instead of falling back', /** Even two primary assignments at one location remain ambiguous in Employment mode. */ () => {
	const facts = locationFacts()
	expect(
		workdayZone({ timezoneMode: 'Location' }, facts, { kind: 'Location', id: 'missing' }),
	).toBeNull()
	expect(
		workdayZone({ timezoneMode: 'Location' }, facts, { kind: 'Assignment', id: 'missing' }),
	).toBeNull()
	facts.assignments = [facts.assignments[0], { ...facts.assignments[0], id: 'second-primary' }]
	expect(workdayZone({ timezoneMode: 'Employment' }, facts, { kind: 'Tenant' })).toBeNull()
	expect(workdayLocation(facts, 'Location', { kind: 'Location', id: 'east' })).toMatchObject({
		locationId: 'east',
	})
	facts.assignments = [facts.assignments[0], { ...facts.assignments[1], locationRevision: 2 }]
	expect(workdayLocation(facts, 'Location', { kind: 'Location', id: 'east' })).toBeNull()
	facts.assignments = [{ ...facts.assignments[0], isPrimary: false }]
	expect(workdayZone({ timezoneMode: 'Employment' }, facts, { kind: 'Tenant' })).toBeNull()
	expect(workdayZone({ timezoneMode: 'Fixed', fixedZone: 'UTC' }, facts, { kind: 'Tenant' })).toBe(
		'UTC',
	)
})
