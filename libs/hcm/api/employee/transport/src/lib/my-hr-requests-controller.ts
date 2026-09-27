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
	Req,
	Res,
} from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { MyHrRequests } from '@empflowyee/hcm-api-employee-application'
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

/** My HR Requests: the caller's own HR service requests and their employee-visible conversation. */
@Controller('v1/employee/me')
export class MyHrRequestsController {
	private readonly logger = new Logger(MyHrRequestsController.name)
	/** Compose verified tenant context with the self-service use cases. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(MyHrRequests) private readonly requests: MyHrRequests,
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

	/** Page the caller's own requests. */
	@Get('hr-requests')
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** Page. */ (context) => this.requests.list(context, query(request)),
		)
	}

	/** Request types the caller may raise. */
	@Get('hr-request-types')
	types(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** List types. */ (context) => {
				queryParameters(request, [])
				return this.requests.types(context)
			},
		)
	}

	/** Raise a request: metadata first, then an optional file. */
	@Post('hr-requests')
	create(
		@Req() request: RoleRequest & IncomingMessage,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Parse the bounded upload, then create. */ async (context, key, requestId) => {
				const upload = await multipart(request, HR_ATTACHMENT_MAX_BYTES, true)
				return this.requests.create(context, upload.metadata, upload.file, key, requestId)
			},
			'multipart',
		)
	}

	/** Read one own request. */
	@Get('hr-requests/:id')
	request(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.read(
			response,
			/** Read. */ (context) => {
				queryParameters(request, [])
				return this.requests.read(context, id)
			},
		)
	}

	/** Page the employee-visible conversation. */
	@Get('hr-requests/:id/messages')
	messages(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.read(
			response,
			/** Page messages. */ (context) => this.requests.messages(context, id, query(request)),
		)
	}

	/** Reply to HR: metadata first, then an optional file. */
	@Post('hr-requests/:id/messages')
	@HttpCode(200)
	message(
		@Param('id') id: string,
		@Req() request: RoleRequest & IncomingMessage,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Parse the bounded upload, then reply. */ async (context, key, requestId) => {
				const upload = await multipart(request, HR_ATTACHMENT_MAX_BYTES, true)
				return this.requests.message(context, id, upload.metadata, upload.file, key, requestId)
			},
			'multipart',
		)
	}

	/** Cancel an own request. */
	@Post('hr-requests/:id/cancel')
	@HttpCode(200)
	cancel(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Cancel. */ (context, key, requestId) =>
				this.requests.cancel(context, id, body, key, requestId),
		)
	}

	/** Reopen an own resolved request. */
	@Post('hr-requests/:id/reopen')
	@HttpCode(200)
	reopen(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Reopen. */ (context, key, requestId) =>
				this.requests.reopen(context, id, body, key, requestId),
		)
	}

	/** Download an employee-visible attachment of an own request. */
	@Get('hr-requests/:id/attachments/:attachmentId/download')
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
				const opened = await this.requests.download(
					context,
					id,
					attachmentId,
					this.context.requestId,
				)
				return hrAttachment(opened, response, this.logger)
			},
		)
	}
}
