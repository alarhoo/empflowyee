import {
	DUE_SOON_MINUTES,
	type HrStatus,
	type SlaState,
	type TargetKind,
} from '@empflowyee/hcm-employee-contract'

/** A stored service level target, with ISO timestamps. */
export interface TargetFacts {
	kind: TargetKind
	targetMinutes: number
	startedAt: string
	dueAt: string
	pausedAt: string | null
	metAt: string | null
	breachedAt: string | null
}

/** An ISO timestamp moved by whole minutes. */
export function addMinutes(iso: string, minutes: number): string {
	return new Date(new Date(iso).getTime() + minutes * 60000).toISOString()
}

/** Whole minutes between two ISO timestamps, never negative. */
export function minutesBetween(from: string, to: string): number {
	return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000))
}

/**
 * DEC-HCM2-004 on a 24x7 clock: a target is Met once met, Paused while waiting for the employee,
 * Breached once its due time passes unmet (derived at read, persisted on the next write), DueSoon
 * within two hours of it, and otherwise OnTrack.
 */
export function targetState(target: TargetFacts, now: string): SlaState {
	if (target.metAt) return 'Met'
	if (target.breachedAt) return 'Breached'
	const clock = target.pausedAt ?? now
	if (clock > target.dueAt) return 'Breached'
	if (target.pausedAt) return 'Paused'
	return minutesBetween(now, target.dueAt) <= DUE_SOON_MINUTES ? 'DueSoon' : 'OnTrack'
}

/** The request's service level state and next due time from its targets. */
export function requestSla(
	status: HrStatus,
	targets: TargetFacts[],
	now: string,
): { slaState: SlaState; nextDueAt: string | null } {
	if (!targets.length || status === 'Cancelled') return { slaState: 'None', nextDueAt: null }
	const open = targets.filter(/** Unmet. */ (target) => !target.metAt)
	if (!open.length) return { slaState: 'Met', nextDueAt: null }
	const states = open.map(/** State. */ (target) => targetState(target, now))
	const running = open.filter(/** Clock running. */ (target) => !target.pausedAt)
	const nextDueAt = running.length
		? (running.map(/** Due. */ (target) => target.dueAt).sort()[0] ?? null)
		: null
	for (const state of ['Breached', 'DueSoon', 'OnTrack', 'Paused'] as const)
		if (states.includes(state)) return { slaState: state, nextDueAt }
	return { slaState: 'None', nextDueAt }
}

/** Unmet targets whose due time has passed, to persist as breached on the next write. */
export function newlyBreached(targets: TargetFacts[], now: string): TargetKind[] {
	return targets
		.filter(
			/** Passed and not yet recorded. */ (target) =>
				!target.metAt && !target.breachedAt && (target.pausedAt ?? now) > target.dueAt,
		)
		.map(/** Kind. */ (target) => target.kind)
}

/** The due time after a pause ends: the paused minutes move it later. */
export function resumedDue(
	dueAt: string,
	pausedAt: string,
	now: string,
): { dueAt: string; pausedMinutes: number } {
	const paused = minutesBetween(pausedAt, now)
	return { dueAt: addMinutes(dueAt, paused), pausedMinutes: paused }
}

/** Status changes an HR agent may make from each status (HR Service Desk REQ-004). */
const HR_TRANSITIONS: Record<HrStatus, HrStatus[]> = {
	New: ['Open', 'WaitingForEmployee', 'WaitingForHr', 'Resolved', 'Cancelled'],
	Open: ['WaitingForEmployee', 'WaitingForHr', 'Resolved', 'Cancelled'],
	WaitingForEmployee: ['Open', 'WaitingForHr', 'Resolved', 'Cancelled'],
	WaitingForHr: ['Open', 'WaitingForEmployee', 'Resolved', 'Cancelled'],
	Resolved: ['Open', 'Closed'],
	Closed: [],
	Cancelled: [],
}

/** The statuses an HR agent may move a request to. */
export function hrTransitions(status: HrStatus): HrStatus[] {
	return HR_TRANSITIONS[status]
}

/** The last moment the requester may reopen a resolved request. */
export function reopenUntil(resolvedAt: string | null, windowDays: number): string | null {
	return resolvedAt ? addMinutes(resolvedAt, windowDays * 1440) : null
}

/** Whether the requester may still reopen: Resolved and within the window (DEC-HCM2-004). */
export function canReopen(
	status: HrStatus,
	resolvedAt: string | null,
	windowDays: number,
	now: string,
): boolean {
	const until = reopenUntil(resolvedAt, windowDays)
	return status === 'Resolved' && until !== null && now <= until
}

/** Whether the requester may cancel: only before HR works the request (My HR Requests REQ-003). */
export function canCancel(status: HrStatus): boolean {
	return status === 'New' || status === 'Open'
}

/** Whether a conversation still accepts messages. */
export function acceptsMessages(status: HrStatus): boolean {
	return status !== 'Closed' && status !== 'Cancelled'
}

/** A request number such as HR-000123. */
export function requestNumber(value: number): string {
	return `HR-${String(value).padStart(6, '0')}`
}
