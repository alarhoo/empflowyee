import { randomUUID } from 'node:crypto'
import {
	parseHolidayDraft,
	parseHolidayDraftUpdate,
	parseAttendanceVersionCommand,
	type HolidayDraft,
	type HolidayVersionView,
} from '@empflowyee/hcm-attendance-contract'
import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type { AppendAudit } from '@empflowyee/hcm-api-audit-application'
import type { AttendanceCommandReceiptStore } from './configuration-evidence'
import { replaySafe } from './schedule-commands'

export interface HolidayVersionInsert {
	id: string
	ownerId: string
	versionNumber: number
	supersedesId: string | null
	draft: HolidayDraft
}
export interface HolidayRepository {
	/** Return an exact-version purpose-built projection in the current tenant. */
	read(ownerId: string, versionId: string): Promise<HolidayVersionView | null>
	/** Lock only the requested tenant/calendar/version before evaluating its lifecycle. */
	lock(ownerId: string, versionId: string): Promise<HolidayVersionView | null>
	/** Create the immutable calendar identity. */
	createOwner(id: string, code: string): Promise<void>
	/** Allocate an ordinal under the exclusive configuration mutation boundary. */
	nextVersionNumber(ownerId: string): Promise<number>
	/** Insert one draft with explicit actual/observed dates and typed partial intervals. */
	insertVersion(input: HolidayVersionInsert): Promise<void>
	/** Replace only an exact editable revision and its entries. */
	replace(ownerId: string, versionId: string, revision: number, draft: HolidayDraft): Promise<void>
}
export interface AttendanceHolidayWork {
	holidayCalendars: HolidayRepository
	receipts: AttendanceCommandReceiptStore
	audit: AppendAudit
	/** Recheck source read permission even when returning an earlier command receipt. */
	requireRead(): Promise<void>
}
export abstract class AttendanceHolidayUnitOfWork {
	/** Require current tenant-wide authority and bind every effect to the same transaction. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		operation: 'draft' | 'read',
		write: boolean,
		work: (scope: AttendanceHolidayWork) => Promise<T>,
	): Promise<T>
}

/** Return only editable business fields when creating a successor from an immutable version. */
export function holidayDraftOf(source: HolidayVersionView): HolidayDraft {
	const { id, versionId, versionNumber, revision, state, ...draft } = source
	void [id, versionId, versionNumber, revision, state]
	return parseHolidayDraft(draft)
}

/** Holiday draft curation; dated impact preview and assignment remain separate authorized operations. */
export class AttendanceHolidayDrafts {
	/** Depend only on the owner transaction port, independent of HTTP and SQL. */
	constructor(private readonly unit: AttendanceHolidayUnitOfWork) {}

	/** Read one exact version without granting access from its route identity. */
	read(
		context: AuthenticatedHcmContext,
		ownerId: string,
		versionId: string,
	): Promise<HolidayVersionView> {
		idValue(ownerId, 'id')
		idValue(versionId, 'version')
		return this.unit.execute(
			context,
			'read',
			false,
			/** Read only after current authorization. */ async (work) => {
				const value = await work.holidayCalendars.read(ownerId, versionId)
				if (!value) throw new HcmDomainError('not-found')
				return value
			},
		)
	}

	/** Persist an explicitly supplied calendar draft with one atomic audit/result receipt. */
	create(
		context: AuthenticatedHcmContext,
		key: string,
		value: unknown,
	): Promise<HolidayVersionView> {
		const draft = parseHolidayDraft(value)
		return this.unit.execute(
			context,
			'draft',
			true,
			/** Authorize before checking actor-owned retry evidence. */ (work) =>
				replaySafe(
					work,
					'Holidays.create',
					key,
					'Holidays',
					draft,
					/** Create once without publishing or assigning. */ async () => {
						const ownerId = randomUUID(),
							versionId = randomUUID()
						await work.holidayCalendars.createOwner(ownerId, draft.code)
						await work.holidayCalendars.insertVersion({
							id: versionId,
							ownerId,
							versionNumber: 1,
							supersedesId: null,
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

	/** Replace a complete draft using its exact revision while keeping calendar identity immutable. */
	update(
		context: AuthenticatedHcmContext,
		ownerId: string,
		versionId: string,
		key: string,
		value: unknown,
	): Promise<HolidayVersionView> {
		idValue(ownerId, 'id')
		idValue(versionId, 'version')
		const input = parseHolidayDraftUpdate(value)
		return this.unit.execute(
			context,
			'draft',
			true,
			/** Reauthorize before source lookup or receipt replay. */ (work) =>
				replaySafe(
					work,
					'Holidays.update',
					key,
					ownerId + '/' + versionId,
					input,
					/** Reject stale or published content instead of patching history. */ async () => {
						const current = await this.requireVersion(
							work,
							ownerId,
							versionId,
							input.expectedRevision,
						)
						if (current.state !== 'Draft') throw new HcmDomainError('version-published')
						if (current.code !== input.draft.code) throw new HcmDomainError('field-not-editable')
						await work.holidayCalendars.replace(
							ownerId,
							versionId,
							input.expectedRevision,
							input.draft,
						)
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

	/** Start an independently editable successor from a Published or Retired version, retaining private reason evidence. */
	newVersion(
		context: AuthenticatedHcmContext,
		ownerId: string,
		key: string,
		value: unknown,
	): Promise<HolidayVersionView> {
		idValue(ownerId, 'id')
		const input = parseAttendanceVersionCommand(value)
		return this.unit.execute(
			context,
			'draft',
			true,
			/** Serialize numbering and current-source checks. */ (work) =>
				replaySafe(
					work,
					'Holidays.version',
					key,
					ownerId,
					input,
					/** Preserve immutable source dates and explicitly supplied observed dates. */ async () => {
						const current = await this.requireVersion(
							work,
							ownerId,
							input.sourceVersionId,
							input.expectedRevision,
						)
						if (current.state === 'Draft') throw new HcmDomainError('invalid-state')
						const versionId = randomUUID()
						await work.holidayCalendars.insertVersion({
							id: versionId,
							ownerId,
							versionNumber: await work.holidayCalendars.nextVersionNumber(ownerId),
							supersedesId: current.versionId,
							draft: holidayDraftOf(current),
						})
						return this.finish(
							work,
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

	/** Hide wrong-owner and foreign-tenant versions before checking the expected revision. */
	private async requireVersion(
		work: AttendanceHolidayWork,
		ownerId: string,
		versionId: string,
		revision: number,
	): Promise<HolidayVersionView> {
		const current = await work.holidayCalendars.lock(ownerId, versionId)
		if (!current) throw new HcmDomainError('not-found')
		if (current.revision !== revision) throw new HcmDomainError('revision-conflict')
		return current
	}

	/** Bind encrypted reason evidence and safe audit to the same commit as the public projection. */
	private async finish(
		work: AttendanceHolidayWork,
		ownerId: string,
		versionId: string,
		key: string,
		action: string,
		fromState: string | null,
		reason: string | null,
	): Promise<HolidayVersionView> {
		const view = await work.holidayCalendars.read(ownerId, versionId)
		if (!view) throw new Error('Created holiday version unavailable')
		work.receipts.setEvidence({ owner: 'Holiday', versionId, revision: view.revision, reason })
		await work.audit.append({
			action,
			category: 'business',
			targetType: 'attendance-holiday-calendar-version',
			targetId: versionId,
			requestId: key,
			summary: { reason: null, changedFields: ['configuration'], fromState, toState: view.state },
		})
		return view
	}
}
