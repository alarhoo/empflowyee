import {
	HR_CONFIG_KINDS,
	parseAssignment,
	parseConfiguration,
	parseCreateHrRequest,
	parseHrListQuery,
	parseHrMessage,
	parseMessageQuery,
	parseQueueQuery,
	parseStatusChange,
	type HrConfigKind,
	type HrOptionPage,
	type HrServiceConfigDto,
	type HrServiceConfigPage,
	type HrServiceMessagePage,
	type HrServiceRequestDto,
	type HrServiceRequestPage,
	type HrServiceRequestSummaryDto,
	type MembershipCommand,
	type RequestTypeCommand,
	type ServiceLevelCommand,
	type TeamCommand,
} from '@empflowyee/hcm-employee-contract'
import { HcmDomainError, idValue, invalidField } from '@empflowyee/hcm-runtime-contract'
import {
	commandHash,
	runIdempotent,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import type { OpenedAttachment } from '@empflowyee/hcm-api-documents-application'
import {
	hrTransitions,
	reopenUntil,
	requestSla,
	targetState,
} from '@empflowyee/hcm-api-employee-domain'
import type { EmployeeUnitOfWork, EmployeeWork } from './employee-unit'
import type { HrQueueRow, HrRequestRow } from './hr-service-repository'
import {
	auditHr,
	createHrRequest,
	hrMessage,
	lockHrRequest,
	requireAgent,
	transitionHr,
	type HrUpload,
} from './hr-service-lifecycle'

const HANDLE = 'hr-service.handle'
const CONFIGURE = 'hr-service.configure'
const OPTION_KINDS = ['workers', 'teams', 'agents', 'types'] as const

/**
 * HR Service Desk use cases (HR Service Desk TDD#API, DEC-HCM2-004): agents work the queue, reply
 * or add internal notes, route and move requests through the lifecycle with service level
 * targets, and configure teams, memberships, request types and service level policies.
 */
export class HrServiceDesk {
	/** Compose the desk use cases on the employee unit of work. */
	constructor(private readonly unit: EmployeeUnitOfWork) {}

	/** A page of the queue for a view, earliest running target first. */
	queue(context: AuthenticatedHcmContext, params: URLSearchParams): Promise<HrServiceRequestPage> {
		const query = parseQueueQuery(params)
		return this.unit.execute(
			context,
			HANDLE,
			false,
			/** Page the queue. */ async (w) => {
				const now = await w.hrService.now()
				const page = await w.hrService.queue(query, w.accountId, now)
				return {
					items: page.items.map(/** Summary. */ (row) => this.summary(row)),
					nextCursor: page.nextCursor,
				}
			},
		)
	}

	/** One request with its targets, assignments and attachments. */
	read(context: AuthenticatedHcmContext, id: string): Promise<HrServiceRequestDto> {
		idValue(id, 'id')
		return this.unit.execute(context, HANDLE, false, /** Read. */ (w) => this.detail(w, id))
	}

	/** A page of the conversation, oldest first, including internal notes. */
	messages(
		context: AuthenticatedHcmContext,
		id: string,
		params: URLSearchParams,
	): Promise<HrServiceMessagePage> {
		idValue(id, 'id')
		const query = parseMessageQuery(params)
		return this.unit.execute(
			context,
			HANDLE,
			false,
			/** Page messages. */ async (w) => {
				if (!(await w.hrService.request(id))) throw new HcmDomainError('not-found')
				const [page, attachments] = await Promise.all([
					w.hrService.messages(id, query, false),
					w.hrService.attachments(id, false),
				])
				return {
					items: page.items.map(
						/** Message with its attachments. */ ({ authorAccountId, ...row }) => {
							void authorAccountId
							return {
								...row,
								attachments: attachments
									.filter(/** Of this message. */ (item) => item.messageId === row.id)
									.map(/** Without the blob. */ ({ blobId, ...item }) => (void blobId, item)),
							}
						},
					),
					nextCursor: page.nextCursor,
				}
			},
		)
	}

	/** Workers, teams, agents or request types for pickers. */
	options(
		context: AuthenticatedHcmContext,
		kind: string,
		params: URLSearchParams,
	): Promise<HrOptionPage> {
		if (!(OPTION_KINDS as readonly string[]).includes(kind)) throw new HcmDomainError('not-found')
		const query = parseHrListQuery(params)
		return this.unit.execute(
			context,
			HANDLE,
			false,
			/** Page options. */ (w) => w.hrService.options(kind as (typeof OPTION_KINDS)[number], query),
		)
	}

	/** Raise a request on behalf of a worker; HR-only types are allowed here. */
	create(
		context: AuthenticatedHcmContext,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<HrServiceRequestDto> {
		const command = parseCreateHrRequest(body)
		return this.command(
			context,
			HANDLE,
			'create',
			command,
			key,
			/** Create. */ async (w) => {
				const type = await w.hrService.type(command.typeId)
				if (!type?.isActive) invalidField('typeId', 'unknown')
				const account = await w.hrService.workerAccount(command.subjectWorkerId)
				const id = await createHrRequest(
					w,
					{
						type,
						requesterWorkerId: command.subjectWorkerId,
						requesterAccountId: account,
						priority: command.priority,
						subject: command.subject,
						description: command.description,
						fromRequester: false,
						upload: null,
					},
					requestId,
				)
				return this.detail(w, id)
			},
		)
	}

	/** Reply to the requester or add an internal note, optionally with one attachment. */
	message(
		context: AuthenticatedHcmContext,
		id: string,
		metadata: unknown,
		upload: HrUpload | null,
		key: string,
		requestId: string,
	): Promise<HrServiceRequestDto> {
		idValue(id, 'id')
		const command = parseHrMessage(metadata)
		const file = upload ? { name: upload.fileName, size: upload.bytes.length } : null
		return this.command(
			context,
			HANDLE,
			'message',
			{ id, command, file },
			key,
			/** Message. */ async (w) => {
				const { request, now } = await lockHrRequest(w, id, command.expectedRevision)
				await hrMessage(w, request, command.visibility, command.body, upload, now)
				const action =
					command.visibility === 'Internal'
						? 'employee.hr-request-noted'
						: 'employee.hr-request-replied'
				await auditHr(w, action, id, requestId, null, request.status, null, ['message'])
				return this.detail(w, id)
			},
		)
	}

	/** Route to a team and optionally an agent; membership routes but never authorizes. */
	assign(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<HrServiceRequestDto> {
		idValue(id, 'id')
		const command = parseAssignment(body)
		return this.command(
			context,
			HANDLE,
			'assign',
			{ id, command },
			key,
			/** Assign. */ async (w) => {
				const { request } = await lockHrRequest(w, id, command.expectedRevision)
				if (request.status === 'Closed' || request.status === 'Cancelled')
					throw new HcmDomainError('invalid-state')
				const team = await w.hrService.configurationItem('teams', command.teamId)
				if (!team || !(team as { isActive: boolean }).isActive) invalidField('teamId', 'unknown')
				if (command.assigneeAccountId) await requireAgent(w, command.assigneeAccountId)
				await w.hrService.assign(id, command.teamId, command.assigneeAccountId, command.reason)
				await auditHr(
					w,
					'employee.hr-request-assigned',
					id,
					requestId,
					command.reason,
					null,
					null,
					['team', 'assignee'],
				)
				return this.detail(w, id)
			},
		)
	}

	/** Move the request to another status allowed from its current one. */
	status(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<HrServiceRequestDto> {
		idValue(id, 'id')
		const command = parseStatusChange(body)
		return this.command(
			context,
			HANDLE,
			'status',
			{ id, command },
			key,
			/** Move. */ async (w) => {
				const { request, now } = await lockHrRequest(w, id, command.expectedRevision)
				if (!hrTransitions(request.status).includes(command.status))
					throw new HcmDomainError('invalid-state')
				await transitionHr(w, request, command.status, now, {
					resolutionCode: command.resolutionCode,
					resolutionSummary: command.resolutionSummary,
					cancelReason: command.status === 'Cancelled' ? (command.reason ?? undefined) : undefined,
					note: command.status === 'Cancelled' ? null : command.reason,
				})
				await auditHr(
					w,
					'employee.hr-request-status-changed',
					id,
					requestId,
					command.reason,
					request.status,
					command.status,
					['status'],
				)
				return this.detail(w, id)
			},
		)
	}

	/** Open an attachment of a request, internal ones included, and audit the download. */
	download(
		context: AuthenticatedHcmContext,
		id: string,
		attachmentId: string,
		requestId: string,
	): Promise<OpenedAttachment> {
		idValue(id, 'id')
		idValue(attachmentId, 'attachmentId')
		return this.unit.execute(
			context,
			HANDLE,
			true,
			/** Open. */ async (w) => {
				const attachment = (await w.hrService.attachments(id, false)).find(
					/** This one. */ (item) => item.id === attachmentId,
				)
				if (!attachment) throw new HcmDomainError('not-found')
				await auditHr(w, 'employee.hr-attachment-downloaded', id, requestId, null, null, null, [
					'attachment',
				])
				return w.sources.openAttachment(attachment.blobId)
			},
		)
	}

	/** A page of one configuration kind. */
	configuration(
		context: AuthenticatedHcmContext,
		kind: string,
		params: URLSearchParams,
	): Promise<HrServiceConfigPage> {
		const configKind = this.kind(kind)
		const query = parseHrListQuery(params)
		return this.unit.execute(
			context,
			CONFIGURE,
			false,
			/** Page configuration. */ async (w) =>
				(await w.hrService.configuration(configKind, query)) as HrServiceConfigPage,
		)
	}

	/** Create a configuration item; a service level creates a draft version. */
	createConfiguration(
		context: AuthenticatedHcmContext,
		kind: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<HrServiceConfigDto> {
		const configKind = this.kind(kind)
		const command = parseConfiguration(configKind, body, false)
		return this.command(
			context,
			CONFIGURE,
			`config.${configKind}`,
			command,
			key,
			/** Create. */ async (w) => {
				let id: string
				if (command.kind === 'teams') id = await w.hrService.createTeam(command as TeamCommand)
				else if (command.kind === 'memberships') {
					const membership = command as MembershipCommand
					if (!(await w.hrService.configurationItem('teams', membership.teamId ?? '')))
						invalidField('teamId', 'unknown')
					await requireAgent(w, membership.accountId ?? '').catch(
						/** Name the membership field. */ () => invalidField('accountId', 'not-agent'),
					)
					id = await w.hrService.createMembership(membership)
				} else if (command.kind === 'request-types') {
					await this.requireTypeReferences(w, command as RequestTypeCommand)
					id = await w.hrService.createRequestType(command as RequestTypeCommand)
				} else id = await this.createPolicy(w, command as ServiceLevelCommand)
				await auditHr(
					w,
					'employee.hr-service-configured',
					id,
					requestId,
					command.reason,
					null,
					configKind,
					['configuration'],
				)
				return (await w.hrService.configurationItem(configKind, id)) as HrServiceConfigDto
			},
		)
	}

	/** Update a configuration item; a service level draft may be edited or published. */
	updateConfiguration(
		context: AuthenticatedHcmContext,
		kind: string,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<HrServiceConfigDto> {
		const configKind = this.kind(kind)
		idValue(id, 'id')
		const command = parseConfiguration(configKind, body, true)
		return this.command(
			context,
			CONFIGURE,
			`config.${configKind}.update`,
			{ id, command },
			key,
			/** Update. */ async (w) => {
				const current = await w.hrService.configurationItem(configKind, id, true)
				if (!current) throw new HcmDomainError('not-found')
				if (current.revision !== (command as { expectedRevision?: number }).expectedRevision)
					throw new HcmDomainError('revision-conflict')
				if (command.kind === 'teams') await w.hrService.updateTeam(id, command as TeamCommand)
				else if (command.kind === 'memberships')
					await w.hrService.updateMembership(id, command as MembershipCommand)
				else if (command.kind === 'request-types') {
					await this.requireTypeReferences(w, command as RequestTypeCommand)
					await w.hrService.updateRequestType(id, command as RequestTypeCommand)
				} else
					await this.updatePolicy(
						w,
						id,
						current as { status: string; code: string },
						command as ServiceLevelCommand,
					)
				await auditHr(
					w,
					'employee.hr-service-configured',
					id,
					requestId,
					command.reason,
					null,
					configKind,
					['configuration'],
				)
				return (await w.hrService.configurationItem(configKind, id)) as HrServiceConfigDto
			},
		)
	}

	/** A known configuration kind. */
	private kind(kind: string): HrConfigKind {
		if (!(HR_CONFIG_KINDS as readonly string[]).includes(kind))
			throw new HcmDomainError('not-found')
		return kind as HrConfigKind
	}

	/** A request type names an active team and a published policy code. */
	private async requireTypeReferences(w: EmployeeWork, command: RequestTypeCommand): Promise<void> {
		const team = await w.hrService.configurationItem('teams', command.defaultTeamId)
		if (!team || !(team as { isActive: boolean }).isActive) invalidField('defaultTeamId', 'unknown')
		if (!(await w.hrService.publishedPolicy(command.serviceLevelCode)))
			invalidField('serviceLevelCode', 'not-published')
	}

	/** Create the next draft version of a policy code. */
	private async createPolicy(w: EmployeeWork, command: ServiceLevelCommand): Promise<string> {
		const code = command.code ?? ''
		const versions = await w.hrService.policyVersions(code)
		if (versions.draft) invalidField('code', 'draft-exists')
		return w.hrService.createPolicy({
			code,
			versionNumber: versions.next,
			name: command.name ?? code,
			targets: command.targets as NonNullable<ServiceLevelCommand['targets']>,
			pauseWhileWaiting: command.pauseWhileWaiting ?? true,
			reopenWindowDays: command.reopenWindowDays ?? 7,
		})
	}

	/** Edit or publish a draft; published versions are immutable and apply to new requests only. */
	private async updatePolicy(
		w: EmployeeWork,
		id: string,
		current: { status: string; code: string },
		command: ServiceLevelCommand,
	): Promise<void> {
		if (current.status !== 'Draft') throw new HcmDomainError('version-published')
		await w.hrService.updatePolicy(id, {
			name: command.name,
			targets: command.targets,
			pauseWhileWaiting: command.pauseWhileWaiting,
			reopenWindowDays: command.reopenWindowDays,
		})
		if (command.status === 'Published') await w.hrService.publishPolicy(id, current.code)
	}

	/** Run one idempotent command in a business transaction. */
	private command<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		operation: string,
		payload: unknown,
		key: string,
		work: (w: EmployeeWork) => Promise<T>,
	): Promise<T> {
		const hash = commandHash(operation, payload)
		return this.unit.execute(
			context,
			permission,
			true,
			/** Keep receipts in the business transaction. */ (w) =>
				runIdempotent(
					w.receipts,
					`hr-service.${operation}`,
					key,
					hash,
					/** Run once. */ () => work(w),
				),
		)
	}

	/** A queue row for display. */
	private summary(row: HrQueueRow): HrServiceRequestSummaryDto {
		return {
			id: row.id,
			requestNumber: row.requestNumber,
			subject: row.subject,
			type: row.type,
			requester: row.requester,
			priority: row.priority,
			status: row.status,
			team: row.team,
			assignee: row.assignee,
			nextDueAt: row.nextDueAt,
			slaState: row.slaState,
			updatedAt: row.updatedAt,
		}
	}

	/** One request for the desk. */
	private async detail(w: EmployeeWork, id: string): Promise<HrServiceRequestDto> {
		const request: HrRequestRow | undefined = await w.hrService.request(id)
		if (!request) throw new HcmDomainError('not-found')
		const [now, targets, assignments, attachments] = await Promise.all([
			w.hrService.now(),
			w.hrService.targets(id),
			w.hrService.assignments(id),
			w.hrService.attachments(id, false),
		])
		const sla = requestSla(request.status, targets, now)
		const open = request.status !== 'Closed' && request.status !== 'Cancelled'
		return {
			...this.summary({ ...request, ...sla }),
			classification: request.classification,
			createdAt: request.createdAt,
			createdBy: request.createdBy,
			resolutionCode: request.resolutionCode,
			resolutionSummary: request.resolutionSummary,
			resolvedAt: request.resolvedAt,
			closedAt: request.closedAt,
			cancelReason: request.cancelReason,
			reopenUntil:
				request.status === 'Resolved'
					? reopenUntil(request.resolvedAt, request.policy.reopenWindowDays)
					: null,
			policy: { code: request.policy.code, versionNumber: request.policy.versionNumber },
			targets: targets.map(
				/** Target with state. */ (target) => ({ ...target, state: targetState(target, now) }),
			),
			assignments,
			attachments: attachments.map(
				/** Without the blob. */ ({ blobId, ...item }) => (void blobId, item),
			),
			actions: {
				reply: open,
				note: open,
				assign: open,
				transitions: hrTransitions(request.status),
			},
			revision: request.revision,
		}
	}
}
