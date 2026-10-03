import { randomUUID } from 'node:crypto'
import {
	readLeaveRequestDraft,
	type LeaveRequestDraft,
	type LeaveRequestView,
} from '@empflowyee/hcm-leave-contract'
import type { WorkdayView } from '@empflowyee/hcm-attendance-contract'
import {
	evaluateLeaveEligibility,
	resolveLeaveRequestPortion,
	type LeaveResolvedPortion,
} from '@empflowyee/hcm-api-leave-domain'
import type { WorkforceLeaveEligibilityPort } from '@empflowyee/hcm-api-workforce-foundation-application'
import type { AttendancePublishedWorkdayPort } from '@empflowyee/hcm-api-attendance-application'
import {
	commandHash,
	runIdempotent,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import type { AppendAudit } from '@empflowyee/hcm-api-audit-application'
import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'
import type { LeavePolicyReceipts } from './policy-commands'
import {
	calculateLeaveWorkdays,
	requireLeaveCalculationRange,
	type LeaveCalculationAdmission,
	type LeaveWorkdayCalculation,
} from './workday-calculation'

export interface LeaveRequestDraftEvidence {
	id: string
	input: LeaveRequestDraft
	admission: LeaveCalculationAdmission
	calculation: Extract<LeaveWorkdayCalculation, { state: 'Available' }>
	sources: Extract<WorkdayView, { state: 'Published' }>[]
	resolved: { workDate: string; request: LeaveResolvedPortion }[]
	eligibility: { workDate: string; inputDigest: string; ruleIds: readonly string[] }[]
}
export interface LeaveRequestDraftWork {
	admission?: LeaveCalculationAdmission
	workdays: AttendancePublishedWorkdayPort
	eligibility: WorkforceLeaveEligibilityPort
	receipts: LeavePolicyReceipts
	audit: AppendAudit
	/** Read the safe request projection under the caller's current self and dated scope authority. */
	read(id: string): Promise<LeaveRequestView | null>
	/** Persist a calculated Draft and all evidence in the caller's existing transaction, without reserving units. */
	insert(evidence: LeaveRequestDraftEvidence): Promise<LeaveRequestView>
	/** Durable recovery requires current independent read permission as well as current self ownership. */
	requireRead(): Promise<void>
}
export abstract class LeaveRequestDraftUnit {
	/** Authorize the operation, complete dated scope and exact self employment before admitting private source facts. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		target: LeaveRequestDraft | { id: string },
		operation: 'read' | 'draft',
		work: (scope: LeaveRequestDraftWork) => Promise<T>,
	): Promise<T>
}

/** Create and reload a source-backed self-service Draft; submission and balance spending remain separate commands. */
export class LeaveRequestDraftCommands {
	/** Reuse source-owned transactional ports and immutable command receipts. */
	constructor(private readonly unit: LeaveRequestDraftUnit) {}
	/** Reload the exact request after current self/subject authorization. */
	read(context: AuthenticatedHcmContext, id: string): Promise<LeaveRequestView> {
		idValue(id, 'id')
		return this.unit.execute(
			context,
			{ id },
			'read',
			/** Keep absent and foreign identities undisclosed. */ async (work) => {
				const result = await work.read(id)
				if (!result) throw new HcmDomainError('not-found')
				return result
			},
		)
	}
	/** Calculate actual current workdays and eligibility, then commit Draft, private evidence, audit and response together. */
	create(context: AuthenticatedHcmContext, key: string, value: unknown): Promise<LeaveRequestView> {
		const input = readLeaveRequestDraft(value)
		return this.unit.execute(
			context,
			input,
			'draft',
			/** Serialize original-key retries before any source effect. */ (work) =>
				runIdempotent(
					{
						get: /** A stored result is not authority to read after revocation. */ async (
							operation,
							commandKey,
						) => {
							const receipt = await work.receipts.get(operation, commandKey)
							if (receipt) await work.requireRead()
							return receipt
						},
						save: /** Retain the original safe result in the same source transaction. */ (
							operation,
							commandKey,
							receipt,
						) => work.receipts.save(operation, commandKey, receipt),
					},
					'Request.create',
					key,
					commandHash('LeaveRequestDraft:1', input),
					/** No retry path fabricates a new request identity or reservation. */ async () => {
						const admission = work.admission
						if (!admission) throw new HcmDomainError('record-incomplete')
						if (input.evidenceIds.length) throw new HcmDomainError('record-incomplete')
						const query = requireLeaveCalculationRange(admission, input.days)
						const page = await work.workdays.read(query)
						const sources: LeaveRequestDraftEvidence['sources'] = [],
							resolved: LeaveRequestDraftEvidence['resolved'] = [],
							eligibility: LeaveRequestDraftEvidence['eligibility'] = []
						for (const day of input.days) {
							const source = page.items.find(
								/** Match the exact selected employment and work date. */ (item) =>
									item.employmentId === input.employmentId && item.workDate === day.workDate,
							)
							if (!source || source.state !== 'Published')
								throw new HcmDomainError('record-incomplete')
							const portion = resolveLeaveRequestPortion(day, source.zone)
							if (portion.state !== 'Available') throw new HcmDomainError('record-incomplete')
							const facts = await work.eligibility.read(input.employmentId, day.workDate)
							if (facts.state !== 'Available') throw new HcmDomainError('record-incomplete')
							const match = evaluateLeaveEligibility(admission.policy, {
								...facts.context.workforce,
								genderCode: facts.context.genderCode,
							})
							if (match.state !== 'Eligible')
								throw new HcmDomainError(
									match.state === 'Unavailable' ? 'record-incomplete' : 'invalid-state',
								)
							sources.push(source)
							resolved.push({ workDate: day.workDate, request: portion.request })
							eligibility.push({
								workDate: day.workDate,
								inputDigest: facts.context.inputDigest,
								ruleIds: match.ruleIds,
							})
						}
						const calculation = await calculateLeaveWorkdays(
							{
								read: /** Reuse the actual owner result from this transaction without substituting business fixtures or reselecting inputs. */ async () =>
									page,
							},
							admission,
							resolved,
						)
						if (calculation.state !== 'Available') throw new HcmDomainError('record-incomplete')
						const result = await work.insert({
							id: randomUUID(),
							input,
							admission,
							calculation,
							sources,
							resolved,
							eligibility,
						})
						work.receipts.setEvidence({
							versionId: result.policyVersionId,
							enrollmentId: result.enrollmentId,
							requestId: result.id,
							revision: result.revision,
							reason: input.reason,
						})
						await work.audit.append({
							action: 'leave.request-drafted',
							category: 'business',
							targetType: 'leave-request',
							targetId: result.id,
							requestId: key,
							summary: {
								reason: null,
								changedFields: ['request'],
								fromState: null,
								toState: 'Draft',
							},
						})
						return result
					},
				),
		)
	}
}
