import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import {
	requireWorkloadScope,
	type HcmWorkloadContext,
} from '@empflowyee/hcm-api-runtime-application'
import {
	validateWorkloadAudit,
	type AppendWorkloadAudit,
	type WorkloadAuditEvent,
} from '@empflowyee/hcm-api-audit-application'

export interface WorkloadAuditTables {
	'hcm.audit_event': {
		tenant_id: string
		id: string
		actor_kind: 'Workload'
		actor_account_id: null
		workload_code: string
		workload_run_id: string
		action: string
		target_type: string
		target_id: string
		outcome: 'Succeeded' | 'Failed'
		request_id: string
		category: 'business'
		safe_summary: { attempt: number; fence: number; errorCode?: string }
	}
}

export class TransactionalWorkloadAudit<
	Database extends WorkloadAuditTables = WorkloadAuditTables,
> implements AppendWorkloadAudit {
	private readonly transaction: Kysely<WorkloadAuditTables>
	/** Bind attribution to the same verified tenant transaction as the workload effect. */
	constructor(
		transaction: Kysely<Database>,
		private readonly context: HcmWorkloadContext,
	) {
		// Narrow the known audit projection; the executor remains the caller's identical transaction.
		this.transaction = transaction as unknown as Kysely<WorkloadAuditTables>
	}

	/** Append one workload event with explicit system attribution and no fabricated human account. */
	async append(event: WorkloadAuditEvent): Promise<string> {
		validateWorkloadAudit(event)
		const scope = requireWorkloadScope(this.context)
		const id = randomUUID()
		await this.transaction
			.insertInto('hcm.audit_event')
			.values({
				tenant_id: scope.tenantId,
				id,
				actor_kind: 'Workload',
				actor_account_id: null,
				workload_code: scope.workload,
				workload_run_id: scope.runId,
				action: event.action,
				target_type: 'background-work',
				target_id: event.workId,
				outcome: event.action === 'background.failed' ? 'Failed' : 'Succeeded',
				request_id: scope.runId,
				category: 'business',
				safe_summary: {
					attempt: event.attempt,
					fence: event.fence,
					...(event.errorCode ? { errorCode: event.errorCode } : {}),
				},
			})
			.execute()
		return id
	}
}
