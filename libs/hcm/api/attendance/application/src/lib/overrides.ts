import { randomUUID } from 'node:crypto'
import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'
import {
	parseAttendanceOverrideDraft,
	parseConfigurationReason,
	parseConfigurationPublish,
	type AttendanceOverrideDraft,
	type AttendanceOverrideView,
	type AttendanceOverrideReview,
	type AttendanceOverrideSubmission,
	type AttendanceOverrideSubmitResult,
} from '@empflowyee/hcm-attendance-contract'
import { commandHash, type AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import { requireIdempotencyKey } from '@empflowyee/hcm-api-runtime-application'
import type { AppendAudit } from '@empflowyee/hcm-api-audit-application'
import type { AttendanceCommandReceiptStore } from './configuration-evidence'
import type { AttendanceConfigurationInputPort } from './configuration-inputs'
import type { AttendancePeriodFencePort } from './period-fences'
import { evaluateOverrideWorkdayImpact } from './override-impact'
import { replaySafe } from './schedule-commands'
import { leaveImpactProposal, type AttendanceLeaveImpactPort } from './leave-impact'

export interface AttendanceOverrideWork {
	inputs: AttendanceConfigurationInputPort
	periods: AttendancePeriodFencePort
	receipts: AttendanceCommandReceiptStore
	audit: AppendAudit
	leaveImpact: AttendanceLeaveImpactPort
	/** Read a safe source projection under the already verified dated subject scope. */
	read(id: string): Promise<AttendanceOverrideView | null>
	/** Require the exact most recent immutable workday and serialize its date against other producers. */
	requireBasis(employmentId: string, date: string, revision: number): Promise<string>
	/** Insert a Draft and its exact intervals; it remains invisible to production resolution. */
	insert(id: string, basisId: string, draft: AttendanceOverrideDraft): Promise<void>
	/** Admit only source-bound clean evidence through its owner; unavailable evidence admission must reject. */
	attachEvidence(id: string, draft: AttendanceOverrideDraft): Promise<void>
	/** Persist all required policy slots and their real Workflow intake atomically; source approval is still pending. */
	requestApproval(
		source: AttendanceOverrideView,
		policyVersionId: string,
		inputDigest: string,
		workforceDigest: string,
	): Promise<AttendanceOverrideSubmission>
	/** Approve only after current policy has no required slots and the complete review is revalidated. */
	approve(source: AttendanceOverrideView, digest: string): Promise<void>
	/** Enqueue actual current dated input evidence in the same transaction as source approval and receipt. */
	enqueue(employmentId: string, workDate: string, inputDigest: string): Promise<string>
	/** Supply a private candidate to the normal resolver without mutating approval state or hiding competing sources. */
	proposedInputs(source: AttendanceOverrideView): AttendanceConfigurationInputPort
	/** Require one complete current operation grant over every reviewed date before its resolver inputs are read. */
	requireImpactDate(date: string): Promise<void>
	/** Require current read permission even when a command result is recovered by its original key. */
	requireRead(response?: unknown): Promise<void>
}
export type AttendanceOverrideTarget = { id: string } | { employmentId: string; workDate: string }
export abstract class AttendanceOverrideUnit {
	/** Bind one complete current grant and the exact dated subject before reading or changing private records. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		target: AttendanceOverrideTarget,
		operation: 'read' | 'manage' | 'preview',
		work: (scope: AttendanceOverrideWork) => Promise<T>,
	): Promise<T>
}

/** Refuse ordinary changes under an active month close, lock or controlled reopen. */
async function requireOpen(
	work: Pick<AttendanceOverrideWork, 'periods'>,
	date: string,
	through = date,
) {
	const period = await work.periods.fence(date, through)
	if (
		period.months.some(
			/** All touched months must admit ordinary workday changes. */ (item) =>
				item.period && ['Closing', 'Locked', 'Reopened'].includes(item.period.state),
		)
	)
		throw new HcmDomainError('invalid-state')
	return period
}

/** Persist and review dated overrides without changing historical workdays or manufacturing an approval. */
export class AttendanceOverrides {
	/** Consume Attendance transaction ports and preserve owner boundaries. */
	constructor(private readonly unit: AttendanceOverrideUnit) {}
	/** Reload the safe source after current operation and dated-scope checks. */
	read(context: AuthenticatedHcmContext, id: string): Promise<AttendanceOverrideView> {
		idValue(id, 'id')
		return this.unit.execute(
			context,
			{ id },
			'read',
			/** A foreign or absent source has no public projection. */ async (work) => {
				const source = await work.read(id)
				if (!source) throw new HcmDomainError('not-found')
				return source
			},
		)
	}
	/** Create a draft using the exact current stored workday; replay returns the original safe projection. */
	create(
		context: AuthenticatedHcmContext,
		key: string,
		value: unknown,
	): Promise<AttendanceOverrideView> {
		const draft = parseAttendanceOverrideDraft(value)
		return this.unit.execute(
			context,
			draft,
			'manage',
			/** Keep draft, encrypted evidence, audit and receipt in one transaction. */ (work) =>
				replaySafe(
					work,
					'Override.create',
					key,
					'Override',
					draft,
					/** Recheck basis and period only for a new command, not for durable recovery. */ async () => {
						await requireOpen(work, draft.workDate)
						const basis = await work.requireBasis(
							draft.employmentId,
							draft.workDate,
							draft.workdayRevision,
						)
						const id = randomUUID()
						await work.insert(id, basis, draft)
						await work.attachEvidence(id, draft)
						const source = await work.read(id)
						if (!source) throw new Error('Created override unavailable')
						await this.record(
							work,
							source,
							key,
							'attendance.configuration-created',
							draft.reason,
							null,
						)
						return source
					},
				),
		)
	}
	/** Review the proposed date with real policy, holiday, DST and independent rest inputs while retaining Draft state. */
	preview(
		context: AuthenticatedHcmContext,
		id: string,
		key: string,
		value: unknown,
	): Promise<AttendanceOverrideReview> {
		idValue(id, 'id')
		const input = parseConfigurationReason(value)
		return this.unit.execute(
			context,
			{ id },
			'preview',
			/** Actor-bound receipts retain the exact review identity and private reason. */ (work) =>
				replaySafe(
					work,
					'Override.preview',
					key,
					id,
					input,
					/** Proposed approval exists only inside the rollback boundary and creates no work intent. */ async () => {
						const { source, policy, resolved, digest, reviewedThrough, restWarnings, leaveImpact } =
							await reviewAttendanceOverride(work, id, input.expectedRevision)
						const result: AttendanceOverrideReview = {
							previewId: key.toLowerCase(),
							sourceRevision: source.revision,
							workdayRevision: source.workdayRevision,
							reviewedThrough,
							restWarnings,
							leaveImpact,
							digest,
							expiresAt: new Date(Date.now() + 900000).toISOString(),
							scheduledMilliseconds: resolved.resolution.scheduledWorkMilliseconds,
							expectedMilliseconds: resolved.resolution.expectedWorkMilliseconds,
							approvalRequired: policy.version.approvalRules.some(
								/** A configured Override subject cannot take an automatic path. */ (rule) =>
									rule.subjectType === 'Override',
							),
						}
						await this.record(
							work,
							source,
							key,
							'attendance.configuration-previewed',
							input.reason,
							'Draft',
						)
						return result
					},
				),
		)
	}

	/** Revalidate the actor-bound review, then honor required approval or apply the explicit no-required-slot policy. */
	submit(
		context: AuthenticatedHcmContext,
		id: string,
		key: string,
		value: unknown,
	): Promise<AttendanceOverrideSubmitResult> {
		idValue(id, 'id')
		const input = parseConfigurationPublish(value)
		requireIdempotencyKey(input.previewId)
		return this.unit.execute(
			context,
			{ id },
			'manage',
			/** Current manage and read authority remain mandatory during duplicate recovery. */ (work) =>
				replaySafe(
					work,
					'Override.submit',
					key,
					id,
					input,
					/** Source case, slots, encrypted reason, intake and response share one transaction. */ async () => {
						const receipt = await work.receipts.get('Override.preview', input.previewId)
						const prior = receipt?.response as AttendanceOverrideReview | undefined
						if (
							!prior ||
							prior.digest !== input.digest ||
							prior.sourceRevision !== input.expectedRevision ||
							!Number.isFinite(Date.parse(prior.expiresAt)) ||
							Date.parse(prior.expiresAt) <= Date.now()
						)
							throw new HcmDomainError('revision-conflict')
						const { source, policy, digest, leaveImpact, reviewedThrough, days } =
							await reviewAttendanceOverride(work, id, input.expectedRevision)
						if (digest !== input.digest) throw new HcmDomainError('revision-conflict')
						if (leaveImpact.unavailableRequestCount) throw new HcmDomainError('record-incomplete')
						if (source.approval) throw new HcmDomainError('invalid-state')
						if (
							!policy.version.approvalRules.some(
								/** Never substitute a fabricated approval route when no policy requirement exists. */ (
									rule,
								) => rule.subjectType === 'Override',
							)
						) {
							await work.approve(source, digest)
							const applied = await evaluateOverrideWorkdayImpact(
								work.inputs,
								source.employmentId,
								source.workDate,
								/** Retain current complete dated authority through final materialization admission. */ (
									date,
								) => work.requireImpactDate(date),
							)
							if (
								commandHash('OverrideResolvedDays:1', applied) !==
								commandHash('OverrideResolvedDays:1', days)
							)
								throw new HcmDomainError('revision-conflict')
							const operationIds: string[] = []
							for (const day of applied)
								operationIds.push(
									await work.enqueue(source.employmentId, day.workDate, day.result.inputDigest),
								)
							const current = await work.read(id)
							if (!current || current.state !== 'Approved')
								throw new HcmDomainError('record-incomplete')
							await this.record(
								work,
								current,
								key,
								'attendance.override-submitted',
								input.reason,
								'Draft',
							)
							return {
								id,
								revision: current.revision,
								state: 'Approved' as const,
								reviewedThrough,
								resolutionState: 'Pending' as const,
								operationIds,
							}
						}
						const result = await work.requestApproval(
							source,
							policy.version.versionId,
							digest,
							policy.workforce.inputDigest,
						)
						await this.record(
							work,
							source,
							key,
							'attendance.override-submitted',
							input.reason,
							'Draft',
						)
						return { ...result, reviewedThrough }
					},
				),
		)
	}

	/** Seal narrative in the receipt while safe shared audit contains only source identity and lifecycle. */
	private async record(
		work: AttendanceOverrideWork,
		source: AttendanceOverrideView,
		key: string,
		action: string,
		reason: string,
		fromState: string | null,
	): Promise<void> {
		work.receipts.setEvidence({
			owner: 'Override',
			versionId: source.id,
			revision: source.revision,
			reason,
		})
		await work.audit.append({
			action,
			category: 'business',
			targetType: 'attendance-schedule-override',
			targetId: source.id,
			requestId: key,
			summary: { reason: null, changedFields: ['configuration'], fromState, toState: source.state },
		})
	}
}

/** Reuse identical current-source validation for preview and consumption, with period locks acquired before dated workday locks. */
export async function reviewAttendanceOverride(
	work: Pick<
		AttendanceOverrideWork,
		| 'read'
		| 'inputs'
		| 'proposedInputs'
		| 'periods'
		| 'requireBasis'
		| 'requireImpactDate'
		| 'leaveImpact'
	>,
	id: string,
	expectedRevision: number,
) {
	const source = await work.read(id)
	if (!source) throw new HcmDomainError('not-found')
	if (source.revision !== expectedRevision) throw new HcmDomainError('revision-conflict')
	if (source.state !== 'Draft') throw new HcmDomainError('invalid-state')
	const policy = await work.inputs.read('Policy', source.employmentId, source.workDate)
	if (policy.state !== 'Available') throw new HcmDomainError('record-incomplete')
	const days = await evaluateOverrideWorkdayImpact(
		work.proposedInputs(source),
		source.employmentId,
		source.workDate,
		/** Each future source needs complete current dated authority before inspection. */ (date) =>
			work.requireImpactDate(date),
	)
	const reviewedThrough = days[days.length - 1].workDate
	const period = await requireOpen(work, source.workDate, reviewedThrough)
	await work.requireBasis(source.employmentId, source.workDate, source.workdayRevision)
	const resolved = days[0].result
	const leaveImpact = await work.leaveImpact.review(leaveImpactProposal(source.employmentId, days))
	const restWarnings: NonNullable<AttendanceOverrideReview['restWarnings']> = []
	for (const day of days)
		if (day.result.rest.state === 'Compared') {
			for (const outcome of day.result.rest.outcomes)
				if (outcome.result.state === 'Warn' && outcome.minutes !== null)
					restWarnings.push({
						workDate: day.workDate,
						source: outcome.source,
						minimumMinutes: outcome.minutes,
						elapsedMilliseconds: outcome.result.elapsedMilliseconds,
					})
		}
	return {
		source,
		policy,
		resolved,
		days,
		reviewedThrough,
		restWarnings,
		leaveImpact,
		digest: commandHash('OverrideImpact:4', {
			source: {
				id: source.id,
				revision: source.revision,
				state: source.state,
				employmentId: source.employmentId,
				workDate: source.workDate,
				workdayRevision: source.workdayRevision,
				zone: source.zone,
				segments: source.segments,
			},
			period,
			policy,
			days,
			leaveImpact,
		}),
	}
}
