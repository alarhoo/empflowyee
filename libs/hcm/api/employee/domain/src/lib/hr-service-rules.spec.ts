import { describe, expect, it } from 'vitest'
import {
	addMinutes,
	canCancel,
	canReopen,
	hrTransitions,
	newlyBreached,
	requestNumber,
	requestSla,
	resumedDue,
	targetState,
	type TargetFacts,
} from './hr-service-rules'

const START = '2026-09-01T09:00:00.000Z'

/** A target started at START. */
function target(
	kind: TargetFacts['kind'],
	minutes: number,
	extra: Partial<TargetFacts> = {},
): TargetFacts {
	return {
		kind,
		targetMinutes: minutes,
		startedAt: START,
		dueAt: addMinutes(START, minutes),
		pausedAt: null,
		metAt: null,
		breachedAt: null,
		...extra,
	}
}

describe('HR service rules', /** DEC-HCM2-004. */ () => {
	it('derives target states on a 24x7 clock', /** Met, DueSoon, Breached, Paused. */ () => {
		const p1 = target('FirstResponse', 240)
		expect(targetState(p1, addMinutes(START, 60))).toBe('OnTrack')
		expect(targetState(p1, addMinutes(START, 150))).toBe('DueSoon')
		expect(targetState(p1, addMinutes(START, 241))).toBe('Breached')
		expect(targetState({ ...p1, metAt: addMinutes(START, 300) }, addMinutes(START, 400))).toBe(
			'Met',
		)
		expect(targetState({ ...p1, pausedAt: addMinutes(START, 10) }, addMinutes(START, 600))).toBe(
			'Paused',
		)
		expect(newlyBreached([p1, target('Resolution', 1440)], addMinutes(START, 300))).toEqual([
			'FirstResponse',
		])
	})

	it('moves the due time by the paused minutes', /** Pause while waiting for the employee. */ () => {
		const resumed = resumedDue(
			addMinutes(START, 240),
			addMinutes(START, 60),
			addMinutes(START, 180),
		)
		expect(resumed).toEqual({ dueAt: addMinutes(START, 360), pausedMinutes: 120 })
	})

	it('orders the queue by the earliest running target', /** Request state. */ () => {
		const targets = [
			target('FirstResponse', 240, { metAt: addMinutes(START, 30) }),
			target('Resolution', 1440),
		]
		expect(requestSla('Open', targets, addMinutes(START, 60))).toEqual({
			slaState: 'OnTrack',
			nextDueAt: addMinutes(START, 1440),
		})
		expect(
			requestSla(
				'Resolved',
				targets.map(/** Met. */ (item) => ({ ...item, metAt: START })),
				START,
			),
		).toEqual({ slaState: 'Met', nextDueAt: null })
		expect(requestSla('Cancelled', targets, START).slaState).toBe('None')
	})

	it('allows only approved transitions, cancellation and a 7-day reopen', /** Lifecycle. */ () => {
		expect(hrTransitions('Resolved')).toEqual(['Open', 'Closed'])
		expect(hrTransitions('Closed')).toEqual([])
		expect(canCancel('Open')).toBe(true)
		expect(canCancel('WaitingForHr')).toBe(false)
		const resolved = '2026-09-01T00:00:00.000Z'
		expect(canReopen('Resolved', resolved, 7, '2026-09-08T00:00:00.000Z')).toBe(true)
		expect(canReopen('Resolved', resolved, 7, '2026-09-09T00:00:00.000Z')).toBe(false)
		expect(canReopen('Closed', resolved, 7, '2026-09-02T00:00:00.000Z')).toBe(false)
		expect(requestNumber(123)).toBe('HR-000123')
	})
})
