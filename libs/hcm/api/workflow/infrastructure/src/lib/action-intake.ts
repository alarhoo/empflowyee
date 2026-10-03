import { randomUUID } from 'node:crypto'
import { TransactionalAudit, type AuditTables } from '@empflowyee/hcm-api-audit-infrastructure'
import { sql, type Kysely, type Transaction } from 'kysely'
import {
	WorkflowActionBinder,
	type WorkflowActionPort,
	type WorkflowSourceBinder,
	type WorkflowSourceActionBinder,
	type WorkflowSourceActionIntent,
} from '@empflowyee/hcm-api-workflow-application'
import {
	commandHash,
	requireAuthenticatedScope,
	requireIdempotencyKey,
	type AuthenticatedHcmContext,
	type FieldCipher,
	type HcmActionAuthorizationBinder,
} from '@empflowyee/hcm-api-runtime-application'
import { enqueueHcmWork } from '@empflowyee/hcm-api-runtime-infrastructure'
import {
	parseWorkflowActionCommand,
	type WorkflowActionResult,
	type WorkflowAttemptView,
	type WorkflowSource,
	type WorkflowActionCommand,
} from '@empflowyee/hcm-workflow-contract'
import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'

interface TaskRow {
	id: string
	revision: number
	state: string
	source: WorkflowSource
	caseId: string
	slotId: string
	slotRevision: number
	caseRevision: number
	subjectRevision: number
	generation: number
}
interface AttemptRow {
	id: string
	taskId: string
	source: WorkflowSource
	caseId: string
	requestDigest: string
	state: WorkflowAttemptView['state']
	operationId: string
	expectedTaskRevision: number
}

/** Preserve one immutable action identity across uncertain browser submissions and worker restarts. */
class SqlWorkflowActions implements WorkflowActionPort {
	/** Bind source authorization, cipher and Runtime references to the same existing tenant transaction. */
	constructor(
		private readonly tx: Kysely<unknown>,
		private readonly tenant: string,
		private readonly cipher: FieldCipher,
		private readonly authorities: HcmActionAuthorizationBinder,
		private readonly projections: WorkflowSourceBinder,
		private readonly sources: WorkflowSourceActionBinder,
	) {}
	/** Resolve one source slot to its current task, retaining the original task revision when recovering the same command. */
	async submitSlot(
		context: AuthenticatedHcmContext,
		source: WorkflowSource,
		caseId: string,
		slotId: string,
		key: string,
		input: Omit<WorkflowActionCommand, 'expectedRevision'>,
	): Promise<WorkflowActionResult> {
		idValue(caseId, 'caseId')
		idValue(slotId, 'slotId')
		requireIdempotencyKey(key)
		const actor = await this.actor(context)
		await this.sources.bind(this.tx, this.tenant, source).authorizeRead(context, caseId)
		const prior = (
			await sql<{
				taskId: string
				revision: number
				source: WorkflowSource
				caseId: string
				slotId: string
			}>`SELECT task_id AS "taskId",expected_task_revision AS revision,source,case_id AS "caseId",slot_id AS "slotId" FROM hcm.workflow_action_attempt WHERE tenant_id=${this.tenant} AND actor_account_id=${actor.accountId} AND idempotency_key=${key}::uuid`.execute(
				this.tx,
			)
		).rows[0]
		if (prior && (prior.source !== source || prior.caseId !== caseId || prior.slotId !== slotId))
			throw new HcmDomainError('revision-conflict')
		const task =
			prior ??
			(
				await sql<{
					taskId: string
					revision: number
				}>`SELECT t.id AS "taskId",t.revision FROM hcm.workflow_task t JOIN hcm.workflow_instance i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id WHERE i.tenant_id=${this.tenant} AND i.source=${source} AND i.source_case_id=${caseId} AND i.generation=${input.generation} AND t.source_slot_id=${slotId}`.execute(
					this.tx,
				)
			).rows[0]
		if (!task) throw new HcmDomainError('record-incomplete')
		return this.submit(context, task.taskId, key, { ...input, expectedRevision: task.revision })
	}
	/** Recover only the original actor/source key; private intent and task data stay behind the Workflow owner. */
	async readKey(
		context: AuthenticatedHcmContext,
		source: WorkflowSource,
		key: string,
	): Promise<{ caseId: string; attempt: WorkflowAttemptView }> {
		requireIdempotencyKey(key)
		const actor = await this.actor(context)
		const row = (
			await sql<{
				id: string
				caseId: string
			}>`SELECT id,case_id AS "caseId" FROM hcm.workflow_action_attempt WHERE tenant_id=${this.tenant} AND actor_account_id=${actor.accountId} AND source=${source} AND idempotency_key=${key}::uuid`.execute(
				this.tx,
			)
		).rows[0]
		if (!row) throw new HcmDomainError('not-found')
		return { caseId: row.caseId, attempt: await this.read(context, row.id) }
	}
	/** Require a real matching transaction and current original human before any attempt lookup. */
	private async actor(context: AuthenticatedHcmContext) {
		const actor = requireAuthenticatedScope(context)
		const bound = await sql<{
			tenant: string | null
		}>`SELECT hcm.current_tenant_id() AS tenant`.execute(this.tx)
		if (
			!this.tx.isTransaction ||
			actor.tenantId !== this.tenant ||
			bound.rows[0]?.tenant !== this.tenant
		)
			throw new HcmDomainError('forbidden')
		await sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${this.tenant},0))`.execute(
			this.tx,
		)
		return requireAuthenticatedScope(context)
	}
	/** Return only this actor's durable result after source-owned current read authorization. */
	async read(context: AuthenticatedHcmContext, attemptId: string): Promise<WorkflowAttemptView> {
		idValue(attemptId, 'attemptId')
		const actor = await this.actor(context)
		const row = (
			await sql<AttemptRow>`SELECT id,task_id AS "taskId",source,case_id AS "caseId",state FROM hcm.workflow_action_attempt
			WHERE tenant_id=${this.tenant} AND id=${attemptId} AND actor_account_id=${actor.accountId}`.execute(
				this.tx,
			)
		).rows[0]
		if (!row) throw new HcmDomainError('not-found')
		await this.sources.bind(this.tx, this.tenant, row.source).authorizeRead(context, row.caseId)
		const receipt = (
			await sql<{
				sourceReceiptId: string
				sourceRevision: number
				safeFailureCode: string | null
			}>`SELECT source_receipt_id AS "sourceReceiptId",source_case_revision AS "sourceRevision",safe_failure_code AS "safeFailureCode" FROM hcm.workflow_action_receipt WHERE tenant_id=${this.tenant} AND attempt_id=${attemptId}`.execute(
				this.tx,
			)
		).rows[0]
		return {
			id: row.id,
			taskId: row.taskId,
			state: row.state,
			...(receipt
				? {
					sourceReceiptId: receipt.sourceReceiptId,
					sourceRevision: receipt.sourceRevision,
					...(receipt.safeFailureCode ? { safeFailureCode: receipt.safeFailureCode } : {}),
				}
				: {}),
		}
	}
	/** Capture current source authority before encrypting and queuing the exact requested decision. */
	async submit(
		context: AuthenticatedHcmContext,
		taskId: string,
		key: string,
		value: unknown,
	): Promise<WorkflowActionResult> {
		idValue(taskId, 'taskId')
		requireIdempotencyKey(key)
		const input = parseWorkflowActionCommand(value),
			actor = await this.actor(context)
		const requestDigest = commandHash('WorkflowActionRequest:1', {
			actor: actor.accountId,
			taskId,
			input,
		})
		await sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([this.tenant, actor.accountId, 'WorkflowAction', key.toLowerCase()])},0))`.execute(
			this.tx,
		)
		const prior = (
			await sql<AttemptRow>`SELECT id,task_id AS "taskId",source,case_id AS "caseId",request_digest AS "requestDigest",outbox_id AS "operationId",expected_task_revision AS "expectedTaskRevision" FROM hcm.workflow_action_attempt WHERE tenant_id=${this.tenant} AND actor_account_id=${actor.accountId} AND idempotency_key=${key}::uuid`.execute(
				this.tx,
			)
		).rows[0]
		if (prior) {
			await this.sources
				.bind(this.tx, this.tenant, prior.source)
				.authorizeRead(context, prior.caseId)
			if (prior.requestDigest !== requestDigest) throw new HcmDomainError('revision-conflict')
			return {
				attemptId: prior.id,
				taskId: prior.taskId,
				revision: prior.expectedTaskRevision + 1,
				state: 'ActionPending',
				operationId: prior.operationId,
			}
		}
		const task = (
			await sql<TaskRow>`SELECT t.id,t.revision,t.state,i.source,i.source_case_id AS "caseId",t.source_slot_id AS "slotId",t.source_slot_revision AS "slotRevision",t.expected_case_revision AS "caseRevision",i.subject_revision AS "subjectRevision",i.generation
			FROM hcm.workflow_task t JOIN hcm.workflow_instance i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id WHERE t.tenant_id=${this.tenant} AND t.id=${taskId}`.execute(
				this.tx,
			)
		).rows[0]
		if (!task) throw new HcmDomainError('not-found')
		await sql`SELECT pg_advisory_xact_lock(hashtextextended(${this.tenant}||':workflow-case:'||${task.source}||':'||${task.caseId},0))`.execute(
			this.tx,
		)
		const source = this.sources.bind(this.tx, this.tenant, task.source)
		const authorization = await source.authorize(context, task.caseId, task.slotId)
		const current = (
			await sql<{
				revision: number
				state: string
			}>`SELECT revision,state FROM hcm.workflow_task WHERE tenant_id=${this.tenant} AND id=${taskId} FOR UPDATE`.execute(
				this.tx,
			)
		).rows[0]
		if (
			!current ||
			current.state !== 'Ready' ||
			current.revision !== input.expectedRevision ||
			current.revision !== task.revision
		)
			throw new HcmDomainError('revision-conflict')
		const projection = this.projections.bind(this.tx, this.tenant, task.source)
		const manifest = await projection.manifest(task.caseId)
		const slot = manifest?.slots.find(
			/** Use only the exact required slot retained by this task. */ (member) =>
				member.id === task.slotId,
		)
		if (
			!manifest ||
			!slot ||
			manifest.safeFacts.sourceState !== 'Pending' ||
			slot.state !== 'Pending' ||
			manifest.caseRevision !== input.expectedSourceRevision ||
			manifest.subjectRevision !== input.expectedSubjectRevision ||
			manifest.generation !== input.generation ||
			task.caseRevision !== manifest.caseRevision ||
			task.slotRevision !== slot.revision ||
			task.subjectRevision !== manifest.subjectRevision ||
			task.generation !== manifest.generation ||
			manifest.slots.some(
				/** Every earlier required source stage must already be approved. */ (member) =>
					member.stage < slot.stage && member.state !== 'Approved',
			)
		)
			throw new HcmDomainError('revision-conflict')
		if (!(await projection.candidates(task.caseId, slot.id)).accountIds.includes(actor.accountId))
			throw new HcmDomainError('forbidden')
		const id = randomUUID(),
			dispatchKey = randomUUID()
		const intentFields = {
			dispatchKey,
			source: task.source,
			caseId: task.caseId,
			slotId: task.slotId,
			actorAccountId: actor.accountId,
			expectedCaseRevision: manifest.caseRevision,
			expectedSlotRevision: slot.revision,
			expectedSubjectRevision: manifest.subjectRevision,
			generation: manifest.generation,
			action: input.action,
			reason: input.reason,
		}
		const intent: WorkflowSourceActionIntent = {
			...intentFields,
			intentDigest: commandHash('WorkflowSourceAction:1', intentFields),
		}
		const authority = await this.authorities
			.bind(this.tx, this.tenant)
			.issue(context, { ...authorization, intentDigest: intent.intentDigest })
		const sealed = await this.cipher
			.bind(this.tx, this.tenant)
			.encrypt(
				{ table: 'workflow_action_attempt', column: 'encrypted_reason', rowId: id },
				input.reason,
			)
		const operationId = await enqueueHcmWork(this.tx as Transaction<unknown>, this.tenant, {
			workload: 'WorkflowDispatch',
			kind: 'workflow.action.dispatch',
			schemaVersion: 1,
			businessKey: dispatchKey,
			payload: { attemptId: id, intentDigest: intent.intentDigest },
		})
		await sql`INSERT INTO hcm.workflow_action_attempt(tenant_id,id,task_id,actor_account_id,idempotency_key,request_digest,dispatch_key,intent_digest,authority_reference,source,case_id,slot_id,expected_task_revision,expected_case_revision,expected_slot_revision,expected_subject_revision,generation,action,encrypted_reason,reason_key_version,outbox_id)
			VALUES(${this.tenant},${id},${taskId},${actor.accountId},${key}::uuid,${requestDigest},${dispatchKey}::uuid,${intent.intentDigest},${authority},${task.source},${task.caseId},${task.slotId},${task.revision},${manifest.caseRevision},${slot.revision},${manifest.subjectRevision},${manifest.generation},${input.action},${sealed.ciphertext},${sealed.keyVersion},${operationId})`.execute(
				this.tx,
			)
		await sql`UPDATE hcm.workflow_task SET state='ActionPending',revision=revision+1 WHERE tenant_id=${this.tenant} AND id=${taskId}`.execute(
			this.tx,
		)
		await new TransactionalAudit(this.tx as unknown as Kysely<AuditTables>, context).append({
			action: 'workflow.action-requested',
			category: 'business',
			targetType: 'workflow-task',
			targetId: taskId,
			requestId: key,
			summary: {
				reason: null,
				changedFields: ['action'],
				fromState: 'Ready',
				toState: 'ActionPending',
			},
		})
		requireAuthenticatedScope(context)
		return {
			attemptId: id,
			taskId,
			revision: task.revision + 1,
			state: 'ActionPending',
			operationId,
		}
	}
}

export class KyselyWorkflowActionBinder extends WorkflowActionBinder {
	/** Compose concrete owner ports once; each source app supplies its current authorized transaction. */
	constructor(
		private readonly cipher: FieldCipher,
		private readonly authorities: HcmActionAuthorizationBinder,
		private readonly projections: WorkflowSourceBinder,
		private readonly sources: WorkflowSourceActionBinder,
	) {
		super()
	}
	/** Reject pool binding before any private action data is read or written. */
	bind(transaction: unknown, tenantId: string): WorkflowActionPort {
		const tx = transaction as Kysely<unknown>
		if (!tx?.isTransaction) throw new HcmDomainError('forbidden')
		return new SqlWorkflowActions(
			tx,
			tenantId,
			this.cipher,
			this.authorities,
			this.projections,
			this.sources,
		)
	}
}
