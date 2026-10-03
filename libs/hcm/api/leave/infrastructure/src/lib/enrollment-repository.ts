import { randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { HcmDomainError, dateValue, idValue } from '@empflowyee/hcm-runtime-contract'
import { commandHash, type BoundFieldCipher } from '@empflowyee/hcm-api-runtime-application'
import type { LeaveEnrollmentView, LeavePeriodView } from '@empflowyee/hcm-leave-contract'
import type {
	LeaveEnrollmentAdmission,
	LeaveEnrollmentRepository,
} from '@empflowyee/hcm-api-leave-application'

/** Persist Leave-owned enrollment evidence inside a caller-authorized transaction; no permission or eligibility is inferred here. */
export class KyselyLeaveEnrollmentRepository implements LeaveEnrollmentRepository {
	/** Retain the existing tenant transaction and identity-bound encryption capability. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenantId: string,
		private readonly accountId: string,
		private readonly cipher: BoundFieldCipher,
	) {
		if (!transaction.isTransaction)
			throw new Error('Leave enrollments require a tenant transaction')
		idValue(tenantId, 'tenantId')
		idValue(accountId, 'accountId')
	}

	/** Reject a repository reused after the transaction's tenant changes. */
	private async requireTenant(): Promise<void> {
		const current = await sql<{
			tenant: string | null
		}>`SELECT hcm.current_tenant_id() AS tenant`.execute(this.transaction)
		if (current.rows[0]?.tenant !== this.tenantId) throw new HcmDomainError('forbidden')
	}

	/** Hold the selected explicit period against concurrent close while returning only business fields. */
	async periodAt(workDate: string): Promise<LeavePeriodView | null> {
		await this.requireTenant()
		dateValue(workDate, 'workDate')
		const found =
			await sql<LeavePeriodView>`SELECT id,code,name,start_date::text AS "startDate",end_date::text AS "endDate",state,revision
      FROM hcm.leave_period WHERE tenant_id=${this.tenantId} AND effective_period @> ${workDate}::date FOR SHARE`.execute(
			this.transaction,
		)
		return found.rows[0] ?? null
	}

	/** Map the exact owner row without exposing encrypted eligibility, employee facts or persistence columns. */
	async read(id: string): Promise<LeaveEnrollmentView | null> {
		await this.requireTenant()
		idValue(id, 'id')
		const found = await sql<{
			value: LeaveEnrollmentView
		}>`SELECT jsonb_strip_nulls(jsonb_build_object(
      'id',e.id,'revision',e.revision,'employmentId',e.employment_id,'policyVersionId',e.policy_version_id,
      'effectiveFrom',e.effective_from::text,'effectiveTo',e.effective_to::text,'trackingMode',e.tracking_mode,
      'state',e.state,'accountId',a.id)) AS value
      FROM hcm.leave_enrollment e LEFT JOIN hcm.leave_balance_account a ON a.tenant_id=e.tenant_id AND a.enrollment_id=e.id
      WHERE e.tenant_id=${this.tenantId} AND e.id=${id}`.execute(this.transaction)
		return found.rows[0]?.value ?? null
	}

	/** Commit immutable eligibility references and an unfunded Balance account without manufacturing a grant. */
	async insert(input: LeaveEnrollmentAdmission): Promise<LeaveEnrollmentView> {
		await this.requireTenant()
		const period = await this.periodAt(input.effectiveFrom)
		if (!period || period.id !== input.periodId) throw new HcmDomainError('record-incomplete')
		const version = await sql<{ revision: number }>`SELECT revision FROM hcm.leave_policy_version
      WHERE tenant_id=${this.tenantId} AND id=${input.policyVersionId} AND policy_id=${input.policyId} FOR SHARE`.execute(
			this.transaction,
		)
		if (!version.rows[0]) throw new HcmDomainError('not-found')
		if (
			period.revision !== input.basis.periodRevision ||
			version.rows[0].revision !== input.basis.policyRevision
		)
			throw new HcmDomainError('revision-conflict')
		const snapshot = { ...input, basis: input.basis }
		const sealed = await this.cipher.encrypt(
			{ table: 'leave_enrollment', column: 'encrypted_eligibility_snapshot', rowId: input.id },
			JSON.stringify(snapshot),
		)
		await sql`INSERT INTO hcm.leave_enrollment(tenant_id,id,employment_id,policy_id,policy_version_id,period_id,tracking_mode,unit,source,state,effective_from,effective_to,eligibility_digest,encrypted_eligibility_snapshot,eligibility_key_version,created_by_account_id)
      VALUES(${this.tenantId},${input.id},${input.employmentId},${input.policyId},${input.policyVersionId},${input.periodId},${input.trackingMode},${input.unit},'Eligibility','Active',${input.effectiveFrom}::date,${input.effectiveTo}::date,${commandHash('LeaveEnrollment:1', snapshot)},${sealed.ciphertext},${sealed.keyVersion},${this.accountId})`.execute(
			this.transaction,
		)
		if (input.trackingMode === 'Balance')
			await sql`INSERT INTO hcm.leave_balance_account(tenant_id,id,enrollment_id,unit)
        VALUES(${this.tenantId},${randomUUID()},${input.id},${input.unit})`.execute(
			this.transaction,
		)
		const stored = await this.read(input.id)
		if (!stored) throw new Error('Enrollment write was not visible in its transaction')
		return stored
	}
}
