/** Immutable source snapshot; Workflow task state never participates in this authority model. */
export interface AttendanceSourceApproval {
	id: string
	revision: number
	generation: number
	subjectRevision: number
	state: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled' | 'Invalidated'
	makerAccountId: string
	requesterAccountId: string
	beneficiaryAccountIds: readonly string[]
	slots: readonly AttendanceSourceApprovalSlot[]
}
export interface AttendanceSourceApprovalSlot {
	id: string
	revision: number
	stage: number
	independent: boolean
	distinctActors: boolean
	state: 'Pending' | 'Approved' | 'Rejected'
	decidedBy: string | null
}
export interface AttendanceSourceDecision {
	slotId: string
	expectedCaseRevision: number
	expectedSlotRevision: number
	expectedSubjectRevision: number
	generation: number
	action: 'Approve' | 'Reject'
}
/** These facts must come from current source-owned session, Access and candidate ports inside the decision transaction. */
export interface AttendanceDecisionAuthority {
	accountId: string
	sessionValid: boolean
	operationAndScopeAllowed: boolean
	currentCandidateAccountIds: readonly string[]
	currentSubjectRevision: number
	routingBasisUnchanged: boolean
}
export type AttendanceDecisionEvaluation =
	| {
		outcome: 'Denied'
		reason:
				| 'SessionExpired'
				| 'NotAuthorized'
				| 'NotCandidate'
				| 'IndependentActorRequired'
				| 'DistinctActorRequired'
	}
	| { outcome: 'Stale'; reason: 'RevisionChanged' | 'GenerationChanged' | 'RoutingChanged' }
	| { outcome: 'Conflict'; reason: 'SlotUnavailable' | 'StageNotCurrent' }
	| { outcome: 'CaseClosed' }
	| {
		outcome: 'Accepted'
		slotState: 'Approved' | 'Rejected'
		caseState: 'Pending' | 'Approved' | 'Rejected'
		nextStage: number | null
	}

/** Evaluate one current source decision without mutating snapshots, accepting Workflow authority or carrying old decisions into a new generation. */
export function evaluateAttendanceSourceDecision(
	approval: AttendanceSourceApproval,
	decision: AttendanceSourceDecision,
	authority: AttendanceDecisionAuthority,
): AttendanceDecisionEvaluation {
	if (!authority.sessionValid) return { outcome: 'Denied', reason: 'SessionExpired' }
	if (!authority.operationAndScopeAllowed) return { outcome: 'Denied', reason: 'NotAuthorized' }
	if (approval.state !== 'Pending') return { outcome: 'CaseClosed' }
	if (decision.generation !== approval.generation)
		return { outcome: 'Stale', reason: 'GenerationChanged' }
	if (!authority.routingBasisUnchanged) return { outcome: 'Stale', reason: 'RoutingChanged' }
	if (
		decision.expectedCaseRevision !== approval.revision ||
		decision.expectedSubjectRevision !== approval.subjectRevision ||
		authority.currentSubjectRevision !== approval.subjectRevision
	)
		return { outcome: 'Stale', reason: 'RevisionChanged' }
	const slot = approval.slots.find(
		/** Match the exact required source slot. */ (value) => value.id === decision.slotId,
	)
	if (!slot || slot.state !== 'Pending') return { outcome: 'Conflict', reason: 'SlotUnavailable' }
	if (slot.revision !== decision.expectedSlotRevision)
		return { outcome: 'Stale', reason: 'RevisionChanged' }
	const pending = approval.slots.filter(
		/** Current stage is derived from outstanding source requirements. */ (value) =>
			value.state === 'Pending',
	)
	const stage = Math.min(
		...pending.map(
			/** Require earlier stages to finish before considering this slot. */ (value) => value.stage,
		),
	)
	if (slot.stage !== stage) return { outcome: 'Conflict', reason: 'StageNotCurrent' }
	if (!authority.currentCandidateAccountIds.includes(authority.accountId))
		return { outcome: 'Denied', reason: 'NotCandidate' }
	if (
		slot.independent &&
		(approval.makerAccountId === authority.accountId ||
			approval.requesterAccountId === authority.accountId ||
			approval.beneficiaryAccountIds.includes(authority.accountId))
	)
		return { outcome: 'Denied', reason: 'IndependentActorRequired' }
	if (
		approval.slots.some(
			/** Distinctness applies if either of the paired required slots requires separate actors. */ (
				prior,
			) =>
				prior.id !== slot.id &&
				prior.decidedBy === authority.accountId &&
				(slot.distinctActors || prior.distinctActors),
		)
	)
		return { outcome: 'Denied', reason: 'DistinctActorRequired' }
	if (decision.action === 'Reject')
		return { outcome: 'Accepted', slotState: 'Rejected', caseState: 'Rejected', nextStage: null }
	const remaining = pending.filter(
		/** This accepted slot is the only newly satisfied source requirement. */ (value) =>
			value.id !== slot.id,
	)
	return {
		outcome: 'Accepted',
		slotState: 'Approved',
		caseState: remaining.length ? 'Pending' : 'Approved',
		nextStage: remaining.length
			? Math.min(
				...remaining.map(
					/** Keep the same stage until all of its slots approve. */ (value) => value.stage,
				),
			)
			: null,
	}
}
