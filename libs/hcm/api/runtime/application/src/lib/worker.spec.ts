import { it, expect } from 'vitest'
import { HcmWorker, type HcmWorkerLane, type HcmWorkerBudget } from './worker'
import {
	HcmWorkloadIssuer,
	requireWorkloadScope,
	type HcmWorkloadContext,
} from './workload-context'
import type { ClaimedHcmWork } from './durable-work'

const budget: HcmWorkerBudget = {
	maximumItems: 10,
	maximumTenants: 10,
	itemsPerTenant: 2,
	maximumMilliseconds: 10000,
	retryBaseMilliseconds: 100,
	retryMaximumMilliseconds: 1000,
}
const runId = 'ad8abf0b-3491-4c11-b52f-eaa9c99230bb'

/** Exercise scheduler behavior with test-only authority; SQL fencing is separately proven by the database suites. */
function setup(options: Partial<HcmWorkerBudget> = {}, stop?: AbortController) {
	const visits: string[] = [],
		completions: string[] = [],
		retries: number[] = []
	let sequence = 0
	const directory = {
		/** Simulate three active tenants and exact opaque continuation. */
		async activeTenantIds(after: string, limit: number) {
			const remaining = ['a', 'b', 'c'].filter(
				/** Match the directory's exclusive lexical continuation. */ (id) => id > after,
			)
			const tenantIds = remaining.slice(0, limit)
			return { tenantIds, nextCursor: remaining.length > limit ? (tenantIds.at(-1) ?? null) : null }
		},
		/** Register only the test's known active tenants. */
		async isActive(id: string) {
			return ['a', 'b', 'c'].includes(id)
		},
	}
	const lane: HcmWorkerLane = {
		workload: 'LeaveAccrual',
		/** Always provide due test work to demonstrate boundedness even under infinite backlog. */
		async claim(context: HcmWorkloadContext): Promise<ClaimedHcmWork> {
			const scope = requireWorkloadScope(context, 'LeaveAccrual')
			visits.push(scope.tenantId)
			return {
				id: `${++sequence}`,
				workload: 'LeaveAccrual',
				kind: 'test.work',
				schemaVersion: 1,
				businessKey: `${sequence}`,
				payload: {},
				digest: 'a'.repeat(64),
				attempt: 2,
				fence: 2,
			}
		},
		/** Inject a poison tenant while allowing other tenants to complete and optionally request shutdown. */
		async complete(context: HcmWorkloadContext) {
			const scope = requireWorkloadScope(context)
			if (scope.tenantId === 'a') throw new Error('Private handler details')
			completions.push(scope.tenantId)
			stop?.abort()
		},
		/** Capture the operational delay without persisting or leaking handler exception contents. */
		async fail(_context: HcmWorkloadContext, _work: ClaimedHcmWork, delay: number) {
			retries.push(delay)
		},
	}
	return {
		worker: new HcmWorker(directory, new HcmWorkloadIssuer(directory, ['LeaveAccrual']), [lane], {
			...budget,
			...options,
		}),
		visits,
		completions,
		retries,
	}
}

it('bounds each tenant and continues after poison work without exposing raw errors', /** Infinite backlog cannot monopolize the run; failed items use capped jittered retries. */ async () => {
	const fixture = setup()
	const result = await fixture.worker.drain(runId, new AbortController().signal)
	expect(fixture.visits).toEqual(['a', 'a', 'b', 'b', 'c', 'c'])
	expect(result).toMatchObject({
		claimed: 6,
		completed: 4,
		retried: 2,
		tenants: 3,
		stopped: 'budget',
		nextTenantCursor: null,
	})
	expect(
		fixture.retries.every(
			/** Attempt two delays remain between half and all of the 200ms exponential ceiling. */ (
				delay,
			) => delay >= 100 && delay <= 200,
		),
	).toBe(true)
	expect(JSON.stringify(result)).not.toContain('Private')
})

it('returns an exact tenant continuation when the finite budget ends', /** A later invocation resumes after the visited tenant instead of starving the tail of the directory. */ async () => {
	const fixture = setup({ maximumTenants: 1 })
	const first = await fixture.worker.drain(runId, new AbortController().signal)
	expect(first).toMatchObject({ tenants: 1, claimed: 2, stopped: 'budget', nextTenantCursor: 'a' })
	const next = await fixture.worker.drain(
		runId,
		new AbortController().signal,
		first.nextTenantCursor ?? '',
	)
	expect(next).toMatchObject({ tenants: 1, completed: 2, nextTenantCursor: 'b' })
})

it('stops new claims after graceful shutdown while preserving the completed item', /** Shutdown observed after a handler returns must not begin another claim. */ async () => {
	const stop = new AbortController()
	const fixture = setup({}, stop)
	const result = await fixture.worker.drain(runId, stop.signal, 'a')
	expect(result).toMatchObject({ claimed: 1, completed: 1, stopped: 'shutdown' })
	expect(fixture.visits).toEqual(['b'])
})

it('does not visit or claim anything when shutdown was already requested', /** Startup cancellation is not permission to drain one final batch. */ async () => {
	const fixture = setup()
	const stop = new AbortController()
	stop.abort()
	expect(await fixture.worker.drain(runId, stop.signal)).toMatchObject({
		claimed: 0,
		tenants: 0,
		stopped: 'shutdown',
	})
	expect(fixture.visits).toEqual([])
})

it('rejects unbounded configuration before issuing workload authority', /** NaN and zero cannot silently disable run or retry limits. */ () => {
	expect(
		/** Attempt an invalid unlimited duration. */ () => setup({ maximumMilliseconds: Infinity }),
	).toThrow('Invalid worker budget')
	expect(/** Attempt a disabled per-tenant limit. */ () => setup({ itemsPerTenant: 0 })).toThrow(
		'Invalid worker budget',
	)
})
