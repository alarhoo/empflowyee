import {
	HCM_WORKLOADS,
	HcmWorkloadIssuer,
	type HcmWorkload,
	type HcmWorkloadContext,
} from './workload-context'
import type { ClaimedHcmWork } from './durable-work'

export interface HcmWorkerDirectory {
	/** Enumerate current active tenants without exposing business facts or bypassing tenant RLS. */
	activeTenantIds(
		after: string,
		limit: number,
	): Promise<{ tenantIds: string[]; nextCursor: string | null }>
}

export interface HcmWorkerLane {
	readonly workload: HcmWorkload
	/** Lease one due, registered kind without holding a business transaction open. */
	claim(context: HcmWorkloadContext): Promise<ClaimedHcmWork | null>
	/** Execute the registered handler, domain effects and completion atomically. */
	complete(context: HcmWorkloadContext, work: ClaimedHcmWork): Promise<void>
	/** Record a safe retry outcome only while the original lease is current. */
	fail(context: HcmWorkloadContext, work: ClaimedHcmWork, delayMilliseconds: number): Promise<void>
}

export interface HcmWorkerBudget {
	maximumItems: number
	maximumTenants: number
	itemsPerTenant: number
	maximumMilliseconds: number
	retryBaseMilliseconds: number
	retryMaximumMilliseconds: number
}

export interface HcmWorkerResult {
	claimed: number
	completed: number
	retried: number
	unsettled: number
	tenants: number
	tenantLimits: number
	tenantFailures: number
	nextTenantCursor: string | null
	stopped: 'drained' | 'budget' | 'shutdown'
}

/** Validate operational limits independently of business policies before any work is claimed. */
export function validateWorkerBudget(value: HcmWorkerBudget): void {
	for (const [key, minimum, maximum] of [
		['maximumItems', 1, 10000],
		['maximumTenants', 1, 10000],
		['itemsPerTenant', 1, 1000],
		['maximumMilliseconds', 100, 1800000],
		['retryBaseMilliseconds', 1, 3600000],
		['retryMaximumMilliseconds', 1, 86400000],
	] as const) {
		if (!Number.isSafeInteger(value[key]) || value[key] < minimum || value[key] > maximum)
			throw new Error(`Invalid worker budget: ${key}`)
	}
	if (value.retryMaximumMilliseconds < value.retryBaseMilliseconds)
		throw new Error('Invalid worker retry bounds')
}

/** Coordinate bounded, fair local drains while domain lanes retain their source authority and transactions. */
export class HcmWorker {
	/** Freeze the static registry and operational budgets; no queue row can register executable code. */
	constructor(
		private readonly directory: HcmWorkerDirectory,
		private readonly issuer: HcmWorkloadIssuer,
		private readonly lanes: readonly HcmWorkerLane[],
		private readonly budget: HcmWorkerBudget,
	) {
		validateWorkerBudget(budget)
		if (budget.itemsPerTenant < lanes.length || budget.maximumItems < lanes.length)
			throw new Error('Worker quotas must accommodate every selected workload')
		if (
			!lanes.length ||
			new Set(
				lanes.map(
					/** Match one lane to each independently authorized workload. */ (lane) => lane.workload,
				),
			).size !== lanes.length ||
			lanes.some(
				/** Reject unknown runtime workload registrations. */ (lane) =>
					!HCM_WORKLOADS.includes(lane.workload),
			)
		)
			throw new Error('Invalid worker handler registry')
		this.lanes = Object.freeze([...lanes])
		this.budget = Object.freeze({ ...budget })
	}

	/** Visit a bounded tenant page; carry the continuation between local polls or explicit finite invocations. */
	async drain(runId: string, signal: AbortSignal, afterTenant = ''): Promise<HcmWorkerResult> {
		const started = performance.now()
		const result: HcmWorkerResult = {
			claimed: 0,
			completed: 0,
			retried: 0,
			unsettled: 0,
			tenants: 0,
			tenantLimits: 0,
			tenantFailures: 0,
			nextTenantCursor: afterTenant || null,
			stopped: 'drained',
		}
		let cursor = afterTenant
		let finishedDirectory = false
		while (!finishedDirectory && !this.exhausted(result, started, signal)) {
			const page = await this.directory.activeTenantIds(
				cursor,
				Math.min(100, this.budget.maximumTenants - result.tenants),
			)
			for (const tenantId of page.tenantIds) {
				if (this.exhausted(result, started, signal)) break
				result.tenants++
				try {
					await this.tenant(tenantId, runId, result, started, signal)
				} catch {
					// Keep diagnostics aggregate-only: never log tenant facts, payloads or raw driver errors.
					result.tenantFailures++
				}
				result.nextTenantCursor = tenantId
			}
			if (this.exhausted(result, started, signal)) break
			finishedDirectory = page.nextCursor === null
			cursor = page.nextCursor ?? ''
			result.nextTenantCursor = page.nextCursor
		}
		result.stopped = finishedDirectory && result.tenantLimits === 0 ? 'drained' : 'budget'
		if (signal.aborted) result.stopped = 'shutdown'
		return result
	}

	/** Stop starting work on shutdown or budget exhaustion; already running transactions settle under their lease. */
	private exhausted(result: HcmWorkerResult, started: number, signal: AbortSignal): boolean {
		return (
			signal.aborted ||
			result.claimed >= this.budget.maximumItems ||
			result.tenants >= this.budget.maximumTenants ||
			performance.now() - started >= this.budget.maximumMilliseconds
		)
	}

	/** Round-robin registered workloads within the tenant quota so a poison or busy lane cannot monopolize a batch. */
	private async tenant(
		tenantId: string,
		runId: string,
		result: HcmWorkerResult,
		started: number,
		signal: AbortSignal,
	): Promise<void> {
		const idle = new Set<HcmWorkerLane>()
		let claims = 0
		while (claims < this.budget.itemsPerTenant && idle.size < this.lanes.length) {
			for (const lane of this.lanes) {
				if (
					signal.aborted ||
					result.claimed >= this.budget.maximumItems ||
					performance.now() - started >= this.budget.maximumMilliseconds ||
					claims >= this.budget.itemsPerTenant
				)
					return
				if (idle.has(lane)) continue
				const context = await this.issuer.issue(tenantId, lane.workload, runId, 600000)
				const work = await lane.claim(context)
				if (!work) {
					idle.add(lane)
					continue
				}
				claims++
				if (claims === this.budget.itemsPerTenant) result.tenantLimits++
				result.claimed++
				try {
					await lane.complete(context, work)
					result.completed++
				} catch {
					const ceiling = Math.min(
						this.budget.retryMaximumMilliseconds,
						this.budget.retryBaseMilliseconds * 2 ** Math.min(work.attempt - 1, 30),
					)
					const delay = Math.max(1, Math.floor(ceiling * (0.5 + Math.random() * 0.5)))
					try {
						await lane.fail(context, work, delay)
						result.retried++
					} catch {
						result.unsettled++
					}
				}
			}
		}
	}
}
