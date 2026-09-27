import type { HcmPage } from '@empflowyee/hcm-runtime-contract'
import type { SealedValue } from '@empflowyee/hcm-api-runtime-application'
import type {
	ChangeItemDto,
	OpenRequestReferenceDto,
	PositionChangeRequestSummaryDto,
	PositionLifecycle,
	PositionOptionDto,
	PositionProposal,
	PositionQuery,
	PositionRequirementQuery,
	PositionRequirementSummaryDto,
	RequirementDto,
	PositionRelationshipDto,
	PositionRequestStatus,
	PositionRequestType,
	PositionType,
	PositionVersionStatus,
	ReferenceDto,
	VarianceDraft,
} from '@empflowyee/hcm-job-architecture-contract'

/** One position version as stored, with its own-domain labels; structure ids are labelled later. */
export interface PositionVersionRow {
	id: string
	positionId: string
	versionNumber: number
	status: PositionVersionStatus
	profileVersionId: string
	profileVersionNumber: number
	profile: ReferenceDto
	grade: ReferenceDto
	gradeId: string
	designationId: string
	legalEntityId: string
	unitId: string
	departmentId: string | null
	locationId: string
	positionType: PositionType
	headcountCapacity: number
	fteCapacity: number
	keyPosition: boolean
	costCenterCode: string
	effectiveFrom: string
	effectiveTo: string | null
	changeSummary: string
	publishedAt: string | null
	current: boolean
	revision: number
}

/** One position with the version shown for it on a date. */
export interface PositionRow {
	id: string
	code: string
	name: string
	lifecycleStatus: PositionLifecycle
	revision: number
	/** The published version effective on the date, else the current published version. */
	version: PositionVersionRow | null
	openRequest: OpenRequestReferenceDto | null
}

/** A locked position. */
export interface PositionLock {
	id: string
	code: string
	name: string
	lifecycleStatus: PositionLifecycle
	currentVersionId: string | null
	latestVersionNumber: number
	revision: number
}

/** A change request as stored; reasons stay sealed until an authorized reader opens them. */
export interface RequestRow {
	id: string
	positionId: string
	positionCode: string
	positionName: string
	requestType: PositionRequestType
	status: PositionRequestStatus
	baseVersionId: string | null
	proposedVersionId: string | null
	proposedName: string | null
	reportsToPositionId: string | null
	reason: SealedValue
	withdrawalReason: SealedValue | null
	requestedById: string
	requestedBy: string
	requestedAt: string
	submittedAt: string | null
	appliedAt: string | null
	revision: number
}

export interface PreviewRow {
	id: string
	status: 'Building' | 'Ready' | 'Stale' | 'Failed'
	activeAssignmentCount: number | null
	assignedFte: number | null
	occupancyComplete: boolean
	childPositionCount: number
	downstreamReferenceCount: number
	sourceDigest: string
	calculatedAt: string
	expiresAt: string
}

export interface ApprovalRow {
	id: string
	status: 'Requested' | 'Pending' | 'Approved' | 'Rejected' | 'Cancelled' | 'Failed'
	requiresWaiveAuthority: boolean
	previewId: string
	subjectVersion: number
	decision: {
		id: string
		decision: 'Approved' | 'Rejected'
		decidedBy: string
		decidedAt: string
		comment: SealedValue | null
	} | null
}

export interface ChangeItemInput extends ChangeItemDto {
	oldDigest: string | null
	newDigest: string | null
}

export interface RequestQuery {
	limit: number
	cursor?: string
	status?: PositionRequestStatus
	positionId?: string
	requestedBy?: string
	/** Only requests pending approval that this account did not raise. */
	awaitingDecisionBy?: { accountId: string; waive: boolean }
}

/** Positions persistence bound to one authorized tenant transaction. */
export interface PositionRepository {
	/** Positions by code or name then id, with their version on a date. */
	positions(query: Omit<PositionQuery, 'hasVacancy'>, asOf: string): Promise<HcmPage<PositionRow>>
	/** One position with its version on a date. */
	position(id: string, asOf: string): Promise<PositionRow | undefined>
	/** Published and superseded versions, newest first. */
	versions(
		positionId: string,
		page: { limit: number; cursor?: string },
	): Promise<HcmPage<PositionVersionRow>>
	/** One version of any status. */
	version(id: string): Promise<PositionVersionRow | undefined>
	/** Relationships of a position effective on a date, both directions. */
	relationships(positionId: string, asOf: string): Promise<PositionRelationshipDto[]>
	/** The solid-line chain above a position on a date, nearest first, bounded. */
	ancestors(positionId: string, asOf: string): Promise<string[]>
	/** Positions reporting on a solid line, and other relationships referencing a position. */
	references(positionId: string, asOf: string): Promise<{ children: number; others: number }>
	/** Change requests, newest first. */
	requests(query: RequestQuery): Promise<HcmPage<PositionChangeRequestSummaryDto>>
	/** One change request. */
	request(id: string): Promise<RequestRow | undefined>
	/** Stored change items of a request. */
	items(requestId: string): Promise<ChangeItemDto[]>
	/** The newest preview of a request. */
	preview(requestId: string): Promise<PreviewRow | undefined>
	/** The newest approval case of a request with its decision. */
	approval(requestId: string): Promise<ApprovalRow | undefined>
	/** Variances of a version, with sealed justifications. */
	variances(
		versionId: string,
	): Promise<
		(Omit<VarianceDraft, 'justification'> & { id: string; justification: SealedValue | null })[]
	>
	/** Requirements of a profile version in profile order, with their ids. */
	profileRequirements(profileVersionId: string): Promise<(RequirementDto & { id: string })[]>
	/** Positions with the variance count of their version on a date, by code then id. */
	requirementPositions(
		query: PositionRequirementQuery,
		asOf: string,
	): Promise<HcmPage<PositionRequirementSummaryDto>>
	/** Current published profile versions with their allowed grades, by name. */
	profileOptions(
		q: string,
		page: { limit: number; cursor?: string },
	): Promise<HcmPage<PositionOptionDto>>
	/** Positions that may be reported to: Open or Frozen, by name. */
	positionOptions(
		q: string,
		page: { limit: number; cursor?: string },
	): Promise<HcmPage<PositionOptionDto>>

	/** Lock one position. */
	lockPosition(id: string): Promise<PositionLock | undefined>
	/** Insert a planned position. */
	insertPosition(id: string, code: string, name: string): Promise<void>
	/** Change a position's name, lifecycle or current version and advance its revision. */
	updatePosition(
		id: string,
		fields: { name?: string; lifecycleStatus?: PositionLifecycle; currentVersionId?: string },
	): Promise<void>
	/** Insert a draft version from a proposal. */
	insertVersion(input: {
		id: string
		positionId: string
		versionNumber: number
		supersedesId: string | null
		proposal: PositionProposal
		changeSummary: string
	}): Promise<void>
	/** Insert variances into a draft version in the given order. */
	insertVariances(
		versionId: string,
		variances: readonly (Omit<VarianceDraft, 'justification' | 'sourceCode'> & {
			id: string
			sourceRequirementId: string | null
			justification: SealedValue | null
		})[],
	): Promise<void>
	/** Remove every variance of a draft version. */
	deleteVariances(versionId: string): Promise<void>
	/** Replace a draft version's content. */
	replaceVersion(id: string, proposal: PositionProposal): Promise<void>
	/** Move a version to review or cancel it. */
	setVersionStatus(id: string, status: 'InReview' | 'Cancelled'): Promise<void>
	/** Publish a version, close the one it replaces and move the position pointer. */
	publishVersion(input: {
		id: string
		positionId: string
		digest: string
		previous: { id: string; effectiveTo: string } | null
	}): Promise<void>
	/** Close the solid line from a position the day before a date and open a new one, if any. */
	setSolidLine(positionId: string, targetId: string | null, effectiveFrom: string): Promise<void>
	/** Lock one change request. */
	lockRequest(id: string): Promise<RequestRow | undefined>
	/** Insert a draft change request. */
	insertRequest(input: {
		id: string
		positionId: string
		requestType: PositionRequestType
		baseVersionId: string | null
		proposedVersionId: string | null
		proposedName: string | null
		reportsToPositionId: string | null
		reason: SealedValue
	}): Promise<void>
	/** Change a request and advance its revision. */
	updateRequest(
		id: string,
		fields: {
			status?: PositionRequestStatus
			reason?: SealedValue
			withdrawalReason?: SealedValue
			proposedName?: string
			reportsToPositionId?: string | null
			submitted?: boolean
			applied?: boolean
		},
	): Promise<void>
	/** Replace the change items of a request. */
	replaceItems(requestId: string, items: readonly ChangeItemInput[]): Promise<void>
	/** Mark every live preview of a request stale. */
	stalePreviews(requestId: string): Promise<void>
	/** Insert a ready preview. */
	insertPreview(
		input: Omit<PreviewRow, 'status' | 'calculatedAt' | 'expiresAt'> & {
			requestId: string
			previewRevision: number
			ttlMinutes: number
		},
	): Promise<void>
	/** Open an approval case. */
	insertApprovalCase(input: {
		id: string
		requestId: string
		subjectVersion: number
		previewId: string
		requiresWaiveAuthority: boolean
		policyDigest: string
	}): Promise<void>
	/** Close an approval case. */
	completeApprovalCase(id: string, status: 'Approved' | 'Rejected' | 'Cancelled'): Promise<void>
	/** Record the one decision of a case. */
	insertDecision(input: {
		id: string
		caseId: string
		decision: 'Approved' | 'Rejected'
		subjectVersion: number
		comment: SealedValue | null
		idempotencyKey: string
		applied: boolean
	}): Promise<void>
}
