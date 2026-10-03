import { randomUUID } from 'node:crypto'
import { Temporal } from '@js-temporal/polyfill'
import {
	readLeaveEnrollmentCommand,
	type LeaveEnrollmentCommand,
	type LeaveEnrollmentView,
	type LeavePolicyVersionView,
	type LeavePeriodView,
} from '@empflowyee/hcm-leave-contract'
import { evaluateLeaveEligibility } from '@empflowyee/hcm-api-leave-domain'
import {
	commandHash,
	runIdempotent,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'
import type { WorkforceLeaveEligibilityPort } from '@empflowyee/hcm-api-workforce-foundation-application'
import type { AppendAudit } from '@empflowyee/hcm-api-audit-application'
import type { LeaveEnrollmentRepository } from './enrollment-ports'
import type { LeavePolicyReceipts } from './policy-commands'

export interface LeaveEnrollmentWork {
	enrollments: LeaveEnrollmentRepository
	admission?: { policy: LeavePolicyVersionView; period: LeavePeriodView; effectiveTo: string }
	eligibility: WorkforceLeaveEligibilityPort
	receipts: LeavePolicyReceipts
	audit: AppendAudit
	/** Recheck current scoped read authority before recovering a prior response. */
	requireRead(): Promise<void>
}
export abstract class LeaveEnrollmentUnit {
	/** Authorize the complete dated employment under one grant before exposing private eligibility facts. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		target: LeaveEnrollmentCommand | { id: string },
		operation: 'read' | 'manage',
		work: (scope: LeaveEnrollmentWork) => Promise<T>,
	): Promise<T>
}

/** Admit eligible employment into an explicit period without creating an entitlement grant. */
export class LeaveEnrollmentCommands {
	/** Keep authorization, storage and Workforce evidence in the same source transaction. */
	constructor(private readonly unit: LeaveEnrollmentUnit) {}
	/** Return a safe exact enrollment after current dated subject authorization. */
	read(context: AuthenticatedHcmContext, id: string): Promise<LeaveEnrollmentView> {
		idValue(id, 'id')
		return this.unit.execute(
			context,
			{ id },
			'read',
			/** Do not disclose foreign or missing enrollment details. */ async (work) => {
				const found = await work.enrollments.read(id)
				if (!found) throw new HcmDomainError('not-found')
				return found
			},
		)
	}
	/** Revalidate every included date and persist enrollment, empty account, reason, audit and retry receipt atomically. */
	create(
		context: AuthenticatedHcmContext,
		key: string,
		value: unknown,
	): Promise<LeaveEnrollmentView> {
		const input = readLeaveEnrollmentCommand(value)
		return this.unit.execute(
			context,
			input,
			'manage',
			/** Serialize duplicate commands before creating any business rows. */ (work) =>
				runIdempotent(
					{
						get: /** Prior results remain subject to current independent read permission. */ async (
							operation,
							commandKey,
						) => {
							const prior = await work.receipts.get(operation, commandKey)
							if (prior) await work.requireRead()
							return prior
						},
						save: /** Persist the original safe response inside this transaction. */ (
							operation,
							commandKey,
							receipt,
						) => work.receipts.save(operation, commandKey, receipt),
					},
					'Enrollment.create',
					key,
					commandHash('LeaveEnrollment.create:1', input),
					/** Eligibility and all effects roll back on any unavailable or excluded date. */ async () => {
						if (!work.admission) throw new HcmDomainError('record-incomplete')
						const { policy, period, effectiveTo } = work.admission
						if (period.state !== 'Open' || policy.state !== 'Published')
							throw new HcmDomainError('invalid-state')
						if (
							input.effectiveFrom < policy.effectiveFrom ||
							effectiveTo > period.endDate ||
							(policy.effectiveTo && effectiveTo > policy.effectiveTo)
						)
							throw new HcmDomainError('invalid-state')
						const workforceDates: { workDate: string; inputDigest: string }[] = [],
							matching = new Set<string>()
						for (
							let date = Temporal.PlainDate.from(input.effectiveFrom);
							Temporal.PlainDate.compare(date, effectiveTo) <= 0;
							date = date.add({ days: 1 })
						) {
							const result = await work.eligibility.read(input.employmentId, date.toString())
							if (result.state !== 'Available') throw new HcmDomainError('record-incomplete')
							const eligible = evaluateLeaveEligibility(policy, {
								...result.context.workforce,
								genderCode: result.context.genderCode,
							})
							if (eligible.state === 'Unavailable') throw new HcmDomainError('record-incomplete')
							if (eligible.state !== 'Eligible') throw new HcmDomainError('invalid-state')
							for (const rule of eligible.ruleIds) matching.add(rule)
							workforceDates.push({
								workDate: date.toString(),
								inputDigest: result.context.inputDigest,
							})
						}
						const result = await work.enrollments.insert({
							id: randomUUID(),
							employmentId: input.employmentId,
							policyId: policy.id,
							policyVersionId: policy.versionId,
							periodId: period.id,
							effectiveFrom: input.effectiveFrom,
							effectiveTo,
							trackingMode: policy.trackingMode,
							unit: policy.unit,
							basis: {
								schemaVersion: 1,
								policyRevision: policy.revision,
								periodRevision: period.revision,
								workforceDates,
								matchingRuleIds: [...matching].sort(),
							},
						})
						work.receipts.setEvidence({
							versionId: policy.versionId,
							enrollmentId: result.id,
							revision: result.revision,
							reason: input.reason,
						})
						await work.audit.append({
							action: 'leave.enrollment-created',
							category: 'business',
							targetType: 'leave-enrollment',
							targetId: result.id,
							requestId: key,
							summary: {
								reason: null,
								changedFields: ['enrollment'],
								fromState: null,
								toState: result.state,
							},
						})
						return result
					},
				),
		)
	}
}
