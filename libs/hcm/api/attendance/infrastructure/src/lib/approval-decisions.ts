import { sql, type Kysely } from 'kysely'
import { AttendanceApprovalPort } from '@empflowyee/hcm-api-attendance-application'
import type {
	AttendanceDecisionCommand,
	AttendanceApprovalCaseView,
} from '@empflowyee/hcm-attendance-contract'
import {
	requireAuthenticatedScope,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import type {
	WorkflowActionBinder,
	WorkflowSourceBinder,
} from '@empflowyee/hcm-api-workflow-application'
import type { WorkforceTimeContextBinder } from '@empflowyee/hcm-api-workforce-foundation-application'
import type { WorkflowAttemptView } from '@empflowyee/hcm-workflow-contract'

/** Source HTTP commands reuse existing Access transactions and the Workflow owner port. */
export class KyselyAttendanceApprovalPort extends AttendanceApprovalPort {
	/** Compose owner adapters without source-owned queries into Workflow storage. */
	constructor(
		private readonly database: HcmAccessDatabase | null,
		private readonly workforce: WorkforceTimeContextBinder,
		private readonly projections: WorkflowSourceBinder,
		private readonly actions: WorkflowActionBinder,
	) {
		super()
	}

	/** Resolve current scope only after Access has verified the independent operation grant. */
	private async subjects(tx: Kysely<unknown>, tenant: string, caseId: string) {
		const row = (
			await sql<{
				employmentId: string
				workDate: string
			}>`SELECT employment_id AS "employmentId",work_date::text AS "workDate" FROM hcm.attendance_approval_case WHERE tenant_id=${tenant} AND id=${caseId}`.execute(
				tx,
			)
		).rows[0]
		if (!row) throw new HcmDomainError('not-found')
		const facts = await this.workforce.bind(tx, tenant).read(row.employmentId, row.workDate)
		if (facts.state !== 'Available' || !facts.context.assignments.length)
			throw new HcmDomainError('record-incomplete')
		return facts.context.assignments.map(
			/** Preserve every current assignment's complete scope dimensions. */ (assignment) => ({
				employmentId: row.employmentId,
				legalEntityId: facts.context.legalEntityId,
				assignmentId: assignment.id,
				orgUnitId: assignment.orgUnitId,
				locationId: assignment.locationId,
				...(assignment.departmentId ? { departmentId: assignment.departmentId } : {}),
			}),
		)
	}

	/** Project source obligations and per-slot actions under independent read and candidate checks. */
	async read(
		context: AuthenticatedHcmContext,
		caseId: string,
	): Promise<AttendanceApprovalCaseView> {
		if (!this.database) throw new HcmDomainError('record-incomplete')
		const actor = requireAuthenticatedScope(context)
		return this.database.execute(
			context,
			{ permission: 'hcm.attendance.approve-attendance.read', entitlement: 'hcm.attendance' },
			false,
			/** Return no private reason, evidence, routing identities or unverified approval authority. */ async (
				scope,
			) => {
				const source = this.projections.bind(scope.transaction, actor.tenantId, 'Attendance')
				const manifest = await source.manifest(caseId)
				if (!manifest) throw new HcmDomainError('record-incomplete')
				const slots: AttendanceApprovalCaseView['slots'] = []
				for (const slot of manifest.slots) {
					const current =
						manifest.safeFacts.sourceState === 'Pending' &&
						slot.state === 'Pending' &&
						!manifest.slots.some(
							/** Earlier source obligations govern stage eligibility. */ (other) =>
								other.stage < slot.stage && other.state !== 'Approved',
						)
					const allowed =
						current &&
						(await source.candidates(caseId, slot.id)).accountIds.includes(actor.accountId)
					slots.push({
						id: slot.id,
						revision: slot.revision,
						stage: slot.stage,
						state: slot.state,
						allowedActions: allowed ? ['Approve', 'Reject'] : [],
					})
				}
				return {
					id: manifest.caseId,
					revision: manifest.caseRevision,
					subjectType: 'Override',
					subjectId: manifest.subjectId,
					subjectRevision: manifest.subjectRevision,
					generation: manifest.generation,
					state: manifest.safeFacts.sourceState,
					workDate: manifest.safeFacts.dateFrom,
					slots,
				}
			},
			/** Resolve private source coordinates inside the established Access boundary. */ (tx) =>
				this.subjects(tx as unknown as Kysely<unknown>, actor.tenantId, caseId),
		)
	}

	/** Capture a real source-slot action, preserving source revisions and the original actor key. */
	async decide(
		context: AuthenticatedHcmContext,
		caseId: string,
		slotId: string,
		key: string,
		input: AttendanceDecisionCommand,
	) {
		if (!this.database) throw new HcmDomainError('record-incomplete')
		const actor = requireAuthenticatedScope(context)
		return this.database.execute(
			context,
			{ permission: 'hcm.attendance.approve-attendance.decide', entitlement: 'hcm.attendance' },
			true,
			/** Workflow owns task lookup, immutable retries, encrypted intent and dispatch production. */ (
				scope,
			) =>
				this.actions
					.bind(scope.transaction, actor.tenantId)
					.submitSlot(context, 'Attendance', caseId, slotId, key, {
						expectedSourceRevision: input.expectedRevision,
						expectedSubjectRevision: input.expectedSubjectRevision,
						generation: input.generation,
						action: input.action,
						reason: input.reason,
					}),
			/** One complete current grant must cover the actual dated source before action admission. */ (
				tx,
			) => this.subjects(tx as unknown as Kysely<unknown>, actor.tenantId, caseId),
		)
	}

	/** Query the original key without resubmitting; fresh source read scope protects a recovered result. */
	async receipt(context: AuthenticatedHcmContext, key: string): Promise<WorkflowAttemptView> {
		if (!this.database) throw new HcmDomainError('record-incomplete')
		const actor = requireAuthenticatedScope(context)
		let result: WorkflowAttemptView | undefined
		return this.database.execute(
			context,
			{ permission: 'hcm.attendance.approve-attendance.read', entitlement: 'hcm.attendance' },
			false,
			/** Return only the source-authorized safe attempt already loaded in this transaction. */ async () => {
				if (!result) throw new HcmDomainError('not-found')
				return result
			},
			/** Workflow resolves its private actor key and independently calls current source read authorization. */ async (
				tx,
			) => {
				const recovered = await this.actions
					.bind(tx, actor.tenantId)
					.readKey(context, 'Attendance', key)
				result = recovered.attempt
				return this.subjects(tx as unknown as Kysely<unknown>, actor.tenantId, recovered.caseId)
			},
		)
	}
}
