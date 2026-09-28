import { randomUUID } from 'node:crypto'
import {
	parseScheduleDraft,
	parseScheduleDraftUpdate,
	parseAttendanceCopyCommand,
	parseAttendanceVersionCommand,
	type ScheduleDraft,
	type ScheduleVersionView,
} from '@empflowyee/hcm-attendance-contract'
import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'
import {
	commandHash,
	runIdempotent,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import type { AppendAudit } from '@empflowyee/hcm-api-audit-application'
import type { AttendanceCommandReceiptStore } from './configuration-evidence'
import type { TemplatePreviewRepository } from './template-publication'
import type { ScheduleQueryRepository } from './schedule-queries'

export type ScheduleApplication = 'Templates' | 'Schedules'
export type ScheduleOperation = 'draft' | 'read' | 'preview' | 'publish' | 'retire'
export interface ScheduleVersionInsert {
	id: string
	ownerId: string
	versionNumber: number
	supersedesId: string | null
	copiedFromId: string | null
	draft: ScheduleDraft
}
export interface ScheduleRepository {
	/** Advance the exact Draft after its preview has been consumed in the same transaction. */
	publish(ownerId: string, versionId: string, revision: number, digest: string): Promise<void>
	/** Retire a Published version without changing its payload or independent copies. */
	retire(ownerId: string, versionId: string, revision: number): Promise<void>
	/** Read the exact version projection inside the current tenant transaction. */
	read(ownerId: string, versionId: string): Promise<ScheduleVersionView | null>
	/** Lock the source version before mutation, preserving tenant and owning root checks. */
	lock(ownerId: string, versionId: string): Promise<ScheduleVersionView | null>
	/** Insert one stable code/ownership identity; no runtime identity updates are permitted. */
	createOwner(id: string, code: string, isTemplate: boolean): Promise<void>
	/** Allocate the next version under the owning use case's tenant write lock. */
	nextVersionNumber(ownerId: string): Promise<number>
	/** Insert a Draft and all typed pattern children without committing independently. */
	insertVersion(input: ScheduleVersionInsert): Promise<void>
	/** Replace Draft content and children, advancing exactly the expected revision. */
	replace(
		ownerId: string,
		versionId: string,
		expectedRevision: number,
		draft: ScheduleDraft,
	): Promise<void>
}
export interface AttendanceScheduleWork {
	schedules: ScheduleRepository
	previews: TemplatePreviewRepository
	queries: ScheduleQueryRepository
	receipts: AttendanceCommandReceiptStore
	audit: AppendAudit
	/** Reauthorize the read permission before returning a stored response to a retry. */
	requireRead(): Promise<void>
}
export abstract class AttendanceScheduleUnitOfWork {
	/** Establish one current tenant-wide operation grant, revocation lock and transaction for global configuration roots. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		app: ScheduleApplication,
		operation: ScheduleOperation,
		write: boolean,
		work: (scope: AttendanceScheduleWork) => Promise<T>,
	): Promise<T>
}

/** Remove read metadata explicitly before a version is copied into a new editable draft. */
export function draftOf(source: ScheduleVersionView): ScheduleDraft {
	const { id, versionId, versionNumber, revision, state, copiedFromVersionId, ...draft } = source
	void [id, versionId, versionNumber, revision, state, copiedFromVersionId]
	return parseScheduleDraft(draft)
}

/** Execute an idempotent mutation, requiring fresh read authority on the replay path. */
export async function replaySafe<T>(
	work: Pick<AttendanceScheduleWork, 'receipts' | 'requireRead'>,
	operation: string,
	key: string,
	target: string,
	payload: unknown,
	mutate: () => Promise<T>,
): Promise<T> {
	return runIdempotent(
		{
			get: /** A stored result is still private source data and requires current read authority. */ async (
				operation,
				key,
			) => {
				const prior = await work.receipts.get(operation, key)
				if (prior) await work.requireRead()
				return prior
			},
			save: /** Persist the exact response alongside the same business transaction. */ (
				operation,
				key,
				receipt,
			) => work.receipts.save(operation, key, receipt),
		},
		operation,
		key,
		commandHash(target, payload),
		mutate,
	)
}

/** Global schedule/template Draft commands; no command publishes or assigns a draft implicitly. */
export class AttendanceScheduleDrafts {
	/** Consume owner ports instead of SQL, HTTP or browser session claims. */
	constructor(private readonly unit: AttendanceScheduleUnitOfWork) {}

	/** Create a new explicitly typed schedule or template Draft with atomic audit and receipt. */
	create(
		context: AuthenticatedHcmContext,
		app: ScheduleApplication,
		key: string,
		value: unknown,
	): Promise<ScheduleVersionView> {
		const draft = parseScheduleDraft(value)
		if (draft.isTemplate !== (app === 'Templates')) throw new HcmDomainError('invalid-request')
		return this.unit.execute(
			context,
			app,
			'draft',
			true,
			/** Bind all effects to current configuration authority. */ (work) =>
				replaySafe(
					work,
					app + '.create',
					key,
					app,
					draft,
					/** Create only after replay and permission checks. */ async () => {
						const ownerId = randomUUID(),
							versionId = randomUUID()
						await work.schedules.createOwner(ownerId, draft.code, draft.isTemplate)
						await work.schedules.insertVersion({
							id: versionId,
							ownerId,
							versionNumber: 1,
							supersedesId: null,
							copiedFromId: null,
							draft,
						})
						return this.finish(
							work,
							ownerId,
							versionId,
							key,
							'attendance.configuration-created',
							null,
							null,
						)
					},
				),
		)
	}

	/** Replace an exact Draft version; stale revisions and attempts to change root identity fail. */
	update(
		context: AuthenticatedHcmContext,
		app: ScheduleApplication,
		ownerId: string,
		versionId: string,
		key: string,
		value: unknown,
	): Promise<ScheduleVersionView> {
		idValue(ownerId, 'id')
		idValue(versionId, 'version')
		const input = parseScheduleDraftUpdate(value)
		return this.unit.execute(
			context,
			app,
			'draft',
			true,
			/** Recheck source authority before replay or locking business state. */ (work) =>
				replaySafe(
					work,
					app + '.update',
					key,
					ownerId + '/' + versionId,
					input,
					/** Replace only the exact reviewed editable revision. */ async () => {
						const current = await this.requireVersion(
							work,
							app,
							ownerId,
							versionId,
							input.expectedRevision,
						)
						if (current.state !== 'Draft') throw new HcmDomainError('version-published')
						if (current.code !== input.draft.code || current.isTemplate !== input.draft.isTemplate)
							throw new HcmDomainError('field-not-editable')
						await work.schedules.replace(ownerId, versionId, input.expectedRevision, input.draft)
						return this.finish(
							work,
							ownerId,
							versionId,
							key,
							'attendance.configuration-updated',
							'Draft',
							null,
						)
					},
				),
		)
	}

	/** Create a successor Draft from immutable Published or Retired source content without modifying that source. */
	newVersion(
		context: AuthenticatedHcmContext,
		app: ScheduleApplication,
		ownerId: string,
		key: string,
		value: unknown,
	): Promise<ScheduleVersionView> {
		idValue(ownerId, 'id')
		const input = parseAttendanceVersionCommand(value)
		return this.unit.execute(
			context,
			app,
			'draft',
			true,
			/** Serialize successor numbering and source checks in one unit of work. */ (work) =>
				replaySafe(
					work,
					app + '.version',
					key,
					ownerId,
					input,
					/** Preserve immutable lineage while creating editable replacement content. */ async () => {
						const current = await this.requireVersion(
							work,
							app,
							ownerId,
							input.sourceVersionId,
							input.expectedRevision,
						)
						if (current.state === 'Draft') throw new HcmDomainError('invalid-state')
						const id = randomUUID()
						await work.schedules.insertVersion({
							id,
							ownerId,
							versionNumber: await work.schedules.nextVersionNumber(ownerId),
							supersedesId: current.versionId,
							copiedFromId: null,
							draft: draftOf(current),
						})
						return this.finish(
							work,
							ownerId,
							id,
							key,
							'attendance.configuration-versioned',
							null,
							input.reason,
						)
					},
				),
		)
	}

	/** Copy a reusable Published template into an independent ordinary Draft with immutable source attribution. */
	copyTemplate(
		context: AuthenticatedHcmContext,
		ownerId: string,
		key: string,
		value: unknown,
	): Promise<ScheduleVersionView> {
		idValue(ownerId, 'id')
		const input = parseAttendanceCopyCommand(value)
		return this.unit.execute(
			context,
			'Templates',
			'draft',
			true,
			/** The admitted template-copy operation creates no live assignment. */ (work) =>
				replaySafe(
					work,
					'Templates.copy',
					key,
					ownerId,
					input,
					/** Copy only a still reusable source revision. */ async () => {
						const current = await this.requireVersion(
							work,
							'Templates',
							ownerId,
							input.sourceVersionId,
							input.expectedRevision,
						)
						if (current.state !== 'Published') throw new HcmDomainError('invalid-state')
						const id = randomUUID(),
							versionId = randomUUID()
						const draft = {
							...draftOf(current),
							code: input.code,
							name: input.name,
							isTemplate: false,
						}
						await work.schedules.createOwner(id, draft.code, false)
						await work.schedules.insertVersion({
							id: versionId,
							ownerId: id,
							versionNumber: 1,
							supersedesId: null,
							copiedFromId: current.versionId,
							draft,
						})
						return this.finish(
							work,
							id,
							versionId,
							key,
							'attendance.configuration-copied',
							null,
							input.reason,
						)
					},
				),
		)
	}

	/** Hide foreign/wrong-family roots and reject stale revisions before evaluating lifecycle commands. */
	private async requireVersion(
		work: AttendanceScheduleWork,
		app: ScheduleApplication,
		ownerId: string,
		versionId: string,
		revision: number,
	): Promise<ScheduleVersionView> {
		const current = await work.schedules.lock(ownerId, versionId)
		if (!current || current.isTemplate !== (app === 'Templates'))
			throw new HcmDomainError('not-found')
		if (current.revision !== revision) throw new HcmDomainError('revision-conflict')
		return current
	}

	/** Attach encrypted owner evidence and safe audit metadata before the receipt commits with the returned DTO. */
	private async finish(
		work: AttendanceScheduleWork,
		ownerId: string,
		versionId: string,
		key: string,
		action: string,
		fromState: string | null,
		reason: string | null,
	): Promise<ScheduleVersionView> {
		const view = await work.schedules.read(ownerId, versionId)
		if (!view) throw new Error('Created schedule version unavailable')
		work.receipts.setEvidence({ owner: 'Schedule', versionId, revision: view.revision, reason })
		await work.audit.append({
			action,
			category: 'business',
			targetType: 'attendance-schedule-version',
			targetId: versionId,
			requestId: key,
			summary: { reason: null, changedFields: ['configuration'], fromState, toState: view.state },
		})
		return view
	}
}
