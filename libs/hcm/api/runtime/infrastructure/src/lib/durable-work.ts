import { createHash, randomUUID } from 'node:crypto'
import { sql, type Transaction } from 'kysely'
import { HcmTenantDatabase } from '@empflowyee/hcm-api-database-kysely'
import {
	HcmWorkError,
	requireWorkloadScope,
	type HcmWorkload,
	type HcmWorkloadContext,
	type HcmWorkIntent,
	type ClaimedHcmWork,
	type HcmWorkLeaseOptions,
	type WorkValue,
} from '@empflowyee/hcm-api-runtime-application'
import {
	TransactionalWorkloadAudit,
	type WorkloadAuditTables,
} from '@empflowyee/hcm-api-audit-infrastructure'

const owners: Record<HcmWorkload, string> = {
	LeaveAccrual: 'leave',
	LeaveExpiry: 'leave',
	AttendanceResolve: 'attendance',
	AttendanceCalculate: 'attendance',
	AttendanceReconcile: 'attendance',
	WorkflowPlan: 'workflow',
	WorkflowDispatch: 'workflow',
	WorkflowReconcile: 'workflow',
	NotificationDispatch: 'notification',
}

interface WorkRow {
	id: string
	workload: HcmWorkload
	kind: string
	schema_version: number
	business_key: string
	payload: HcmWorkIntent['payload']
	digest: string
	attempts: number
	fence: string
}

/** Resolve only a product-owned table; no tenant, queue or command input can select an arbitrary SQL identifier. */
function table(workload: HcmWorkload, suffix: 'outbox' | 'planner_cursor') {
	const owner = Object.hasOwn(owners, workload) ? owners[workload] : undefined
	if (!owner) throw new HcmWorkError('invalid-work')
	return sql.table(`hcm.${owner}_${suffix}`)
}

/** Canonicalize bounded JSON so semantically identical payloads share a digest without accepting executable objects. */
function canonical(value: WorkValue, depth = 0): string {
	if (depth > 32) throw new HcmWorkError('invalid-work')
	if (value === null || typeof value === 'string' || typeof value === 'boolean')
		return JSON.stringify(value)
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new HcmWorkError('invalid-work')
		return JSON.stringify(value)
	}
	if (Array.isArray(value))
		return `[${value.map(/** Preserve ordered arrays while normalizing nested objects. */ (item) => canonical(item, depth + 1)).join(',')}]`
	if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
		throw new HcmWorkError('invalid-work')
	return `{${Object.keys(value)
		.sort()
		.map(
			/** Hash object keys in stable order without changing the stored business values. */ (key) =>
				`${JSON.stringify(key)}:${canonical(value[key], depth + 1)}`,
		)
		.join(',')}}`
}

/** Validate and hash the immutable intent independently of delivery timing and generated work ID. */
function digest(intent: HcmWorkIntent): string {
	if (
		!/^[a-z][a-z0-9.-]{0,99}$/.test(intent.kind) ||
		!intent.businessKey ||
		intent.businessKey.length > 200 ||
		!Number.isSafeInteger(intent.schemaVersion) ||
		intent.schemaVersion < 1 ||
		!intent.payload ||
		Array.isArray(intent.payload) ||
		typeof intent.payload !== 'object' ||
		(intent.availableAt !== undefined && !Number.isFinite(Date.parse(intent.availableAt)))
	)
		throw new HcmWorkError('invalid-work')
	const payload = canonical(intent.payload)
	if (Buffer.byteLength(payload, 'utf8') > 60000) throw new HcmWorkError('invalid-work')
	return createHash('sha256')
		.update(
			canonical({
				workload: intent.workload,
				kind: intent.kind,
				schemaVersion: intent.schemaVersion,
				businessKey: intent.businessKey,
				payload: intent.payload,
			}),
		)
		.digest('hex')
}

/** Persist intent in the producer's existing transaction; retry never substitutes a different payload under one key. */
export async function enqueueHcmWork<Database>(
	transaction: Transaction<Database>,
	tenantId: string,
	intent: HcmWorkIntent,
): Promise<string> {
	const target = table(intent.workload, 'outbox')
	const inputDigest = digest(intent)
	const id = randomUUID()
	const inserted = await sql<{ id: string }>`INSERT INTO ${target}
		(tenant_id,id,workload,kind,schema_version,business_key,payload,digest,available_at)
		VALUES (${tenantId},${id},${intent.workload},${intent.kind},${intent.schemaVersion},${intent.businessKey},${JSON.stringify(intent.payload)}::jsonb,${inputDigest},COALESCE(${intent.availableAt ?? null}::timestamptz,clock_timestamp()))
		ON CONFLICT (tenant_id,workload,kind,business_key) DO NOTHING RETURNING id
`.execute(transaction)
	if (inserted.rows[0]) return inserted.rows[0].id
	const existing = await sql<{ id: string; digest: string }>`SELECT id,digest FROM ${target}
		WHERE tenant_id=${tenantId} AND workload=${intent.workload} AND kind=${intent.kind} AND business_key=${intent.businessKey}
`.execute(transaction)
	if (existing.rows[0]?.digest !== inputDigest) throw new HcmWorkError('work-conflict')
	return existing.rows[0].id
}

/** Advance a domain planner only in the transaction that durably creates its missed-date work items. */
export async function advanceHcmPlanner<Database>(
	transaction: Transaction<Database>,
	context: HcmWorkloadContext,
	ruleKey: string,
	throughDate: string,
	expectedRevision: number,
): Promise<number> {
	const scope = requireWorkloadScope(context)
	if (
		!ruleKey ||
		ruleKey.length > 200 ||
		!/^\d{4}-\d{2}-\d{2}$/.test(throughDate) ||
		!Number.isSafeInteger(expectedRevision) ||
		expectedRevision < 0
	)
		throw new HcmWorkError('invalid-work')
	const target = table(scope.workload, 'planner_cursor')
	let result: { rows: { revision: number }[] }
	if (expectedRevision === 0) {
		result = await sql<{
			revision: number
		}>`INSERT INTO ${target} (tenant_id,workload,rule_key,last_planned_date)
			VALUES (${scope.tenantId},${scope.workload},${ruleKey},${throughDate}::date)
			ON CONFLICT DO NOTHING RETURNING revision
`.execute(transaction)
	} else {
		result = await sql<{
			revision: number
		}>`UPDATE ${target} SET last_planned_date=${throughDate}::date,revision=revision+1
			WHERE tenant_id=${scope.tenantId} AND workload=${scope.workload} AND rule_key=${ruleKey}
			AND revision=${expectedRevision} AND last_planned_date<=${throughDate}::date RETURNING revision
`.execute(transaction)
	}
	if (!result.rows[0]) throw new HcmWorkError('work-conflict')
	return result.rows[0].revision
}

export class HcmDurableWorkStore<Database extends WorkloadAuditTables> {
	/** Reuse a restricted tenant pool and validated operational bounds; callers own pool shutdown. */
	constructor(
		private readonly database: HcmTenantDatabase<Database>,
		private readonly options: HcmWorkLeaseOptions,
	) {
		if (
			!Number.isSafeInteger(options.leaseMilliseconds) ||
			options.leaseMilliseconds < 1000 ||
			options.leaseMilliseconds > 300000 ||
			!Number.isSafeInteger(options.maximumAttempts) ||
			options.maximumAttempts < 1 ||
			options.maximumAttempts > 100
		)
			throw new HcmWorkError('invalid-work')
		this.options = Object.freeze({ ...options })
	}

	/** Claim one registered kind under SKIP LOCKED, fencing expired claims and quarantining exhausted work. */
	async claim(
		context: HcmWorkloadContext,
		kinds: readonly string[],
	): Promise<ClaimedHcmWork | null> {
		const scope = requireWorkloadScope(context)
		if (
			!kinds.length ||
			kinds.length > 100 ||
			kinds.some(
				/** Reject malformed registry entries rather than interpolating them as SQL. */ (kind) =>
					!/^[a-z][a-z0-9.-]{0,99}$/.test(kind),
			)
		)
			throw new HcmWorkError('invalid-work')
		return this.database.workloadTransaction(
			context,
			scope.workload,
			/** Commit a short lease transaction before a handler can begin its business work. */ async (
				transaction,
			) => {
				const target = table(scope.workload, 'outbox')
				const exhausted = await sql<WorkRow>`WITH expired AS (SELECT id FROM ${target}
					WHERE tenant_id=${scope.tenantId} AND workload=${scope.workload} AND kind IN (${sql.join(kinds)})
					AND state='Leased' AND lease_until<=clock_timestamp() AND attempts>=${this.options.maximumAttempts}
					ORDER BY lease_until,id FOR UPDATE SKIP LOCKED LIMIT 100)
					UPDATE ${target} work SET state='Exception',lease_owner=NULL,lease_until=NULL,
					last_error_code='retry-exhausted',updated_at=clock_timestamp()
					FROM expired WHERE work.tenant_id=${scope.tenantId} AND work.id=expired.id RETURNING work.*
				
`.execute(transaction)
				for (const row of exhausted.rows) {
					const expired = project(row)
					await new TransactionalWorkloadAudit(transaction, context).append({
						action: 'background.failed',
						workId: expired.id,
						attempt: expired.attempt,
						fence: expired.fence,
						errorCode: 'retry-exhausted',
					})
				}
				const result = await sql<WorkRow>`WITH candidate AS (SELECT id FROM ${target}
					WHERE tenant_id=${scope.tenantId} AND workload=${scope.workload} AND kind IN (${sql.join(kinds)})
					AND attempts<${this.options.maximumAttempts} AND available_at<=clock_timestamp()
					AND (state='Pending' OR (state='Leased' AND lease_until<=clock_timestamp()))
					ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
					UPDATE ${target} work SET state='Leased',lease_owner=${scope.runId}::uuid,
					lease_until=clock_timestamp()+${this.options.leaseMilliseconds}*interval '1 millisecond',
					attempts=attempts+1,fence=fence+1,updated_at=clock_timestamp()
					FROM candidate WHERE work.tenant_id=${scope.tenantId} AND work.id=candidate.id RETURNING work.*
`.execute(transaction)
				const row = result.rows[0]
				if (!row) return null
				const work = project(row)
				await new TransactionalWorkloadAudit(transaction, context).append({
					action: 'background.claimed',
					workId: work.id,
					attempt: work.attempt,
					fence: work.fence,
				})
				return work
			},
		)
	}

	/** Commit the domain effect and completed lease together, rolling back the effect if the fence or lifetime changed. */
	async complete(
		context: HcmWorkloadContext,
		work: ClaimedHcmWork,
		handler: (transaction: Transaction<Database>, verified: ClaimedHcmWork) => Promise<void>,
	): Promise<void> {
		const scope = requireWorkloadScope(context, work.workload)
		await this.database.workloadTransaction(
			context,
			scope.workload,
			/** Reload immutable intent under the completion lock; never execute caller-supplied replacement payload. */ async (
				transaction,
			) => {
				const target = table(scope.workload, 'outbox')
				const current =
					await sql<WorkRow>`SELECT * FROM ${target} WHERE tenant_id=${scope.tenantId} AND id=${work.id}
					AND workload=${scope.workload} AND state='Leased' AND lease_owner=${scope.runId}::uuid
					AND fence=${work.fence} AND lease_until>clock_timestamp() FOR UPDATE
`.execute(transaction)
				const row = current.rows[0]
				if (!row || row.digest !== work.digest || row.kind !== work.kind)
					throw new HcmWorkError('lease-lost')
				await handler(transaction, project(row))
				const completed = await sql<{
					id: string
				}>`UPDATE ${target} SET state='Completed',completed_at=clock_timestamp(),
					lease_owner=NULL,lease_until=NULL,last_error_code=NULL,updated_at=clock_timestamp()
					WHERE tenant_id=${scope.tenantId} AND id=${work.id} AND state='Leased' AND fence=${work.fence}
					AND lease_owner=${scope.runId}::uuid AND lease_until>clock_timestamp() RETURNING id
`.execute(transaction)
				if (!completed.rows[0]) throw new HcmWorkError('lease-lost')
				await new TransactionalWorkloadAudit(transaction, context).append({
					action: 'background.completed',
					workId: work.id,
					attempt: row.attempts,
					fence: work.fence,
				})
			},
		)
	}

	/** Schedule bounded retry or a visible terminal exception without mutating immutable intent or another worker's lease. */
	async fail(
		context: HcmWorkloadContext,
		work: ClaimedHcmWork,
		errorCode: string,
		delayMilliseconds: number,
	): Promise<void> {
		const scope = requireWorkloadScope(context, work.workload)
		if (
			!/^[a-z0-9][a-z0-9.-]{0,79}$/.test(errorCode) ||
			!Number.isSafeInteger(delayMilliseconds) ||
			delayMilliseconds < 0 ||
			delayMilliseconds > 86400000
		)
			throw new HcmWorkError('invalid-work')
		await this.database.workloadTransaction(
			context,
			scope.workload,
			/** A failure is recorded only by the current live lease holder after its business transaction rolled back. */ async (
				transaction,
			) => {
				const result = await sql<{ attempts: number }>`UPDATE ${table(scope.workload, 'outbox')}
					SET state=CASE WHEN attempts>=${this.options.maximumAttempts} THEN 'Exception' ELSE 'Pending' END,
					available_at=clock_timestamp()+${delayMilliseconds}*interval '1 millisecond',lease_owner=NULL,lease_until=NULL,
					last_error_code=${errorCode},updated_at=clock_timestamp()
					WHERE tenant_id=${scope.tenantId} AND id=${work.id} AND workload=${scope.workload} AND state='Leased'
					AND fence=${work.fence} AND lease_owner=${scope.runId}::uuid AND lease_until>clock_timestamp()
					RETURNING attempts
`.execute(transaction)
				if (!result.rows[0]) throw new HcmWorkError('lease-lost')
				await new TransactionalWorkloadAudit(transaction, context).append({
					action: 'background.failed',
					workId: work.id,
					attempt: result.rows[0].attempts,
					fence: work.fence,
					errorCode,
				})
			},
		)
	}
}

/** Project only the immutable work contract and checked claim counters needed by a registered handler. */
function project(row: WorkRow): ClaimedHcmWork {
	const fence = Number(row.fence)
	if (!Number.isSafeInteger(fence) || fence < 1) throw new HcmWorkError('invalid-work')
	return {
		id: row.id,
		workload: row.workload,
		kind: row.kind,
		schemaVersion: row.schema_version,
		businessKey: row.business_key,
		payload: row.payload,
		digest: row.digest,
		attempt: row.attempts,
		fence,
	}
}
