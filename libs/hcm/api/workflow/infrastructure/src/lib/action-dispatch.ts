import { sql, type Transaction } from 'kysely'
import type { WorkloadAuditTables } from '@empflowyee/hcm-api-audit-infrastructure'
import type {
	WorkflowSourceActionBinder,
	WorkflowSourceActionIntent,
	WorkflowSourceActionReceipt,
} from '@empflowyee/hcm-api-workflow-application'
import {
	commandHash,
	HcmWorkError,
	requireWorkloadScope,
	type ClaimedHcmWork,
	type FieldCipher,
	type HcmWorkloadContext,
	type HcmActionAuthorizationBinder,
} from '@empflowyee/hcm-api-runtime-application'
import { enqueueHcmWork, type HcmWorkHandler } from '@empflowyee/hcm-api-runtime-infrastructure'
import { enumValue, idValue, readBody, revisionValue } from '@empflowyee/hcm-runtime-contract'

interface DispatchRow extends Omit<WorkflowSourceActionIntent, 'reason'> {
	id: string
	taskId: string
	state: string
	authorityReference: string
	encryptedReason: Buffer
	reasonKeyVersion: number
}

/** Validate fixed-adapter receipt identity before any coordination status can change. */
export function validateWorkflowSourceReceipt(
	value: WorkflowSourceActionReceipt,
	intent: WorkflowSourceActionIntent,
): void {
	const receipt = readBody(value, [
		'id',
		'dispatchKey',
		'intentDigest',
		'caseId',
		'slotId',
		'actorAccountId',
		'generation',
		'outcome',
		'caseRevision',
		'subjectRevision',
		'decisionId',
		'safeFailureCode',
	])
	idValue(receipt['id'], 'sourceReceiptId')
	revisionValue(receipt['caseRevision'], 'caseRevision')
	revisionValue(receipt['subjectRevision'], 'subjectRevision')
	enumValue(receipt['outcome'], 'outcome', [
		'Accepted',
		'Denied',
		'Stale',
		'Conflict',
		'CaseClosed',
	])
	for (const key of [
		'dispatchKey',
		'intentDigest',
		'caseId',
		'slotId',
		'actorAccountId',
		'generation',
	] as const)
		if (receipt[key] !== intent[key]) throw new HcmWorkError('work-conflict')
	if (value.outcome === 'Accepted') {
		idValue(value.decisionId, 'decisionId')
		if (value.caseRevision <= intent.expectedCaseRevision || value.safeFailureCode !== null)
			throw new HcmWorkError('work-conflict')
	} else if (value.decisionId !== null) throw new HcmWorkError('work-conflict')
	if (value.safeFailureCode !== null && !/^[A-Za-z][A-Za-z0-9]{0,79}$/.test(value.safeFailureCode))
		throw new HcmWorkError('invalid-work')
}

/** Dispatch only immutable owner-registered actions and reconcile the source receipt in the same lease-fenced transaction. */
export class KyselyWorkflowDispatchHandler implements HcmWorkHandler<WorkloadAuditTables> {
	readonly kind = 'workflow.action.dispatch'
	readonly schemaVersion = 1
	/** Keep source authority and private narrative inside fixed HCM adapters. */
	constructor(
		private readonly sources: WorkflowSourceActionBinder,
		private readonly cipher: FieldCipher,
		private readonly authorities: HcmActionAuthorizationBinder,
	) {}
	/** Query the original source key first; retry never renews authority or issues a replacement decision key. */
	async execute(
		tx: Transaction<WorkloadAuditTables>,
		context: HcmWorkloadContext,
		work: ClaimedHcmWork,
	): Promise<void> {
		const { tenantId } = requireWorkloadScope(context, 'WorkflowDispatch')
		if (
			!tx.isTransaction ||
			work.kind !== this.kind ||
			work.schemaVersion !== 1 ||
			work.workload !== 'WorkflowDispatch'
		)
			throw new HcmWorkError('invalid-work')
		const payload = readBody(work.payload, ['attemptId', 'intentDigest'])
		const attemptId = idValue(payload['attemptId'], 'attemptId')
		const row = (
			await sql<DispatchRow>`SELECT id,task_id AS "taskId",state,dispatch_key::text AS "dispatchKey",intent_digest AS "intentDigest",authority_reference AS "authorityReference",
			source,case_id AS "caseId",slot_id AS "slotId",actor_account_id AS "actorAccountId",expected_case_revision AS "expectedCaseRevision",expected_slot_revision AS "expectedSlotRevision",expected_subject_revision AS "expectedSubjectRevision",generation,action,encrypted_reason AS "encryptedReason",reason_key_version AS "reasonKeyVersion"
			FROM hcm.workflow_action_attempt WHERE tenant_id=${tenantId} AND id=${attemptId}`.execute(tx)
		).rows[0]
		if (!row || row.intentDigest !== payload['intentDigest'])
			throw new HcmWorkError('work-conflict')
		await sql`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId}||':workflow-case:'||${row.source}||':'||${row.caseId},0))`.execute(
			tx,
		)
		const state = (
			await sql<{
				state: string
			}>`SELECT state FROM hcm.workflow_action_attempt WHERE tenant_id=${tenantId} AND id=${attemptId} FOR UPDATE`.execute(
				tx,
			)
		).rows[0].state
		if (!['Pending', 'Unknown'].includes(state)) return
		const authority = await this.authorities.bind(tx, tenantId).read(row.authorityReference)
		if (
			!authority ||
			authority.intentDigest !== row.intentDigest ||
			authority.accountId !== row.actorAccountId ||
			authority.tenantId !== tenantId
		)
			throw new HcmWorkError('work-conflict')
		const reason = await this.cipher
			.bind(tx, tenantId)
			.decrypt(
				{ table: 'workflow_action_attempt', column: 'encrypted_reason', rowId: row.id },
				{ ciphertext: row.encryptedReason, keyVersion: row.reasonKeyVersion },
			)
		const fields = {
			dispatchKey: row.dispatchKey,
			source: row.source,
			caseId: row.caseId,
			slotId: row.slotId,
			actorAccountId: row.actorAccountId,
			expectedCaseRevision: row.expectedCaseRevision,
			expectedSlotRevision: row.expectedSlotRevision,
			expectedSubjectRevision: row.expectedSubjectRevision,
			generation: row.generation,
			action: row.action,
			reason,
		}
		if (commandHash('WorkflowSourceAction:1', fields) !== row.intentDigest)
			throw new HcmWorkError('work-conflict')
		const intent = { ...fields, intentDigest: row.intentDigest }
		const source = this.sources.bind(tx, tenantId, row.source)
		const receipt =
			(await source.query(context, intent)) ??
			(await source.decide(context, row.authorityReference, intent))
		validateWorkflowSourceReceipt(receipt, intent)
		await sql`INSERT INTO hcm.workflow_action_receipt(tenant_id,attempt_id,task_id,source_receipt_id,outcome,source_case_revision,source_subject_revision,source_decision_id,safe_failure_code,result_digest)
			VALUES(${tenantId},${attemptId},${row.taskId},${receipt.id},${receipt.outcome},${receipt.caseRevision},${receipt.subjectRevision},${receipt.decisionId},${receipt.safeFailureCode},${commandHash('WorkflowSourceReceipt:1', receipt)})`.execute(
				tx,
			)
		await sql`UPDATE hcm.workflow_action_attempt SET state=${receipt.outcome},completed_at=clock_timestamp() WHERE tenant_id=${tenantId} AND id=${attemptId}`.execute(
			tx,
		)
		await sql`UPDATE hcm.workflow_task SET state=${receipt.outcome === 'Accepted' ? 'Completed' : 'Failed'},revision=revision+1 WHERE tenant_id=${tenantId} AND id=${row.taskId}`.execute(
			tx,
		)
		await enqueueHcmWork(tx, tenantId, {
			workload: 'WorkflowReconcile',
			kind: 'workflow.source.reconcile',
			schemaVersion: 1,
			businessKey: attemptId,
			payload: { source: row.source, caseId: row.caseId, generation: row.generation },
		})
		requireWorkloadScope(context, 'WorkflowDispatch')
	}
}
