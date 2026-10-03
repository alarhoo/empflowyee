import { randomUUID } from 'node:crypto'
import { sql, type Transaction } from 'kysely'
import type { WorkloadAuditTables } from '@empflowyee/hcm-api-audit-infrastructure'
import {
	WorkflowSourceBinder,
	workflowManifestDigest,
} from '@empflowyee/hcm-api-workflow-application'
import { WORKFLOW_DEFINITION_MODE } from '@empflowyee/hcm-workflow-contract'
import {
	HcmWorkError,
	requireWorkloadScope,
	type HcmWorkloadContext,
	type ClaimedHcmWork,
} from '@empflowyee/hcm-api-runtime-application'
import type { HcmWorkHandler } from '@empflowyee/hcm-api-runtime-infrastructure'
import { enumValue, idValue, readBody, revisionValue } from '@empflowyee/hcm-runtime-contract'

/** Materialize source-required tasks through Runtime's existing lease and transaction fence. */
export class KyselyWorkflowPlanHandler implements HcmWorkHandler<WorkloadAuditTables> {
	readonly kind = 'workflow.source.intake'
	readonly schemaVersion = 1
	/** Receive only registered source-owned projections from composition. */
	constructor(private readonly sources: WorkflowSourceBinder) {}

	/** Reread the authoritative source before creating tasks; stale or closed intake never creates approval authority. */
	async execute(
		transaction: Transaction<WorkloadAuditTables>,
		context: HcmWorkloadContext,
		work: ClaimedHcmWork,
	): Promise<void> {
		const { tenantId } = requireWorkloadScope(context, 'WorkflowPlan')
		if (
			!transaction.isTransaction ||
			work.workload !== 'WorkflowPlan' ||
			work.kind !== this.kind ||
			work.schemaVersion !== 1
		)
			throw new HcmWorkError('invalid-work')
		const payload = readBody(work.payload, [
			'source',
			'caseId',
			'caseRevision',
			'subjectRevision',
			'generation',
			'manifestDigest',
		])
		const source = enumValue(payload['source'], 'source', ['Attendance', 'Leave']),
			caseId = idValue(payload['caseId'], 'caseId')
		const caseRevision = revisionValue(payload['caseRevision']),
			subjectRevision = revisionValue(payload['subjectRevision']),
			generation = revisionValue(payload['generation'])
		const expected = payload['manifestDigest']
		if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected))
			throw new HcmWorkError('invalid-work')
		await sql`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId}||':workflow-case:'||${source}||':'||${caseId},0))`.execute(
			transaction,
		)
		const projection = this.sources.bind(transaction, tenantId, source)
		const fresh = await projection.manifest(caseId)
		let outcome = 'SourceUnavailable',
			instanceId: string | null = null
		if (fresh) {
			const { manifest, digest } = workflowManifestDigest(fresh)
			if (
				manifest.source !== source ||
				manifest.caseId !== caseId ||
				manifest.caseRevision !== caseRevision ||
				manifest.subjectRevision !== subjectRevision ||
				manifest.generation !== generation ||
				digest !== expected
			)
				outcome = 'SourceChanged'
			else if (manifest.safeFacts.sourceState !== 'Pending') outcome = 'SourceClosed'
			else {
				const existing = (
					await sql<{
						id: string
						manifest_digest: string
						generation: number
					}>`SELECT id,manifest_digest,generation FROM hcm.workflow_instance WHERE tenant_id=${tenantId} AND source=${source} AND source_case_id=${caseId} AND (generation=${generation} OR state='Open')`.execute(
						transaction,
					)
				).rows
				if (existing.length) {
					const same = existing.find(
						/** Recover only the exact previously materialized generation. */ (row) =>
							row.generation === generation && row.manifest_digest === digest,
					)
					outcome = same ? 'AlreadyPlanned' : 'ReconciliationRequired'
					instanceId = same?.id ?? null
				} else if (
					manifest.slots.some(
						/** Existing source decisions require receipt reconciliation, never fabricated task completion. */ (
							slot,
						) => slot.state !== 'Pending',
					)
				)
					outcome = 'ReconciliationRequired'
				else {
					instanceId = randomUUID()
					await sql`INSERT INTO hcm.workflow_instance(tenant_id,id,source,subject_type,definition_mode,registry_version,source_case_id,source_case_revision,subject_id,subject_revision,generation,manifest_digest) VALUES(${tenantId},${instanceId}::uuid,${source},${manifest.safeFacts.subjectType},${WORKFLOW_DEFINITION_MODE},1,${caseId},${caseRevision},${manifest.subjectId},${subjectRevision},${generation},${digest})`.execute(
						transaction,
					)
					const openedAt = (
						await sql<{
							opened_at: Date
						}>`SELECT opened_at FROM hcm.workflow_instance WHERE tenant_id=${tenantId} AND id=${instanceId}::uuid`.execute(
							transaction,
						)
					).rows[0].opened_at
					for (const stage of new Set(
						manifest.slots.map(/** Preserve all required stage ordinals. */ (slot) => slot.stage),
					)) {
						const members = manifest.slots.filter(
							/** Group the source graph without weakening its obligations. */ (slot) =>
								slot.stage === stage,
						)
						await sql`INSERT INTO hcm.workflow_stage_instance(tenant_id,instance_id,stage,required_count,completion_mode,state,activated_at) VALUES(${tenantId},${instanceId}::uuid,${stage},${members.length},'All',${stage === 1 ? 'Active' : 'Blocked'},${stage === 1 ? openedAt : null})`.execute(
							transaction,
						)
						for (const slot of members) {
							const candidates = stage === 1 ? await projection.candidates(caseId, slot.id) : null
							if (
								candidates &&
								(candidates.accountIds.length > 100 ||
									new Set(candidates.accountIds).size !== candidates.accountIds.length ||
									!/^[a-f0-9]{64}$/.test(candidates.digest))
							)
								throw new HcmWorkError('invalid-work')
							for (const accountId of candidates?.accountIds ?? [])
								idValue(accountId, 'candidateAccountId')
							const taskId = randomUUID(),
								ready = !!candidates?.accountIds.length
							const assignment =
								candidates?.accountIds.length === 1 ? 'Direct' : 'OfferToCandidates'
							const activeState = ready ? 'Ready' : 'Failed'
							const dueAt = ready ? new Date(openedAt.getTime() + 48 * 3600000) : null
							await sql`INSERT INTO hcm.workflow_task(tenant_id,id,instance_id,stage,ordinal,source_slot_id,source_slot_revision,expected_case_revision,independent,distinct_actors,candidate_rule_code,candidate_digest,assignment_mode,state,available_at,due_at) VALUES(${tenantId},${taskId}::uuid,${instanceId}::uuid,${stage},${slot.ordinal},${slot.id},${slot.revision},${caseRevision},${slot.independent},${slot.distinctActors},${slot.candidateRuleCode},${candidates?.digest ?? null},${ready ? assignment : null},${stage !== 1 ? 'Blocked' : activeState},${ready ? openedAt : null},${dueAt})`.execute(
								transaction,
							)
							for (const accountId of candidates?.accountIds ?? [])
								await sql`INSERT INTO hcm.workflow_task_candidate(tenant_id,task_id,account_id) VALUES(${tenantId},${taskId}::uuid,${accountId})`.execute(
									transaction,
								)
							if (candidates && !ready)
								await sql`INSERT INTO hcm.workflow_reconciliation_exception(tenant_id,id,task_id,code) VALUES(${tenantId},${randomUUID()}::uuid,${taskId}::uuid,'NoCandidates')`.execute(
									transaction,
								)
							if (ready) {
								const timers = [
									{ kind: 'Due', fire: 1, hours: 48 },
									{ kind: 'Reminder', fire: 1, hours: 24 },
									{ kind: 'Reminder', fire: 2, hours: 48 },
									{ kind: 'Reminder', fire: 3, hours: 72 },
									{ kind: 'Escalation', fire: 1, hours: 72 },
								]
								for (const timer of timers)
									await sql`INSERT INTO hcm.workflow_task_timer(tenant_id,id,task_id,kind,fire_number,due_at) VALUES(${tenantId},${randomUUID()}::uuid,${taskId}::uuid,${timer.kind},${timer.fire},${new Date(openedAt.getTime() + timer.hours * 3600000)})`.execute(
										transaction,
									)
							}
						}
					}
					outcome = 'Planned'
				}
			}
		}
		await sql`INSERT INTO hcm.workflow_planning_receipt(tenant_id,outbox_id,instance_id,outcome,manifest_digest) VALUES(${tenantId},${work.id},${instanceId}::uuid,${outcome},${expected})`.execute(
			transaction,
		)
		requireWorkloadScope(context, 'WorkflowPlan')
	}
}
