import {
	parseConfigurationPreview,
	parseConfigurationPublish,
	parseConfigurationReason,
	type ConfigurationPreviewCommand,
	type ConfigurationPreviewView,
	type ConfigurationCommandResult,
	type ScheduleVersionView,
} from '@empflowyee/hcm-attendance-contract'
import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'
import { commandHash, type AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	AttendanceScheduleUnitOfWork,
	draftOf,
	replaySafe,
	type AttendanceScheduleWork,
} from './schedule-commands'

export interface TemplatePreviewRepository {
	/** Persist a Ready, actor-bound abstract pattern preview; templates cannot have live assignments. */
	create(
		source: ScheduleVersionView,
		range: ConfigurationPreviewCommand,
		sourceDigest: string,
	): Promise<ConfigurationPreviewView>
	/** Consume only this actor's unexpired, unchanged, conflict-free source preview under lock. */
	consume(
		previewId: string,
		source: ScheduleVersionView,
		sourceDigest: string,
		digest: string,
	): Promise<void>
}

/** Template publication checks reusable pattern structure; copied schedules still require their own dated workforce preview. */
export class AttendanceTemplatePublication {
	/** Reuse the configuration transaction, authority, audit and encrypted receipt ports. */
	constructor(private readonly unit: AttendanceScheduleUnitOfWork) {}

	/** Validate an exact Draft and persist a revision-bound reusable-pattern preview with no fictional employment impact. */
	preview(
		context: AuthenticatedHcmContext,
		ownerId: string,
		versionId: string,
		key: string,
		value: unknown,
	): Promise<ConfigurationPreviewView> {
		idValue(ownerId, 'id')
		idValue(versionId, 'version')
		const input = parseConfigurationPreview(value)
		return this.unit.execute(
			context,
			'Templates',
			'preview',
			true,
			/** Bind preview evidence to the current actor and source. */ (work) =>
				replaySafe(
					work,
					'Templates.preview',
					key,
					ownerId + '/' + versionId,
					input,
					/** Validate structure and persist only after idempotency checks. */ async () => {
						const current = await this.source(work, ownerId, versionId, input.expectedRevision)
						if (current.state !== 'Draft') throw new HcmDomainError('invalid-state')
						draftOf(current)
						if (
							input.effectiveFrom < current.effectiveFrom ||
							(current.effectiveTo && input.effectiveTo > current.effectiveTo)
						)
							throw new HcmDomainError('effective-date-out-of-range')
						const preview = await work.previews.create(
							current,
							input,
							commandHash('TemplatePattern', current),
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
			'Templates',
			'publish',
			true,
			/** Protect source publication and preview consumption with one mutation lock. */ (work) =>
				replaySafe(
					work,
					'Templates.publish',
					key,
					ownerId + '/' + versionId,
					input,
					/** Revalidate the source and all actor-bound preview facts before advancing state. */ async () => {
						const current = await this.source(work, ownerId, versionId, input.expectedRevision)
						if (current.state !== 'Draft') throw new HcmDomainError('invalid-state')
						draftOf(current)
						await work.previews.consume(
							input.previewId,
							current,
							commandHash('TemplatePattern', current),
							input.digest,
						)
						await work.schedules.publish(ownerId, versionId, current.revision, input.digest)
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

	/** Prevent future reuse while retaining immutable source content and already created copies. */
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
			'Templates',
			'retire',
			true,
			/** Require retirement authority separately from Draft or publication authority. */ (work) =>
				replaySafe(
					work,
					'Templates.retire',
					key,
					ownerId + '/' + versionId,
					input,
					/** Retire only the still-current reusable version. */ async () => {
						const current = await this.source(work, ownerId, versionId, input.expectedRevision)
						if (current.state !== 'Published') throw new HcmDomainError('invalid-state')
						await work.schedules.retire(ownerId, versionId, current.revision)
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

	/** Hide foreign or ordinary schedule roots and reject stale exact-version commands. */
	private async source(
		work: AttendanceScheduleWork,
		ownerId: string,
		versionId: string,
		revision: number,
	): Promise<ScheduleVersionView> {
		const source = await work.schedules.lock(ownerId, versionId)
		if (!source?.isTemplate) throw new HcmDomainError('not-found')
		if (source.revision !== revision) throw new HcmDomainError('revision-conflict')
		return source
	}

	/** Keep private reasons in encrypted owner evidence and publish only safe lifecycle facts to shared audit. */
	private async evidence(
		work: AttendanceScheduleWork,
		source: ScheduleVersionView,
		key: string,
		action: string,
		fromState: string,
		reason: string | null,
	): Promise<void> {
		work.receipts.setEvidence({
			owner: 'Schedule',
			versionId: source.versionId,
			revision: source.revision,
			reason,
		})
		await work.audit.append({
			action,
			category: 'business',
			targetType: 'attendance-schedule-version',
			targetId: source.versionId,
			requestId: key,
			summary: { reason: null, changedFields: ['configuration'], fromState, toState: source.state },
		})
	}
}
