import { randomUUID } from 'node:crypto'
import { Temporal } from '@js-temporal/polyfill'
import { sql, type Kysely } from 'kysely'
import type {
	AttendanceOverrideView,
	AttendanceOverrideSubmission,
} from '@empflowyee/hcm-attendance-contract'
import type {
	WorkflowSourceBinder,
	WorkflowIntakeBinder,
} from '@empflowyee/hcm-api-workflow-application'
import type { WorkforceApprovalRoutingBinder } from '@empflowyee/hcm-api-workforce-foundation-application'
import { commandHash } from '@empflowyee/hcm-api-runtime-application'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'

/** Capture published policy obligations and queue their manifest in the already authorized source transaction. */
export class SqlOverrideApprovalIntake {
	/** Keep source writes and cross-domain intake on one transaction through owner ports. */
	constructor(
		private readonly tx: Kysely<unknown>,
		private readonly tenantId: string,
		private readonly accountId: string,
		private readonly sources: WorkflowSourceBinder,
		private readonly intake: WorkflowIntakeBinder,
		private readonly routing: WorkforceApprovalRoutingBinder,
	) {}
	/** Open one pending generation; required approval is not a lifecycle mutation of the override or its prior workday. */
	async request(
		source: AttendanceOverrideView,
		policyVersionId: string,
		inputDigest: string,
		workforceDigest: string,
	): Promise<AttendanceOverrideSubmission> {
		const { rules, digest: routingDigest } = await overrideApprovalRouting(
			this.tx,
			this.tenantId,
			this.routing,
			source,
			policyVersionId,
			workforceDigest,
		)
		const generation = (
			await sql<{
				generation: number
			}>`SELECT coalesce(max(generation),0)+1 AS generation FROM hcm.attendance_approval_case WHERE tenant_id=${this.tenantId} AND schedule_override_id=${source.id}`.execute(
				this.tx,
			)
		).rows[0].generation
		const caseId = randomUUID()
		await sql`INSERT INTO hcm.attendance_approval_case(tenant_id,id,subject_type,schedule_override_id,employment_id,work_date,attendance_policy_version_id,subject_revision,generation,input_digest,routing_digest,requested_by_account_id) VALUES(${this.tenantId},${caseId},'Override',${source.id},${source.employmentId},${source.workDate}::date,${policyVersionId},${source.revision},${generation},${inputDigest},${routingDigest},${this.accountId})`.execute(
			this.tx,
		)
		for (const rule of rules)
			await sql`INSERT INTO hcm.attendance_approval_slot(tenant_id,id,case_id,attendance_policy_version_id,rule_id,stage,ordinal,independent,distinct_actors) VALUES(${this.tenantId},${randomUUID()},${caseId},${policyVersionId},${rule.id},${rule.stage},${rule.ordinal},${rule.independent},false)`.execute(
				this.tx,
			)
		const manifest = await this.sources.bind(this.tx, this.tenantId, 'Attendance').manifest(caseId)
		if (!manifest) throw new HcmDomainError('record-incomplete')
		const work = await this.intake.bind(this.tx, this.tenantId).enqueue(manifest)
		return {
			id: source.id,
			revision: source.revision,
			state: 'PendingApproval',
			caseId,
			caseRevision: 1,
			generation,
			operationId: work.operationId,
		}
	}
}

/** Recompute the exact policy and current reporting basis used when opening source obligations. */
export async function overrideApprovalRouting(
	tx: Kysely<unknown>,
	tenantId: string,
	routingBinder: WorkforceApprovalRoutingBinder,
	source: AttendanceOverrideView,
	policyVersionId: string,
	workforceDigest: string,
) {
	const rules = (
		await sql<{
			id: string
			ordinal: number
			stage: number
			independent: boolean
			candidateSource: string
			managerLevel: number | null
			accountId: string | null
			functionCode: string | null
		}>`SELECT id,ordinal,stage,independent,candidate_source AS "candidateSource",manager_level AS "managerLevel",account_id AS "accountId",function_code AS "functionCode" FROM hcm.attendance_approval_rule WHERE tenant_id=${tenantId} AND version_id=${policyVersionId} AND subject_type='Override' ORDER BY ordinal`.execute(
			tx,
		)
	).rows
	if (!rules.length) throw new HcmDomainError('record-incomplete')
	const asOf = Temporal.Now.instant().toZonedDateTimeISO(source.zone).toPlainDate().toString()
	const routing = []
	for (const rule of rules) {
		let level: number | null = null
		if (rule.candidateSource === 'LineManager') level = 1
		if (rule.candidateSource === 'ManagerLevel') level = rule.managerLevel
		routing.push({
			rule,
			routing: await routingBinder.bind(tx, tenantId).read(source.employmentId, asOf, level),
		})
	}
	const digest = commandHash('OverrideApprovalRouting:1', {
		policyVersionId,
		workforceDigest,
		routing,
	})
	return { rules, digest }
}
