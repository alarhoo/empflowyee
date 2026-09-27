import {
	boolValue,
	codeValue,
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

/**
 * HR service vocabulary (HR Service Desk and My HR Requests TDD#API, DEC-HCM2-004): requests raised
 * by or for a worker, routed to a team, worked through a lifecycle with employee-visible replies and
 * internal notes, and measured against versioned service level targets on a 24x7 clock. Self DTOs
 * never carry internal content, assignee identity or internal service level fields.
 */

export const HR_PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const
export type HrPriority = (typeof HR_PRIORITIES)[number]
export const HR_STATUSES = [
	'New',
	'Open',
	'WaitingForEmployee',
	'WaitingForHr',
	'Resolved',
	'Closed',
	'Cancelled',
] as const
export type HrStatus = (typeof HR_STATUSES)[number]
export const HR_RESOLUTION_CODES = [
	'Answered',
	'Corrected',
	'NoActionNeeded',
	'Duplicate',
	'OutOfScope',
] as const
export type HrResolutionCode = (typeof HR_RESOLUTION_CODES)[number]
export const HR_VISIBILITIES = ['EmployeeVisible', 'Internal'] as const
export type HrVisibility = (typeof HR_VISIBILITIES)[number]
export const HR_CATEGORIES = [
	'PersonalData',
	'Employment',
	'Pay',
	'Leave',
	'Documents',
	'General',
] as const
export type HrCategory = (typeof HR_CATEGORIES)[number]
export const HR_AUDIENCES = ['Employee', 'HrOnly'] as const
export type HrAudience = (typeof HR_AUDIENCES)[number]
export const HR_CLASSIFICATIONS = ['Standard', 'Sensitive'] as const
export const HR_QUEUE_VIEWS = ['assigned', 'teams', 'all'] as const
export type HrQueueView = (typeof HR_QUEUE_VIEWS)[number]
export const SLA_STATES = ['OnTrack', 'DueSoon', 'Breached', 'Paused', 'Met', 'None'] as const
export type SlaState = (typeof SLA_STATES)[number]
export const TARGET_KINDS = ['FirstResponse', 'Resolution'] as const
export type TargetKind = (typeof TARGET_KINDS)[number]
export const HR_CONFIG_KINDS = ['teams', 'memberships', 'request-types', 'service-levels'] as const
export type HrConfigKind = (typeof HR_CONFIG_KINDS)[number]
export const SELF_VIEWS = ['open', 'closed', 'all'] as const
/** The request type a My Profile correction link prefills. */
export const CORRECTION_TYPE_CODE = 'personal-data-correction'
/** DEC-HCM2-004: the requester may reopen a resolved request for this many days. */
export const REOPEN_WINDOW_DAYS = 7
/** A running target due within this many minutes is DueSoon. */
export const DUE_SOON_MINUTES = 120
/** Statuses in which a request is still being worked. */
export const HR_ACTIVE_STATUSES: readonly HrStatus[] = [
	'New',
	'Open',
	'WaitingForEmployee',
	'WaitingForHr',
]

export interface HrRef {
	id: string
	name: string
}

export interface HrServiceRequestSummaryDto {
	id: string
	requestNumber: string
	subject: string
	type: HrRef
	requester: { workerId: string; name: string }
	priority: HrPriority
	status: HrStatus
	team: HrRef
	assignee: { accountId: string; name: string } | null
	nextDueAt: string | null
	slaState: SlaState
	updatedAt: string
}

export type HrServiceRequestPage = HcmPage<HrServiceRequestSummaryDto>

export interface HrServiceTargetDto {
	kind: TargetKind
	targetMinutes: number
	startedAt: string
	dueAt: string
	pausedAt: string | null
	metAt: string | null
	breachedAt: string | null
	state: SlaState
}

export interface HrServiceAttachmentDto {
	id: string
	messageId: string
	fileName: string
	mediaType: string
	sizeBytes: number
	visibility: HrVisibility
	createdAt: string
}

export interface HrServiceRequestDto extends HrServiceRequestSummaryDto {
	classification: string
	createdAt: string
	createdBy: string
	resolutionCode: HrResolutionCode | null
	resolutionSummary: string | null
	resolvedAt: string | null
	closedAt: string | null
	cancelReason: string | null
	reopenUntil: string | null
	policy: { code: string; versionNumber: number }
	targets: HrServiceTargetDto[]
	assignments: {
		team: string
		assignee: string | null
		assignedBy: string
		reason: string
		assignedAt: string
		endedAt: string | null
	}[]
	attachments: HrServiceAttachmentDto[]
	/** Presentation hints; every command re-authorizes on the server. */
	actions: { reply: boolean; note: boolean; assign: boolean; transitions: HrStatus[] }
	revision: number
}

export interface HrServiceMessageDto {
	id: string
	sequenceNumber: number
	visibility: HrVisibility
	kind: 'Message' | 'StatusUpdate'
	author: string
	fromRequester: boolean
	body: string
	createdAt: string
	attachments: HrServiceAttachmentDto[]
}

export type HrServiceMessagePage = HcmPage<HrServiceMessageDto>

export interface HrServiceRequestSelfSummaryDto {
	id: string
	requestNumber: string
	subject: string
	typeName: string
	status: HrStatus
	createdAt: string
	updatedAt: string
}

export type HrServiceRequestSelfPage = HcmPage<HrServiceRequestSelfSummaryDto>

/** The requester's view: no internal content, assignee identity or internal service level field. */
export interface HrServiceRequestSelfDto extends HrServiceRequestSelfSummaryDto {
	type: HrRef
	resolutionCode: HrResolutionCode | null
	resolutionSummary: string | null
	resolvedAt: string | null
	cancelReason: string | null
	reopenUntil: string | null
	actions: { reply: boolean; cancel: boolean; reopen: boolean }
	revision: number
}

export interface HrServiceMessageSelfDto {
	id: string
	kind: 'Message' | 'StatusUpdate'
	fromMe: boolean
	/** 'You' for the requester, 'HR' for every agent; agent names are not shown. */
	author: string
	body: string
	createdAt: string
	attachments: { id: string; fileName: string; mediaType: string; sizeBytes: number }[]
}

export type HrServiceMessageSelfPage = HcmPage<HrServiceMessageSelfDto>

export interface RequestTypeOptionDto {
	id: string
	code: string
	name: string
	category: HrCategory
	description: string
}

export interface HrServiceTeamDto {
	id: string
	code: string
	name: string
	description: string
	isActive: boolean
	memberCount: number
	revision: number
}

export interface HrServiceMembershipDto {
	id: string
	team: HrRef
	account: { accountId: string; name: string }
	memberRole: 'Agent' | 'Lead'
	isActive: boolean
	revision: number
}

export interface HrServiceRequestTypeDto {
	id: string
	code: string
	name: string
	description: string
	category: HrCategory
	audience: HrAudience
	classification: string
	defaultTeam: HrRef
	serviceLevelCode: string
	defaultPriority: HrPriority
	isActive: boolean
	sortOrder: number
	revision: number
}

export type PriorityTargets = Record<HrPriority, { firstResponse: number; resolution: number }>

export interface HrServiceLevelPolicyDto {
	id: string
	code: string
	versionNumber: number
	name: string
	status: 'Draft' | 'Published' | 'Retired'
	targets: PriorityTargets
	pauseWhileWaiting: boolean
	reopenWindowDays: number
	publishedAt: string | null
	revision: number
}

export type HrServiceConfigDto =
	HrServiceTeamDto | HrServiceMembershipDto | HrServiceRequestTypeDto | HrServiceLevelPolicyDto

export type HrServiceConfigPage = HcmPage<HrServiceConfigDto>

export interface HrOptionDto {
	id: string
	name: string
	detail: string
}

export type HrOptionPage = HcmPage<HrOptionDto>

// Commands and queries.

/** An optional trimmed text, or null when absent or blank. */
function optional(value: unknown, field: string, max: number): string | null {
	if (value === undefined || value === null) return null
	const text = textValue(value, field, max, false).trim()
	return text || null
}

/** Parse an HR-raised request for a worker. */
export function parseCreateHrRequest(body: unknown) {
	const v = readBody(body, [
		'subjectWorkerId',
		'typeId',
		'priority',
		'subject',
		'description',
		'reason',
	])
	return {
		subjectWorkerId: idValue(v['subjectWorkerId'], 'subjectWorkerId'),
		typeId: idValue(v['typeId'], 'typeId'),
		priority: enumValue(v['priority'], 'priority', HR_PRIORITIES),
		subject: textValue(v['subject'], 'subject', 200),
		description: textValue(v['description'], 'description', 5000),
		reason: textValue(v['reason'], 'reason', 500),
	}
}

/** Parse a self-raised request's metadata. */
export function parseCreateSelfRequest(body: unknown) {
	const v = readBody(body, ['typeId', 'subject', 'description'])
	return {
		typeId: idValue(v['typeId'], 'typeId'),
		subject: textValue(v['subject'], 'subject', 200),
		description: textValue(v['description'], 'description', 5000),
	}
}

/** Parse an HR message: an employee-visible reply or an internal note. */
export function parseHrMessage(body: unknown) {
	const v = readBody(body, ['visibility', 'body', 'expectedRevision'])
	return {
		visibility: enumValue(v['visibility'], 'visibility', HR_VISIBILITIES),
		body: textValue(v['body'], 'body', 5000),
		expectedRevision: revisionValue(v['expectedRevision']),
	}
}

/** Parse a requester reply. */
export function parseSelfMessage(body: unknown) {
	const v = readBody(body, ['body', 'expectedRevision'])
	return {
		body: textValue(v['body'], 'body', 5000),
		expectedRevision: revisionValue(v['expectedRevision']),
	}
}

/** Parse an assignment to a team and optionally an agent. */
export function parseAssignment(body: unknown) {
	const v = readBody(body, ['teamId', 'reason', 'expectedRevision'], ['assigneeAccountId'])
	return {
		teamId: idValue(v['teamId'], 'teamId'),
		assigneeAccountId:
			v['assigneeAccountId'] === undefined || v['assigneeAccountId'] === null
				? null
				: idValue(v['assigneeAccountId'], 'assigneeAccountId'),
		reason: textValue(v['reason'], 'reason', 500),
		expectedRevision: revisionValue(v['expectedRevision']),
	}
}

/** Parse a status change; Resolved needs a resolution code and summary, Cancelled a reason. */
export function parseStatusChange(body: unknown) {
	const v = readBody(
		body,
		['status', 'expectedRevision'],
		['resolutionCode', 'resolutionSummary', 'reason'],
	)
	const status = enumValue(v['status'], 'status', HR_STATUSES)
	const resolutionCode =
		v['resolutionCode'] === undefined || v['resolutionCode'] === null
			? null
			: enumValue(v['resolutionCode'], 'resolutionCode', HR_RESOLUTION_CODES)
	const resolutionSummary = optional(v['resolutionSummary'], 'resolutionSummary', 1000)
	const reason = optional(v['reason'], 'reason', 500)
	if (status === 'Resolved' && !resolutionCode) invalidField('resolutionCode', 'required')
	if (status === 'Resolved' && !resolutionSummary) invalidField('resolutionSummary', 'required')
	if (status !== 'Resolved' && (resolutionCode || resolutionSummary))
		invalidField('resolutionCode', 'not-allowed')
	if (status === 'Cancelled' && !reason) invalidField('reason', 'required')
	return {
		status,
		resolutionCode,
		resolutionSummary,
		reason,
		expectedRevision: revisionValue(v['expectedRevision']),
	}
}

/** Parse a requester's cancel or reopen. */
export function parseSelfTransition(body: unknown) {
	const v = readBody(body, ['reason', 'expectedRevision'])
	return {
		reason: textValue(v['reason'], 'reason', 500),
		expectedRevision: revisionValue(v['expectedRevision']),
	}
}

/** Parse the desk queue query. */
export function parseQueueQuery(params: URLSearchParams) {
	const query = readListQuery(
		params,
		['nextDue:asc'],
		['view', 'status', 'priority', 'typeId', 'slaState'],
	)
	const f = query.filters
	return {
		limit: query.limit,
		q: query.q,
		view: f['view'] ? enumValue(f['view'], 'view', HR_QUEUE_VIEWS) : ('all' as HrQueueView),
		...(query.cursor ? { cursor: query.cursor } : {}),
		...(f['status'] ? { status: enumValue(f['status'], 'status', HR_STATUSES) } : {}),
		...(f['priority'] ? { priority: enumValue(f['priority'], 'priority', HR_PRIORITIES) } : {}),
		...(f['typeId'] ? { typeId: idValue(f['typeId'], 'typeId') } : {}),
		...(f['slaState'] ? { slaState: enumValue(f['slaState'], 'slaState', SLA_STATES) } : {}),
	}
}

/** Parse the requester's own list query. */
export function parseSelfQuery(params: URLSearchParams) {
	const query = readListQuery(params, ['createdAt:desc'], ['view'])
	return {
		limit: query.limit,
		view: query.filters['view']
			? enumValue(query.filters['view'], 'view', SELF_VIEWS)
			: ('all' as const),
		...(query.cursor ? { cursor: query.cursor } : {}),
	}
}

/** Parse a message page query. */
export function parseMessageQuery(params: URLSearchParams) {
	const query = readListQuery(params, ['sequence:asc'])
	return { limit: query.limit, ...(query.cursor ? { cursor: query.cursor } : {}) }
}

/** Parse an option or configuration page query. */
export function parseHrListQuery(params: URLSearchParams) {
	const query = readListQuery(params, ['name:asc'])
	return { limit: query.limit, q: query.q, ...(query.cursor ? { cursor: query.cursor } : {}) }
}

/** Parse the minute targets of each priority. */
function targetsValue(value: unknown): PriorityTargets {
	if (!value || typeof value !== 'object' || Array.isArray(value)) invalidField('targets')
	const input = value as Record<string, unknown>
	const result = {} as PriorityTargets
	for (const priority of HR_PRIORITIES) {
		const entry = input[priority] as Record<string, unknown> | undefined
		if (!entry || typeof entry !== 'object') invalidField(`targets.${priority}`, 'required')
		const firstResponse = intValue(
			entry['firstResponse'],
			`targets.${priority}.firstResponse`,
			1,
			525600,
		)
		const resolution = intValue(entry['resolution'], `targets.${priority}.resolution`, 1, 525600)
		if (resolution < firstResponse)
			invalidField(`targets.${priority}.resolution`, 'before-first-response')
		result[priority] = { firstResponse, resolution }
	}
	if (
		Object.keys(input).some(
			/** Unknown priority. */ (key) => !(HR_PRIORITIES as readonly string[]).includes(key),
		)
	)
		invalidField('targets', 'unknown')
	return result
}

/** Parse a configuration create or update of one kind; `update` names the revision. */
export function parseConfiguration(kind: HrConfigKind, body: unknown, update: boolean) {
	const revision = update ? ['expectedRevision'] : []
	if (kind === 'teams') {
		const v = readBody(
			body,
			[...(update ? [] : ['code']), 'name', 'reason', ...revision],
			['description', 'isActive'],
		)
		return {
			kind,
			...(update ? {} : { code: codeValue(v['code'], 'code') }),
			name: textValue(v['name'], 'name', 100),
			description: optional(v['description'], 'description', 500) ?? '',
			isActive: v['isActive'] === undefined ? true : boolValue(v['isActive'], 'isActive'),
			reason: textValue(v['reason'], 'reason', 500),
			...(update ? { expectedRevision: revisionValue(v['expectedRevision']) } : {}),
		}
	}
	if (kind === 'memberships') {
		const v = readBody(
			body,
			[...(update ? [] : ['teamId', 'accountId']), 'memberRole', 'reason', ...revision],
			['isActive'],
		)
		const subject = update
			? {}
			: { teamId: idValue(v['teamId'], 'teamId'), accountId: idValue(v['accountId'], 'accountId') }
		return {
			kind,
			...subject,
			memberRole: enumValue(v['memberRole'], 'memberRole', ['Agent', 'Lead'] as const),
			isActive: v['isActive'] === undefined ? true : boolValue(v['isActive'], 'isActive'),
			reason: textValue(v['reason'], 'reason', 500),
			...(update ? { expectedRevision: revisionValue(v['expectedRevision']) } : {}),
		}
	}
	if (kind === 'request-types') {
		const v = readBody(
			body,
			[
				...(update ? [] : ['code']),
				'name',
				'category',
				'audience',
				'defaultTeamId',
				'serviceLevelCode',
				'defaultPriority',
				'reason',
				...revision,
			],
			['description', 'classification', 'isActive', 'sortOrder'],
		)
		const code = update ? undefined : textValue(v['code'], 'code', 60)
		if (code !== undefined && !/^[a-z][a-z0-9-]{1,59}$/.test(code)) invalidField('code')
		return {
			kind,
			...(code !== undefined ? { code } : {}),
			name: textValue(v['name'], 'name', 100),
			description: optional(v['description'], 'description', 500) ?? '',
			category: enumValue(v['category'], 'category', HR_CATEGORIES),
			audience: enumValue(v['audience'], 'audience', HR_AUDIENCES),
			classification:
				v['classification'] === undefined
					? 'Standard'
					: enumValue(v['classification'], 'classification', HR_CLASSIFICATIONS),
			defaultTeamId: idValue(v['defaultTeamId'], 'defaultTeamId'),
			serviceLevelCode: textValue(v['serviceLevelCode'], 'serviceLevelCode', 40),
			defaultPriority: enumValue(v['defaultPriority'], 'defaultPriority', HR_PRIORITIES),
			isActive: v['isActive'] === undefined ? true : boolValue(v['isActive'], 'isActive'),
			sortOrder: v['sortOrder'] === undefined ? 0 : intValue(v['sortOrder'], 'sortOrder', 0, 999),
			reason: textValue(v['reason'], 'reason', 500),
			...(update ? { expectedRevision: revisionValue(v['expectedRevision']) } : {}),
		}
	}
	// Service levels: create a draft version, edit it, or publish it with status Published.
	const v = readBody(
		body,
		[...(update ? [] : ['code']), 'reason', ...revision],
		['name', 'targets', 'pauseWhileWaiting', 'reopenWindowDays', 'status'],
	)
	const code = update ? undefined : textValue(v['code'], 'code', 40)
	if (code !== undefined && !/^[a-z][a-z0-9-]{1,39}$/.test(code)) invalidField('code')
	const status =
		v['status'] === undefined
			? undefined
			: enumValue(v['status'], 'status', ['Draft', 'Published'] as const)
	if (!update && (v['name'] === undefined || v['targets'] === undefined))
		invalidField(v['name'] === undefined ? 'name' : 'targets', 'required')
	return {
		kind,
		...(code !== undefined ? { code } : {}),
		...(v['name'] !== undefined ? { name: textValue(v['name'], 'name', 100) } : {}),
		...(v['targets'] !== undefined ? { targets: targetsValue(v['targets']) } : {}),
		...(v['pauseWhileWaiting'] !== undefined
			? { pauseWhileWaiting: boolValue(v['pauseWhileWaiting'], 'pauseWhileWaiting') }
			: {}),
		...(v['reopenWindowDays'] !== undefined
			? { reopenWindowDays: intValue(v['reopenWindowDays'], 'reopenWindowDays', 0, 90) }
			: {}),
		...(status ? { status } : {}),
		reason: textValue(v['reason'], 'reason', 500),
		...(update ? { expectedRevision: revisionValue(v['expectedRevision']) } : {}),
	}
}

export type TeamCommand = Extract<ReturnType<typeof parseConfiguration>, { kind: 'teams' }>
export type MembershipCommand = Extract<
	ReturnType<typeof parseConfiguration>,
	{ kind: 'memberships' }
>
export type RequestTypeCommand = Extract<
	ReturnType<typeof parseConfiguration>,
	{ kind: 'request-types' }
>
export type ServiceLevelCommand = Extract<
	ReturnType<typeof parseConfiguration>,
	{ kind: 'service-levels' }
>
