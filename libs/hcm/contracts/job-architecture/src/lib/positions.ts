import {
	boolValue,
	codeValue,
	dateValue,
	decimalValue,
	enumValue,
	idValue,
	intValue,
	invalidField,
	optionalId,
	optionalText,
	readBody,
	readListQuery,
	revisionValue,
	textValue,
} from '@empflowyee/hcm-runtime-contract'
import {
	QUANTITY_UNITS,
	REQUIREMENT_TYPES,
	type QuantityUnit,
	type ReferenceDto,
	type RequirementType,
} from './catalogue'

/**
 * Position vocabulary and DTOs (job architecture TECHNICAL-DESIGN#contract). A position stores no
 * person: occupancy comes from workforce assignments, and unavailable occupancy is never zero.
 */
export const POSITION_LIFECYCLE = ['Planned', 'Open', 'Frozen', 'Closed', 'Cancelled'] as const
export type PositionLifecycle = (typeof POSITION_LIFECYCLE)[number]

export const POSITION_VERSION_STATUSES = [
	'Draft',
	'InReview',
	'Published',
	'Superseded',
	'Cancelled',
] as const
export type PositionVersionStatus = (typeof POSITION_VERSION_STATUSES)[number]

export const POSITION_TYPES = ['Regular', 'Temporary', 'Project'] as const
export type PositionType = (typeof POSITION_TYPES)[number]

export const POSITION_REQUEST_TYPES = [
	'Create',
	'Change',
	'Freeze',
	'Reopen',
	'Close',
	'Cancel',
] as const
export type PositionRequestType = (typeof POSITION_REQUEST_TYPES)[number]
/** Requests that change lifecycle status only and propose no version. */
export const LIFECYCLE_REQUEST_TYPES = ['Freeze', 'Reopen', 'Close', 'Cancel'] as const
export type LifecycleRequestType = (typeof LIFECYCLE_REQUEST_TYPES)[number]

export const POSITION_REQUEST_STATUSES = [
	'Draft',
	'Previewed',
	'Submitted',
	'PendingApproval',
	'Approved',
	'Rejected',
	'Withdrawn',
	'Applying',
	'Applied',
	'Failed',
] as const
export type PositionRequestStatus = (typeof POSITION_REQUEST_STATUSES)[number]
/** Statuses of a request still in flight; a position has at most one. */
export const OPEN_REQUEST_STATUSES: readonly PositionRequestStatus[] = [
	'Draft',
	'Previewed',
	'Submitted',
	'PendingApproval',
	'Approved',
	'Applying',
]

/** DEC-HCM2-009: all four variance operations are allowed. */
export const VARIANCE_TYPES = ['Add', 'Replace', 'Strengthen', 'Waive'] as const
export type VarianceType = (typeof VARIANCE_TYPES)[number]

export const RELATIONSHIP_TYPES = ['SolidLine', 'DottedLine', 'Functional'] as const
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number]

export const POSITION_DECISIONS = ['Approved', 'Rejected'] as const
export type PositionDecision = (typeof POSITION_DECISIONS)[number]

/** Structure kinds a position proposal references, plus published profiles and positions. */
export const POSITION_OPTION_KINDS = [
	'legal-entities',
	'units',
	'departments',
	'designations',
	'locations',
	'profiles',
	'positions',
] as const
export type PositionOptionKind = (typeof POSITION_OPTION_KINDS)[number]

/** An impact preview is valid for this long after it is calculated. */
export const PREVIEW_TTL_MINUTES = 15
/** Bound on headcount capacity of one position. */
export const MAX_HEADCOUNT_CAPACITY = 10000
/** Bound on effective requirements of one position. */
export const MAX_POSITION_REQUIREMENTS = 200
/** Bound on variances one request proposes. */
export const MAX_VARIANCES = 50

export interface PositionPlacementDto {
	designation: ReferenceDto | null
	legalEntity: ReferenceDto | null
	unit: ReferenceDto | null
	department: ReferenceDto | null
	location: ReferenceDto | null
}

/**
 * Occupancy on the read date. Counts and remaining capacity are null when occupancy is incomplete
 * or the position has no published version; they are never guessed as zero.
 */
export interface PositionOccupancyDto {
	occupiedHeadcount: number | null
	occupiedFte: number | null
	occupancyComplete: boolean
	remainingHeadcount: number | null
	remainingFte: number | null
}

export interface OpenRequestReferenceDto {
	id: string
	requestType: PositionRequestType
	status: PositionRequestStatus
}

export interface PositionSummaryDto extends PositionOccupancyDto {
	id: string
	code: string
	name: string
	lifecycleStatus: PositionLifecycle
	placement: PositionPlacementDto
	profile: ReferenceDto | null
	grade: ReferenceDto | null
	headcountCapacity: number | null
	fteCapacity: number | null
	keyPosition: boolean
	openRequest: OpenRequestReferenceDto | null
	revision: number
}

export interface PositionPage {
	items: PositionSummaryDto[]
	nextCursor: string | null
}

export interface PositionVersionDto {
	id: string
	versionNumber: number
	status: PositionVersionStatus
	profileVersionId: string
	profileVersionNumber: number
	profile: ReferenceDto
	grade: ReferenceDto
	placement: PositionPlacementDto
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
}

export interface PositionVersionPage {
	items: PositionVersionDto[]
	nextCursor: string | null
}

export interface PositionRelationshipDto {
	id: string
	/** Outgoing: this position reports to the other; incoming: the other reports to this one. */
	direction: 'Outgoing' | 'Incoming'
	type: RelationshipType
	position: ReferenceDto
	effectiveFrom: string
	effectiveTo: string | null
}

export interface PositionDetailDto extends PositionSummaryDto {
	currentVersion: PositionVersionDto | null
	relationships: PositionRelationshipDto[]
	/** Read date of occupancy and relationships. */
	asOf: string
}

export interface IncumbentDto {
	assignmentId: string
	workerId: string
	displayName: string
	designation: string | null
	fullTimeEquivalent: number | null
	primary: boolean
	effectiveFrom: string
}

export interface IncumbentPage {
	items: IncumbentDto[]
	nextCursor: string | null
}

/** The facts a Create or Change request proposes for a position version. */
export interface PositionProposal {
	name: string
	profileVersionId: string
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
	/** The position this one reports to on a solid line, if any. */
	reportsToPositionId: string | null
}

/** A proposal as read back, with labels for display. */
export interface PositionProposalDto extends PositionProposal {
	versionId: string
	profile: ReferenceDto | null
	grade: ReferenceDto | null
	placement: PositionPlacementDto
	reportsTo: ReferenceDto | null
}

export interface ChangeItemDto {
	field: string
	changeType: 'Set' | 'Clear' | 'AddRequirement' | 'ReplaceRequirement' | 'RemoveRequirement'
	summary: string
}

export interface ImpactPreviewDto {
	id: string
	status: 'Building' | 'Ready' | 'Stale' | 'Failed'
	activeAssignmentCount: number | null
	assignedFte: number | null
	occupancyComplete: boolean
	childPositionCount: number
	downstreamReferenceCount: number
	calculatedAt: string
	expiresAt: string
	/** False once expired, stale or superseded by an edit. */
	valid: boolean
}

export interface PositionDecisionDto {
	decision: PositionDecision
	decidedBy: string
	decidedAt: string
	/** Returned only to the requester and approvers. */
	comment: string | null
}

export interface PositionApprovalDto {
	status: 'Requested' | 'Pending' | 'Approved' | 'Rejected' | 'Cancelled' | 'Failed'
	requiresWaiveAuthority: boolean
	decision: PositionDecisionDto | null
}

export interface VarianceDto {
	code: string
	varianceType: VarianceType
	sourceCode: string | null
	type: RequirementType
	name: string
	description: string
	proficiency: string
	minimumQuantity: number | null
	unit: QuantityUnit | null
	mandatory: boolean
	/** Returned only to the requester and approvers. */
	justification: string | null
}

export interface PositionChangeRequestDto {
	id: string
	positionId: string
	positionCode: string
	positionName: string
	requestType: PositionRequestType
	status: PositionRequestStatus
	/** Returned only to the requester and approvers; null otherwise. */
	reason: string | null
	requestedBy: string
	requestedByMe: boolean
	requestedAt: string
	submittedAt: string | null
	appliedAt: string | null
	base: PositionVersionDto | null
	proposed: PositionProposalDto | null
	variances: VarianceDto[]
	items: ChangeItemDto[]
	preview: ImpactPreviewDto | null
	approval: PositionApprovalDto | null
	/** True when the reader may decide this request now. */
	canDecide: boolean
	revision: number
}

export interface PositionChangeRequestSummaryDto {
	id: string
	positionId: string
	positionCode: string
	positionName: string
	requestType: PositionRequestType
	status: PositionRequestStatus
	requestedBy: string
	requestedByMe: boolean
	requestedAt: string
	revision: number
}

export interface PositionChangeRequestPage {
	items: PositionChangeRequestSummaryDto[]
	nextCursor: string | null
}

export interface PositionOptionDto {
	id: string
	code: string
	name: string
	/** Allowed grades of a profile version option; empty for other kinds. */
	grades: { id: string; code: string; name: string; isDefault: boolean }[]
}

export interface PositionOptionPage {
	items: PositionOptionDto[]
	nextCursor: string | null
}

export interface EffectiveRequirementDto {
	code: string
	type: RequirementType
	name: string
	description: string
	proficiency: string
	minimumQuantity: number | null
	unit: QuantityUnit | null
	mandatory: boolean
	source: 'Profile' | 'Position'
	variance: VarianceType | null
	/** True for a waived profile requirement, which stays visible but does not apply. */
	waived: boolean
}

export interface PositionRequirementSummaryDto {
	id: string
	code: string
	name: string
	lifecycleStatus: PositionLifecycle
	profile: ReferenceDto | null
	varianceCount: number
	openRequest: OpenRequestReferenceDto | null
}

export interface PositionRequirementPage {
	items: PositionRequirementSummaryDto[]
	nextCursor: string | null
}

// Commands and queries.

export interface PositionQuery {
	q: string
	sort: 'code:asc' | 'name:asc'
	limit: number
	cursor?: string
	status?: PositionLifecycle
	unitId?: string
	departmentId?: string
	locationId?: string
	profileId?: string
	hasVacancy?: boolean
}

export interface PositionRequestQuery {
	limit: number
	cursor?: string
	status?: PositionRequestStatus
	positionId?: string
	view?: 'mine' | 'awaiting-my-decision'
}

export interface PositionOptionQuery {
	q: string
	limit: number
	cursor?: string
}

export interface VarianceDraft {
	code: string
	varianceType: VarianceType
	/** The profile requirement a Replace, Strengthen or Waive acts on. */
	sourceCode: string | null
	type: RequirementType
	name: string
	description: string
	proficiency: string
	minimumQuantity: number | null
	unit: QuantityUnit | null
	mandatory: boolean
	/** Required for Waive; stored only as ciphertext. */
	justification: string | null
}

export type PositionRequestCreate =
	| { requestType: 'Create'; code: string; proposed: PositionProposal; reason: string }
	| { requestType: 'Change'; positionId: string; proposed: PositionProposal; reason: string }
	| { requestType: LifecycleRequestType; positionId: string; reason: string }

export interface PositionRequestUpdate {
	proposed: PositionProposal
	reason: string
	expectedRevision: number
}

export interface RequirementChangeCreate {
	variances: VarianceDraft[]
	reason: string
}

export interface RequirementChangeUpdate {
	variances: VarianceDraft[]
	expectedRevision: number
}

export interface PreviewCommand {
	expectedRevision: number
}

export interface SubmitCommand {
	previewId: string
	expectedRevision: number
}

export interface WithdrawCommand {
	expectedRevision: number
	reason: string
}

export interface DecideCommand {
	decision: PositionDecision
	comment: string
	expectedRevision: number
}

const POSITION_CODE = /^[A-Z][A-Z0-9_-]{1,39}$/

/** Parse a request or decision reason. */
function reasonValue(value: unknown, field = 'reason'): string {
	return textValue(value, field, 500).trim()
}

/** Parse a proposed position version. */
export function parsePositionProposal(value: unknown): PositionProposal {
	const v = readBody(
		value,
		[
			'name',
			'profileVersionId',
			'gradeId',
			'designationId',
			'legalEntityId',
			'unitId',
			'locationId',
			'positionType',
			'headcountCapacity',
			'fteCapacity',
			'effectiveFrom',
		],
		['departmentId', 'keyPosition', 'costCenterCode', 'reportsToPositionId'],
	)
	const headcount = intValue(v['headcountCapacity'], 'headcountCapacity', 1, MAX_HEADCOUNT_CAPACITY)
	const fte = decimalValue(v['fteCapacity'], 'fteCapacity', 0.01, MAX_HEADCOUNT_CAPACITY, 2)
	// Each seat carries at most one full-time equivalent.
	if (fte > headcount) invalidField('fteCapacity', 'exceeds-headcount')
	return {
		name: textValue(v['name'], 'name', 150).trim(),
		profileVersionId: idValue(v['profileVersionId'], 'profileVersionId'),
		gradeId: idValue(v['gradeId'], 'gradeId'),
		designationId: idValue(v['designationId'], 'designationId'),
		legalEntityId: idValue(v['legalEntityId'], 'legalEntityId'),
		unitId: idValue(v['unitId'], 'unitId'),
		departmentId: optionalId(v['departmentId'], 'departmentId'),
		locationId: idValue(v['locationId'], 'locationId'),
		positionType: enumValue(v['positionType'], 'positionType', POSITION_TYPES),
		headcountCapacity: headcount,
		fteCapacity: fte,
		keyPosition:
			v['keyPosition'] === undefined ? false : boolValue(v['keyPosition'], 'keyPosition'),
		costCenterCode: optionalText(v['costCenterCode'], 'costCenterCode', 40).trim(),
		effectiveFrom: dateValue(v['effectiveFrom'], 'effectiveFrom'),
		reportsToPositionId: optionalId(v['reportsToPositionId'], 'reportsToPositionId'),
	}
}

/** Parse a new position change request of any type. */
export function parsePositionRequestCreate(body: unknown): PositionRequestCreate {
	const probe = readBody(body, ['requestType', 'reason'], ['code', 'positionId', 'proposed'])
	const requestType = enumValue(probe['requestType'], 'requestType', POSITION_REQUEST_TYPES)
	const reason = reasonValue(probe['reason'])
	if (requestType === 'Create') {
		const v = readBody(body, ['requestType', 'reason', 'code', 'proposed'])
		return {
			requestType,
			code: codeValue(v['code'], 'code', POSITION_CODE),
			proposed: parsePositionProposal(v['proposed']),
			reason,
		}
	}
	if (requestType === 'Change') {
		const v = readBody(body, ['requestType', 'reason', 'positionId', 'proposed'])
		return {
			requestType,
			positionId: idValue(v['positionId'], 'positionId'),
			proposed: parsePositionProposal(v['proposed']),
			reason,
		}
	}
	const v = readBody(body, ['requestType', 'reason', 'positionId'])
	return { requestType, positionId: idValue(v['positionId'], 'positionId'), reason }
}

/** Parse a replacement of a draft request's proposal. */
export function parsePositionRequestUpdate(body: unknown): PositionRequestUpdate {
	const v = readBody(body, ['proposed', 'reason', 'expectedRevision'])
	return {
		proposed: parsePositionProposal(v['proposed']),
		reason: reasonValue(v['reason']),
		expectedRevision: revisionValue(v['expectedRevision']),
	}
}

/** Parse one requirement variance; Add has no source, every other operation has one. */
export function parseVariance(value: unknown, field: string): VarianceDraft {
	const v = readBody(
		value,
		['code', 'varianceType', 'type', 'name'],
		[
			'sourceCode',
			'description',
			'proficiency',
			'minimumQuantity',
			'unit',
			'mandatory',
			'justification',
		],
	)
	const varianceType = enumValue(v['varianceType'], `${field}.varianceType`, VARIANCE_TYPES)
	const source = v['sourceCode'] ?? null
	if ((varianceType === 'Add') !== (source === null))
		invalidField(`${field}.sourceCode`, varianceType === 'Add' ? 'not-allowed' : 'required')
	const quantity = v['minimumQuantity'] ?? null
	const unit = v['unit'] ?? null
	if (quantity !== null) decimalValue(quantity, `${field}.minimumQuantity`, 0, 999999, 2)
	if ((quantity === null) !== (unit === null)) invalidField(`${field}.unit`, 'quantity-unit')
	const justification = v['justification'] ?? null
	if (varianceType === 'Waive' && justification === null)
		invalidField(`${field}.justification`, 'required')
	if (varianceType !== 'Waive' && justification !== null)
		invalidField(`${field}.justification`, 'not-allowed')
	return {
		code: codeValue(v['code'], `${field}.code`),
		varianceType,
		sourceCode: source === null ? null : codeValue(source, `${field}.sourceCode`),
		type: enumValue(v['type'], `${field}.type`, REQUIREMENT_TYPES),
		name: textValue(v['name'], `${field}.name`, 150).trim(),
		description: optionalText(v['description'], `${field}.description`, 1000).trim(),
		proficiency: optionalText(v['proficiency'], `${field}.proficiency`, 100).trim(),
		minimumQuantity: quantity === null ? null : (quantity as number),
		unit: unit === null ? null : enumValue(unit, `${field}.unit`, QUANTITY_UNITS),
		mandatory:
			v['mandatory'] === undefined ? true : boolValue(v['mandatory'], `${field}.mandatory`),
		justification:
			justification === null
				? null
				: textValue(justification, `${field}.justification`, 1000).trim(),
	}
}

/** Parse a bounded variance list with unique codes. */
function variances(value: unknown): VarianceDraft[] {
	if (!Array.isArray(value) || value.length > MAX_VARIANCES) invalidField('variances')
	const parsed = (value as unknown[]).map(
		/** One variance. */ (item, index) => parseVariance(item, `variances.${index}`),
	)
	const seen = new Set<string>()
	parsed.forEach(
		/** Codes are unique within the proposed version. */ (item, index) => {
			if (seen.has(item.code)) invalidField(`variances.${index}.code`, 'duplicate')
			seen.add(item.code)
		},
	)
	return parsed
}

/** Parse a new requirement change request. */
export function parseRequirementChangeCreate(body: unknown): RequirementChangeCreate {
	const v = readBody(body, ['variances', 'reason'])
	return { variances: variances(v['variances']), reason: reasonValue(v['reason']) }
}

/** Parse a replacement of a draft request's variances. */
export function parseRequirementChangeUpdate(body: unknown): RequirementChangeUpdate {
	const v = readBody(body, ['variances', 'expectedRevision'])
	return {
		variances: variances(v['variances']),
		expectedRevision: revisionValue(v['expectedRevision']),
	}
}

/** Parse a preview request. */
export function parsePreview(body: unknown): PreviewCommand {
	const v = readBody(body, ['expectedRevision'])
	return { expectedRevision: revisionValue(v['expectedRevision']) }
}

/** Parse a submission bound to a preview. */
export function parsePositionSubmit(body: unknown): SubmitCommand {
	const v = readBody(body, ['previewId', 'expectedRevision'])
	return {
		previewId: idValue(v['previewId'], 'previewId'),
		expectedRevision: revisionValue(v['expectedRevision']),
	}
}

/** Parse a withdrawal. */
export function parseWithdraw(body: unknown): WithdrawCommand {
	const v = readBody(body, ['expectedRevision', 'reason'])
	return {
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: reasonValue(v['reason']),
	}
}

/** Parse a decision; a rejection always explains itself. */
export function parseDecide(body: unknown): DecideCommand {
	const v = readBody(body, ['decision', 'expectedRevision'], ['comment'])
	const decision = enumValue(v['decision'], 'decision', POSITION_DECISIONS)
	const comment = optionalText(v['comment'], 'comment', 1000).trim()
	if (decision === 'Rejected' && !comment) invalidField('comment', 'required')
	return { decision, comment, expectedRevision: revisionValue(v['expectedRevision']) }
}

/** Parse a position page query. */
export function parsePositionQuery(params: URLSearchParams): PositionQuery {
	const query = readListQuery(
		params,
		['code:asc', 'name:asc'],
		['status', 'unitId', 'departmentId', 'locationId', 'profileId', 'hasVacancy'],
	)
	const f = query.filters
	const vacancy = f['hasVacancy']
	if (vacancy !== undefined && vacancy !== 'true' && vacancy !== 'false') invalidField('hasVacancy')
	return {
		q: query.q,
		sort: query.sort as PositionQuery['sort'],
		limit: query.limit,
		...(query.cursor ? { cursor: query.cursor } : {}),
		...(f['status'] !== undefined
			? { status: enumValue(f['status'], 'status', POSITION_LIFECYCLE) }
			: {}),
		...(f['unitId'] !== undefined ? { unitId: idValue(f['unitId'], 'unitId') } : {}),
		...(f['departmentId'] !== undefined
			? { departmentId: idValue(f['departmentId'], 'departmentId') }
			: {}),
		...(f['locationId'] !== undefined
			? { locationId: idValue(f['locationId'], 'locationId') }
			: {}),
		...(f['profileId'] !== undefined ? { profileId: idValue(f['profileId'], 'profileId') } : {}),
		...(vacancy !== undefined ? { hasVacancy: vacancy === 'true' } : {}),
	}
}

/** Parse a change request page query. */
export function parsePositionRequestQuery(params: URLSearchParams): PositionRequestQuery {
	const query = readListQuery(params, ['requestedAt:desc'], ['status', 'positionId', 'view'])
	const f = query.filters
	return {
		limit: query.limit,
		...(query.cursor ? { cursor: query.cursor } : {}),
		...(f['status'] !== undefined
			? { status: enumValue(f['status'], 'status', POSITION_REQUEST_STATUSES) }
			: {}),
		...(f['positionId'] !== undefined
			? { positionId: idValue(f['positionId'], 'positionId') }
			: {}),
		...(f['view'] !== undefined
			? { view: enumValue(f['view'], 'view', ['mine', 'awaiting-my-decision'] as const) }
			: {}),
	}
}

/** Parse a bounded page query without filters. */
export function parsePageQuery(params: URLSearchParams): { limit: number; cursor?: string } {
	const query = readListQuery(params, ['default'])
	return { limit: query.limit, ...(query.cursor ? { cursor: query.cursor } : {}) }
}

/** Parse an option query. */
export function parsePositionOptionQuery(params: URLSearchParams): PositionOptionQuery {
	const query = readListQuery(params, ['name:asc'])
	return { q: query.q, limit: query.limit, ...(query.cursor ? { cursor: query.cursor } : {}) }
}

/** Parse the option kind path segment. */
export function parsePositionOptionKind(kind: string): PositionOptionKind {
	return enumValue(kind, 'kind', POSITION_OPTION_KINDS)
}
