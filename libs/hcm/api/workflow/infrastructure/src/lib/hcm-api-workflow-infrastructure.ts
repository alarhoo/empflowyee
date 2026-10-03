import { sql, type Kysely, type Transaction } from 'kysely'
import { idValue } from '@empflowyee/hcm-runtime-contract'
import {
	WorkflowIntakeBinder,
	workflowManifestDigest,
	type WorkflowIntakePort,
} from '@empflowyee/hcm-api-workflow-application'
import { enqueueHcmWork } from '@empflowyee/hcm-api-runtime-infrastructure'
import { commandHash } from '@empflowyee/hcm-api-runtime-application'

/** Workflow's source-facing intake adapter owns its outbox contract and participates in the source transaction. */
export class KyselyWorkflowIntakeBinder extends WorkflowIntakeBinder {
	/** Require an existing live tenant transaction; this adapter neither creates source authority nor opens a second connection. */
	bind(transaction: unknown, tenantId: string): WorkflowIntakePort {
		idValue(tenantId, 'tenantId')
		const executor = transaction as Kysely<unknown>
		if (!executor?.isTransaction) throw new Error('Workflow intake requires a tenant transaction')
		return {
			enqueue:
			/** Persist only a safe manifest's identity/digest; the planner rereads authoritative requirements from the fixed source adapter. */ async (
				value,
			) => {
				const binding = await sql<{
					tenantId: string | null
				}>`SELECT hcm.current_tenant_id() AS "tenantId"`.execute(executor)
				if (binding.rows[0]?.tenantId !== tenantId)
					throw new Error('Workflow intake tenant mismatch')
				const { manifest, digest } = workflowManifestDigest(value)
				const operationId = await enqueueHcmWork(executor as Transaction<unknown>, tenantId, {
					workload: 'WorkflowPlan',
					kind: 'workflow.source.intake',
					schemaVersion: 1,
					businessKey: commandHash('WorkflowIntakeIdentity:1', {
						source: manifest.source,
						caseId: manifest.caseId,
						caseRevision: manifest.caseRevision,
						generation: manifest.generation,
					}),
					payload: {
						source: manifest.source,
						caseId: manifest.caseId,
						caseRevision: manifest.caseRevision,
						subjectRevision: manifest.subjectRevision,
						generation: manifest.generation,
						manifestDigest: digest,
					},
				})
				return { operationId, state: 'Queued', manifestDigest: digest }
			},
		}
	}
}
