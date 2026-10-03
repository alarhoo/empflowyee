import { expect, it } from 'vitest'
import {
	evaluateAttendanceSourceDecision,
	type AttendanceDecisionAuthority,
	type AttendanceSourceApproval,
	type AttendanceSourceDecision,
} from './source-approval'

/** Two required first-stage slots and one final slot model all-required staged source approval. */
function approval(): AttendanceSourceApproval {
	return {
		id: 'case-1',
		revision: 1,
		generation: 1,
		subjectRevision: 4,
		state: 'Pending',
		makerAccountId: 'maker',
		requesterAccountId: 'requester',
		beneficiaryAccountIds: ['employee'],
		slots: ['first', 'second', 'last'].map(
			/** Each slot begins independently undecided. */ (id, index) => ({
				id,
				revision: 1,
				stage: index < 2 ? 1 : 2,
				independent: true,
				distinctActors: true,
				state: 'Pending',
				decidedBy: null,
			}),
		),
	}
}
/** Supply currently verified source authority, not a Workflow candidate row. */
function authority(): AttendanceDecisionAuthority {
	return {
		accountId: 'manager',
		sessionValid: true,
		operationAndScopeAllowed: true,
		currentCandidateAccountIds: ['manager'],
		currentSubjectRevision: 4,
		routingBasisUnchanged: true,
	}
}
/** Keep every expected revision explicit in the source decision. */
function decision(): AttendanceSourceDecision {
	return {
		slotId: 'first',
		expectedCaseRevision: 1,
		expectedSlotRevision: 1,
		expectedSubjectRevision: 4,
		generation: 1,
		action: 'Approve',
	}
}
it('requires all current-stage slots and never skips directly to a future stage', /** Coordination cannot weaken the source all-required rule. */ () => {
	expect(evaluateAttendanceSourceDecision(approval(), decision(), authority())).toMatchObject({
		outcome: 'Accepted',
		caseState: 'Pending',
		nextStage: 1,
	})
	expect(
		evaluateAttendanceSourceDecision(approval(), { ...decision(), slotId: 'last' }, authority()),
	).toEqual({ outcome: 'Conflict', reason: 'StageNotCurrent' })
	const current = approval()
	current.slots = current.slots.map(
		/** Arrange one independently accepted prior slot. */ (slot) =>
			slot.id === 'first' ? { ...slot, state: 'Approved', decidedBy: 'other-manager' } : slot,
	)
	expect(
		evaluateAttendanceSourceDecision(current, { ...decision(), slotId: 'second' }, authority()),
	).toMatchObject({ outcome: 'Accepted', caseState: 'Pending', nextStage: 2 })
})
it('rejects maker, beneficiary, revoked candidates, expired sessions and distinct-slot reuse', /** Previously assigned tasks confer no source decision authority. */ () => {
	for (const accountId of ['maker', 'requester', 'employee'])
		expect(
			evaluateAttendanceSourceDecision(approval(), decision(), {
				...authority(),
				accountId,
				currentCandidateAccountIds: [accountId],
			}),
		).toEqual({ outcome: 'Denied', reason: 'IndependentActorRequired' })
	expect(
		evaluateAttendanceSourceDecision(approval(), decision(), {
			...authority(),
			currentCandidateAccountIds: [],
		}),
	).toEqual({ outcome: 'Denied', reason: 'NotCandidate' })
	expect(
		evaluateAttendanceSourceDecision(approval(), decision(), {
			...authority(),
			sessionValid: false,
		}),
	).toEqual({ outcome: 'Denied', reason: 'SessionExpired' })
	expect(
		evaluateAttendanceSourceDecision(approval(), decision(), {
			...authority(),
			operationAndScopeAllowed: false,
		}),
	).toEqual({ outcome: 'Denied', reason: 'NotAuthorized' })
	const current = approval()
	current.slots = current.slots.map(
		/** Record the same actor on another completed required slot. */ (slot) =>
			slot.id === 'second' ? { ...slot, state: 'Approved', decidedBy: 'manager' } : slot,
	)
	expect(evaluateAttendanceSourceDecision(current, decision(), authority())).toEqual({
		outcome: 'Denied',
		reason: 'DistinctActorRequired',
	})
})
it('rejects stale source, slot, case, generation and current routing evidence', /** Rerouting starts a new generation; old decisions never become valid again. */ () => {
	for (const changed of [
		{ expectedCaseRevision: 0 },
		{ expectedSlotRevision: 0 },
		{ expectedSubjectRevision: 3 },
	])
		expect(
			evaluateAttendanceSourceDecision(approval(), { ...decision(), ...changed }, authority()),
		).toEqual({ outcome: 'Stale', reason: 'RevisionChanged' })
	expect(
		evaluateAttendanceSourceDecision(approval(), { ...decision(), generation: 2 }, authority()),
	).toEqual({ outcome: 'Stale', reason: 'GenerationChanged' })
	expect(
		evaluateAttendanceSourceDecision(approval(), decision(), {
			...authority(),
			currentSubjectRevision: 5,
		}),
	).toEqual({ outcome: 'Stale', reason: 'RevisionChanged' })
	expect(
		evaluateAttendanceSourceDecision(approval(), decision(), {
			...authority(),
			routingBasisUnchanged: false,
		}),
	).toEqual({ outcome: 'Stale', reason: 'RoutingChanged' })
})
it('ends on any authorized rejection and approves only the final required slot', /** Source results are explicit and evaluation leaves prior evidence unchanged. */ () => {
	const original = approval(),
		before = JSON.stringify(original)
	expect(
		evaluateAttendanceSourceDecision(original, { ...decision(), action: 'Reject' }, authority()),
	).toEqual({ outcome: 'Accepted', slotState: 'Rejected', caseState: 'Rejected', nextStage: null })
	expect(JSON.stringify(original)).toBe(before)
	const final = { ...approval(), slots: [approval().slots[0]] }
	expect(evaluateAttendanceSourceDecision(final, decision(), authority())).toEqual({
		outcome: 'Accepted',
		slotState: 'Approved',
		caseState: 'Approved',
		nextStage: null,
	})
	expect(
		evaluateAttendanceSourceDecision({ ...final, state: 'Invalidated' }, decision(), authority()),
	).toEqual({ outcome: 'CaseClosed' })
})
