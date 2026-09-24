import {
	Controller,
	Get,
	Post,
	Body,
	Param,
	Req,
	Res,
	Inject,
	Logger,
	HttpCode,
} from '@nestjs/common'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { DocumentRequests } from '@empflowyee/hcm-api-documents-application'
import {
	parseDocumentRequestQuery,
	parseVersionQuery,
	parseWorkerQuery,
	parseDocumentTypeQuery,
} from '@empflowyee/hcm-documents-contract'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	queryParameters,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { documentMultipart } from './document-multipart'
import { documentAttachment } from './document-attachment'
import { runDocumentRequest } from './document-request'
@Controller('v1/documents')
export class DocumentRequestController {
	private readonly logger = new Logger(DocumentRequestController.name)
	/** Compose verified tenant context with request lifecycle services and the write origin. */ constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(DocumentRequests) private readonly documents: DocumentRequests,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}
	/** Query the explicit hr collection with server-owned filters. */ @Get('requests')
	hrList(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Parse only the endpoint's approved controls. */ (context) =>
				this.documents.list(
					context,
					'hr',
					parseDocumentRequestQuery(
						new URL(request.originalUrl, 'http://local.invalid').searchParams,
						'hr',
					),
				),
		)
	}
	/** Resolve an exact hr deep link through current subject authorization. */ @Get('requests/:id')
	hrGet(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		queryParameters(request, [])
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Do not disclose unrelated targets. */ (context) => this.documents.get(context, 'hr', id),
		)
	}
	/** Read retained hr submissions under their authorized parent. */ @Get(
		'requests/:id/submissions',
	)
	hrVersions(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Bound child pagination to the selected request. */ (context) =>
				this.documents.versions(
					context,
					'hr',
					id,
					parseVersionQuery(new URL(request.originalUrl, 'http://local.invalid').searchParams),
				),
		)
	}
	/** Stream one verified hr attachment after the access audit commits. */ @Get(
		'requests/:id/submissions/:versionId/download',
	)
	hrDownload(
		@Param('id') id: string,
		@Param('versionId') versionId: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: ServerResponse,
	) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Reauthorize immediately before reading bytes. */ async (context) => {
				queryParameters(request, [])
				return documentAttachment(
					await this.documents.attachment(context, 'hr', id, versionId, this.context.requestId),
					response,
					this.logger,
				)
			},
		)
	}
	/** Query the explicit own collection with server-owned filters. */ @Get('me/requests')
	ownList(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Parse only the endpoint's approved controls. */ (context) =>
				this.documents.list(
					context,
					'own',
					parseDocumentRequestQuery(
						new URL(request.originalUrl, 'http://local.invalid').searchParams,
						'own',
					),
				),
		)
	}
	/** Resolve an exact own deep link through current subject authorization. */ @Get(
		'me/requests/:id',
	)
	ownGet(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		queryParameters(request, [])
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Do not disclose unrelated targets. */ (context) => this.documents.get(context, 'own', id),
		)
	}
	/** Read retained own submissions under their authorized parent. */ @Get(
		'me/requests/:id/submissions',
	)
	ownVersions(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Bound child pagination to the selected request. */ (context) =>
				this.documents.versions(
					context,
					'own',
					id,
					parseVersionQuery(new URL(request.originalUrl, 'http://local.invalid').searchParams),
				),
		)
	}
	/** Stream one verified own attachment after the access audit commits. */ @Get(
		'me/requests/:id/submissions/:versionId/download',
	)
	ownDownload(
		@Param('id') id: string,
		@Param('versionId') versionId: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: ServerResponse,
	) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Reauthorize immediately before reading bytes. */ async (context) => {
				queryParameters(request, [])
				return documentAttachment(
					await this.documents.attachment(context, 'own', id, versionId, this.context.requestId),
					response,
					this.logger,
				)
			},
		)
	}
	/** Supply the bounded workers picker under request-management authority. */ @Get(
		'request-worker-options',
	)
	workers(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Preserve query validation and real persistence. */ (context) =>
				this.documents.workers(
					context,
					parseWorkerQuery(new URL(request.originalUrl, 'http://local.invalid').searchParams),
				),
		)
	}
	/** Supply the bounded types picker under request-management authority. */ @Get(
		'request-type-options',
	)
	types(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Preserve query validation and real persistence. */ (context) =>
				this.documents.types(
					context,
					parseDocumentTypeQuery(new URL(request.originalUrl, 'http://local.invalid').searchParams),
				),
		)
	}
	/** Create an Open request and its transactional notification. */ @Post('requests') create(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Apply the standard write and retry contract. */ (context) =>
				this.documents.create(
					context,
					body,
					accessWriteKey(request, this.origin, this.context.requestId),
					this.context.requestId,
				),
		)
	}
	/** Apply the approved accept transition at the expected revision. */ @Post('requests/:id/accept')
	@HttpCode(200)
	accept(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Keep retries actor-bound and revisioned. */ (context) =>
				this.documents.transition(
					context,
					id,
					'accept',
					body,
					accessWriteKey(request, this.origin, this.context.requestId),
					this.context.requestId,
				),
		)
	}
	/** Apply the approved replacement transition at the expected revision. */ @Post(
		'requests/:id/replacement',
	)
	@HttpCode(200)
	replacement(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Keep retries actor-bound and revisioned. */ (context) =>
				this.documents.transition(
					context,
					id,
					'replacement',
					body,
					accessWriteKey(request, this.origin, this.context.requestId),
					this.context.requestId,
				),
		)
	}
	/** Apply the approved cancel transition at the expected revision. */ @Post('requests/:id/cancel')
	@HttpCode(200)
	cancel(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Keep retries actor-bound and revisioned. */ (context) =>
				this.documents.transition(
					context,
					id,
					'cancel',
					body,
					accessWriteKey(request, this.origin, this.context.requestId),
					this.context.requestId,
				),
		)
	}
	/** Accept one bounded file only from the addressed employee while Open. */ @Post(
		'me/requests/:id/submit',
	)
	@HttpCode(200)
	submit(
		@Param('id') id: string,
		@Req() request: RoleRequest & IncomingMessage,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Validate metadata before storage receives any bytes. */ (context) => {
				const key = accessWriteKey(request, this.origin, this.context.requestId, 'multipart')
				return documentMultipart(
					request,
					/** Bind the immutable submission intent. */ (metadata) =>
						this.documents.prepare(context, id, metadata, key),
					/** Publish verified bytes and lifecycle evidence together. */ (
						intent,
						bytes,
						filename,
						mediaType,
					) =>
						this.documents.upload(
							context,
							intent,
							key,
							this.context.requestId,
							bytes,
							filename,
							mediaType,
						),
				)
			},
		)
	}
}
