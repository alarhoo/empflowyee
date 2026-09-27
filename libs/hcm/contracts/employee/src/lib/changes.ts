import {
	codeValue,
	dateValue,
	decimalValue,
	enumValue,
	idValue,
	intValue,
	invalidField,
	readBody,
	readListQuery,
	revisionValue,
	textValue,
	type HcmPage,
} from '@empflowyee/hcm-runtime-contract'
import {
	EMPLOYMENT_TYPES,
	WORK_MODES,
	type EmploymentTypeValue,
	type WorkModeValue,
} from './records'

/**
 * Employment Changes vocabulary (Employment Changes TDD#API): typed, effective-dated requests that
 * change employment and assignment facts only after an independent approval (DEC-HCM2-002).
 */
export const CHANGE_TYPES = [
	'Rehire',
	'Transfer',
	'Promotion',
	'Demotion',
	'LocationChange',
	'ManagerChange',
	'HoursChange',
	'EmploymentTypeChange',
	'Suspension',
	'ReturnToWork',
	'Correction',
] as const
export type ChangeType = (typeof CHANGE_TYPES)[number]

export const CHANGE_STATUSES = [
	'Draft',
	'PendingApproval',
	'Approved',
	'Rejected',
	'Executing',
	'Completed',
	'Failed',
	'Cancelled',
] as const
export type ChangeStatus = (typeof CHANGE_STATUSES)[number]

export const CHANGE_VIEWS = ['all', 'mine', 'awaiting-my-decision'] as const
export type ChangeView = (typeof CHANGE_VIEWS)[number]

export const CHANGE_OPTION_KINDS = [
	'workers',
	'legal-entities',
	'units',
	'departments',
	'designations',
	'locations',
	'positions',
	'worker-types',
	'managers',
] as const
export type ChangeOptionKind = (typeof CHANGE_OPTION_KINDS)[number]

/** Approval policy `employment-change@1` (DEC-HCM2-002): one slot, 30 days back, 90 for Correction. */
export const CHANGE_POLICY = { code: 'employment-change', version: 1, slot: 'hr-approver' } as const
/** Days an effective date may lie before submission and approval. */
export function backdatingLimit(type: ChangeType): number {
	return type === 'Correction' ? 90 : 30
}

export const TARGET_FIELDS = [
	'legalEntityId',
	'workerTypeId',
	'employmentType',
	'continuousServiceStartDate',
	'probationEndDate',
	'noticePeriodDays',
	'unitId',
	'departmentId',
	'designationId',
	'locationId',
	'positionId',
	'jobTitle',
	'workMode',
	'fullTimeEquivalent',
	'standardHoursPerWeek',
	'costCenterCode',
	'managerWorkerId',
] as const
export type TargetField = (typeof TARGET_FIELDS)[number]

/** Target facts that a request may set to none; null clears them. */
export const CLEARABLE_TARGETS: readonly TargetField[] = [
	'departmentId',
	'designationId',
	'positionId',
	'probationEndDate',
	'noticePeriodDays',
	'standardHoursPerWeek',
	'costCenterCode',
	'managerWorkerId',
]

/** Employment-level facts; they are undated, so a future change waits for Apply. */
export const EMPLOYMENT_TARGETS: readonly TargetField[] = [
	'employmentType',
	'continuousServiceStartDate',
	'probationEndDate',
	'noticePeriodDays',
]

const ASSIGNMENT_TARGETS: TargetField[] = [
	'unitId',
	'departmentId',
	'designationId',
	'locationId',
	'positionId',
	'jobTitle',
	'workMode',
	'fullTimeEquivalent',
	'standardHoursPerWeek',
	'costCenterCode',
	'managerWorkerId',
]

/** The target facts one change type accepts, those it requires, and whether it needs any. */
export interface ChangeTypeRule {
	allowed: readonly TargetField[]
	required: readonly TargetField[]
	/** At least one allowed target must be given. */
	needsTarget: boolean
	/** The employment status the change sets. */
	status?: 'Active' | 'Suspended'
	reasons: readonly string[]
}

export const CHANGE_TYPE_RULES: Record<ChangeType, ChangeTypeRule> = {
	Rehire: {
		allowed: [
			'legalEntityId',
			'workerTypeId',
			'employmentType',
			'probationEndDate',
			'noticePeriodDays',
			...ASSIGNMENT_TARGETS,
		],
		required: [
			'legalEntityId',
			'employmentType',
			'unitId',
			'locationId',
			'jobTitle',
			'workMode',
			'fullTimeEquivalent',
		],
		needsTarget: true,
		reasons: ['RETURNING_EMPLOYEE', 'SEASONAL_RETURN'],
	},
	Transfer: {
		allowed: [
			'unitId',
			'departmentId',
			'designationId',
			'locationId',
			'positionId',
			'jobTitle',
			'costCenterCode',
			'managerWorkerId',
		],
		required: [],
		needsTarget: true,
		reasons: ['BUSINESS_NEED', 'EMPLOYEE_REQUEST', 'REORGANISATION'],
	},
	Promotion: {
		allowed: [
			'designationId',
			'positionId',
			'jobTitle',
			'departmentId',
			'costCenterCode',
			'managerWorkerId',
		],
		required: [],
		needsTarget: true,
		reasons: ['MERIT', 'ROLE_EXPANSION'],
	},
	Demotion: {
		allowed: [
			'designationId',
			'positionId',
			'jobTitle',
			'departmentId',
			'costCenterCode',
			'managerWorkerId',
		],
		required: [],
		needsTarget: true,
		reasons: ['EMPLOYEE_REQUEST', 'PERFORMANCE', 'REORGANISATION'],
	},
	LocationChange: {
		allowed: ['locationId', 'workMode'],
		required: ['locationId'],
		needsTarget: true,
		reasons: ['BUSINESS_NEED', 'EMPLOYEE_REQUEST', 'RELOCATION'],
	},
	ManagerChange: {
		allowed: ['managerWorkerId'],
		required: [],
		needsTarget: true,
		reasons: ['REORGANISATION', 'BUSINESS_NEED'],
	},
	HoursChange: {
		allowed: ['fullTimeEquivalent', 'standardHoursPerWeek', 'workMode'],
		required: [],
		needsTarget: true,
		reasons: ['EMPLOYEE_REQUEST', 'BUSINESS_NEED'],
	},
	EmploymentTypeChange: {
		allowed: ['employmentType', 'probationEndDate', 'noticePeriodDays'],
		required: ['employmentType'],
		needsTarget: true,
		reasons: ['CONVERSION', 'CONTRACT_RENEWAL'],
	},
	Suspension: {
		allowed: [],
		required: [],
		needsTarget: false,
		status: 'Suspended',
		reasons: ['INVESTIGATION', 'DISCIPLINARY'],
	},
	ReturnToWork: {
		allowed: [],
		required: [],
		needsTarget: false,
		status: 'Active',
		reasons: ['SUSPENSION_ENDED'],
	},
	Correction: {
		allowed: [
			'employmentType',
			'continuousServiceStartDate',
			'probationEndDate',
			'noticePeriodDays',
			...ASSIGNMENT_TARGETS,
		],
		required: [],
		needsTarget: true,
		reasons: ['DATA_ENTRY_ERROR', 'MISSING_RECORD'],
	},
}

/**
 * Proposed facts. An omitted property keeps the current value; null clears a clearable fact.
 * The manager is named by worker; the server resolves their primary assignment on the date.
 */
export interface ChangeTargets {
	legalEntityId?: string
	workerTypeId?: string
	employmentType?: EmploymentTypeValue
	continuousServiceStartDate?: string
	probationEndDate?: string | null
	noticePeriodDays?: number | null
	unitId?: string
	departmentId?: string | null
	designationId?: string | null
	locationId?: string
	positionId?: string | null
	jobTitle?: string
	workMode?: WorkModeValue
	fullTimeEquivalent?: number
	standardHoursPerWeek?: number | null
	costCenterCode?: string | null
	managerWorkerId?: string | null
}

export interface ChangeReferenceDto {
	id: string
	name: string
}

/** A current or proposed fact for display: label text, never a raw identifier. */
export interface ChangeComparisonRowDto {
	field: TargetField | 'employmentStatus'
	current: string | null
	proposed: string | null
}

export interface ChangeApprovalDto {
	slotCode: string
	decision: 'Approved' | 'Rejected'
	decidedBy: string
	decidedByMe: boolean
	reason: string
	decidedAt: string
}

export interface ChangeSlotDto {
	code: string
	name: string
	status: 'Pending' | 'Approved' | 'Rejected'
}

export interface ChangeExecutionStepDto {
	stepCode: string
	sequence: number
	attempt: number
	status: 'Succeeded' | 'Failed' | 'Skipped'
	completedAt: string | null
	failureCode: string | null
}

export interface EmploymentChangeSummaryDto {
	id: string
	workerId: string
	workerName: string
	workerNumber: string
	changeType: ChangeType
	effectiveDate: string
	status: ChangeStatus
	/** The open approval slot, if any. */
	currentSlot: string | null
	requestedBy: string
	requestedByMe: boolean
	requestedAt: string
}

export type EmploymentChangePage = HcmPage<EmploymentChangeSummaryDto>

export interface EmploymentChangeRequestDto extends EmploymentChangeSummaryDto {
	employmentId: string | null
	assignmentId: string | null
	targets: ChangeTargets
	/** Current against proposed facts, as display text. */
	comparison: ChangeComparisonRowDto[]
	reasonCode: string
	reasonDetail: string
	evidenceReference: string
	approvalPolicy: { code: string; version: number } | null
	slots: ChangeSlotDto[]
	approvals: ChangeApprovalDto[]
	execution: ChangeExecutionStepDto[]
	submittedAt: string | null
	approvedAt: string | null
	completedAt: string | null
	cancelledAt: string | null
	cancelReason: string | null
	failureCode: string | null
	resultEmploymentId: string | null
	/** Presentation hints; every command re-authorizes on the server. */
	actions: { edit: boolean; submit: boolean; decide: boolean; apply: boolean; cancel: boolean }
	revision: number
}

export interface ChangeContextEmploymentDto {
	employmentId: string
	revision: number
	primary: boolean
	legalEntity: ChangeReferenceDto | null
	employmentType: string | null
	employmentStatus: string | null
	hireDate: string | null
	endDate: string | null
	continuousServiceStartDate: string | null
	probationEndDate: string | null
	noticePeriodDays: number | null
	eligibleForRehire: boolean | null
	established: boolean
}

export interface ChangeContextAssignmentDto {
	assignmentId: string
	employmentId: string
	revision: number
	primary: boolean
	effectiveFrom: string | null
	effectiveTo: string | null
	unit: ChangeReferenceDto | null
	department: ChangeReferenceDto | null
	designation: ChangeReferenceDto | null
	location: ChangeReferenceDto | null
	position: ChangeReferenceDto | null
	jobTitle: string
	workMode: string | null
	fullTimeEquivalent: number | null
	standardHoursPerWeek: number | null
	costCenterCode: string
	manager: ChangeReferenceDto | null
}

export interface WorkerChangeContextDto {
	workerId: string
	displayName: string
	workerNumber: string
	workerType: ChangeReferenceDto | null
	employments: ChangeContextEmploymentDto[]
	assignments: ChangeContextAssignmentDto[]
	/** Whether the worker has no engaged employment, so a Rehire is possible. */
	rehireAllowed: boolean
	asOf: string
}

export interface ChangeOptionDto {
	id: string
	code: string
	name: string
}

export type ChangeOptionPage = HcmPage<ChangeOptionDto>

// Commands and queries.

export interface ChangeListQuery {
	view: ChangeView
	sort: 'effectiveDate:desc' | 'createdAt:desc'
	limit: number
	cursor?: string
	q: string
	changeType?: ChangeType
	status?: ChangeStatus
	from?: string
	to?: string
}

export interface CreateChangeCommand {
	workerId: string
	employmentId: string | null
	assignmentId: string | null
	changeType: ChangeType
	effectiveDate: string
	targets: ChangeTargets
	reasonCode: string
	reasonDetail: string
	evidenceReference: string
}

export interface UpdateChangeCommand {
	targets: ChangeTargets
	effectiveDate: string
	reasonCode: string
	reasonDetail: string
	expectedRevision: number
}

export interface DecideChangeCommand {
	slotCode: string
	decision: 'Approved' | 'Rejected'
	reason: string
	expectedRevision: number
}

/** Parse one target value by field. */
function targetValue(field: TargetField, value: unknown): unknown {
	const name = `targets.${field}`
	if (value === null) {
		if (!CLEARABLE_TARGETS.includes(field)) invalidField(name, 'required')
		return null
	}
	switch (field) {
		case 'employmentType':
			return enumValue(value, name, EMPLOYMENT_TYPES)
		case 'workMode':
			return enumValue(value, name, WORK_MODES)
		case 'continuousServiceStartDate':
		case 'probationEndDate':
			return dateValue(value, name)
		case 'noticePeriodDays':
			return intValue(value, name, 0, 365)
		case 'fullTimeEquivalent':
			return decimalValue(value, name, 0.01, 1, 2)
		case 'standardHoursPerWeek':
			return decimalValue(value, name, 0.25, 168, 2)
		case 'jobTitle':
			return textValue(value, name, 150)
		case 'costCenterCode':
			return textValue(value, name, 40, false)
		default:
			return idValue(value, name)
	}
}

/** Parse the targets of a change type: only its allowed facts, its required ones present. */
export function parseTargets(type: ChangeType, value: unknown): ChangeTargets {
	const rule = CHANGE_TYPE_RULES[type]
	if (!value || typeof value !== 'object' || Array.isArray(value)) invalidField('targets')
	const input = value as Record<string, unknown>
	const targets: Record<string, unknown> = {}
	for (const key of Object.keys(input)) {
		if (!(rule.allowed as readonly string[]).includes(key))
			invalidField(`targets.${key}`, 'unknown')
		if (input[key] !== undefined) targets[key] = targetValue(key as TargetField, input[key])
	}
	for (const field of rule.required)
		if (targets[field] === undefined || targets[field] === null)
			invalidField(`targets.${field}`, 'required')
	if (rule.needsTarget && !Object.keys(targets).length) invalidField('targets', 'required')
	return targets as ChangeTargets
}

/** Parse the reason code of a change type. */
function reasonCodeValue(type: ChangeType, value: unknown): string {
	const code = codeValue(value, 'reasonCode')
	if (!CHANGE_TYPE_RULES[type].reasons.includes(code)) invalidField('reasonCode', 'unknown')
	return code
}

/** Parse a new request. */
export function parseCreateChange(body: unknown): CreateChangeCommand {
	const v = readBody(
		body,
		['workerId', 'changeType', 'effectiveDate', 'targets', 'reasonCode', 'reasonDetail'],
		['employmentId', 'assignmentId', 'evidenceReference'],
	)
	const changeType = enumValue(v['changeType'], 'changeType', CHANGE_TYPES)
	const employmentId =
		v['employmentId'] === undefined || v['employmentId'] === null
			? null
			: idValue(v['employmentId'], 'employmentId')
	if ((changeType === 'Rehire') !== (employmentId === null))
		invalidField('employmentId', changeType === 'Rehire' ? 'unknown' : 'required')
	const assignmentId =
		v['assignmentId'] === undefined || v['assignmentId'] === null
			? null
			: idValue(v['assignmentId'], 'assignmentId')
	return {
		workerId: idValue(v['workerId'], 'workerId'),
		employmentId,
		assignmentId,
		changeType,
		effectiveDate: dateValue(v['effectiveDate'], 'effectiveDate'),
		targets: parseTargets(changeType, v['targets']),
		reasonCode: reasonCodeValue(changeType, v['reasonCode']),
		reasonDetail: textValue(v['reasonDetail'], 'reasonDetail', 1000),
		evidenceReference:
			v['evidenceReference'] === undefined || v['evidenceReference'] === null
				? ''
				: textValue(v['evidenceReference'], 'evidenceReference', 200, false),
	}
}

/** Parse a draft update; the change type is fixed for life. */
export function parseUpdateChange(type: ChangeType, body: unknown): UpdateChangeCommand {
	const v = readBody(body, [
		'targets',
		'effectiveDate',
		'reasonCode',
		'reasonDetail',
		'expectedRevision',
	])
	return {
		targets: parseTargets(type, v['targets']),
		effectiveDate: dateValue(v['effectiveDate'], 'effectiveDate'),
		reasonCode: reasonCodeValue(type, v['reasonCode']),
		reasonDetail: textValue(v['reasonDetail'], 'reasonDetail', 1000),
		expectedRevision: revisionValue(v['expectedRevision']),
	}
}

/** Parse a command that only quotes the revision. */
export function parseRevisionCommand(body: unknown): { expectedRevision: number } {
	const v = readBody(body, ['expectedRevision'])
	return { expectedRevision: revisionValue(v['expectedRevision']) }
}

/** Parse a decision on an approval slot. */
export function parseDecideChange(body: unknown): DecideChangeCommand {
	const v = readBody(body, ['slotCode', 'decision', 'reason', 'expectedRevision'])
	return {
		slotCode: codeValue(v['slotCode'], 'slotCode', /^[a-z][a-z0-9-]{1,59}$/),
		decision: enumValue(v['decision'], 'decision', ['Approved', 'Rejected'] as const),
		reason: textValue(v['reason'], 'reason', 1000),
		expectedRevision: revisionValue(v['expectedRevision']),
	}
}

/** Parse a cancellation. */
export function parseCancelChange(body: unknown): { expectedRevision: number; reason: string } {
	const v = readBody(body, ['expectedRevision', 'reason'])
	return {
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: textValue(v['reason'], 'reason', 500),
	}
}

/** Parse a request page query. */
export function parseChangeListQuery(params: URLSearchParams): ChangeListQuery {
	const query = readListQuery(
		params,
		['effectiveDate:desc', 'createdAt:desc'],
		['view', 'changeType', 'status', 'from', 'to'],
	)
	const f = query.filters
	const from = f['from'] !== undefined ? dateValue(f['from'], 'from') : undefined
	const to = f['to'] !== undefined ? dateValue(f['to'], 'to') : undefined
	if (from && to && to < from) invalidField('to', 'before-from')
	return {
		view: f['view'] !== undefined ? enumValue(f['view'], 'view', CHANGE_VIEWS) : 'all',
		sort: query.sort as ChangeListQuery['sort'],
		limit: query.limit,
		q: query.q,
		...(query.cursor ? { cursor: query.cursor } : {}),
		...(f['changeType'] !== undefined
			? { changeType: enumValue(f['changeType'], 'changeType', CHANGE_TYPES) }
			: {}),
		...(f['status'] !== undefined
			? { status: enumValue(f['status'], 'status', CHANGE_STATUSES) }
			: {}),
		...(from ? { from } : {}),
		...(to ? { to } : {}),
	}
}

/** Parse the option kind path segment. */
export function parseChangeOptionKind(value: string): ChangeOptionKind {
	return enumValue(value, 'kind', CHANGE_OPTION_KINDS)
}
