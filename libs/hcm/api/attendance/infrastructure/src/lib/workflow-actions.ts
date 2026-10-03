import { randomUUID } from 'node:crypto'
import { sql, type Kysely, type Transaction } from 'kysely'
import {
	commandHash,
	HcmActionAuthorityResolver,
	HcmRuntimeError,
	HcmWorkError,
	requireAuthenticatedScope,
	requireHcmActionAuthority,
	requireWorkloadScope,
	type AuthenticatedHcmContext,
	type HcmWorkloadContext,
	type HcmActionAuthorizationBinder,
	type FieldCipher,
	type HcmActionAuthority,
} from '@empflowyee/hcm-api-runtime-application'
import { enqueueHcmWork } from '@empflowyee/hcm-api-runtime-infrastructure'
import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'
import {
	HcmAccessError,
	type HcmScopeSubject,
} from '@empflowyee/hcm-api-access-control-application'
import {
	TransactionalAccessPolicy,
	TransactionalActionAccessPolicy,
	type AccessTables,
} from '@empflowyee/hcm-api-access-control-infrastructure'
import { TransactionalAudit, type AuditTables } from '@empflowyee/hcm-api-audit-infrastructure'
import {
	evaluateAttendanceSourceDecision,
	type AttendanceSourceApproval,
	type AttendanceSourceApprovalSlot,
} from '@empflowyee/hcm-api-attendance-domain'
import {
	reviewAttendanceOverride,
	type AttendanceLeaveImpactBinder,
} from '@empflowyee/hcm-api-attendance-application'
import { evaluateOverrideWorkdayImpact } from '@empflowyee/hcm-api-attendance-application'
import {
	WorkflowSourceActionBinder,
	type WorkflowSourceActionPort,
	type WorkflowSourceActionIntent,
	type WorkflowSourceActionReceipt,
	type WorkflowSourceBinder,
} from '@empflowyee/hcm-api-workflow-application'
import type { WorkflowSource } from '@empflowyee/hcm-workflow-contract'
import type {
	WorkforceTimeContextBinder,
	WorkforceApprovalRoutingBinder,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import { KyselyAttendanceConfigurationInputBinder } from './configuration-inputs'
import { KyselyAttendancePeriodFenceBinder } from './period-fences'
import { readOverride } from './override-unit'
import { overrideApprovalRouting } from './override-approval-intake'

const decisionPermission = 'hcm.attendance.approve-attendance.decide'
const readPermission = 'hcm.attendance.approve-attendance.read'
interface CaseRow extends Omit<AttendanceSourceApproval, 'slots' | 'beneficiaryAccountIds'> {
	subjectId: string
	currentSubjectRevision: number
	employmentId: string
	workDate: string
	policyVersionId: string
	inputDigest: string
	routingDigest: string
}

/** Attendance alone applies source decisions; Workflow supplies immutable intent and existing human authority. */
class AttendanceWorkflowActions implements WorkflowSourceActionPort {
	/** Keep all authority checks, source effects and receipts in the caller's existing tenant transaction. */
	constructor(
		private readonly tx: Kysely<unknown>,
		private readonly tenant: string,
		private readonly workforce: WorkforceTimeContextBinder,
		private readonly routing: WorkforceApprovalRoutingBinder,
		private readonly projections: WorkflowSourceBinder,
		private readonly authorities: HcmActionAuthorizationBinder,
		private readonly cipher: FieldCipher,
		private readonly leave: AttendanceLeaveImpactBinder,
	) {}

	/** Reject mismatched RLS context before any source identity is exposed. */
	private async tenantBound() {
		const row = (
			await sql<{ tenant: string | null }>`SELECT hcm.current_tenant_id() AS tenant`.execute(
				this.tx,
			)
		).rows[0]
		if (!this.tx.isTransaction || row?.tenant !== this.tenant) throw new HcmDomainError('forbidden')
	}

	/** Lock source progress while retaining the submitted revision separately from current subject state. */
	private async source(caseId: string): Promise<CaseRow> {
		idValue(caseId, 'caseId')
		await this.tenantBound()
		const row = (
			await sql<CaseRow>`SELECT c.id,c.revision,c.generation,c.subject_revision AS "subjectRevision",c.state,
      c.schedule_override_id AS "subjectId",c.employment_id AS "employmentId",c.work_date::text AS "workDate",
      c.attendance_policy_version_id AS "policyVersionId",c.input_digest AS "inputDigest",c.routing_digest AS "routingDigest",
      c.requested_by_account_id AS "requesterAccountId",o.created_by_account_id AS "makerAccountId",o.revision AS "currentSubjectRevision"
      FROM hcm.attendance_approval_case c JOIN hcm.schedule_override o ON o.tenant_id=c.tenant_id AND o.id=c.schedule_override_id
      WHERE c.tenant_id=${this.tenant} AND c.id=${caseId} FOR UPDATE OF c`.execute(this.tx)
		).rows[0]
		if (!row) throw new HcmDomainError('not-found')
		return row
	}

	/** Derive current dated scope through Workforce; a missing assignment cannot become tenant-wide authority. */
	private async subjects(employmentId: string, date: string): Promise<HcmScopeSubject[]> {
		const facts = await this.workforce.bind(this.tx, this.tenant).read(employmentId, date)
		if (facts.state !== 'Available' || !facts.context.assignments.length)
			throw new HcmDomainError('record-incomplete')
		return facts.context.assignments.map(
			/** Keep dimensions from each actual assignment together. */ (assignment) => ({
				employmentId,
				legalEntityId: facts.context.legalEntityId,
				assignmentId: assignment.id,
				orgUnitId: assignment.orgUnitId,
				locationId: assignment.locationId,
				...(assignment.departmentId ? { departmentId: assignment.departmentId } : {}),
			}),
		)
	}

	/** Bind the fixed source generation and dated subject, without retaining private employee data in the authority reference. */
	private binding(source: CaseRow, intentDigest: string) {
		return {
			permission: decisionPermission,
			intentDigest,
			scopeReference: commandHash('AttendanceDecisionScope:1', {
				tenant: this.tenant,
				caseId: source.id,
				generation: source.generation,
				subjectId: source.subjectId,
				employmentId: source.employmentId,
				workDate: source.workDate,
			}),
		}
	}

	/** Require the independent source read operation over the actual dated employment, including after closure. */
	async authorizeRead(context: AuthenticatedHcmContext, caseId: string): Promise<void> {
		const actor = requireAuthenticatedScope(context)
		if (actor.tenantId !== this.tenant) throw new HcmDomainError('forbidden')
		const access = new TransactionalAccessPolicy(
			this.tx as unknown as Transaction<AccessTables>,
			context,
		)
		await access.require(
			{ permission: readPermission, entitlement: 'hcm.attendance' },
			/** Resolve private coordinates only after the independent operation check. */ async () => {
				const source = await this.source(caseId)
				return this.subjects(source.employmentId, source.workDate)
			},
		)
	}

	/** Recheck source operation, current candidate and stage before Workflow captures an online intent. */
	async authorize(context: AuthenticatedHcmContext, caseId: string, slotId: string) {
		await this.authorizeRead(context, caseId)
		const source = await this.source(caseId),
			actor = requireAuthenticatedScope(context)
		await new TransactionalAccessPolicy(
			this.tx as unknown as Transaction<AccessTables>,
			context,
		).require({
			permission: decisionPermission,
			entitlement: 'hcm.attendance',
			subjects: await this.subjects(source.employmentId, source.workDate),
		})
		const manifest = await this.projections
			.bind(this.tx, this.tenant, 'Attendance')
			.manifest(caseId)
		const slot = manifest?.slots.find(
			/** Match only the requested source obligation. */ (item) => item.id === slotId,
		)
		if (
			!manifest ||
			!slot ||
			source.state !== 'Pending' ||
			slot.state !== 'Pending' ||
			manifest.slots.some(
				/** Every earlier source stage must finish first. */ (item) =>
					item.stage < slot.stage && item.state !== 'Approved',
			)
		)
			throw new HcmDomainError('revision-conflict')
		const candidates = await this.projections
			.bind(this.tx, this.tenant, 'Attendance')
			.candidates(caseId, slotId)
		if (!candidates.accountIds.includes(actor.accountId)) throw new HcmDomainError('forbidden')
		const { permission, scopeReference } = this.binding(source, '0'.repeat(64))
		return { permission, scopeReference }
	}

	/** Query original source proof before considering expiry or re-execution; mismatched retries never recover another intent. */
	async query(
		context: HcmWorkloadContext,
		intent: WorkflowSourceActionIntent,
	): Promise<WorkflowSourceActionReceipt | null> {
		const scope = requireWorkloadScope(context, 'WorkflowDispatch')
		await this.tenantBound()
		if (scope.tenantId !== this.tenant || intent.source !== 'Attendance')
			throw new HcmWorkError('work-conflict')
		const row = (
			await sql<WorkflowSourceActionReceipt>`SELECT id,dispatch_key::text AS "dispatchKey",intent_digest AS "intentDigest",
      case_id AS "caseId",slot_id AS "slotId",actor_account_id AS "actorAccountId",generation,outcome,
      case_revision AS "caseRevision",subject_revision AS "subjectRevision",decision_id AS "decisionId",safe_failure_code AS "safeFailureCode"
      FROM hcm.attendance_decision_receipt WHERE tenant_id=${this.tenant} AND dispatch_key=${intent.dispatchKey}::uuid`.execute(
				this.tx,
			)
		).rows[0]
		if (
			row &&
			(row.intentDigest !== intent.intentDigest ||
				row.caseId !== intent.caseId ||
				row.slotId !== intent.slotId ||
				row.actorAccountId !== intent.actorAccountId ||
				row.generation !== intent.generation)
		)
			throw new HcmWorkError('work-conflict')
		return row ?? null
	}

	/** Retain immutable safe proof for both accepted decisions and terminal rejected attempts. */
	private async receipt(
		intent: WorkflowSourceActionIntent,
		source: CaseRow,
		outcome: WorkflowSourceActionReceipt['outcome'],
		safeFailureCode: string | null,
		decisionId: string | null = null,
	): Promise<WorkflowSourceActionReceipt> {
		const result: WorkflowSourceActionReceipt = {
			id: randomUUID(),
			dispatchKey: intent.dispatchKey,
			intentDigest: intent.intentDigest,
			caseId: intent.caseId,
			slotId: intent.slotId,
			actorAccountId: intent.actorAccountId,
			generation: intent.generation,
			outcome,
			caseRevision: source.revision,
			subjectRevision: source.currentSubjectRevision,
			decisionId,
			safeFailureCode,
		}
		await sql`INSERT INTO hcm.attendance_decision_receipt(tenant_id,id,dispatch_key,intent_digest,case_id,slot_id,actor_account_id,generation,outcome,case_revision,subject_revision,decision_id,safe_failure_code)
      VALUES(${this.tenant},${result.id},${result.dispatchKey}::uuid,${result.intentDigest},${result.caseId},${result.slotId},${result.actorAccountId},${result.generation},${result.outcome},${result.caseRevision},${result.subjectRevision},${result.decisionId},${result.safeFailureCode})`.execute(
			this.tx,
		)
		return result
	}

	/** Close obsolete source requirements without applying the subject or carrying decisions into another generation. */
	private async invalidate(
		intent: WorkflowSourceActionIntent,
		source: CaseRow,
		authority: HcmActionAuthority,
	) {
		if (source.state === 'Pending') {
			await sql`UPDATE hcm.attendance_approval_case SET state='Invalidated',revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=${this.tenant} AND id=${source.id} AND state='Pending' AND revision=${source.revision}`.execute(
				this.tx,
			)
			source.revision++
			source.state = 'Invalidated'
			await new TransactionalAudit(this.tx as Kysely<AuditTables>, authority).append({
				action: 'attendance.override-invalidated',
				category: 'business',
				targetType: 'attendance-schedule-override',
				targetId: source.subjectId,
				requestId: intent.dispatchKey,
				summary: {
					reason: null,
					changedFields: ['approval'],
					fromState: 'Pending',
					toState: 'Invalidated',
				},
			})
		}
		return this.receipt(intent, source, 'Stale', 'SourceInputsChanged')
	}

	/** Apply one source-owned decision after fresh human, candidate, routing and full impact checks; never synthesize an online session. */
	async decide(
		context: HcmWorkloadContext,
		reference: string,
		intent: WorkflowSourceActionIntent,
	): Promise<WorkflowSourceActionReceipt> {
		const prior = await this.query(context, intent)
		if (prior) return prior
		const source = await this.source(intent.caseId)
		let authority: HcmActionAuthority
		const binding = this.binding(source, intent.intentDigest)
		let subjects: HcmScopeSubject[]
		try {
			authority = await new HcmActionAuthorityResolver(
				this.authorities.bind(this.tx, this.tenant),
			).resolve(context, reference, binding)
			if (requireHcmActionAuthority(authority).accountId !== intent.actorAccountId)
				throw new HcmRuntimeError('forbidden')
			subjects = await this.subjects(source.employmentId, source.workDate)
			await new TransactionalActionAccessPolicy(
				this.tx as unknown as Transaction<AccessTables>,
				authority,
				binding.scopeReference,
			).require({
				permission: decisionPermission,
				entitlement: 'hcm.attendance',
				subjects,
			})
		} catch (error) {
			if (error instanceof HcmRuntimeError || error instanceof HcmAccessError)
				return this.receipt(intent, source, 'Denied', 'AuthorityUnavailable')
			if (error instanceof HcmDomainError)
				return this.receipt(intent, source, 'Stale', 'DatedScopeUnavailable')
			throw error
		}
		const slots = (
			await sql<AttendanceSourceApprovalSlot>`SELECT id,revision,stage,independent,distinct_actors AS "distinctActors",state,decided_by_account_id AS "decidedBy" FROM hcm.attendance_approval_slot WHERE tenant_id=${this.tenant} AND case_id=${source.id} ORDER BY stage,ordinal`.execute(
				this.tx,
			)
		).rows
		const candidates = await this.projections
			.bind(this.tx, this.tenant, 'Attendance')
			.candidates(source.id, intent.slotId)
		const evaluation = evaluateAttendanceSourceDecision(
			{ ...source, slots, beneficiaryAccountIds: [] },
			intent,
			{
				accountId: intent.actorAccountId,
				sessionValid: true,
				operationAndScopeAllowed: true,
				currentCandidateAccountIds: candidates.accountIds,
				currentSubjectRevision: source.currentSubjectRevision,
				routingBasisUnchanged: true,
			},
		)
		// Candidate discovery already excludes every account linked to the beneficiary.
		if (evaluation.outcome !== 'Accepted')
			return this.receipt(
				intent,
				source,
				evaluation.outcome,
				'reason' in evaluation ? evaluation.reason : 'CaseClosed',
			)
		const access = new TransactionalActionAccessPolicy(
			this.tx as unknown as Transaction<AccessTables>,
			authority,
			binding.scopeReference,
		)
		const inputs = new KyselyAttendanceConfigurationInputBinder(this.workforce)
		let review: Awaited<ReturnType<typeof reviewAttendanceOverride>>
		try {
			review = await reviewAttendanceOverride(
				{
					read: /** Reuse the safe owner projection under the verified source coordinates. */ (
						id,
					) => readOverride(this.tx, this.tenant, id),
					inputs: inputs.bind(this.tx, this.tenant),
					proposedInputs:
					/** Feed the exact Draft into the existing production resolver without temporary SQL mutation. */ (
						draft,
					) => inputs.bind(this.tx, this.tenant, draft),
					periods: new KyselyAttendancePeriodFenceBinder().bind(this.tx, this.tenant),
					leaveImpact: this.leave.bind(this.tx, this.tenant),
					requireImpactDate:
					/** Require one complete current grant over the accumulated dated range. */ async (
						date,
					) => {
						subjects.push(...(await this.subjects(source.employmentId, date)))
						await access.require({
							permission: decisionPermission,
							entitlement: 'hcm.attendance',
							subjects,
						})
					},
					requireBasis:
					/** Serialize source date and immutable workday before consuming reviewed input. */ async (
						employment,
						date,
						revision,
					) => {
						await sql`SELECT pg_advisory_xact_lock(hashtextextended(${this.tenant + ':dated-source:' + employment + ':' + date},0))`.execute(
							this.tx,
						)
						await sql`SELECT pg_advisory_xact_lock(hashtextextended(${this.tenant + ':workday:' + employment + ':' + date},0))`.execute(
							this.tx,
						)
						const basis = (
							await sql<{
								id: string
								revision: number
							}>`SELECT id,revision FROM hcm.published_workday WHERE tenant_id=${this.tenant} AND employment_id=${employment} AND work_date=${date}::date ORDER BY revision DESC LIMIT 1`.execute(
								this.tx,
							)
						).rows[0]
						if (!basis || basis.revision !== revision)
							throw new HcmDomainError('revision-conflict')
						return basis.id
					},
				},
				source.subjectId,
				source.subjectRevision,
			)
			const routing = await overrideApprovalRouting(
				this.tx,
				this.tenant,
				this.routing,
				review.source,
				review.policy.version.versionId,
				review.policy.workforce.inputDigest,
			)
			if (
				review.digest !== source.inputDigest ||
				routing.digest !== source.routingDigest ||
				review.policy.version.versionId !== source.policyVersionId
			)
				return this.invalidate(intent, source, authority)
			if (review.leaveImpact.unavailableRequestCount)
				return this.receipt(intent, source, 'Conflict', 'LeaveImpactUnavailable')
		} catch (error) {
			if (error instanceof HcmRuntimeError || error instanceof HcmAccessError)
				return this.receipt(intent, source, 'Denied', 'AuthorityUnavailable')
			if (error instanceof HcmDomainError) return this.invalidate(intent, source, authority)
			throw error
		}
		requireHcmActionAuthority(authority)
		const decisionId = randomUUID()
		const sealed = await this.cipher
			.bind(this.tx, this.tenant)
			.encrypt(
				{ table: 'attendance_decision', column: 'encrypted_reason', rowId: decisionId },
				intent.reason,
			)
		await sql`INSERT INTO hcm.attendance_decision(tenant_id,id,case_id,slot_id,actor_account_id,action,case_revision,slot_revision,subject_revision,generation,command_key,input_digest,encrypted_reason,reason_key_version)
      VALUES(${this.tenant},${decisionId},${source.id},${intent.slotId},${intent.actorAccountId},${intent.action},${source.revision},${intent.expectedSlotRevision},${source.subjectRevision},${source.generation},${intent.dispatchKey}::uuid,${intent.intentDigest},${sealed.ciphertext},${sealed.keyVersion})`.execute(
			this.tx,
		)
		await sql`UPDATE hcm.attendance_approval_slot SET state=${evaluation.slotState},revision=revision+1,decided_by_account_id=${intent.actorAccountId},decided_at=clock_timestamp() WHERE tenant_id=${this.tenant} AND id=${intent.slotId} AND case_id=${source.id}`.execute(
			this.tx,
		)
		await sql`UPDATE hcm.attendance_approval_case SET state=${evaluation.caseState},revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=${this.tenant} AND id=${source.id}`.execute(
			this.tx,
		)
		source.revision++
		if (evaluation.caseState === 'Approved') {
			await sql`UPDATE hcm.schedule_override SET state='Approved',revision=revision+1,approval_digest=${review.digest},approved_at=clock_timestamp(),approved_by_account_id=${intent.actorAccountId},updated_at=clock_timestamp() WHERE tenant_id=${this.tenant} AND id=${source.subjectId} AND state='Draft' AND revision=${source.subjectRevision}`.execute(
				this.tx,
			)
			source.currentSubjectRevision++
			const days = await evaluateOverrideWorkdayImpact(
				inputs.bind(this.tx, this.tenant),
				source.employmentId,
				source.workDate,
				/** Authority already covers all reviewed dates; recheck the identical complete scope during application. */ async () => {
					await access.require({
						permission: decisionPermission,
						entitlement: 'hcm.attendance',
						subjects,
					})
				},
			)
			if (
				commandHash('OverrideResolvedDays:1', days) !==
				commandHash('OverrideResolvedDays:1', review.days)
			)
				throw new HcmDomainError('revision-conflict')
			for (const day of days)
				await enqueueHcmWork(this.tx as Transaction<unknown>, this.tenant, {
					workload: 'AttendanceResolve',
					kind: 'attendance.workday.resolve',
					schemaVersion: 1,
					businessKey: `${source.employmentId}:${day.workDate}:${day.result.inputDigest}`,
					payload: {
						employmentId: source.employmentId,
						workDate: day.workDate,
						inputDigest: day.result.inputDigest,
					},
				})
		}
		await new TransactionalAudit(this.tx as Kysely<AuditTables>, authority).append({
			action: 'attendance.override-decided',
			category: 'business',
			targetType: 'attendance-schedule-override',
			targetId: source.subjectId,
			requestId: intent.dispatchKey,
			summary: {
				reason: null,
				changedFields: ['approval'],
				fromState: 'Pending',
				toState: evaluation.caseState,
			},
		})
		requireHcmActionAuthority(authority)
		return this.receipt(intent, source, 'Accepted', null, decisionId)
	}
}

/** Register only the implemented Attendance source; unsupported sources never receive fallback authority. */
export class KyselyAttendanceWorkflowActionBinder extends WorkflowSourceActionBinder {
	/** Compose existing owner adapters without a Workflow-to-Attendance implementation import. */
	constructor(
		private readonly workforce: WorkforceTimeContextBinder,
		private readonly routing: WorkforceApprovalRoutingBinder,
		private readonly projections: WorkflowSourceBinder,
		private readonly authorities: HcmActionAuthorizationBinder,
		private readonly cipher: FieldCipher,
		private readonly leave: AttendanceLeaveImpactBinder,
	) {
		super()
	}
	/** Keep source effects on the verified caller transaction and exact registered source. */
	bind(transaction: unknown, tenantId: string, source: WorkflowSource): WorkflowSourceActionPort {
		const tx = transaction as Kysely<unknown>
		if (!tx?.isTransaction || source !== 'Attendance') throw new HcmDomainError('forbidden')
		return new AttendanceWorkflowActions(
			tx,
			tenantId,
			this.workforce,
			this.routing,
			this.projections,
			this.authorities,
			this.cipher,
			this.leave,
		)
	}
}
