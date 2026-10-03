import { randomUUID } from 'node:crypto'
import {
	parseAttendancePolicyDraft,
	parseShiftDraft,
	parseAttendanceVersionCommand,
	parseAttendancePolicyUpdate,
	parseShiftUpdate,
	parseScheduleListQuery,
	type AttendancePolicyDraft,
	type AttendancePolicyVersionView,
	type ShiftDraft,
	type ShiftVersionView,
	type ScheduleListQuery,
} from '@empflowyee/hcm-attendance-contract'
import { HcmDomainError, idValue, type HcmPage } from '@empflowyee/hcm-runtime-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type { AppendAudit } from '@empflowyee/hcm-api-audit-application'
import type { AttendanceCommandReceiptStore } from './configuration-evidence'
import { replaySafe } from './schedule-commands'
import type { PolicyPreviewRepository } from './policy-publication'
import type { HolidayReferencePort } from './holiday-references'

export type WorkConfigurationFamily = 'Shift' | 'Policy'
export type WorkConfigurationDraft = ShiftDraft | AttendancePolicyDraft
export type WorkConfigurationView = ShiftVersionView | AttendancePolicyVersionView
export interface WorkConfigurationInsert {
	id: string
	ownerId: string
	versionNumber: number
	supersedesId: string | null
	draft: WorkConfigurationDraft
}
export interface WorkConfigurationRepository {
	/** Publish only after current source-owned impact evidence has been consumed in this transaction. */
	publish(ownerId: string, versionId: string, revision: number, digest: string): Promise<void>
	/** Retire a Published source without editing its immutable payload. */
	retire(ownerId: string, versionId: string, revision: number): Promise<void>
	/** Read only the requested family's exact tenant-owned version. */
	read(ownerId: string, versionId: string): Promise<WorkConfigurationView | null>
	/** Serialize changes to the selected version before checking its revision. */
	lock(ownerId: string, versionId: string): Promise<WorkConfigurationView | null>
	/** Insert the stable identity whose code cannot be changed by later drafts. */
	createOwner(id: string, code: string): Promise<void>
	/** Allocate a successor ordinal under the tenant mutation lock. */
	nextVersionNumber(ownerId: string): Promise<number>
	/** Store a complete draft and its typed rules or segments atomically. */
	insertVersion(input: WorkConfigurationInsert): Promise<void>
	/** Replace only a current Draft, retaining stable root identity. */
	replace(
		ownerId: string,
		versionId: string,
		revision: number,
		draft: WorkConfigurationDraft,
	): Promise<void>
	/** Read latest versions using a bounded, current-authority continuation. */
	list(query: ScheduleListQuery): Promise<HcmPage<WorkConfigurationView>>
}
export interface WorkConfigurationWork {
	references?: HolidayReferencePort
	previews: PolicyPreviewRepository
	configurations: WorkConfigurationRepository
	receipts: AttendanceCommandReceiptStore
	audit: AppendAudit
	/** Recheck read permission before replaying a previously stored private response. */
	requireRead(): Promise<void>
}
export abstract class WorkConfigurationUnitOfWork {
	/** Bind the selected family's operation to one verified tenant transaction and current grant. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		family: WorkConfigurationFamily,
		operation: 'read' | 'draft' | 'preview' | 'publish' | 'retire',
		write: boolean,
		work: (scope: WorkConfigurationWork) => Promise<T>,
	): Promise<T>
}

/** Validate the closed family's declared business DTO without accepting persisted metadata. */
export function parseWorkConfigurationDraft(
	family: WorkConfigurationFamily,
	value: unknown,
): WorkConfigurationDraft {
	return family === 'Shift' ? parseShiftDraft(value) : parseAttendancePolicyDraft(value)
}

/** Remove read-only metadata before creating an independent successor draft. */
export function workConfigurationDraftOf(
	family: WorkConfigurationFamily,
	source: WorkConfigurationView,
): WorkConfigurationDraft {
	const { id, versionId, versionNumber, revision, state, ...draft } = source
	void [id, versionId, versionNumber, revision, state]
	return parseWorkConfigurationDraft(family, draft)
}

/** Own Shift and Attendance policy draft operations without publishing, assigning, or inventing defaults. */
export class AttendanceWorkConfigurationDrafts {
	/** Reuse the existing Access, audit and idempotency transaction ports. */
	constructor(private readonly unit: WorkConfigurationUnitOfWork) {}

	/** Return the current tenant's latest versions after bounded query validation. */
	list(
		context: AuthenticatedHcmContext,
		family: WorkConfigurationFamily,
		params: URLSearchParams,
	): Promise<HcmPage<WorkConfigurationView>> {
		const query = parseScheduleListQuery(params)
		return this.unit.execute(
			context,
			family,
			'read',
			false,
			/** Keep pagination and counts inside current source authority. */ (work) =>
				work.configurations.list(query),
		)
	}

	/** Read an exact version, uniformly hiding foreign and missing identities. */
	detail(
		context: AuthenticatedHcmContext,
		family: WorkConfigurationFamily,
		ownerId: string,
		versionId: string,
	): Promise<WorkConfigurationView> {
		idValue(ownerId, 'id')
		idValue(versionId, 'version')
		return this.unit.execute(
			context,
			family,
			'read',
			false,
			/** Select only after establishing the current operation grant. */ async (work) => {
				const result = await work.configurations.read(ownerId, versionId)
				if (!result) throw new HcmDomainError('not-found')
				return result
			},
		)
	}

	/** Create a stable root and initial Draft with one atomic response receipt. */
	create(
		context: AuthenticatedHcmContext,
		family: WorkConfigurationFamily,
		key: string,
		value: unknown,
	): Promise<WorkConfigurationView> {
		const draft = parseWorkConfigurationDraft(family, value)
		return this.unit.execute(
			context,
			family,
			'draft',
			true,
			/** Authorize before retrieving any prior response or allocating identity. */ (work) =>
				replaySafe(
					work,
					family + '.create',
					key,
					family,
					draft,
					/** Commit root, typed children, evidence and audit together. */ async () => {
						const ownerId = randomUUID(),
							versionId = randomUUID()
						await work.configurations.createOwner(ownerId, draft.code)
						await work.configurations.insertVersion({
							id: versionId,
							ownerId,
							versionNumber: 1,
							supersedesId: null,
							draft,
						})
						return this.finish(
							work,
							family,
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

	/** Replace a complete Draft only when its root identity and expected revision still match. */
	update(
		context: AuthenticatedHcmContext,
		family: WorkConfigurationFamily,
		ownerId: string,
		versionId: string,
		key: string,
		value: unknown,
	): Promise<WorkConfigurationView> {
		idValue(ownerId, 'id')
		idValue(versionId, 'version')
		const { expectedRevision: revision, draft } =
			family === 'Shift' ? parseShiftUpdate(value) : parseAttendancePolicyUpdate(value)
		return this.unit.execute(
			context,
			family,
			'draft',
			true,
			/** Recheck permission before replay and version locks. */ (work) =>
				replaySafe(
					work,
					family + '.update',
					key,
					ownerId + '/' + versionId,
					{ revision, draft },
					/** Refuse immutable content and stale writes before changing child rows. */ async () => {
						const source = await this.requireVersion(work, ownerId, versionId, revision)
						if (source.state !== 'Draft') throw new HcmDomainError('version-published')
						if (source.code !== draft.code) throw new HcmDomainError('field-not-editable')
						await work.configurations.replace(ownerId, versionId, revision, draft)
						return this.finish(
							work,
							family,
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

	/** Version immutable source content without changing the existing publication or its assignments. */
	newVersion(
		context: AuthenticatedHcmContext,
		family: WorkConfigurationFamily,
		ownerId: string,
		key: string,
		value: unknown,
	): Promise<WorkConfigurationView> {
		idValue(ownerId, 'id')
		const input = parseAttendanceVersionCommand(value)
		return this.unit.execute(
			context,
			family,
			'draft',
			true,
			/** Serialize source checks and successor numbering within current authority. */ (work) =>
				replaySafe(
					work,
					family + '.version',
					key,
					ownerId,
					input,
					/** Copy only immutable business fields into an independent editable version. */ async () => {
						const source = await this.requireVersion(
							work,
							ownerId,
							input.sourceVersionId,
							input.expectedRevision,
						)
						if (source.state === 'Draft') throw new HcmDomainError('invalid-state')
						const versionId = randomUUID()
						await work.configurations.insertVersion({
							id: versionId,
							ownerId,
							versionNumber: await work.configurations.nextVersionNumber(ownerId),
							supersedesId: source.versionId,
							draft: workConfigurationDraftOf(family, source),
						})
						return this.finish(
							work,
							family,
							ownerId,
							versionId,
							key,
							'attendance.configuration-versioned',
							null,
							input.reason,
						)
					},
				),
		)
	}

	/** Lock and compare the exact source revision before any stateful operation. */
	private async requireVersion(
		work: WorkConfigurationWork,
		ownerId: string,
		versionId: string,
		revision: number,
	): Promise<WorkConfigurationView> {
		const source = await work.configurations.lock(ownerId, versionId)
		if (!source) throw new HcmDomainError('not-found')
		if (source.revision !== revision) throw new HcmDomainError('revision-conflict')
		return source
	}

	/** Bind typed receipt evidence and safe audit metadata to the exact returned business projection. */
	private async finish(
		work: WorkConfigurationWork,
		family: WorkConfigurationFamily,
		ownerId: string,
		versionId: string,
		key: string,
		action: string,
		fromState: string | null,
		reason: string | null,
	): Promise<WorkConfigurationView> {
		const view = await work.configurations.read(ownerId, versionId)
		if (!view) throw new Error('Created work configuration unavailable')
		work.receipts.setEvidence({ owner: family, versionId, revision: view.revision, reason })
		await work.audit.append({
			action,
			category: 'business',
			targetType: family === 'Shift' ? 'attendance-shift-version' : 'attendance-policy-version',
			targetId: versionId,
			requestId: key,
			summary: { reason: null, changedFields: ['configuration'], fromState, toState: view.state },
		})
		return view
	}
}
