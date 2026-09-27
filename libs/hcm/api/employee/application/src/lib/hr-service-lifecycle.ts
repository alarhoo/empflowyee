import type { HrPriority, HrStatus, HrVisibility } from '@empflowyee/hcm-employee-contract'
import { HcmDomainError, invalidField } from '@empflowyee/hcm-runtime-contract'
import { minutesBetween, newlyBreached, resumedDue } from '@empflowyee/hcm-api-employee-domain'
import { DocumentError } from '@empflowyee/hcm-documents-contract'
import type { EmployeeWork } from './employee-unit'
import type { HrRequestPatch, HrRequestRow, HrTypeRow } from './hr-service-repository'

/** An uploaded file for a message. */
export interface HrUpload {
	fileName: string
	mediaType: string
	bytes: Buffer
}

/** Status labels written into employee-visible status messages. */
const STATUS_TEXT: Record<HrStatus, string> = {
	New: 'New',
	Open: 'Open',
	WaitingForEmployee: 'Waiting for you',
	WaitingForHr: 'Waiting for HR',
	Resolved: 'Resolved',
	Closed: 'Closed',
	Cancelled: 'Cancelled',
}

/** Append one HR service audit event naming states and fields only. */
export async function auditHr(
	w: EmployeeWork,
	action: string,
	id: string,
	requestId: string,
	reason: string | null,
	fromState: string | null,
	toState: string | null,
	changedFields: string[] = [],
): Promise<void> {
	await w.audit.append({
		action,
		category: 'business',
		targetType: 'hr-service-request',
		targetId: id,
		requestId,
		summary: { reason, changedFields, fromState, toState },
	})
}

/**
 * Create a request in one transaction: the tenant's next request number, routing to the type's
 * default team, service level targets from the type's published policy, the description as the
 * first employee-visible message and an optional attachment.
 */
export async function createHrRequest(
	w: EmployeeWork,
	input: {
		type: HrTypeRow
		requesterWorkerId: string
		requesterAccountId: string | null
		priority: HrPriority
		subject: string
		description: string
		fromRequester: boolean
		upload: HrUpload | null
	},
	requestId: string,
): Promise<string> {
	const policy = await w.hrService.publishedPolicy(input.type.serviceLevelCode)
	if (!policy)
		throw new HcmDomainError('invalid-state', [{ field: 'typeId', code: 'no-service-level' }])
	const { id } = await w.hrService.insertRequest({
		requesterWorkerId: input.requesterWorkerId,
		requesterAccountId: input.requesterAccountId,
		typeId: input.type.id,
		policyId: policy.id,
		priority: input.priority,
		subject: input.subject,
		teamId: input.type.defaultTeamId,
	})
	await w.hrService.assign(
		id,
		input.type.defaultTeamId,
		null,
		'Routed to the default team of the request type.',
	)
	const now = await w.hrService.now()
	const targets = policy.targets[input.priority]
	await w.hrService.insertTargets(id, [
		{ kind: 'FirstResponse', minutes: targets.firstResponse, startedAt: now },
		{ kind: 'Resolution', minutes: targets.resolution, startedAt: now },
	])
	const messageId = await w.hrService.insertMessage(id, {
		visibility: 'EmployeeVisible',
		kind: 'Message',
		body: input.description,
		fromRequester: input.fromRequester,
	})
	if (input.upload) await attach(w, id, messageId, 'EmployeeVisible', input.upload)
	await auditHr(w, 'employee.hr-request-created', id, requestId, null, null, 'New', [
		'type',
		'priority',
		'subject',
	])
	return id
}

/** Stage a verified attachment through documents and link it with the message's visibility. */
export async function attach(
	w: EmployeeWork,
	requestId: string,
	messageId: string,
	visibility: HrVisibility,
	upload: HrUpload,
): Promise<void> {
	let staged
	try {
		staged = await w.sources.stageAttachment(upload)
	} catch (error) {
		if (!(error instanceof DocumentError)) throw error
		if (error.code === 'file-too-large') throw new HcmDomainError('file-too-large')
		if (error.code === 'storage-unavailable') throw error
		throw new HcmDomainError('unsupported-file', [{ field: 'file', code: error.code }])
	}
	await w.hrService.insertAttachment(requestId, messageId, staged.blobId, visibility)
}

/** Persist every target whose due time passed unmet as breached at its due time. */
export async function persistBreaches(
	w: EmployeeWork,
	requestId: string,
	now: string,
): Promise<void> {
	const targets = await w.hrService.targets(requestId)
	for (const kind of newlyBreached(targets, now)) {
		const target = targets.find(/** Same kind. */ (item) => item.kind === kind)
		if (target) await w.hrService.updateTarget(requestId, kind, { breachedAt: target.dueAt })
	}
}

/** Lock a request at the expected revision and persist derived breaches first. */
export async function lockHrRequest(
	w: EmployeeWork,
	id: string,
	expected: number,
	requesterWorkerId?: string,
): Promise<{ request: HrRequestRow; now: string }> {
	const request = await w.hrService.request(id, { lock: true, requesterWorkerId })
	if (!request) throw new HcmDomainError('not-found')
	if (request.revision !== expected) throw new HcmDomainError('revision-conflict')
	const now = await w.hrService.now()
	await persistBreaches(w, id, now)
	return { request, now }
}

/**
 * Move a request to a status and keep its targets on the DEC-HCM2-004 clock: waiting for the
 * employee pauses unmet targets (when the policy says so), leaving it resumes them and moves their
 * due times, resolving meets both targets, and reopening restarts the resolution target with its
 * due time moved by the time spent resolved. An employee-visible status message records the change.
 */
export async function transitionHr(
	w: EmployeeWork,
	request: HrRequestRow,
	to: HrStatus,
	now: string,
	options: {
		resolutionCode?: string | null
		resolutionSummary?: string | null
		cancelReason?: string
		note?: string | null
	},
): Promise<void> {
	const from = request.status
	const targets = await w.hrService.targets(request.id)
	if (from === 'WaitingForEmployee' && to !== 'WaitingForEmployee')
		for (const target of targets)
			if (target.pausedAt && !target.metAt) {
				const resumed = resumedDue(target.dueAt, target.pausedAt, now)
				await w.hrService.updateTarget(request.id, target.kind, {
					dueAt: resumed.dueAt,
					pausedAt: null,
					addPausedMinutes: resumed.pausedMinutes,
				})
			}
	if (to === 'WaitingForEmployee' && request.policy.pauseWhileWaiting)
		for (const target of targets)
			if (!target.metAt && !target.pausedAt && !target.breachedAt)
				await w.hrService.updateTarget(request.id, target.kind, { pausedAt: now })
	if (to === 'Resolved')
		for (const target of targets)
			if (!target.metAt) await w.hrService.updateTarget(request.id, target.kind, { metAt: now })
	const reopened = from === 'Resolved' && to === 'Open'
	if (reopened) {
		const resolution = targets.find(/** Resolution. */ (item) => item.kind === 'Resolution')
		if (resolution && request.resolvedAt)
			await w.hrService.updateTarget(request.id, 'Resolution', {
				metAt: null,
				dueAt: new Date(
					new Date(resolution.dueAt).getTime() + minutesBetween(request.resolvedAt, now) * 60000,
				).toISOString(),
			})
	}
	const resolution: HrRequestPatch = {}
	if (to === 'Resolved') {
		resolution.resolutionCode = options.resolutionCode as HrRequestPatch['resolutionCode']
		resolution.resolutionSummary = options.resolutionSummary ?? null
		resolution.resolved = true
	}
	await w.hrService.updateRequest(request.id, {
		status: to,
		...resolution,
		...(reopened ? { resolutionCode: null, resolutionSummary: null, resolved: null } : {}),
		...(to === 'Closed' ? { closed: true } : {}),
		...(to === 'Cancelled' ? { cancelReason: options.cancelReason } : {}),
	})
	const note = options.note ?? options.cancelReason ?? options.resolutionSummary
	await w.hrService.insertMessage(request.id, {
		visibility: 'EmployeeVisible',
		kind: 'StatusUpdate',
		body: `Status changed from ${STATUS_TEXT[from]} to ${STATUS_TEXT[to]}.${note ? ` ${note}` : ''}`,
		fromRequester: false,
	})
}

/**
 * Record an HR message. An employee-visible reply meets the first response target and opens a new
 * request; an internal note changes nothing the employee can see.
 */
export async function hrMessage(
	w: EmployeeWork,
	request: HrRequestRow,
	visibility: HrVisibility,
	body: string,
	upload: HrUpload | null,
	now: string,
): Promise<void> {
	if (request.status === 'Closed' || request.status === 'Cancelled')
		throw new HcmDomainError('invalid-state')
	const messageId = await w.hrService.insertMessage(request.id, {
		visibility,
		kind: 'Message',
		body,
		fromRequester: false,
	})
	if (upload) await attach(w, request.id, messageId, visibility, upload)
	// Every message moves the revision, so open views see the conversation changed.
	const patch: HrRequestPatch = {}
	if (visibility === 'EmployeeVisible' && !request.firstRespondedAt) {
		await w.hrService.updateTarget(request.id, 'FirstResponse', { metAt: now })
		patch.firstResponded = true
	}
	if (visibility === 'EmployeeVisible' && request.status === 'New') patch.status = 'Open'
	await w.hrService.updateRequest(request.id, patch)
}

/** Require an agent account for an assignment. */
export async function requireAgent(w: EmployeeWork, accountId: string): Promise<void> {
	if (!(await w.hrService.isAgent(accountId))) invalidField('assigneeAccountId', 'not-agent')
}
