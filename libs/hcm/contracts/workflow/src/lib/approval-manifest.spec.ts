import { expect, it } from 'vitest'
import { parseDomainApprovalManifest, type DomainApprovalManifest } from './hcm-workflow-contract'

/** A source-owned independent Override case with one complete required stage. */
function manifest(): DomainApprovalManifest {
	return {
		schemaVersion: 1,
		registryVersion: 1,
		source: 'Attendance',
		caseId: 'case-1',
		caseRevision: 1,
		subjectId: 'override-1',
		subjectRevision: 1,
		generation: 1,
		completion: 'AllRequiredAnyReject',
		allowedActions: ['Approve', 'Reject'],
		registeredRouteCode: 'WORK_SCHEDULES',
		safeFacts: {
			subjectType: 'Override',
			dateFrom: '2027-02-03',
			dateTo: '2027-02-03',
			legalEntityId: 'entity-1',
			sourceState: 'Pending',
			qualifyingMilliseconds: '14400250',
		},
		slots: [
			{
				id: 'slot-1',
				revision: 1,
				state: 'Pending',
				stage: 1,
				ordinal: 1,
				independent: true,
				distinctActors: true,
				candidateRuleCode: 'rule-1',
			},
		],
	}
}
it('admits exactly five stages of five required slots and preserves exact safe durations', /** Compiler bounds never silently truncate source obligations. */ () => {
	const source = manifest()
	source.slots = Array.from(
		{ length: 25 },
		/** Create the complete admitted stage/slot boundary. */ (_, index) => ({
			...source.slots[0],
			id: 'slot-' + index,
			stage: Math.floor(index / 5) + 1,
			ordinal: (index % 5) + 1,
		}),
	)
	expect(parseDomainApprovalManifest(source).slots).toHaveLength(25)
	expect(parseDomainApprovalManifest(source).safeFacts.qualifyingMilliseconds).toBe('14400250')
	expect(
		/** A sixth stage cannot be accepted with truncated requirements. */ () =>
			parseDomainApprovalManifest({
				...source,
				slots: [...source.slots, { ...source.slots[0], id: 'extra', stage: 6 }],
			}),
	).toThrow()
})
it('rejects unknown sources, private fields, arbitrary routes and weakened approval thresholds', /** Safe registry validation precedes outbox serialization. */ () => {
	const source = manifest()
	for (const changed of [
		{ source: 'Payroll' },
		{ schemaVersion: 2 },
		{ registryVersion: 2 },
		{ reason: 'private' },
		{ registeredRouteCode: 'https://attacker.invalid' },
		{ completion: 'AnyOne' },
		{ allowedActions: ['Approve'] },
		{ safeFacts: { ...source.safeFacts, medicalReason: 'private' } },
		{ safeFacts: { ...source.safeFacts, units: '1.0' } },
		{ safeFacts: { ...source.safeFacts, subjectType: 'ClockEvent' } },
		{ safeFacts: { ...source.safeFacts, qualifyingMilliseconds: 14400250 } },
	])
		expect(
			/** Each invalid shape must fail as a whole, with no permissive projection fallback. */ () =>
				parseDomainApprovalManifest({ ...source, ...changed }),
		).toThrow()
})
it('rejects missing, duplicate, skipped and overflowing source slots', /** One slot cannot satisfy two obligations or bypass an earlier stage. */ () => {
	const source = manifest(),
		slot = source.slots[0]
	for (const slots of [
		[],
		[slot, slot],
		[{ ...slot, stage: 2 }],
		[{ ...slot, ordinal: 2 }],
		Array.from(
			{ length: 6 },
			/** Construct an overflowing single stage. */ (_, index) => ({
				...slot,
				id: 'slot-' + index,
				ordinal: index + 1,
			}),
		),
	])
		expect(
			/** A malformed graph cannot enter coordination. */ () =>
				parseDomainApprovalManifest({ ...source, slots }),
		).toThrow()
})
it('canonicalizes declared source order and retains completed slot state', /** Reordered JSON cannot alter semantic identity or reopen completed obligations. */ () => {
	const source = manifest(),
		slot = source.slots[0]
	const later = { ...slot, id: 'slot-2', ordinal: 2 }
	expect(parseDomainApprovalManifest({ ...source, slots: [later, slot] }).slots).toEqual([
		slot,
		later,
	])
	expect(
		parseDomainApprovalManifest({
			...source,
			slots: [{ ...slot, state: 'Approved', revision: 2 }, later],
		}).slots[0].state,
	).toBe('Approved')
})
it('retains Leave decimal units within the approved numeric posting precision', /** Leave facts cannot masquerade as Attendance time evidence. */ () => {
	const source = manifest(),
		{ qualifyingMilliseconds, ...facts } = source.safeFacts
	void qualifyingMilliseconds
	const leave = {
		...source,
		source: 'Leave',
		registeredRouteCode: 'LEAVE_ADMINISTRATION',
		safeFacts: { ...facts, subjectType: 'Adjustment', units: '-123456789012.123456' },
	}
	expect(parseDomainApprovalManifest(leave).safeFacts.units).toBe('-123456789012.123456')
	for (const units of ['1.0000001', '1234567890123', 'NaN', '1e3'])
		expect(
			/** Reject precision loss and coercion in safe numeric facts. */ () =>
				parseDomainApprovalManifest({ ...leave, safeFacts: { ...leave.safeFacts, units } }),
		).toThrow()
})

it('rejects contradictory case states, stage bypass and weakened independent obligations', /** A syntactically valid graph must also represent an admissible source lifecycle. */ () => {
	const source = manifest(),
		slot = source.slots[0]
	for (const changed of [
		{ slots: [{ ...slot, state: 'Approved' }] },
		{ slots: [{ ...slot, state: 'Rejected' }] },
		{ slots: [{ ...slot, independent: false }] },
		{ safeFacts: { ...source.safeFacts, sourceState: 'Approved' } },
		{ safeFacts: { ...source.safeFacts, sourceState: 'Rejected' } },
		{ slots: [slot, { ...slot, id: 'later', stage: 2, state: 'Approved' }] },
	])
		expect(
			/** Source contradictions cannot enter the durable intake contract. */ () =>
				parseDomainApprovalManifest({ ...source, ...changed }),
		).toThrow()
})
