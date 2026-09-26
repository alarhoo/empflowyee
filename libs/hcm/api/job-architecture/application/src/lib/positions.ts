import { createHash, randomUUID } from 'node:crypto'
import {
	PREVIEW_TTL_MINUTES,
	parseDecide,
	parsePageQuery,
	parsePositionOptionKind,
	parsePositionOptionQuery,
	parsePositionQuery,
	parsePositionRequestCreate,
	parsePositionRequestQuery,
	parsePositionRequestUpdate,
	parsePositionSubmit,
	parsePreview,
	parseWithdraw,
	type IncumbentPage,
	type PositionChangeRequestDto,
	type PositionChangeRequestPage,
	type PositionDetailDto,
	type PositionOptionPage,
	type PositionPage,
	type PositionPlacementDto,
	type PositionProposal,
	type PositionProposalDto,
	type PositionSummaryDto,
	type PositionVersionDto,
	type PositionVersionPage,
	type ImpactPreviewDto,
	type PositionApprovalDto,
	type VarianceDto,
	type ReferenceDto,
} from '@empflowyee/hcm-job-architecture-contract'
import { HcmDomainError, idValue, invalidField } from '@empflowyee/hcm-runtime-contract'
import {
	commandHash,
	runIdempotent,
	type AuthenticatedHcmContext,
	type CipherTarget,
	type SealedValue,
} from '@empflowyee/hcm-api-runtime-application'
import type { StructureReferenceKind } from '@empflowyee/hcm-api-workforce-foundation-application'
import {
	capacityDecision,
	dayBefore,
	lifecycleTarget,
	remainingCapacity,
	requireCancellable,
	requireCapacity,
	requireEffectiveAfter,
	requireIndependentDecider,
	requireNoPositionCycle,
	requirePreviewValid,
	requireRequestStatus,
	type OccupancyFacts,
} from '@empflowyee/hcm-api-job-architecture-domain'
import type { JobArchitectureUnitOfWork, JobArchitectureWork } from './job-architecture-unit'
import type {
	ApprovalRow,
	ChangeItemInput,
	PreviewRow,
	PositionRow,
	PositionVersionRow,
	RequestRow,
} from './position-repository'

const READ = 'positions.read'
const REQUEST = 'positions.request'
const APPROVE = 'positions.approve'
const WAIVE = 'position-requirements.waive'
/** The most pages a vacancy filter scans to fill one page. */
const VACANCY_SCAN_PAGES = 10

/** A stable SHA-256 digest. */
function digest(content: unknown): string {
	return createHash('sha256').update(JSON.stringify(content)).digest('hex')
}

/** Refuse a stale expected revision. */
function requireRevision(current: number, expected: number): void {
	if (current !== expected) throw new HcmDomainError('revision-conflict')
}

/** Where a request's sealed reason lives. */
function reasonTarget(requestId: string, column = 'encrypted_reason'): CipherTarget {
	return { table: 'position_change_request', column, rowId: requestId }
}

/** Placement fields of a proposal and the structure kind each references. */
const PLACEMENT: readonly [
	'designationId' | 'legalEntityId' | 'unitId' | 'departmentId' | 'locationId',
	StructureReferenceKind,
	keyof PositionPlacementDto,
][] = [
	['designationId', 'designations', 'designation'],
	['legalEntityId', 'legal-entities', 'legalEntity'],
	['unitId', 'units', 'unit'],
	['departmentId', 'departments', 'department'],
	['locationId', 'locations', 'location'],
]

/** Proposal fields compared for change items, with safe labels. */
const COMPARED: readonly [keyof PositionProposal, string][] = [
	['name', 'Name'],
	['profileVersionId', 'Job profile'],
	['gradeId', 'Grade'],
	['designationId', 'Designation'],
	['legalEntityId', 'Legal entity'],
	['unitId', 'Unit'],
	['departmentId', 'Department'],
	['locationId', 'Location'],
	['positionType', 'Type'],
	['headcountCapacity', 'Headcount capacity'],
	['fteCapacity', 'FTE capacity'],
	['keyPosition', 'Key position'],
	['costCenterCode', 'Cost centre'],
	['effectiveFrom', 'Effective from'],
	['reportsToPositionId', 'Reports to'],
]

/** Positions use cases: occupancy-backed reads and previewed, independently approved changes. */
export class Positions {
	/** Bind the use cases to the job architecture unit of work. */
	constructor(private readonly unit: JobArchitectureUnitOfWork) {}

	/** Positions with occupancy on today's business date. */
	list(context: AuthenticatedHcmContext, params: URLSearchParams): Promise<PositionPage> {
		const query = parsePositionQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Page positions, scanning further pages when filtering by vacancy. */ async (w) => {
				const { hasVacancy, ...base } = query
				if (hasVacancy === undefined) {
					const page = await w.positions.positions(base, w.today)
					return { items: await this.summaries(w, page.items), nextCursor: page.nextCursor }
				}
				const items: PositionSummaryDto[] = []
				let cursor = base.cursor
				for (let scanned = 0; scanned < VACANCY_SCAN_PAGES; scanned++) {
					const page = await w.positions.positions(
						{ ...base, limit: base.limit - items.length, ...(cursor ? { cursor } : {}) },
						w.today,
					)
					for (const item of await this.summaries(w, page.items))
						if (this.vacant(item) === hasVacancy) items.push(item)
					cursor = page.nextCursor ?? undefined
					if (!cursor || items.length >= base.limit) break
				}
				return { items, nextCursor: cursor ?? null }
			},
		)
	}

	/** One position with its current version, relationships and occupancy. */
	detail(context: AuthenticatedHcmContext, id: string): Promise<PositionDetailDto> {
		idValue(id, 'id')
		return this.unit.execute(
			context,
			READ,
			false,
			/** Read the position. */ (w) => this.readDetail(w, id),
		)
	}

	/** Incumbents occupying a position today. */
	incumbents(
		context: AuthenticatedHcmContext,
		id: string,
		params: URLSearchParams,
	): Promise<IncumbentPage> {
		idValue(id, 'id')
		const page = parsePageQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Page the incumbents of a visible position. */ async (w) => {
				await this.requirePosition(w, id)
				return w.occupancy.incumbents(id, w.today, page)
			},
		)
	}

	/** Published versions of a position, newest first. */
	versions(
		context: AuthenticatedHcmContext,
		id: string,
		params: URLSearchParams,
	): Promise<PositionVersionPage> {
		idValue(id, 'id')
		const page = parsePageQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Page the versions. */ async (w) => {
				await this.requirePosition(w, id)
				const result = await w.positions.versions(id, page)
				return { items: await this.versionDtos(w, result.items), nextCursor: result.nextCursor }
			},
		)
	}

	/** Change requests, optionally only mine or those awaiting my decision. */
	requests(
		context: AuthenticatedHcmContext,
		params: URLSearchParams,
	): Promise<PositionChangeRequestPage> {
		const query = parsePositionRequestQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Page the requests. */ async (w) => {
				const { view, ...rest } = query
				if (view === 'mine') return w.positions.requests({ ...rest, requestedBy: w.accountId })
				if (view === 'awaiting-my-decision') {
					if (!(await w.holds(APPROVE))) return { items: [], nextCursor: null }
					return w.positions.requests({
						...rest,
						awaitingDecisionBy: { accountId: w.accountId, waive: await w.holds(WAIVE) },
					})
				}
				return w.positions.requests(rest)
			},
		)
	}

	/** One change request; reasons and comments only for the requester and approvers. */
	request(context: AuthenticatedHcmContext, id: string): Promise<PositionChangeRequestDto> {
		idValue(id, 'id')
		return this.unit.execute(
			context,
			READ,
			false,
			/** Read the request. */ (w) => this.readRequest(w, id),
		)
	}

	/** Options for a proposal's references. */
	options(
		context: AuthenticatedHcmContext,
		kind: string,
		params: URLSearchParams,
	): Promise<PositionOptionPage> {
		const optionKind = parsePositionOptionKind(kind)
		const query = parsePositionOptionQuery(params)
		const page = { limit: query.limit, ...(query.cursor ? { cursor: query.cursor } : {}) }
		return this.unit.execute(
			context,
			REQUEST,
			false,
			/** Page one option kind. */ async (w) => {
				if (optionKind === 'profiles') return w.positions.profileOptions(query.q, page)
				if (optionKind === 'positions') return w.positions.positionOptions(query.q, page)
				const result = await w.structure.options(
					optionKind,
					{ q: query.q, sort: 'name:asc', activeOnly: true, ...page },
					w.today,
				)
				return {
					items: result.items.map(
						/** Structure option. */ (item) => ({
							id: item.id,
							code: item.code,
							name: item.name,
							grades: [],
						}),
					),
					nextCursor: result.nextCursor,
				}
			},
		)
	}

	/** Raise a Create, Change or lifecycle request as a draft. */
	createRequest(
		context: AuthenticatedHcmContext,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<PositionChangeRequestDto> {
		const command = parsePositionRequestCreate(body)
		return this.command(
			context,
			REQUEST,
			'request.create',
			command,
			key,
			/** Store the position, draft version and request. */ async (w) => {
				const id = randomUUID()
				const reason = await w.cipher.encrypt(reasonTarget(id), command.reason)
				if (command.requestType === 'Create') {
					const positionId = `position/${randomUUID()}`
					await this.validateProposal(w, positionId, command.proposed, null)
					await w.positions.insertPosition(positionId, command.code, command.proposed.name)
					const versionId = `${positionId}/v1`
					await w.positions.insertVersion({
						id: versionId,
						positionId,
						versionNumber: 1,
						supersedesId: null,
						proposal: command.proposed,
						changeSummary: 'New position.',
					})
					await w.positions.insertRequest({
						id,
						positionId,
						requestType: 'Create',
						baseVersionId: null,
						proposedVersionId: versionId,
						proposedName: command.proposed.name,
						reportsToPositionId: command.proposed.reportsToPositionId,
						reason,
					})
					await w.positions.replaceItems(id, this.diff(null, command.proposed, null))
				} else {
					const position = await w.positions.lockPosition(command.positionId)
					if (!position) throw new HcmDomainError('not-found')
					lifecycleTarget(command.requestType, position.lifecycleStatus)
					if (await this.openRequest(w, position.id)) throw new HcmDomainError('invalid-state')
					const base = position.currentVersionId
						? await w.positions.version(position.currentVersionId)
						: undefined
					if (!base) throw new HcmDomainError('invalid-state')
					if (command.requestType === 'Change') {
						await this.validateProposal(w, position.id, command.proposed, base)
						const versionId = `${position.id}/v${position.latestVersionNumber + 1}`
						await w.positions.insertVersion({
							id: versionId,
							positionId: position.id,
							versionNumber: position.latestVersionNumber + 1,
							supersedesId: base.id,
							proposal: command.proposed,
							changeSummary: 'Position change.',
						})
						await w.positions.insertRequest({
							id,
							positionId: position.id,
							requestType: 'Change',
							baseVersionId: base.id,
							proposedVersionId: versionId,
							proposedName: command.proposed.name,
							reportsToPositionId: command.proposed.reportsToPositionId,
							reason,
						})
						await w.positions.replaceItems(
							id,
							this.diff(
								this.proposalOf(base, position.name, await this.reportsTo(w, position.id)),
								command.proposed,
								null,
							),
						)
					} else {
						if (command.requestType === 'Cancel')
							requireCancellable(await this.occupancyOf(w, position.id))
						await w.positions.insertRequest({
							id,
							positionId: position.id,
							requestType: command.requestType,
							baseVersionId: base.id,
							proposedVersionId: null,
							proposedName: null,
							reportsToPositionId: null,
							reason,
						})
						await w.positions.replaceItems(
							id,
							this.diff(null, null, {
								from: position.lifecycleStatus,
								to: lifecycleTarget(command.requestType, position.lifecycleStatus),
							}),
						)
					}
				}
				await this.audit(w, 'job-architecture.position-change-requested', id, requestId, {
					changedFields: ['requestType'],
					fromState: null,
					toState: 'Draft',
				})
				return this.readRequest(w, id)
			},
		)
	}

	/** Replace a draft Create or Change proposal; an edit after preview makes the preview stale. */
	updateRequest(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<PositionChangeRequestDto> {
		idValue(id, 'id')
		const command = parsePositionRequestUpdate(body)
		return this.command(
			context,
			REQUEST,
			'request.update',
			{ id, command },
			key,
			/** Validate and replace the proposal. */ async (w) => {
				const request = await this.lockOwnRequest(w, id, command.expectedRevision)
				requireRequestStatus(request.status, ['Draft', 'Previewed'])
				if (!request.proposedVersionId) throw new HcmDomainError('invalid-state')
				const base = request.baseVersionId
					? await w.positions.version(request.baseVersionId)
					: undefined
				await this.validateProposal(w, request.positionId, command.proposed, base ?? null)
				await w.positions.replaceVersion(request.proposedVersionId, command.proposed)
				if (request.requestType === 'Create')
					await w.positions.updatePosition(request.positionId, { name: command.proposed.name })
				await w.positions.stalePreviews(id)
				await w.positions.updateRequest(id, {
					status: 'Draft',
					reason: await w.cipher.encrypt(reasonTarget(id), command.reason),
					proposedName: command.proposed.name,
					reportsToPositionId: command.proposed.reportsToPositionId,
				})
				let before: PositionProposal | null = null
				if (base) {
					const line = await this.reportsTo(w, request.positionId)
					before = this.proposalOf(base, request.positionName, line)
				}
				await w.positions.replaceItems(id, this.diff(before, command.proposed, null))
				await this.audit(w, 'job-architecture.position-change-updated', id, requestId, {
					changedFields: ['proposed'],
					fromState: request.status,
					toState: 'Draft',
				})
				return this.readRequest(w, id)
			},
		)
	}

	/** Calculate the impact preview; valid for 15 minutes while the sources stay unchanged. */
	preview(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<PositionChangeRequestDto> {
		idValue(id, 'id')
		const command = parsePreview(body)
		return this.command(
			context,
			REQUEST,
			'request.preview',
			{ id, command },
			key,
			/** Build the preview. */ async (w) => {
				const request = await this.lockOwnRequest(w, id, command.expectedRevision)
				requireRequestStatus(request.status, ['Draft', 'Previewed'])
				const occupancy =
					request.requestType === 'Create'
						? { headcount: 0, fte: 0, complete: true }
						: await this.occupancyOf(w, request.positionId)
				const references = await w.positions.references(request.positionId, w.today)
				await w.positions.stalePreviews(id)
				await w.positions.insertPreview({
					id: randomUUID(),
					requestId: id,
					previewRevision: request.revision + 1,
					activeAssignmentCount: occupancy.complete ? occupancy.headcount : null,
					assignedFte: occupancy.complete ? occupancy.fte : null,
					occupancyComplete: occupancy.complete,
					childPositionCount: references.children,
					downstreamReferenceCount: references.others,
					sourceDigest: await this.sourceDigest(w, request),
					ttlMinutes: PREVIEW_TTL_MINUTES,
				})
				await w.positions.updateRequest(id, { status: 'Previewed' })
				await this.audit(w, 'job-architecture.position-change-previewed', id, requestId, {
					changedFields: ['preview'],
					fromState: request.status,
					toState: 'Previewed',
				})
				return this.readRequest(w, id)
			},
		)
	}

	/** Submit with a valid preview; the request then awaits one independent approver. */
	submit(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<PositionChangeRequestDto> {
		idValue(id, 'id')
		const command = parsePositionSubmit(body)
		return this.command(
			context,
			REQUEST,
			'request.submit',
			{ id, command },
			key,
			/** Bind the submission to the preview. */ async (w) => {
				const request = await this.lockOwnRequest(w, id, command.expectedRevision)
				requireRequestStatus(request.status, ['Previewed'])
				const preview = await w.positions.preview(id)
				if (preview?.id !== command.previewId) throw new HcmDomainError('preview-stale')
				requirePreviewValid(preview, new Date(), await this.sourceDigest(w, request))
				await this.requireStillApplicable(w, request)
				const waive = await this.hasWaive(w, request.proposedVersionId)
				if (request.proposedVersionId)
					await w.positions.setVersionStatus(request.proposedVersionId, 'InReview')
				await w.positions.updateRequest(id, { status: 'PendingApproval', submitted: true })
				await w.positions.insertApprovalCase({
					id: randomUUID(),
					requestId: id,
					subjectVersion: request.revision + 1,
					previewId: preview.id,
					requiresWaiveAuthority: waive,
					policyDigest: digest({ policy: 'DEC-HCM2-008', approvers: 1, waive }),
				})
				await this.audit(w, 'job-architecture.position-change-submitted', id, requestId, {
					changedFields: ['status'],
					fromState: 'Previewed',
					toState: 'PendingApproval',
				})
				return this.readRequest(w, id)
			},
		)
	}

	/** Withdraw an open request before it is decided. */
	withdraw(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<PositionChangeRequestDto> {
		idValue(id, 'id')
		const command = parseWithdraw(body)
		return this.command(
			context,
			REQUEST,
			'request.withdraw',
			{ id, command },
			key,
			/** Withdraw and release the proposal. */ async (w) => {
				const request = await this.lockOwnRequest(w, id, command.expectedRevision)
				requireRequestStatus(request.status, ['Draft', 'Previewed', 'PendingApproval'])
				await this.close(w, request, 'Withdrawn')
				await w.positions.updateRequest(id, {
					status: 'Withdrawn',
					withdrawalReason: await w.cipher.encrypt(
						reasonTarget(id, 'encrypted_withdrawal_reason'),
						command.reason,
					),
				})
				await this.audit(w, 'job-architecture.position-change-withdrawn', id, requestId, {
					changedFields: ['status'],
					fromState: request.status,
					toState: 'Withdrawn',
				})
				return this.readRequest(w, id)
			},
		)
	}

	/**
	 * Approve or reject (DEC-HCM2-008). The decision binds to the request revision and the preview's
	 * source digest; approval applies the change in the same transaction.
	 */
	decide(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<PositionChangeRequestDto> {
		idValue(id, 'id')
		const command = parseDecide(body)
		return this.command(
			context,
			APPROVE,
			'request.decide',
			{ id, command },
			key,
			/** Decide, then apply or close. */ async (w) => {
				const request = await w.positions.lockRequest(id)
				if (!request) throw new HcmDomainError('not-found')
				requireRevision(request.revision, command.expectedRevision)
				requireRequestStatus(request.status, ['PendingApproval'])
				requireIndependentDecider(request.requestedById, w.accountId)
				const approval = await w.positions.approval(id)
				if (!approval || approval.status !== 'Pending') throw new HcmDomainError('invalid-state')
				if (approval.requiresWaiveAuthority && !(await w.holds(WAIVE)))
					throw new HcmDomainError('forbidden')
				const preview = await w.positions.preview(id)
				if (
					preview?.id !== approval.previewId ||
					preview.sourceDigest !== (await this.sourceDigest(w, request))
				)
					throw new HcmDomainError('preview-stale')
				const decisionId = randomUUID()
				const comment = await this.seal(
					w,
					{ table: 'position_decision', column: 'encrypted_comment', rowId: decisionId },
					command.comment,
				)
				if (command.decision === 'Rejected') {
					await w.positions.insertDecision({
						id: decisionId,
						caseId: approval.id,
						decision: 'Rejected',
						subjectVersion: approval.subjectVersion,
						comment,
						idempotencyKey: key,
						applied: false,
					})
					await w.positions.completeApprovalCase(approval.id, 'Rejected')
					await this.close(w, request, 'Rejected')
					await w.positions.updateRequest(id, { status: 'Rejected' })
					await this.audit(w, 'job-architecture.position-change-rejected', id, requestId, {
						changedFields: ['status'],
						fromState: 'PendingApproval',
						toState: 'Rejected',
					})
					return this.readRequest(w, id)
				}
				await w.positions.updateRequest(id, { status: 'Applying' })
				await this.apply(w, request, requestId)
				await w.positions.insertDecision({
					id: decisionId,
					caseId: approval.id,
					decision: 'Approved',
					subjectVersion: approval.subjectVersion,
					comment,
					idempotencyKey: key,
					applied: true,
				})
				await w.positions.completeApprovalCase(approval.id, 'Approved')
				await w.positions.updateRequest(id, { status: 'Applied', applied: true })
				await this.audit(w, 'job-architecture.position-change-approved', id, requestId, {
					changedFields: ['status'],
					fromState: 'PendingApproval',
					toState: 'Applied',
				})
				return this.readRequest(w, id)
			},
		)
	}

	/** Publish the proposed version or change the lifecycle; assignments are never ended. */
	private async apply(
		w: JobArchitectureWork,
		request: RequestRow,
		requestId: string,
	): Promise<void> {
		const position = await w.positions.lockPosition(request.positionId)
		if (!position) throw new HcmDomainError('not-found')
		const target = lifecycleTarget(request.requestType, position.lifecycleStatus)
		if (request.requestType === 'Cancel') requireCancellable(await this.occupancyOf(w, position.id))
		if (!request.proposedVersionId) {
			await w.positions.updatePosition(position.id, { lifecycleStatus: target })
			await this.audit(w, 'job-architecture.position-lifecycle-changed', position.id, requestId, {
				changedFields: ['lifecycleStatus'],
				fromState: position.lifecycleStatus,
				toState: target,
			})
			return
		}
		const proposed = await w.positions.version(request.proposedVersionId)
		if (!proposed) throw new HcmDomainError('not-found')
		const base = request.baseVersionId ? await w.positions.version(request.baseVersionId) : null
		if (base) requireEffectiveAfter(base.effectiveFrom, proposed.effectiveFrom)
		await w.positions.publishVersion({
			id: proposed.id,
			positionId: position.id,
			digest: digest({ proposed, reportsTo: request.reportsToPositionId }),
			previous: base ? { id: base.id, effectiveTo: dayBefore(proposed.effectiveFrom) } : null,
		})
		await w.positions.setSolidLine(position.id, request.reportsToPositionId, proposed.effectiveFrom)
		await w.positions.updatePosition(position.id, {
			name: request.proposedName ?? position.name,
			lifecycleStatus: target,
			currentVersionId: proposed.id,
		})
		await this.audit(w, 'job-architecture.position-version-published', position.id, requestId, {
			changedFields: ['currentVersion'],
			fromState: position.lifecycleStatus,
			toState: target,
		})
	}

	/** Release a withdrawn or rejected request's proposal; a never-published position is cancelled. */
	private async close(
		w: JobArchitectureWork,
		request: RequestRow,
		outcome: 'Withdrawn' | 'Rejected',
	): Promise<void> {
		await w.positions.stalePreviews(request.id)
		const approval = await w.positions.approval(request.id)
		if (outcome === 'Withdrawn' && approval?.status === 'Pending')
			await w.positions.completeApprovalCase(approval.id, 'Cancelled')
		if (request.proposedVersionId)
			await w.positions.setVersionStatus(request.proposedVersionId, 'Cancelled')
		if (request.requestType === 'Create')
			await w.positions.updatePosition(request.positionId, { lifecycleStatus: 'Cancelled' })
	}

	/** Refuse a submission whose request no longer applies to the position. */
	private async requireStillApplicable(w: JobArchitectureWork, request: RequestRow): Promise<void> {
		const position = await w.positions.lockPosition(request.positionId)
		if (!position) throw new HcmDomainError('not-found')
		lifecycleTarget(request.requestType, position.lifecycleStatus)
		if (request.baseVersionId && position.currentVersionId !== request.baseVersionId)
			throw new HcmDomainError('preview-stale')
		if (request.requestType === 'Cancel') requireCancellable(await this.occupancyOf(w, position.id))
		if (request.requestType === 'Change' && request.proposedVersionId) {
			// No overfill: a smaller capacity must still hold today's occupancy (DEC-HCM2-007).
			const proposed = await w.positions.version(request.proposedVersionId)
			const occupancy = await this.occupancyOf(w, position.id)
			if (proposed && (occupancy.headcount ?? 0) + (occupancy.fte ?? 0) > 0)
				requireCapacity(capacityDecision(proposed, occupancy, 0, 0))
		}
	}

	/**
	 * The digest of everything a preview describes: the position's state and version, the base and
	 * proposed content and the proposed line. Any change makes an earlier preview stale.
	 */
	private async sourceDigest(w: JobArchitectureWork, request: RequestRow): Promise<string> {
		const position = await w.positions.lockPosition(request.positionId)
		const proposed = request.proposedVersionId
			? await w.positions.version(request.proposedVersionId)
			: null
		const variances = request.proposedVersionId
			? await w.positions.variances(request.proposedVersionId)
			: []
		return digest({
			position: position && {
				lifecycle: position.lifecycleStatus,
				current: position.currentVersionId,
				revision: position.revision,
			},
			base: request.baseVersionId,
			proposed: proposed && { ...proposed, revision: undefined, status: undefined },
			name: request.proposedName,
			reportsTo: request.reportsToPositionId,
			variances: variances.map(
				/** Without sealed values, which differ per encryption. */ ({
					justification,
					...item
				}) => ({
					...item,
					justified: justification !== null,
				}),
			),
		})
	}

	/** Validate a proposal's references on its effective date (business rules 7, 10, 11, 12). */
	private async validateProposal(
		w: JobArchitectureWork,
		positionId: string,
		proposal: PositionProposal,
		base: PositionVersionRow | null,
	): Promise<void> {
		if (base) requireEffectiveAfter(base.effectiveFrom, proposal.effectiveFrom)
		const profile = await w.catalogue.profileVersion(proposal.profileVersionId)
		if (!profile || profile.status !== 'Published') invalidField('profileVersionId', 'unknown')
		if (
			!profile.allowedGrades.some(
				/** The chosen grade. */ (grade) => grade.gradeId === proposal.gradeId,
			)
		)
			invalidField('gradeId', 'not-allowed')
		for (const [field, kind] of PLACEMENT) {
			const value = proposal[field]
			if (typeof value === 'string')
				await w.structure.requireReference(kind, value, field, proposal.effectiveFrom)
		}
		if (proposal.reportsToPositionId) {
			if (proposal.reportsToPositionId === positionId) invalidField('reportsToPositionId', 'cycle')
			const target = await w.positions.position(proposal.reportsToPositionId, w.today)
			if (!target || !['Open', 'Frozen'].includes(target.lifecycleStatus))
				invalidField('reportsToPositionId', 'unknown')
			requireNoPositionCycle(
				positionId,
				await w.positions.ancestors(proposal.reportsToPositionId, proposal.effectiveFrom),
			)
		}
	}

	/** Change items between the current and proposed facts, or a lifecycle transition. */
	private diff(
		before: PositionProposal | null,
		after: PositionProposal | null,
		lifecycle: { from: string; to: string } | null,
	): ChangeItemInput[] {
		if (lifecycle)
			return [
				{
					field: 'lifecycleStatus',
					changeType: 'Set',
					summary: `Status: ${lifecycle.from} → ${lifecycle.to}`,
					oldDigest: digest(lifecycle.from),
					newDigest: digest(lifecycle.to),
				},
			]
		if (!after) return []
		const items: ChangeItemInput[] = []
		for (const [field, label] of COMPARED) {
			const old = before ? before[field] : null
			const next = after[field]
			if (old === next) continue
			const changeType = next === null || next === '' ? 'Clear' : 'Set'
			/** A safe display of a value; identifiers are never shown. */
			const shown = (value: unknown) =>
				typeof value === 'string' && value.includes('/') ? 'changed' : String(value)
			const summary =
				field.endsWith('Id') || old === null
					? `${label}: ${changeType === 'Clear' ? 'cleared' : 'set'}`
					: `${label}: ${shown(old)} → ${shown(next)}`
			items.push({
				field,
				changeType,
				summary: summary.slice(0, 200),
				oldDigest: old === null ? null : digest(old),
				newDigest: next === null ? null : digest(next),
			})
		}
		return items
	}

	/** The facts of a stored version as a proposal. */
	private proposalOf(
		version: PositionVersionRow,
		name: string,
		reportsTo: string | null,
	): PositionProposal {
		return {
			name,
			profileVersionId: version.profileVersionId,
			gradeId: version.gradeId,
			designationId: version.designationId,
			legalEntityId: version.legalEntityId,
			unitId: version.unitId,
			departmentId: version.departmentId,
			locationId: version.locationId,
			positionType: version.positionType,
			headcountCapacity: version.headcountCapacity,
			fteCapacity: version.fteCapacity,
			keyPosition: version.keyPosition,
			costCenterCode: version.costCenterCode,
			effectiveFrom: version.effectiveFrom,
			reportsToPositionId: reportsTo,
		}
	}

	/** The position a position reports to on a solid line today. */
	private async reportsTo(w: JobArchitectureWork, positionId: string): Promise<string | null> {
		return (await w.positions.ancestors(positionId, w.today))[0] ?? null
	}

	/** Today's occupancy of one position. */
	private async occupancyOf(w: JobArchitectureWork, positionId: string): Promise<OccupancyFacts> {
		return (
			(await w.occupancy.occupancy([positionId], w.today)).get(positionId) ?? {
				headcount: null,
				fte: null,
				complete: false,
			}
		)
	}

	/** The open request of a position, if any. */
	private async openRequest(w: JobArchitectureWork, positionId: string): Promise<boolean> {
		return (await w.positions.position(positionId, w.today))?.openRequest !== null
	}

	/** Lock a request the actor raised; other requesters' requests are not theirs to change. */
	private async lockOwnRequest(
		w: JobArchitectureWork,
		id: string,
		expectedRevision: number,
	): Promise<RequestRow> {
		const request = await w.positions.lockRequest(id)
		if (!request) throw new HcmDomainError('not-found')
		if (request.requestedById !== w.accountId) throw new HcmDomainError('forbidden')
		requireRevision(request.revision, expectedRevision)
		return request
	}

	/** Require a position to exist. */
	private async requirePosition(w: JobArchitectureWork, id: string): Promise<PositionRow> {
		const position = await w.positions.position(id, w.today)
		if (!position) throw new HcmDomainError('not-found')
		return position
	}

	/** True, false, or null when vacancy is unknown. */
	private vacant(item: PositionSummaryDto): boolean | null {
		if (!item.occupancyComplete || item.remainingHeadcount === null || item.remainingFte === null)
			return null
		return item.remainingHeadcount > 0 && item.remainingFte > 0
	}

	/** Summaries with occupancy and placement labels. */
	private async summaries(
		w: JobArchitectureWork,
		rows: readonly PositionRow[],
	): Promise<PositionSummaryDto[]> {
		const occupancy = await w.occupancy.occupancy(
			rows.filter(/** Published only. */ (row) => row.version).map(/** Id. */ (row) => row.id),
			w.today,
		)
		const placements = await this.placements(
			w,
			rows.map(/** Version. */ (row) => row.version),
		)
		return rows.map(
			/** One summary. */ (row, index) => {
				const version = row.version
				const facts = occupancy.get(row.id)
				const counts = version && facts ? facts : { headcount: null, fte: null, complete: false }
				const remaining = version
					? remainingCapacity(version, counts)
					: { headcount: null, fte: null }
				return {
					id: row.id,
					code: row.code,
					name: row.name,
					lifecycleStatus: row.lifecycleStatus,
					placement: placements[index] ?? this.emptyPlacement(),
					profile: version?.profile ?? null,
					grade: version?.grade ?? null,
					headcountCapacity: version?.headcountCapacity ?? null,
					fteCapacity: version?.fteCapacity ?? null,
					keyPosition: version?.keyPosition ?? false,
					occupiedHeadcount: counts.complete ? counts.headcount : null,
					occupiedFte: counts.complete ? counts.fte : null,
					occupancyComplete: counts.complete,
					remainingHeadcount: remaining.headcount,
					remainingFte: remaining.fte,
					openRequest: row.openRequest,
					revision: row.revision,
				}
			},
		)
	}

	/** A placement without references. */
	private emptyPlacement(): PositionPlacementDto {
		return { designation: null, legalEntity: null, unit: null, department: null, location: null }
	}

	/** Structure labels for several versions or proposals, batched by kind. */
	private async placements(
		w: JobArchitectureWork,
		sources: readonly (Pick<
			PositionProposal,
			'designationId' | 'legalEntityId' | 'unitId' | 'departmentId' | 'locationId'
		> | null)[],
	): Promise<PositionPlacementDto[]> {
		const labels = new Map<StructureReferenceKind, Map<string, ReferenceDto>>()
		for (const [field, kind] of PLACEMENT) {
			const ids = sources
				.map(/** Referenced id. */ (source) => (source ? source[field] : null))
				.filter(/** Present. */ (id): id is string => typeof id === 'string')
			labels.set(kind, await w.structure.labels(kind, ids, w.today))
		}
		return sources.map(
			/** Label one source. */ (source) => {
				const placement = this.emptyPlacement()
				if (!source) return placement
				for (const [field, kind, key] of PLACEMENT) {
					const id = source[field]
					const label = typeof id === 'string' ? labels.get(kind)?.get(id) : undefined
					placement[key] = label ? { id: label.id, code: label.code, name: label.name } : null
				}
				return placement
			},
		)
	}

	/** Version DTOs with placement labels. */
	private async versionDtos(
		w: JobArchitectureWork,
		rows: readonly PositionVersionRow[],
	): Promise<PositionVersionDto[]> {
		const placements = await this.placements(w, rows)
		return rows.map(
			/** One version. */ (row, index) => ({
				id: row.id,
				versionNumber: row.versionNumber,
				status: row.status,
				profileVersionId: row.profileVersionId,
				profileVersionNumber: row.profileVersionNumber,
				profile: row.profile,
				grade: row.grade,
				placement: placements[index] ?? this.emptyPlacement(),
				positionType: row.positionType,
				headcountCapacity: row.headcountCapacity,
				fteCapacity: row.fteCapacity,
				keyPosition: row.keyPosition,
				costCenterCode: row.costCenterCode,
				effectiveFrom: row.effectiveFrom,
				effectiveTo: row.effectiveTo,
				changeSummary: row.changeSummary,
				publishedAt: row.publishedAt,
				current: row.current,
			}),
		)
	}

	/** One position's detail. */
	private async readDetail(w: JobArchitectureWork, id: string): Promise<PositionDetailDto> {
		const row = await this.requirePosition(w, id)
		const [summary] = await this.summaries(w, [row])
		const [version] = row.version ? await this.versionDtos(w, [row.version]) : []
		return {
			...(summary as PositionSummaryDto),
			currentVersion: version ?? null,
			relationships: await w.positions.relationships(id, w.today),
			asOf: w.today,
		}
	}

	/** Whether a proposed version waives a requirement. */
	private async hasWaive(w: JobArchitectureWork, versionId: string | null): Promise<boolean> {
		if (!versionId) return false
		const variances = await w.positions.variances(versionId)
		return variances.some(/** A waived requirement. */ (item) => item.varianceType === 'Waive')
	}

	/** Seal optional text; empty text stores nothing. */
	private async seal(
		w: JobArchitectureWork,
		target: CipherTarget,
		text: string,
	): Promise<SealedValue | null> {
		return text ? w.cipher.encrypt(target, text) : null
	}

	/** Open a sealed value for an authorized reader. */
	private open(
		w: JobArchitectureWork,
		target: CipherTarget,
		sealed: SealedValue | null,
	): Promise<string | null> {
		return sealed ? w.cipher.decrypt(target, sealed) : Promise.resolve(null)
	}

	/** One change request as its reader may see it. */
	private async readRequest(w: JobArchitectureWork, id: string): Promise<PositionChangeRequestDto> {
		const request = await w.positions.request(id)
		if (!request) throw new HcmDomainError('not-found')
		const mine = request.requestedById === w.accountId
		const approver = await w.holds(APPROVE)
		const privileged = mine || approver
		const proposed = request.proposedVersionId
			? await w.positions.version(request.proposedVersionId)
			: undefined
		const approval = await w.positions.approval(id)
		let canDecide = request.status === 'PendingApproval' && !mine && approver
		if (canDecide && approval?.requiresWaiveAuthority) canDecide = await w.holds(WAIVE)
		return {
			id: request.id,
			positionId: request.positionId,
			positionCode: request.positionCode,
			positionName: request.positionName,
			requestType: request.requestType,
			status: request.status,
			reason: privileged ? await this.open(w, reasonTarget(id), request.reason) : null,
			requestedBy: request.requestedBy,
			requestedByMe: mine,
			requestedAt: request.requestedAt,
			submittedAt: request.submittedAt,
			appliedAt: request.appliedAt,
			base: await this.versionDto(w, request.baseVersionId),
			proposed: proposed ? await this.proposalDto(w, proposed, request) : null,
			variances: await this.varianceDtos(w, request.proposedVersionId, privileged),
			items: await w.positions.items(id),
			preview: this.previewDto(await w.positions.preview(id), request),
			approval: approval ? await this.approvalDto(w, approval, privileged) : null,
			canDecide,
			revision: request.revision,
		}
	}

	/** One labelled version, or null. */
	private async versionDto(
		w: JobArchitectureWork,
		id: string | null,
	): Promise<PositionVersionDto | null> {
		const row = id ? await w.positions.version(id) : undefined
		if (!row) return null
		return (await this.versionDtos(w, [row]))[0] ?? null
	}

	/** Variances of a proposed version; justifications only for privileged readers. */
	private async varianceDtos(
		w: JobArchitectureWork,
		versionId: string | null,
		privileged: boolean,
	): Promise<VarianceDto[]> {
		if (!versionId) return []
		const result: VarianceDto[] = []
		for (const { id, justification, ...item } of await w.positions.variances(versionId)) {
			const target = { table: 'position_requirement', column: 'encrypted_justification', rowId: id }
			result.push({
				...item,
				justification: privileged ? await this.open(w, target, justification) : null,
			})
		}
		return result
	}

	/** The newest preview; it authorizes submission only while ready, unexpired and unedited. */
	private previewDto(
		preview: PreviewRow | undefined,
		request: RequestRow,
	): ImpactPreviewDto | null {
		if (!preview) return null
		const { sourceDigest: _digest, ...shown } = preview
		void _digest
		return {
			...shown,
			valid:
				preview.status === 'Ready' &&
				request.status === 'Previewed' &&
				new Date(preview.expiresAt).getTime() > Date.now(),
		}
	}

	/** The approval case; the decision comment only for privileged readers. */
	private async approvalDto(
		w: JobArchitectureWork,
		approval: ApprovalRow,
		privileged: boolean,
	): Promise<PositionApprovalDto> {
		const decision = approval.decision
		if (!decision)
			return {
				status: approval.status,
				requiresWaiveAuthority: approval.requiresWaiveAuthority,
				decision: null,
			}
		const target = { table: 'position_decision', column: 'encrypted_comment', rowId: decision.id }
		return {
			status: approval.status,
			requiresWaiveAuthority: approval.requiresWaiveAuthority,
			decision: {
				decision: decision.decision,
				decidedBy: decision.decidedBy,
				decidedAt: decision.decidedAt,
				comment: privileged ? await this.open(w, target, decision.comment) : null,
			},
		}
	}

	/** A stored proposal with labels. */
	private async proposalDto(
		w: JobArchitectureWork,
		version: PositionVersionRow,
		request: RequestRow,
	): Promise<PositionProposalDto> {
		const [placement] = await this.placements(w, [version])
		const reportsTo = request.reportsToPositionId
			? await w.positions.position(request.reportsToPositionId, w.today)
			: undefined
		return {
			...this.proposalOf(
				version,
				request.proposedName ?? request.positionName,
				request.reportsToPositionId,
			),
			versionId: version.id,
			profile: version.profile,
			grade: version.grade,
			placement: placement ?? this.emptyPlacement(),
			reportsTo: reportsTo
				? { id: reportsTo.id, code: reportsTo.code, name: reportsTo.name }
				: null,
		}
	}

	/** Append business evidence without sensitive text. */
	private audit(
		w: JobArchitectureWork,
		action: string,
		targetId: string,
		requestId: string,
		summary: { changedFields: string[]; fromState: string | null; toState: string | null },
	) {
		return w.audit.append({
			action,
			category: 'business',
			targetType: action.includes('position-change') ? 'position-change-request' : 'position',
			targetId,
			requestId,
			// Reasons and comments are ciphertext; the evidence never repeats them.
			summary: { reason: null, ...summary },
		})
	}

	/** Serialize a write and replay identical retries from the actor's receipt. */
	private command<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		operation: string,
		payload: unknown,
		key: string,
		work: (w: JobArchitectureWork) => Promise<T>,
	): Promise<T> {
		const hash = commandHash(operation, payload)
		return this.unit.execute(
			context,
			permission,
			true,
			/** Keep receipts in the business transaction. */ (w) =>
				runIdempotent(
					w.receipts,
					`positions.${operation}`,
					key,
					hash,
					/** Run once. */ () => work(w),
				),
		)
	}
}
