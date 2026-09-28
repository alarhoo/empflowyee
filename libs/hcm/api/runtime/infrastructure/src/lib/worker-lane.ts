import type { Transaction } from 'kysely'
import {
	HcmWorkError,
	requireWorkloadScope,
	type ClaimedHcmWork,
	type HcmWorkload,
	type HcmWorkloadContext,
	type HcmWorkerLane,
} from '@empflowyee/hcm-api-runtime-application'
import type { WorkloadAuditTables } from '@empflowyee/hcm-api-audit-infrastructure'
import { HcmDurableWorkStore } from './durable-work'

export interface HcmWorkHandler<Database extends WorkloadAuditTables> {
	readonly kind: string
	readonly schemaVersion: number
	/** Validate immutable domain input and publish effects/receipts in the caller's fenced tenant transaction. */
	execute(
		transaction: Transaction<Database>,
		context: HcmWorkloadContext,
		work: ClaimedHcmWork,
	): Promise<void>
}

/** Bind a fixed source-owned handler registry to the durable mechanics without exporting database authority to the scheduler. */
export class HcmTransactionalWorkerLane<
	Database extends WorkloadAuditTables,
> implements HcmWorkerLane {
	private readonly handlers: ReadonlyMap<string, HcmWorkHandler<Database>>
	private readonly kinds: readonly string[]
	/** Reject duplicate or malformed registrations rather than allowing the last registration to silently replace a handler. */
	constructor(
		readonly workload: HcmWorkload,
		private readonly store: HcmDurableWorkStore<Database>,
		handlers: readonly HcmWorkHandler<Database>[],
	) {
		const registry = new Map<string, HcmWorkHandler<Database>>()
		for (const handler of handlers) {
			if (
				!/^[a-z][a-z0-9.-]{0,99}$/.test(handler.kind) ||
				!Number.isSafeInteger(handler.schemaVersion) ||
				handler.schemaVersion < 1 ||
				registry.has(`${handler.kind}:${handler.schemaVersion}`)
			)
				throw new HcmWorkError('invalid-work')
			registry.set(
				`${handler.kind}:${handler.schemaVersion}`,
				Object.freeze({
					kind: handler.kind,
					schemaVersion: handler.schemaVersion,
					execute: /** Preserve the owning handler's instance binding and prototype methods. */ (
						transaction: Transaction<Database>,
						context: HcmWorkloadContext,
						work: ClaimedHcmWork,
					) => handler.execute(transaction, context, work),
				}),
			)
		}
		if (!registry.size || registry.size > 100) throw new HcmWorkError('invalid-work')
		this.handlers = registry
		this.kinds = Object.freeze([
			...new Set(
				handlers.map(
					/** Claim only kinds backed by this static registry. */ (handler) => handler.kind,
				),
			),
		])
	}

	/** Delegate one short claim to the source owner's outbox. */
	claim(context: HcmWorkloadContext): Promise<ClaimedHcmWork | null> {
		requireWorkloadScope(context, this.workload)
		return this.store.claim(context, this.kinds)
	}

	/** Resolve the handler from the reloaded database intent, including its schema version, inside the completion fence. */
	complete(context: HcmWorkloadContext, work: ClaimedHcmWork): Promise<void> {
		requireWorkloadScope(context, this.workload)
		return this.store.complete(
			context,
			work,
			/** Never let caller payload or a queue-provided executable select a handler. */ async (
				transaction,
				verified,
			) => {
				const handler = this.handlers.get(`${verified.kind}:${verified.schemaVersion}`)
				if (!handler) throw new HcmWorkError('invalid-work')
				await handler.execute(transaction, context, verified)
			},
		)
	}

	/** Persist a deliberately bounded diagnostic; handler exceptions may contain private data and are never stored. */
	fail(
		context: HcmWorkloadContext,
		work: ClaimedHcmWork,
		delayMilliseconds: number,
	): Promise<void> {
		requireWorkloadScope(context, this.workload)
		return this.store.fail(context, work, 'handler-failed', delayMilliseconds)
	}
}
