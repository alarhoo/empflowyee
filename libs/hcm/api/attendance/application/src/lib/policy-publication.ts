import {
	parseConfigurationPreview,
	parseConfigurationPublish,
	parseConfigurationReason,
	type ConfigurationPreviewCommand,
	type ConfigurationPreviewView,
	type ConfigurationCommandResult,
	type AttendancePolicyVersionView,
} from '@empflowyee/hcm-attendance-contract'
import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'
import { commandHash, type AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	WorkConfigurationUnitOfWork,
	workConfigurationDraftOf,
	type WorkConfigurationWork,
} from './work-configuration-drafts'
import { replaySafe } from './schedule-commands'

export interface PolicyPreviewRepository {
	/** Persist a Ready, actor-bound rule preview; an unpublished policy Draft cannot have live assignments. */
	create(
		source: AttendancePolicyVersionView,
		range: ConfigurationPreviewCommand,
		sourceDigest: string,
	): Promise<ConfigurationPreviewView<'Policy'>>
	/** Consume only this actor's unexpired, unchanged, conflict-free source preview under lock. */
	consume(
		previewId: string,
		source: AttendancePolicyVersionView,
		sourceDigest: string,
		digest: string,
	): Promise<void>
}

/** Policy publication validates complete typed rules; dated assignments independently enforce their actual workday impact. */
export class AttendancePolicyPublication {
	/** Reuse the configuration transaction, authority, audit and encrypted receipt ports. */
	constructor(private readonly unit: WorkConfigurationUnitOfWork) {}

	/** Validate an exact Draft and persist a revision-bound policy-rule preview with no implicit dated assignment. */
	preview(
		context: AuthenticatedHcmContext,
		ownerId: string,
		versionId: string,
		key: string,
		value: unknown,
	): Promise<ConfigurationPreviewView<'Policy'>> {
		idValue(ownerId, 'id')
		idValue(versionId, 'version')
		const input = parseConfigurationPreview(value)
		return this.unit.execute(
			context,
			'Policy',
			'preview',
			true,
			/** Bind preview evidence to the current actor and source. */ (work) =>
				replaySafe(
					work,
					'Policy.preview',
					key,
					ownerId + '/' + versionId,
					input,
					/** Validate complete policy rules and persist only after idempotency checks. */ async () => {
						const current = await this.source(work, ownerId, versionId, input.expectedRevision)
						if (current.state !== 'Draft') throw new HcmDomainError('invalid-state')
						workConfigurationDraftOf('Policy', current)
						if (
							input.effectiveFrom < current.effectiveFrom ||
							(current.effectiveTo && input.effectiveTo > current.effectiveTo)
						)
							throw new HcmDomainError('effective-date-out-of-range')
						const preview = await work.previews.create(
							current,
							input,
							commandHash('PolicyRules', current),
						)
						await this.evidence(
							work,
							current,
							key,
							'attendance.configuration-previewed',
							'Draft',
							null,
						)
						return preview
					},
				),
		)
	}

	/** Consume the reviewed preview and publish atomically; repeated keys return only after fresh read authorization. */
	publish(
		context: AuthenticatedHcmContext,
		ownerId: string,
		versionId: string,
		key: string,
		value: unknown,
	): Promise<ConfigurationCommandResult> {
		idValue(ownerId, 'id')
		idValue(versionId, 'version')
		const input = parseConfigurationPublish(value)
		return this.unit.execute(
			context,
			'Policy',
			'publish',
			true,
			/** Protect source publication and preview consumption with one mutation lock. */ (work) =>
				replaySafe(
					work,
					'Policy.publish',
					key,
					ownerId + '/' + versionId,
					input,
					/** Revalidate the source and all actor-bound preview facts before advancing state. */ async () => {
						const current = await this.source(work, ownerId, versionId, input.expectedRevision)
						if (current.state !== 'Draft') throw new HcmDomainError('invalid-state')
						workConfigurationDraftOf('Policy', current)
						await work.previews.consume(
							input.previewId,
							current,
							commandHash('PolicyRules', current),
							input.digest,
						)
						await work.configurations.publish(ownerId, versionId, current.revision, input.digest)
						const result = {
							id: ownerId,
							versionId,
							revision: current.revision + 1,
							state: 'Published' as const,
						}
						await this.evidence(
							work,
							{ ...current, ...result },
							key,
							'attendance.configuration-published',
							'Draft',
							input.reason,
						)
						return result
					},
				),
		)
	}

	/** Prevent new assignments while retaining immutable policy content and historical assignment evidence. */
	retire(
		context: AuthenticatedHcmContext,
		ownerId: string,
		versionId: string,
		key: string,
		value: unknown,
	): Promise<ConfigurationCommandResult> {
		idValue(ownerId, 'id')
		idValue(versionId, 'version')
		const input = parseConfigurationReason(value)
		return this.unit.execute(
			context,
			'Policy',
			'retire',
			true,
			/** Require retirement authority separately from Draft or publication authority. */ (work) =>
				replaySafe(
					work,
					'Policy.retire',
					key,
					ownerId + '/' + versionId,
					input,
					/** Retire only the still-current published policy version. */ async () => {
						const current = await this.source(work, ownerId, versionId, input.expectedRevision)
						if (current.state !== 'Published') throw new HcmDomainError('invalid-state')
						await work.configurations.retire(ownerId, versionId, current.revision)
						const result = {
							id: ownerId,
							versionId,
							revision: current.revision + 1,
							state: 'Retired' as const,
						}
						await this.evidence(
							work,
							{ ...current, ...result },
							key,
							'attendance.configuration-retired',
							'Published',
							input.reason,
						)
						return result
					},
				),
		)
	}

	/** Hide foreign or wrong-family configuration roots and reject stale exact-version commands. */
	private async source(
		work: WorkConfigurationWork,
		ownerId: string,
		versionId: string,
		revision: number,
	): Promise<AttendancePolicyVersionView> {
		const source = await work.configurations.lock(ownerId, versionId)
		if (!source || !('approvalRules' in source)) throw new HcmDomainError('not-found')
		if (source.revision !== revision) throw new HcmDomainError('revision-conflict')
		return source
	}

	/** Keep private reasons in encrypted owner evidence and publish only safe lifecycle facts to shared audit. */
	private async evidence(
		work: WorkConfigurationWork,
		source: AttendancePolicyVersionView,
		key: string,
		action: string,
		fromState: string,
		reason: string | null,
	): Promise<void> {
		work.receipts.setEvidence({
			owner: 'Policy',
			versionId: source.versionId,
			revision: source.revision,
			reason,
		})
		await work.audit.append({
			action,
			category: 'business',
			targetType: 'attendance-policy-version',
			targetId: source.versionId,
			requestId: key,
			summary: { reason: null, changedFields: ['configuration'], fromState, toState: source.state },
		})
	}
}
