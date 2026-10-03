import {
	parseDatedConfigurationPreview,
	parseConfigurationPublish,
	parseConfigurationReason,
	type DatedConfigurationFamily,
	type DatedConfigurationPreviewView,
} from '@empflowyee/hcm-attendance-contract'
import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	AttendanceDatedPublicationUnit,
	type DatedPublicationWork,
	type DatedConfigurationPublicationPort,
} from './dated-publication-ports'
import type { DatedConfigurationVersion } from './dated-impact'
import { replaySafe } from './schedule-commands'

/** Dated schedule and shift publication is gated by a completed durable review and fresh source-owned validation. */
export class AttendanceDatedPublication {
	/** Reuse current-authority transactions and existing audit/receipt mechanics. */
	constructor(private readonly unit: AttendanceDatedPublicationUnit) {}
	/** Admit durable preview work only for an exact editable version and explicit context. */
	preview(
		context: AuthenticatedHcmContext,
		family: DatedConfigurationFamily,
		id: string,
		version: string,
		key: string,
		value: unknown,
	): Promise<DatedConfigurationPreviewView> {
		idValue(id, 'id')
		idValue(version, 'version')
		const input = parseDatedConfigurationPreview(value)
		return this.unit.execute(
			context,
			family,
			'preview',
			true,
			/** Authorize and retain idempotent acceptance. */ (work) =>
				replaySafe(
					work,
					family + '.preview',
					key,
					id + '/' + version,
					input,
					/** Enqueue without reporting unexecuted checks as successful. */ async () => {
						const source = await this.source(work, id, version, input.expectedRevision)
						if (
							input.effectiveFrom < source.effectiveFrom ||
							(source.effectiveTo && input.effectiveTo > source.effectiveTo)
						)
							throw new HcmDomainError('effective-date-out-of-range')
						const preview = await this.port(work).start(source, input)
						work.receipts.setEvidence({
							owner: family,
							versionId: version,
							revision: source.revision,
							reason: null,
						})
						await work.audit.append({
							action: 'attendance.configuration-previewed',
							category: 'business',
							targetType:
								family === 'Schedule' ? 'attendance-schedule-version' : 'attendance-shift-version',
							targetId: version,
							requestId: key,
							summary: {
								reason: null,
								changedFields: ['configuration'],
								fromState: 'Draft',
								toState: 'Draft',
							},
						})
						return preview
					},
				),
		)
	}
	/** Poll only the authenticated actor's preview for the selected exact source. */
	read(
		context: AuthenticatedHcmContext,
		family: DatedConfigurationFamily,
		id: string,
		version: string,
		previewId: string,
	): Promise<DatedConfigurationPreviewView> {
		idValue(id, 'id')
		idValue(version, 'version')
		idValue(previewId, 'previewId')
		return this.unit.execute(
			context,
			family,
			'read',
			false,
			/** Resolve the hidden source before preview evidence. */ async (work) => {
				const source = await work.configurations.read(id, version)
				if (!source || ('isTemplate' in source && source.isTemplate))
					throw new HcmDomainError('not-found')
				return this.port(work).read(source, previewId)
			},
		)
	}
	/** Consume only a current conflict-free review and atomically freeze content, reason, audit and result. */
	publish(
		context: AuthenticatedHcmContext,
		family: DatedConfigurationFamily,
		id: string,
		version: string,
		key: string,
		value: unknown,
	): Promise<DatedConfigurationVersion> {
		idValue(id, 'id')
		idValue(version, 'version')
		const input = parseConfigurationPublish(value)
		return this.unit.execute(
			context,
			family,
			'publish',
			true,
			/** Recheck publication authority before command recovery. */ (work) =>
				replaySafe(
					work,
					family + '.publish',
					key,
					id + '/' + version,
					input,
					/** Revalidate the dated source evidence before changing lifecycle. */ async () => {
						const source = await this.source(work, id, version, input.expectedRevision)
						await this.port(work).consume(source, input.previewId, input.digest)
						await work.configurations.publish(id, version, source.revision, input.digest)
						work.receipts.setEvidence({
							owner: family,
							versionId: version,
							revision: source.revision + 1,
							reason: input.reason,
						})
						await work.audit.append({
							action: 'attendance.configuration-published',
							category: 'business',
							targetType:
								family === 'Schedule' ? 'attendance-schedule-version' : 'attendance-shift-version',
							targetId: version,
							requestId: key,
							summary: {
								reason: null,
								changedFields: ['configuration'],
								fromState: 'Draft',
								toState: 'Published',
							},
						})
						const result = await work.configurations.read(id, version)
						if (!result) throw new HcmDomainError('not-found')
						return result
					},
				),
		)
	}
	/** Retire the exact published source without changing its immutable payload or historical workdays. */
	retire(
		context: AuthenticatedHcmContext,
		family: DatedConfigurationFamily,
		id: string,
		version: string,
		key: string,
		value: unknown,
	): Promise<DatedConfigurationVersion> {
		idValue(id, 'id')
		idValue(version, 'version')
		const input = parseConfigurationReason(value)
		return this.unit.execute(
			context,
			family,
			'retire',
			true,
			/** Recheck current retirement and replay authority before locking the source. */ (work) =>
				replaySafe(
					work,
					family + '.retire',
					key,
					id + '/' + version,
					input,
					/** Preserve immutable history and commit source evidence with the exact response. */ async () => {
						const source = await work.configurations.lock(id, version)
						if (!source || ('isTemplate' in source && source.isTemplate))
							throw new HcmDomainError('not-found')
						if (source.revision !== input.expectedRevision)
							throw new HcmDomainError('revision-conflict')
						if (source.state !== 'Published') throw new HcmDomainError('invalid-state')
						await work.configurations.retire(id, version, source.revision)
						work.receipts.setEvidence({
							owner: family,
							versionId: version,
							revision: source.revision + 1,
							reason: input.reason,
						})
						await work.audit.append({
							action: 'attendance.configuration-retired',
							category: 'business',
							targetType:
								family === 'Schedule' ? 'attendance-schedule-version' : 'attendance-shift-version',
							targetId: version,
							requestId: key,
							summary: {
								reason: null,
								changedFields: ['configuration'],
								fromState: 'Published',
								toState: 'Retired',
							},
						})
						const result = await work.configurations.read(id, version)
						if (!result) throw new HcmDomainError('not-found')
						return result
					},
				),
		)
	}
	/** Fail closed when the composition has not supplied real publication dependencies. */
	private port(work: DatedPublicationWork): DatedConfigurationPublicationPort {
		if (!work.publication) throw new HcmDomainError('record-incomplete')
		return work.publication
	}
	/** Reject foreign, stale and immutable versions before deriving any impact. */
	private async source(
		work: DatedPublicationWork,
		id: string,
		version: string,
		revision: number,
	): Promise<DatedConfigurationVersion> {
		const source = await work.configurations.lock(id, version)
		if (!source || ('isTemplate' in source && source.isTemplate))
			throw new HcmDomainError('not-found')
		if (source.revision !== revision) throw new HcmDomainError('revision-conflict')
		if (source.state !== 'Draft') throw new HcmDomainError('invalid-state')
		return source
	}
}
