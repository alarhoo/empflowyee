import { randomUUID } from 'node:crypto'
import { sql, type Transaction } from 'kysely'
import type { WorkloadAuditTables } from '@empflowyee/hcm-api-audit-infrastructure'
import {
	workflowManifestDigest,
	type WorkflowSourceBinder,
} from '@empflowyee/hcm-api-workflow-application'
import type { DomainApprovalManifest } from '@empflowyee/hcm-workflow-contract'
import {
	HcmWorkError,
	requireWorkloadScope,
	type HcmWorkloadContext,
	type ClaimedHcmWork,
} from '@empflowyee/hcm-api-runtime-application'
import type { HcmWorkHandler } from '@empflowyee/hcm-api-runtime-infrastructure'
import { enumValue, idValue, readBody, revisionValue } from '@empflowyee/hcm-runtime-contract'

interface Task {
	id: string
	state: string
	slotId: string
	stage: number
	ordinal: number
	independent: boolean
	distinctActors: boolean
	ruleId: string
	availableAt: Date | null
	dueAt: Date | null
}

/** Reconcile only current source requirements and authentic previously accepted receipts. */
export class KyselyWorkflowReconcileHandler implements HcmWorkHandler<WorkloadAuditTables> {
	readonly kind = 'workflow.source.reconcile'
	readonly schemaVersion = 1
	/** Receive fixed source projections; reconciliation has no source decision capability. */
	constructor(private readonly sources: WorkflowSourceBinder) {}
	/** Refresh pending candidates/stages and cancel obsolete work without inventing source decisions. */
	async execute(
		tx: Transaction<WorkloadAuditTables>,
		context: HcmWorkloadContext,
		work: ClaimedHcmWork,
	): Promise<void> {
		const { tenantId: tenant } = requireWorkloadScope(context, 'WorkflowReconcile')
		if (
			!tx.isTransaction ||
			work.workload !== 'WorkflowReconcile' ||
			work.kind !== this.kind ||
			work.schemaVersion !== 1
		)
			throw new HcmWorkError('invalid-work')
		const payload = readBody(work.payload, ['source', 'caseId', 'generation'])
		const source = enumValue(payload['source'], 'source', ['Attendance', 'Leave']),
			caseId = idValue(payload['caseId'], 'caseId'),
			generation = revisionValue(payload['generation'], 'generation')
		await sql`SELECT pg_advisory_xact_lock(hashtextextended(${tenant}||':workflow-case:'||${source}||':'||${caseId},0))`.execute(
			tx,
		)
		const instance = (
			await sql<{
				id: string
				state: string
				subjectId: string
				subjectRevision: number
			}>`SELECT id,state,subject_id AS "subjectId",subject_revision AS "subjectRevision" FROM hcm.workflow_instance WHERE tenant_id=${tenant} AND source=${source} AND source_case_id=${caseId} AND generation=${generation} FOR UPDATE`.execute(
				tx,
			)
		).rows[0]
		let outcome = 'NotPlanned',
			digest: string | null = null
		if (instance) {
			const projection = this.sources.bind(tx, tenant, source),
				current = await projection.manifest(caseId)
			const tasks = (
				await sql<Task>`SELECT id,state,source_slot_id AS "slotId",stage,ordinal,independent,distinct_actors AS "distinctActors",candidate_rule_code AS "ruleId",available_at AS "availableAt",due_at AS "dueAt" FROM hcm.workflow_task WHERE tenant_id=${tenant} AND instance_id=${instance.id} ORDER BY stage,ordinal FOR UPDATE`.execute(
					tx,
				)
			).rows
			if (!current) {
				outcome = 'SourceUnavailable'
				await this.fail(tx, tenant, tasks, 'MissingSource')
			} else {
				const parsed = workflowManifestDigest(current),
					manifest = parsed.manifest
				digest = parsed.digest
				if (
					manifest.source !== source ||
					manifest.caseId !== caseId ||
					manifest.generation !== generation ||
					manifest.subjectId !== instance.subjectId ||
					manifest.subjectRevision !== instance.subjectRevision ||
					!this.sameRequirements(tasks, manifest)
				) {
					outcome = 'SourceChanged'
					await this.fail(tx, tenant, tasks, 'VersionDrift')
				} else if (['Completed', 'Cancelled', 'Invalidated'].includes(instance.state))
					outcome = 'Closed'
				else {
					const accepted = (
						await sql<{
							slotId: string
							action: string
						}>`SELECT a.slot_id AS "slotId",a.action FROM hcm.workflow_action_attempt a JOIN hcm.workflow_action_receipt r ON r.tenant_id=a.tenant_id AND r.attempt_id=a.id JOIN hcm.workflow_task t ON t.tenant_id=a.tenant_id AND t.id=a.task_id WHERE a.tenant_id=${tenant} AND t.instance_id=${instance.id} AND r.outcome='Accepted'`.execute(
							tx,
						)
					).rows
					const proofMissing = manifest.slots.some(
						/** Decided source slots need the matching accepted action receipt before task completion. */ (
							slot,
						) =>
							slot.state !== 'Pending' &&
							!accepted.some(
								/** Bind proof to the required slot and exact source outcome. */ (proof) =>
									proof.slotId === slot.id &&
									proof.action === (slot.state === 'Approved' ? 'Approve' : 'Reject'),
							),
					)
					if (proofMissing) {
						outcome = 'SourceProofMissing'
						await this.fail(tx, tenant, tasks, 'SourceProofMissing')
					} else {
						const terminal = manifest.safeFacts.sourceState !== 'Pending'
						const firstPendingStage = Math.min(
							...manifest.slots
								.filter(
									/** Source requirements determine stage order. */ (slot) =>
										slot.state === 'Pending',
								)
								.map(/** Preserve the required ordinal. */ (slot) => slot.stage),
						)
						for (const task of tasks) {
							const slot = manifest.slots.find(
								/** Requirement identity was checked above; match its current source state. */ (
									member,
								) => member.id === task.slotId,
							)
							if (!slot) throw new HcmWorkError('work-conflict')
							if (['Completed', 'Cancelled'].includes(task.state)) continue
							if (slot.state !== 'Pending') {
								await sql`UPDATE hcm.workflow_task SET state='Completed',revision=revision+1 WHERE tenant_id=${tenant} AND id=${task.id}`.execute(
									tx,
								)
							} else if (task.state === 'ActionPending') continue
							else if (terminal)
								await sql`UPDATE hcm.workflow_task SET state='Cancelled',revision=revision+1 WHERE tenant_id=${tenant} AND id=${task.id}`.execute(
									tx,
								)
							else if (slot.stage === firstPendingStage) {
								const candidates = await projection.candidates(caseId, slot.id)
								if (
									candidates.accountIds.length > 100 ||
									new Set(candidates.accountIds).size !== candidates.accountIds.length ||
									!/^[a-f0-9]{64}$/.test(candidates.digest)
								)
									throw new HcmWorkError('invalid-work')
								for (const id of candidates.accountIds) idValue(id, 'candidateAccountId')
								const ready = candidates.accountIds.length > 0
								const activation = task.availableAt ?? new Date()
								const availableAt = ready ? activation : task.availableAt
								const dueAt = ready
									? (task.dueAt ?? new Date(activation.getTime() + 48 * 3600000))
									: task.dueAt
								let assignment: string | null = null
								if (ready)
									assignment = candidates.accountIds.length === 1 ? 'Direct' : 'OfferToCandidates'
								await sql`UPDATE hcm.workflow_task SET state=${ready ? 'Ready' : 'Failed'},revision=revision+1,source_slot_revision=${slot.revision},expected_case_revision=${manifest.caseRevision},candidate_digest=${candidates.digest},assignment_mode=${assignment},available_at=${availableAt},due_at=${dueAt} WHERE tenant_id=${tenant} AND id=${task.id}`.execute(
									tx,
								)
								await sql`DELETE FROM hcm.workflow_task_candidate WHERE tenant_id=${tenant} AND task_id=${task.id}`.execute(
									tx,
								)
								for (const id of candidates.accountIds)
									await sql`INSERT INTO hcm.workflow_task_candidate(tenant_id,task_id,account_id) VALUES(${tenant},${task.id},${id})`.execute(
										tx,
									)
								if (!ready) await this.exception(tx, tenant, task.id, 'NoCandidates')
								else {
									await sql`UPDATE hcm.workflow_reconciliation_exception SET state='Resolved' WHERE tenant_id=${tenant} AND task_id=${task.id} AND state='Open'`.execute(
										tx,
									)
									for (const timer of [
										{ kind: 'Due', fire: 1, hours: 48 },
										{ kind: 'Reminder', fire: 1, hours: 24 },
										{ kind: 'Reminder', fire: 2, hours: 48 },
										{ kind: 'Reminder', fire: 3, hours: 72 },
										{ kind: 'Escalation', fire: 1, hours: 72 },
									])
										await sql`INSERT INTO hcm.workflow_task_timer(tenant_id,id,task_id,kind,fire_number,due_at) VALUES(${tenant},${randomUUID()},${task.id},${timer.kind},${timer.fire},${new Date(activation.getTime() + timer.hours * 3600000)}) ON CONFLICT(tenant_id,task_id,kind,fire_number) DO NOTHING`.execute(
											tx,
										)
								}
							}
						}
						await sql`UPDATE hcm.workflow_task_timer r SET state='Cancelled' FROM hcm.workflow_task t WHERE r.tenant_id=${tenant} AND r.tenant_id=t.tenant_id AND r.task_id=t.id AND t.instance_id=${instance.id} AND r.state='Pending' AND t.state IN ('Completed','Cancelled')`.execute(
							tx,
						)
						for (const stage of new Set(
							manifest.slots.map(/** Update each required stage once. */ (slot) => slot.stage),
						)) {
							const members = manifest.slots.filter(
								/** Preserve all-required source membership. */ (slot) => slot.stage === stage,
							)
							let state = 'Blocked'
							if (stage === firstPendingStage) state = 'Active'
							if (terminal) state = 'Cancelled'
							if (
								members.every(
									/** Every source slot must approve before a stage completes. */ (slot) =>
										slot.state === 'Approved',
								)
							)
								state = 'Completed'
							if (
								members.some(
									/** A single source rejection terminates its required stage. */ (slot) =>
										slot.state === 'Rejected',
								)
							)
								state = 'Rejected'
							await sql`UPDATE hcm.workflow_stage_instance SET state=${state},activated_at=CASE WHEN ${state}='Active' THEN coalesce(activated_at,clock_timestamp()) ELSE activated_at END WHERE tenant_id=${tenant} AND instance_id=${instance.id} AND stage=${stage} AND state<>${state}`.execute(
								tx,
							)
						}
						let state = 'Open'
						if (['Approved', 'Rejected'].includes(manifest.safeFacts.sourceState))
							state = 'Completed'
						if (manifest.safeFacts.sourceState === 'Cancelled') state = 'Cancelled'
						if (manifest.safeFacts.sourceState === 'Invalidated') state = 'Invalidated'
						await sql`UPDATE hcm.workflow_instance SET state=${state},revision=revision+1,source_case_revision=${manifest.caseRevision},manifest_digest=${digest},closed_at=CASE WHEN ${state}='Open' THEN NULL ELSE clock_timestamp() END WHERE tenant_id=${tenant} AND id=${instance.id}`.execute(
							tx,
						)
						outcome = terminal ? 'Closed' : 'Refreshed'
					}
				}
			}
		}
		await sql`INSERT INTO hcm.workflow_reconciliation_receipt(tenant_id,outbox_id,instance_id,outcome,manifest_digest) VALUES(${tenant},${work.id},${instance?.id ?? null},${outcome},${digest})`.execute(
			tx,
		)
		requireWorkloadScope(context, 'WorkflowReconcile')
	}
	/** A generation may change slot progress, never silently alter its required graph. */
	private sameRequirements(tasks: Task[], manifest: DomainApprovalManifest): boolean {
		return (
			tasks.length === manifest.slots.length &&
			tasks.every(
				/** Compare immutable source obligation facts against the original planned graph. */ (
					task,
				) =>
					manifest.slots.some(
						/** Match one exact source obligation. */ (slot) =>
							slot.id === task.slotId &&
							slot.stage === task.stage &&
							slot.ordinal === task.ordinal &&
							slot.independent === task.independent &&
							slot.distinctActors === task.distinctActors &&
							slot.candidateRuleCode === task.ruleId,
					),
			)
		)
	}
	/** Record a bounded operator-visible exception without private source content. */
	private async exception(
		tx: Transaction<WorkloadAuditTables>,
		tenant: string,
		taskId: string,
		code: string,
	) {
		await sql`INSERT INTO hcm.workflow_reconciliation_exception(tenant_id,id,task_id,code) VALUES(${tenant},${randomUUID()},${taskId},${code}) ON CONFLICT(tenant_id,task_id,code) DO UPDATE SET state='Open'`.execute(
			tx,
		)
	}
	/** Prevent stale ready tasks from admitting new actions; in-flight intents retain their original identity. */
	private async fail(
		tx: Transaction<WorkloadAuditTables>,
		tenant: string,
		tasks: Task[],
		code: string,
	) {
		for (const task of tasks) {
			if (['Completed', 'Cancelled'].includes(task.state)) continue
			await this.exception(tx, tenant, task.id, code)
			if (task.state !== 'ActionPending')
				await sql`UPDATE hcm.workflow_task SET state='Failed',revision=revision+1 WHERE tenant_id=${tenant} AND id=${task.id}`.execute(
					tx,
				)
		}
	}
}
