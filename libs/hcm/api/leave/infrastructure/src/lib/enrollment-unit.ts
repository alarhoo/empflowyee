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
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'
import type { LeaveEnrollmentCommand } from '@empflowyee/hcm-leave-contract'
import {
	LeaveEnrollmentUnit,
	type LeaveEnrollmentWork,
} from '@empflowyee/hcm-api-leave-application'
import type {
	WorkforceTimeContextBinder,
	WorkforceLeaveEligibilityBinder,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import { KyselyLeaveEnrollmentRepository } from './enrollment-repository'
import { KyselyLeavePolicyRepository } from './hcm-api-leave-infrastructure'
import { SqlLeavePolicyReceipts } from './policy-unit'

/** Bind enrollment admission to one current whole-grant scope across every included date. */
export class KyselyLeaveEnrollmentUnit extends LeaveEnrollmentUnit {
	/** Reuse owner ports for dated scope and private eligibility; no Workforce tables are read here. */
	constructor(
		private readonly database: HcmAccessDatabase | null,
		private readonly cipher: FieldCipher,
		private readonly workforce: WorkforceTimeContextBinder,
		private readonly eligibility: WorkforceLeaveEligibilityBinder,
	) {
		super()
	}
	/** Resolve dates under the existing revocation-safe tenant transaction, then check private eligibility only after scoped authorization. */
	async execute<T>(
		context: AuthenticatedHcmContext,
		target: LeaveEnrollmentCommand | { id: string },
		operation: 'read' | 'manage',
		work: (scope: LeaveEnrollmentWork) => Promise<T>,
	): Promise<T> {
		if (!this.database) throw new HcmDomainError('record-incomplete')
		const tenant = requireAuthenticatedTenant(context),
			actor = requireAuthenticatedAccount(context)
		let admission: LeaveEnrollmentWork['admission'],
			subjects: HcmScopeSubject[] = [],
			unavailable = false,
			missing = false
		try {
			return await this.database.execute(
				context,
				{ permission: 'hcm.leave.leave-administration.' + operation, entitlement: 'hcm.leave' },
				operation === 'manage',
				/** Compose all effects only after one complete current grant covers the dated employment. */ async (
					access,
				) => {
					if (missing) throw new HcmDomainError('not-found')
					if (unavailable) throw new HcmDomainError('record-incomplete')
					const tx = access.transaction as unknown as Kysely<unknown>
					const result = await work({
						admission,
						enrollments: new KyselyLeaveEnrollmentRepository(
							tx,
							tenant,
							actor,
							this.cipher.bind(tx, tenant),
						),
						eligibility: this.eligibility.bind(tx, tenant),
						receipts: new SqlLeavePolicyReceipts(tx, tenant, actor, this.cipher.bind(tx, tenant)),
						audit: access.audit,
						requireRead:
						/** Revoked read grants cannot recover a formerly authorized enrollment response. */ async () => {
							await new TransactionalAccessPolicy(access.transaction, context).require({
								permission: 'hcm.leave.leave-administration.read',
								entitlement: 'hcm.leave',
								subjects,
							})
						},
					})
					requireAuthenticatedTenant(context)
					return result
				},
				/** Resolve minimal dated scope only after the independent operation and entitlement check. */ async (
					transaction,
				) => {
					const tx = transaction as unknown as Kysely<unknown>,
						repository = new KyselyLeaveEnrollmentRepository(
							tx,
							tenant,
							actor,
							this.cipher.bind(tx, tenant),
						)
					let employmentId: string, from: string, to: string
					if ('id' in target) {
						const found = await repository.read(target.id)
						if (!found) {
							missing = true
							return [{}]
						}
						employmentId = found.employmentId
						from = found.effectiveFrom
						to = found.effectiveTo
					} else {
						employmentId = target.employmentId
						from = target.effectiveFrom
						// Period-before-policy lock order matches enrollment admission and period-close writers.
						const period = await repository.periodAt(from)
						if (!period) {
							unavailable = true
							return [{ employmentId }]
						}
						const root = (
							await sql<{
								policyId: string
							}>`SELECT policy_id AS "policyId" FROM hcm.leave_policy_version WHERE tenant_id=${tenant} AND id=${target.policyVersionId} FOR SHARE`.execute(
								tx,
							)
						).rows[0]
						if (!root) {
							missing = true
							return [{ employmentId }]
						}
						const policy = await new KyselyLeavePolicyRepository(tx, tenant, actor).read(
							root.policyId,
							target.policyVersionId,
						)
						if (!policy) {
							missing = true
							return [{ employmentId }]
						}
						to =
							target.effectiveTo ?? [period.endDate, policy.effectiveTo ?? period.endDate].sort()[0]
						admission = { policy, period, effectiveTo: to }
					}
					const start = Temporal.PlainDate.from(from),
						end = Temporal.PlainDate.from(to)
					// Bound synchronous source reads; larger ranges require a separately designed background admission.
					if (start.until(end).days < 0 || start.until(end).days >= 3660) {
						unavailable = true
						return [{ employmentId }]
					}
					const scopeRows = new Map<string, HcmScopeSubject>()
					for (
						let date = start;
						Temporal.PlainDate.compare(date, end) <= 0;
						date = date.add({ days: 1 })
					) {
						const facts = await this.workforce.bind(tx, tenant).read(employmentId, date.toString())
						if (facts.state !== 'Available') {
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
							scopeRows.set(JSON.stringify(subject), subject)
						}
						if (!facts.context.assignments.length) unavailable = true
					}
					subjects = scopeRows.size ? [...scopeRows.values()] : [{ employmentId }]
					return subjects
				},
			)
		} catch (error) {
			return classifyConstraint(error)
		}
	}
}
