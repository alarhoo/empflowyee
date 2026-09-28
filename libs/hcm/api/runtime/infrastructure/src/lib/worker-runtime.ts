import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { HcmTenantDatabase } from '@empflowyee/hcm-api-database-kysely'
import type { WorkloadAuditTables } from '@empflowyee/hcm-api-audit-infrastructure'
import {
	HcmWorker,
	HcmWorkloadIssuer,
	type HcmWorkerLane,
	type HcmWorkerResult,
} from '@empflowyee/hcm-api-runtime-application'
import { HcmRuntimeStore } from './hcm-runtime-store'
import { HcmDurableWorkStore } from './durable-work'
import { readWorkerConfiguration } from './worker-config'

export interface HcmWorkerComposition {
	/** Compose only real source-owned handlers; unimplemented workloads must remain unregistered. */
	lanes(
		database: HcmTenantDatabase<WorkloadAuditTables>,
		store: HcmDurableWorkStore<WorkloadAuditTables>,
	): readonly HcmWorkerLane[]
	/** Emit aggregate counters and the non-secret continuation without private handler errors or payloads. */
	report(result: HcmWorkerResult): void
}

/** Run the local worker with explicit composition, bounded claims and interruptible polling; never migrate or listen on HTTP. */
export async function runHcmWorker(
	env: Readonly<Record<string, string | undefined>>,
	composition: HcmWorkerComposition,
	signal: AbortSignal,
): Promise<void> {
	const config = readWorkerConfiguration(env)
	const connectionString = env['HCM_DATABASE_URL']
	if (!connectionString) throw new Error('Worker database configuration unavailable')
	const directory = new HcmRuntimeStore(connectionString)
	const database = new HcmTenantDatabase<WorkloadAuditTables>({
		connectionString,
		maxConnections: 5,
	})
	try {
		const store = new HcmDurableWorkStore(database, config)
		const available = composition.lanes(database, store)
		const lanes = config.workloads.map(
			/** Fail startup when a selected workload lacks an implemented handler; never consume it as a no-op. */ (
				workload,
			) => {
				const matches = available.filter(
					/** Select exactly one source-owned lane for the configured workload. */ (lane) =>
						lane.workload === workload,
				)
				if (matches.length !== 1) throw new Error(`Worker handler unavailable: ${workload}`)
				return matches[0]
			},
		)
		const issuer = new HcmWorkloadIssuer(directory, config.workloads)
		const worker = new HcmWorker(directory, issuer, lanes, config)
		let cursor = config.afterTenant
		do {
			const result = await worker.drain(randomUUID(), signal, cursor)
			composition.report(result)
			cursor = result.nextTenantCursor ?? ''
			if (config.mode === 'drain' || signal.aborted) break
			try {
				await delay(config.pollMilliseconds, undefined, { signal })
			} catch {
				if (!signal.aborted) throw new Error('Worker polling interrupted')
			}
		} while (!signal.aborted)
	} finally {
		await Promise.all([directory.onApplicationShutdown(), database.destroy()])
	}
}
