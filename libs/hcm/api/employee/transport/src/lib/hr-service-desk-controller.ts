import type { IncomingMessage, ServerResponse } from 'node:http'
import {
	Body,
	Controller,
	Get,
	HttpCode,
	Inject,
	Logger,
	Param,
	Post,
	Put,
	Req,
	Res,
} from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { HrServiceDesk } from '@empflowyee/hcm-api-employee-application'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	queryParameters,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { HR_ATTACHMENT_MAX_BYTES, hrAttachment } from './hr-attachment'
import { multipart } from './import-multipart'
import { query } from './request'

/** HR Service Desk: the agent queue, conversations, routing, lifecycle and configuration. */
@Controller('v1/employee/hr-service')
export class HrServiceDeskController {
	private readonly logger = new Logger(HrServiceDeskController.name)
	/** Compose verified tenant context with the desk use cases. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(HrServiceDesk) private readonly desk: HrServiceDesk,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}

	/** Run a read with the shared failure classification. */
	private read<T>(response: RoleResponse, work: (context: AuthenticatedHcmContext) => Promise<T>) {
		return runAccessRequest(this.context, this.logger, response, work)
	}

	/** Run a write after origin, media and idempotency-key validation. */
	private write<T>(
		request: RoleRequest,
		response: RoleResponse,
		work: (context: AuthenticatedHcmContext, key: string, requestId: string) => Promise<T>,
		media: 'json' | 'multipart' = 'json',
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Validate browser write headers before the owning command. */ (context) =>
				work(
					context,
					accessWriteKey(request, this.origin, this.context.requestId, media),
					this.context.requestId,
				),
		)
	}

	/** Page the queue of a view. */
	@Get('requests')
	queue(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** Page the queue. */ (context) => this.desk.queue(context, query(request)),
		)
	}

	/** Raise a request on behalf of a worker. */
	@Post('requests')
	create(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Create. */ (context, key, requestId) => this.desk.create(context, body, key, requestId),
		)
	}

	/** Page one option kind. */
	@Get('options/:kind')
	options(
		@Param('kind') kind: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.read(
			response,
			/** Page options. */ (context) => this.desk.options(context, kind, query(request)),
		)
	}

	/** Read one request. */
	@Get('requests/:id')
	request(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.read(
			response,
			/** Read. */ (context) => {
				queryParameters(request, [])
				return this.desk.read(context, id)
			},
		)
	}

	/** Page the conversation of a request. */
	@Get('requests/:id/messages')
	messages(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.read(
			response,
			/** Page messages. */ (context) => this.desk.messages(context, id, query(request)),
		)
	}

	/** Reply or add an internal note: metadata first, then an optional file. */
	@Post('requests/:id/messages')
	@HttpCode(200)
	message(
		@Param('id') id: string,
		@Req() request: RoleRequest & IncomingMessage,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Parse the bounded upload, then record the message. */ async (context, key, requestId) => {
				const upload = await multipart(request, HR_ATTACHMENT_MAX_BYTES, true)
				return this.desk.message(context, id, upload.metadata, upload.file, key, requestId)
			},
			'multipart',
		)
	}

	/** Route to a team and optionally an agent. */
	@Post('requests/:id/assignment')
	@HttpCode(200)
	assign(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Assign. */ (context, key, requestId) =>
				this.desk.assign(context, id, body, key, requestId),
		)
	}

	/** Move the request to another status. */
	@Post('requests/:id/status')
	@HttpCode(200)
	status(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Move. */ (context, key, requestId) => this.desk.status(context, id, body, key, requestId),
		)
	}

	/** Download an attachment of a request. */
	@Get('requests/:id/attachments/:attachmentId')
	attachment(
		@Param('id') id: string,
		@Param('attachmentId') attachmentId: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse & ServerResponse,
	) {
		return this.read(
			response,
			/** Open, audit and stream. */ async (context) => {
				queryParameters(request, [])
				const opened = await this.desk.download(context, id, attachmentId, this.context.requestId)
				return hrAttachment(opened, response, this.logger)
			},
		)
	}

	/** Page one configuration kind. */
	@Get('configuration/:kind')
	configuration(
		@Param('kind') kind: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.read(
			response,
			/** Page configuration. */ (context) =>
				this.desk.configuration(context, kind, query(request)),
		)
	}

	/** Create a configuration item. */
	@Post('configuration/:kind')
	createConfiguration(
		@Param('kind') kind: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Create. */ (context, key, requestId) =>
				this.desk.createConfiguration(context, kind, body, key, requestId),
		)
	}

	/** Update a configuration item. */
	@Put('configuration/:kind/:id')
	updateConfiguration(
		@Param('kind') kind: string,
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Update. */ (context, key, requestId) =>
				this.desk.updateConfiguration(context, kind, id, body, key, requestId),
		)
	}
}
