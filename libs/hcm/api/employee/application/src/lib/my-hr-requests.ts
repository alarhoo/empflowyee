import {
	parseCreateSelfRequest,
	parseMessageQuery,
	parseSelfMessage,
	parseSelfQuery,
	parseSelfTransition,
	type HrServiceMessageSelfPage,
	type HrServiceRequestSelfDto,
	type HrServiceRequestSelfPage,
	type RequestTypeOptionDto,
} from '@empflowyee/hcm-employee-contract'
import { HcmDomainError, idValue, invalidField } from '@empflowyee/hcm-runtime-contract'
import {
	commandHash,
	runIdempotent,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import type { OpenedAttachment } from '@empflowyee/hcm-api-documents-application'
import {
	acceptsMessages,
	canCancel,
	canReopen,
	reopenUntil,
} from '@empflowyee/hcm-api-employee-domain'
import type { EmployeeUnitOfWork, EmployeeWork } from './employee-unit'
import type { HrRequestRow } from './hr-service-repository'
import {
	attach,
	auditHr,
	createHrRequest,
	lockHrRequest,
	transitionHr,
	type HrUpload,
} from './hr-service-lifecycle'

const READ = 'hr-requests.self.read'
const MANAGE = 'hr-requests.self.manage'

/**
 * My HR Requests use cases (My HR Requests TDD#API, DEC-HCM2-004): a worker raises requests of
 * employee types, converses with HR, cancels and reopens within the window. Only the requester's
 * own requests are in scope, and no internal content, agent identity or service level field is read.
 */
export class MyHrRequests {
	/** Compose the self-service use cases on the employee unit of work. */
	constructor(private readonly unit: EmployeeUnitOfWork) {}

	/** A page of the caller's own requests, newest first. */
	list(
		context: AuthenticatedHcmContext,
		params: URLSearchParams,
	): Promise<HrServiceRequestSelfPage> {
		const query = parseSelfQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Page own requests. */ async (w) => {
				const worker = await this.worker(w)
				if (!worker) return { items: [], nextCursor: null }
				const page = await w.hrService.selfRequests(worker, query)
				return {
					items: page.items.map(/** Summary. */ (row) => this.summary(row)),
					nextCursor: page.nextCursor,
				}
			},
		)
	}

	/** One own request. */
	read(context: AuthenticatedHcmContext, id: string): Promise<HrServiceRequestSelfDto> {
		idValue(id, 'id')
		return this.unit.execute(
			context,
			READ,
			false,
			/** Read. */ async (w) => this.detail(w, await this.own(w, id)),
		)
	}

	/** A page of the employee-visible conversation, oldest first. */
	messages(
		context: AuthenticatedHcmContext,
		id: string,
		params: URLSearchParams,
	): Promise<HrServiceMessageSelfPage> {
		idValue(id, 'id')
		const query = parseMessageQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Page messages. */ async (w) => {
				await this.own(w, id)
				const [page, attachments] = await Promise.all([
					w.hrService.messages(id, query, true),
					w.hrService.attachments(id, true),
				])
				return {
					items: page.items.map(
						/** Message with its attachments, attributed to You or HR. */ (row) => ({
							id: row.id,
							kind: row.kind,
							fromMe: row.fromRequester,
							author: row.fromRequester ? 'You' : 'HR',
							body: row.body,
							createdAt: row.createdAt,
							attachments: attachments
								.filter(/** Of this message. */ (item) => item.messageId === row.id)
								.map(
									/** Safe fields. */ (item) => ({
										id: item.id,
										fileName: item.fileName,
										mediaType: item.mediaType,
										sizeBytes: item.sizeBytes,
									}),
								),
						}),
					),
					nextCursor: page.nextCursor,
				}
			},
		)
	}

	/** Request types employees may raise. */
	types(context: AuthenticatedHcmContext): Promise<{ items: RequestTypeOptionDto[] }> {
		return this.unit.execute(
			context,
			MANAGE,
			false,
			/** List types. */ async (w) => ({
				items: (await w.hrService.types('Employee')).map(
					/** Option. */ (type) => ({
						id: type.id,
						code: type.code,
						name: type.name,
						category: type.category,
						description: type.description,
					}),
				),
			}),
		)
	}

	/** Raise a request with its description as the first message and an optional attachment. */
	create(
		context: AuthenticatedHcmContext,
		metadata: unknown,
		upload: HrUpload | null,
		key: string,
		requestId: string,
	): Promise<HrServiceRequestSelfDto> {
		const command = parseCreateSelfRequest(metadata)
		const file = upload ? { name: upload.fileName, size: upload.bytes.length } : null
		return this.command(
			context,
			'create',
			{ command, file },
			key,
			/** Create. */ async (w) => {
				const worker = await this.worker(w)
				if (!worker) throw new HcmDomainError('forbidden')
				const type = await w.hrService.type(command.typeId)
				if (!type?.isActive || type.audience !== 'Employee') invalidField('typeId', 'unknown')
				const id = await createHrRequest(
					w,
					{
						type,
						requesterWorkerId: worker,
						requesterAccountId: w.accountId,
						priority: type.defaultPriority,
						subject: command.subject,
						description: command.description,
						fromRequester: true,
						upload,
					},
					requestId,
				)
				return this.detail(w, await this.own(w, id))
			},
		)
	}

	/** Reply to HR; a reply while HR waits on the employee hands the request back to HR. */
	message(
		context: AuthenticatedHcmContext,
		id: string,
		metadata: unknown,
		upload: HrUpload | null,
		key: string,
		requestId: string,
	): Promise<HrServiceRequestSelfDto> {
		idValue(id, 'id')
		const command = parseSelfMessage(metadata)
		const file = upload ? { name: upload.fileName, size: upload.bytes.length } : null
		return this.command(
			context,
			'message',
			{ id, command, file },
			key,
			/** Reply. */ async (w) => {
				const { request, now } = await this.lock(w, id, command.expectedRevision)
				if (!acceptsMessages(request.status)) throw new HcmDomainError('invalid-state')
				const messageId = await w.hrService.insertMessage(id, {
					visibility: 'EmployeeVisible',
					kind: 'Message',
					body: command.body,
					fromRequester: true,
				})
				if (upload) await attach(w, id, messageId, 'EmployeeVisible', upload)
				if (request.status === 'WaitingForEmployee')
					await transitionHr(w, request, 'WaitingForHr', now, { note: null })
				else await w.hrService.updateRequest(id, {})
				await auditHr(w, 'employee.hr-request-replied', id, requestId, null, request.status, null, [
					'message',
				])
				return this.detail(w, await this.own(w, id))
			},
		)
	}

	/** Cancel a New or Open request with a reason. */
	cancel(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<HrServiceRequestSelfDto> {
		idValue(id, 'id')
		const command = parseSelfTransition(body)
		return this.command(
			context,
			'cancel',
			{ id, command },
			key,
			/** Cancel. */ async (w) => {
				const { request, now } = await this.lock(w, id, command.expectedRevision)
				if (!canCancel(request.status)) throw new HcmDomainError('invalid-state')
				await transitionHr(w, request, 'Cancelled', now, { cancelReason: command.reason })
				await auditHr(
					w,
					'employee.hr-request-cancelled',
					id,
					requestId,
					command.reason,
					request.status,
					'Cancelled',
					['status'],
				)
				return this.detail(w, await this.own(w, id))
			},
		)
	}

	/** Reopen a Resolved request within the policy's window (DEC-HCM2-004). */
	reopen(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<HrServiceRequestSelfDto> {
		idValue(id, 'id')
		const command = parseSelfTransition(body)
		return this.command(
			context,
			'reopen',
			{ id, command },
			key,
			/** Reopen. */ async (w) => {
				const { request, now } = await this.lock(w, id, command.expectedRevision)
				if (!canReopen(request.status, request.resolvedAt, request.policy.reopenWindowDays, now))
					throw new HcmDomainError('invalid-state')
				await transitionHr(w, request, 'Open', now, { note: command.reason })
				await auditHr(
					w,
					'employee.hr-request-reopened',
					id,
					requestId,
					command.reason,
					'Resolved',
					'Open',
					['status'],
				)
				return this.detail(w, await this.own(w, id))
			},
		)
	}

	/** Open an employee-visible attachment of an own request and audit the download. */
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
			READ,
			true,
			/** Open. */ async (w) => {
				await this.own(w, id)
				const attachment = (await w.hrService.attachments(id, true)).find(
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

	/** The caller's worker, if the account has one. */
	private worker(w: EmployeeWork): Promise<string | null | undefined> {
		return w.reads.accountWorker(w.accountId)
	}

	/** One of the caller's own requests; anything else is not found. */
	private async own(w: EmployeeWork, id: string): Promise<HrRequestRow> {
		const worker = await this.worker(w)
		const request = worker
			? await w.hrService.request(id, { requesterWorkerId: worker })
			: undefined
		if (!request) throw new HcmDomainError('not-found')
		return request
	}

	/** Lock one of the caller's own requests at the expected revision. */
	private async lock(w: EmployeeWork, id: string, expected: number) {
		const worker = await this.worker(w)
		if (!worker) throw new HcmDomainError('not-found')
		return lockHrRequest(w, id, expected, worker)
	}

	/** Run one idempotent command in a business transaction. */
	private command<T>(
		context: AuthenticatedHcmContext,
		operation: string,
		payload: unknown,
		key: string,
		work: (w: EmployeeWork) => Promise<T>,
	): Promise<T> {
		const hash = commandHash(operation, payload)
		return this.unit.execute(
			context,
			MANAGE,
			true,
			/** Keep receipts in the business transaction. */ (w) =>
				runIdempotent(
					w.receipts,
					`hr-requests.self.${operation}`,
					key,
					hash,
					/** Run once. */ () => work(w),
				),
		)
	}

	/** A request row for the requester's list. */
	private summary(row: HrRequestRow) {
		return {
			id: row.id,
			requestNumber: row.requestNumber,
			subject: row.subject,
			typeName: row.type.name,
			status: row.status,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		}
	}

	/** One request for the requester, with the actions allowed now. */
	private async detail(w: EmployeeWork, request: HrRequestRow): Promise<HrServiceRequestSelfDto> {
		const now = await w.hrService.now()
		const window = request.policy.reopenWindowDays
		return {
			...this.summary(request),
			type: request.type,
			resolutionCode: request.resolutionCode,
			resolutionSummary: request.resolutionSummary,
			resolvedAt: request.resolvedAt,
			cancelReason: request.cancelReason,
			reopenUntil: request.status === 'Resolved' ? reopenUntil(request.resolvedAt, window) : null,
			actions: {
				reply: acceptsMessages(request.status),
				cancel: canCancel(request.status),
				reopen: canReopen(request.status, request.resolvedAt, window, now),
			},
			revision: request.revision,
		}
	}
}
