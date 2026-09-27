import type { HcmPage } from '@empflowyee/hcm-runtime-contract'
import type {
	HrConfigKind,
	HrOptionDto,
	HrPriority,
	HrQueueView,
	HrResolutionCode,
	HrServiceLevelPolicyDto,
	HrServiceMembershipDto,
	HrServiceRequestTypeDto,
	HrServiceTeamDto,
	HrStatus,
	HrVisibility,
	MembershipCommand,
	PriorityTargets,
	RequestTypeCommand,
	SlaState,
	TargetKind,
	TeamCommand,
} from '@empflowyee/hcm-employee-contract'
import type { TargetFacts } from '@empflowyee/hcm-api-employee-domain'

export interface HrRequestRow {
	id: string
	requestNumber: string
	subject: string
	type: { id: string; name: string }
	typeCode: string
	classification: string
	requester: { workerId: string; name: string }
	requesterAccountId: string | null
	priority: HrPriority
	status: HrStatus
	team: { id: string; name: string }
	assignee: { accountId: string; name: string } | null
	policy: {
		id: string
		code: string
		versionNumber: number
		pauseWhileWaiting: boolean
		reopenWindowDays: number
	}
	resolutionCode: HrResolutionCode | null
	resolutionSummary: string | null
	resolvedAt: string | null
	closedAt: string | null
	cancelReason: string | null
	firstRespondedAt: string | null
	createdAt: string
	createdBy: string
	updatedAt: string
	revision: number
}

/** A queue row with its server-computed service level state. */
export interface HrQueueRow extends HrRequestRow {
	nextDueAt: string | null
	slaState: SlaState
}

export interface HrMessageRow {
	id: string
	sequenceNumber: number
	visibility: HrVisibility
	kind: 'Message' | 'StatusUpdate'
	author: string
	authorAccountId: string
	fromRequester: boolean
	body: string
	createdAt: string
}

export interface HrAttachmentRow {
	id: string
	messageId: string
	blobId: string
	fileName: string
	mediaType: string
	sizeBytes: number
	visibility: HrVisibility
	createdAt: string
}

export interface HrAssignmentRow {
	team: string
	assignee: string | null
	assignedBy: string
	reason: string
	assignedAt: string
	endedAt: string | null
}

export interface HrTypeRow extends HrServiceRequestTypeDto {
	defaultTeamId: string
}

export interface NewHrRequest {
	requesterWorkerId: string
	requesterAccountId: string | null
	typeId: string
	policyId: string
	priority: HrPriority
	subject: string
	teamId: string
}

/** Request changes a command applies; omitted properties keep their value. */
export interface HrRequestPatch {
	status?: HrStatus
	priority?: HrPriority
	resolutionCode?: HrResolutionCode | null
	resolutionSummary?: string | null
	resolved?: boolean | null
	closed?: boolean
	cancelReason?: string
	firstResponded?: boolean
}

/** Target changes; timestamps are ISO strings. */
export interface HrTargetPatch {
	dueAt?: string
	pausedAt?: string | null
	addPausedMinutes?: number
	metAt?: string | null
	breachedAt?: string
}

/** Employee-owned HR service persistence in the caller's transaction. */
export interface HrServiceRepository {
	/** The database clock, so every service level calculation uses one time. */
	now(): Promise<string>
	queue(
		query: {
			limit: number
			cursor?: string
			q: string
			view: HrQueueView
			status?: HrStatus
			priority?: HrPriority
			typeId?: string
			slaState?: SlaState
		},
		actorAccountId: string,
		now: string,
	): Promise<HcmPage<HrQueueRow>>
	request(
		id: string,
		options?: { lock?: boolean; requesterWorkerId?: string },
	): Promise<HrRequestRow | undefined>
	selfRequests(
		requesterWorkerId: string,
		query: { limit: number; cursor?: string; view: 'open' | 'closed' | 'all' },
	): Promise<HcmPage<HrRequestRow>>
	messages(
		requestId: string,
		query: { limit: number; cursor?: string },
		employeeVisibleOnly: boolean,
	): Promise<HcmPage<HrMessageRow>>
	attachments(requestId: string, employeeVisibleOnly: boolean): Promise<HrAttachmentRow[]>
	targets(requestId: string): Promise<TargetFacts[]>
	assignments(requestId: string): Promise<HrAssignmentRow[]>
	insertRequest(request: NewHrRequest): Promise<{ id: string; requestNumber: string }>
	updateRequest(id: string, patch: HrRequestPatch): Promise<void>
	insertMessage(
		requestId: string,
		message: {
			visibility: HrVisibility
			kind: 'Message' | 'StatusUpdate'
			body: string
			fromRequester: boolean
		},
	): Promise<string>
	insertAttachment(
		requestId: string,
		messageId: string,
		blobId: string,
		visibility: HrVisibility,
	): Promise<string>
	insertTargets(
		requestId: string,
		targets: { kind: TargetKind; minutes: number; startedAt: string }[],
	): Promise<void>
	updateTarget(requestId: string, kind: TargetKind, patch: HrTargetPatch): Promise<void>
	/** End the current assignment and start a new one; the request carries the current team and agent. */
	assign(
		requestId: string,
		teamId: string,
		assigneeAccountId: string | null,
		reason: string,
	): Promise<void>
	/** Active request types of an audience, or of every audience. */
	types(audience?: 'Employee'): Promise<HrTypeRow[]>
	type(id: string): Promise<HrTypeRow | undefined>
	/** The published version of a service level policy code. */
	publishedPolicy(
		code: string,
	): Promise<(HrServiceLevelPolicyDto & { targets: PriorityTargets }) | undefined>
	/** Whether an enabled account holds the handle grant. */
	isAgent(accountId: string): Promise<boolean>
	/** Workers, teams or agents by name. */
	options(
		kind: 'workers' | 'teams' | 'agents' | 'types',
		query: { q: string; limit: number; cursor?: string },
	): Promise<HcmPage<HrOptionDto>>
	/** A worker's enabled account, if any. */
	workerAccount(workerId: string): Promise<string | null>
	configuration(
		kind: HrConfigKind,
		query: { q: string; limit: number; cursor?: string },
	): Promise<HcmPage<unknown>>
	configurationItem(
		kind: HrConfigKind,
		id: string,
		lock?: boolean,
	): Promise<(HrConfigItem & { revision: number }) | undefined>
	createTeam(command: TeamCommand): Promise<string>
	updateTeam(id: string, command: TeamCommand): Promise<void>
	createMembership(command: MembershipCommand): Promise<string>
	updateMembership(id: string, command: MembershipCommand): Promise<void>
	createRequestType(command: RequestTypeCommand): Promise<string>
	updateRequestType(id: string, command: RequestTypeCommand): Promise<void>
	/** The next version number of a policy code and whether a draft exists. */
	policyVersions(code: string): Promise<{ next: number; draft: boolean }>
	createPolicy(input: {
		code: string
		versionNumber: number
		name: string
		targets: PriorityTargets
		pauseWhileWaiting: boolean
		reopenWindowDays: number
	}): Promise<string>
	updatePolicy(
		id: string,
		patch: {
			name?: string
			targets?: PriorityTargets
			pauseWhileWaiting?: boolean
			reopenWindowDays?: number
		},
	): Promise<void>
	/** Retire the code's published version and publish the draft. */
	publishPolicy(id: string, code: string): Promise<void>
}

export type HrConfigItem =
	HrServiceTeamDto | HrServiceMembershipDto | HrServiceRequestTypeDto | HrServiceLevelPolicyDto
