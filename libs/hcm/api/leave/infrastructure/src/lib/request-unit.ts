import { Temporal } from '@js-temporal/polyfill'
import { sql, type Kysely } from 'kysely'
import {
	HcmAccessDatabase,
	TransactionalAccessPolicy,
} from '@empflowyee/hcm-api-access-control-infrastructure'
import type { HcmScopeSubject } from '@empflowyee/hcm-api-access-control-application'
import { classifyConstraint } from '@empflowyee/hcm-api-database-kysely'
import {
	requireAuthenticatedTenant,
	requireAuthenticatedAccount,
	type AuthenticatedHcmContext,
	type FieldCipher,
} from '@empflowyee/hcm-api-runtime-application'
import type {
	WorkforceTimeContextBinder,
	WorkforceApprovalRoutingBinder,
	WorkforceLeaveEligibilityBinder,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import type { AttendancePublishedWorkdayBinder } from '@empflowyee/hcm-api-attendance-application'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'
import type { LeaveRequestDraft, LeavePeriodView } from '@empflowyee/hcm-leave-contract'
import {
	LeaveRequestDraftUnit,
	type LeaveRequestDraftWork,
} from '@empflowyee/hcm-api-leave-application'
import { KyselyLeaveEnrollmentRepository } from './enrollment-repository'
import { KyselyLeavePolicyRepository } from './hcm-api-leave-infrastructure'
import { SqlLeavePolicyReceipts } from './policy-unit'
import { KyselyLeaveRequestRepository } from './request-repository'

/** Bind self requests to current Access authority and minimal Workforce ownership facts, never a UI persona or supplied person ID. */
export class KyselyLeaveRequestDraftUnit extends LeaveRequestDraftUnit {
	/** Compose existing owner ports; Leave performs no Workforce or Attendance SQL queries. */
	constructor(
		private readonly database: HcmAccessDatabase | null,
		private readonly cipher: FieldCipher,
		private readonly workforce: WorkforceTimeContextBinder,
		private readonly ownership: WorkforceApprovalRoutingBinder,
		private readonly eligibility: WorkforceLeaveEligibilityBinder,
		private readonly workdays: AttendancePublishedWorkdayBinder,
	) {
		super()
	}
	/** Check operation first, then one complete dated grant, then exact self ownership before reading private eligibility or storing a Draft. */
	async execute<T>(
		context: AuthenticatedHcmContext,
		target: LeaveRequestDraft | { id: string },
		operation: 'read' | 'draft',
		work: (scope: LeaveRequestDraftWork) => Promise<T>,
	): Promise<T> {
		if (!this.database) throw new HcmDomainError('record-incomplete')
		const tenant = requireAuthenticatedTenant(context),
			actor = requireAuthenticatedAccount(context)
		let admission: LeaveRequestDraftWork['admission'],
			subjects: HcmScopeSubject[] = [],
			employmentId = '',
			from = '',
			missing = false,
			unavailable = false
		try {
			return await this.database.execute(
				context,
				{ permission: `hcm.leave.apply-leave.${operation}`, entitlement: 'hcm.leave' },
				operation === 'draft',
				/** Self relation is an extra restriction, never a replacement for the operation grant. */ async (
					access,
				) => {
					if (missing) throw new HcmDomainError('not-found')
					if (unavailable) throw new HcmDomainError('record-incomplete')
					const tx = access.transaction as unknown as Kysely<unknown>
					const owner = await this.ownership.bind(tx, tenant).read(employmentId, from, null)
					if (!access.actor.personId || owner?.beneficiaryPersonId !== access.actor.personId)
						throw new HcmDomainError('forbidden')
					const repository = new KyselyLeaveRequestRepository(
						tx,
						tenant,
						actor,
						this.cipher.bind(tx, tenant),
					)
					const result = await work({
						admission,
						workdays: this.workdays.bind(tx, tenant),
						eligibility: this.eligibility.bind(tx, tenant),
						receipts: new SqlLeavePolicyReceipts(tx, tenant, actor, this.cipher.bind(tx, tenant)),
						audit: access.audit,
						read: /** Preserve the owning repository's safe projection. */ (id) =>
							repository.read(id),
						insert:
						/** Persist only after the application completes actual source calculation and eligibility. */ (
							evidence,
						) => repository.insert(evidence),
						requireRead:
						/** Revocation affects duplicate-result recovery as well as ordinary GET. */ async () => {
							await new TransactionalAccessPolicy(access.transaction, context).require({
								permission: 'hcm.leave.apply-leave.read',
								entitlement: 'hcm.leave',
								subjects,
							})
						},
					})
					requireAuthenticatedTenant(context)
					return result
				},
				/** Resolve only the dated scope needed by Access after it has verified the operation and entitlement. */ async (
					transaction,
				) => {
					const tx = transaction as unknown as Kysely<unknown>
					let to: string
					if ('id' in target) {
						const root = (
							await sql<{
								employmentId: string
								from: string
								to: string
							}>`SELECT employment_id AS "employmentId",start_date::text AS "from",end_date::text AS "to" FROM hcm.leave_request WHERE tenant_id=${tenant} AND id=${target.id}`.execute(
								tx,
							)
						).rows[0]
						if (!root) {
							missing = true
							return [{}]
						}
						employmentId = root.employmentId
						from = root.from
						to = root.to
					} else {
						employmentId = target.employmentId
						const dates = target.days
							.map(
								/** Use explicit request-date bounds for the complete scope check. */ (day) =>
									day.workDate,
							)
							.sort()
						from = dates[0]
						to = dates[dates.length - 1]
						const root = (
							await sql<{
								periodId: string
								policyId: string
								policyVersionId: string
								employmentId: string
							}>`SELECT period_id AS "periodId",policy_id AS "policyId",policy_version_id AS "policyVersionId",employment_id AS "employmentId" FROM hcm.leave_enrollment WHERE tenant_id=${tenant} AND id=${target.enrollmentId}`.execute(
								tx,
							)
						).rows[0]
						if (!root || root.employmentId !== employmentId) {
							missing = true
							return [{ employmentId }]
						}
						const period = (
							await sql<LeavePeriodView>`SELECT id,revision,code,name,state,start_date::text AS "startDate",end_date::text AS "endDate" FROM hcm.leave_period WHERE tenant_id=${tenant} AND id=${root.periodId} FOR SHARE`.execute(
								tx,
							)
						).rows[0]
						await sql`SELECT id FROM hcm.leave_policy_version WHERE tenant_id=${tenant} AND id=${root.policyVersionId} FOR SHARE`.execute(
							tx,
						)
						await sql`SELECT id FROM hcm.leave_enrollment WHERE tenant_id=${tenant} AND id=${target.enrollmentId} FOR SHARE`.execute(
							tx,
						)
						const policy = await new KyselyLeavePolicyRepository(tx, tenant, actor).read(
							root.policyId,
							root.policyVersionId,
						)
						const enrollment = await new KyselyLeaveEnrollmentRepository(
							tx,
							tenant,
							actor,
							this.cipher.bind(tx, tenant),
						).read(target.enrollmentId)
						if (!period || !policy || !enrollment) {
							unavailable = true
							return [{ employmentId }]
						}
						admission = { policy, period, enrollment: { ...enrollment, periodId: root.periodId } }
					}
					const rows = new Map<string, HcmScopeSubject>()
					for (
						let date = Temporal.PlainDate.from(from);
						Temporal.PlainDate.compare(date, to) <= 0;
						date = date.add({ days: 1 })
					) {
						const facts = await this.workforce.bind(tx, tenant).read(employmentId, date.toString())
						if (facts.state !== 'Available' || !facts.context.assignments.length) {
							unavailable = true
							continue
						}
						for (const assignment of facts.context.assignments) {
							const subject = {
								employmentId,
								legalEntityId: facts.context.legalEntityId,
								assignmentId: assignment.id,
								orgUnitId: assignment.orgUnitId,
								locationId: assignment.locationId,
								...(assignment.departmentId ? { departmentId: assignment.departmentId } : {}),
							}
							rows.set(JSON.stringify(subject), subject)
						}
					}
					subjects = rows.size ? [...rows.values()] : [{ employmentId }]
					return subjects
				},
			)
		} catch (error) {
			return classifyConstraint(error)
		}
	}
}
