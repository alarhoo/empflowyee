import {
	Controller,
	Get,
	Post,
	Put,
	Body,
	Param,
	Req,
	Res,
	Inject,
	Logger,
	HttpCode,
} from '@nestjs/common'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { documentAttachment } from './document-attachment'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { WorkerFiles } from '@empflowyee/hcm-api-documents-application'
import {
	parseDocumentTypeQuery,
	parseWorkerDocumentQuery,
	parseWorkerQuery,
	parseVersionQuery,
} from '@empflowyee/hcm-documents-contract'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	queryParameters,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { runDocumentRequest } from './document-request'
import { documentMultipart } from './document-multipart'
@Controller('v1/documents')
export class WorkerDocumentController {
	private readonly logger = new Logger(WorkerDocumentController.name)
	/** Compose current request context, durable document service and the configured browser write origin. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(WorkerFiles) private readonly documents: WorkerFiles,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}
	/** Query server-owned worker document filtering and pagination. */
	@Get('worker-documents')
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Parse only approved list controls. */ (context) =>
				this.documents.list(
					context,
					parseWorkerDocumentQuery(
						new URL(request.originalUrl, 'http://local.invalid').searchParams,
					),
				),
		)
	}
	/** Resolve exact deep links without scanning or loading an unbounded list. */
	@Get('worker-documents/:id')
	get(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		queryParameters(request, [])
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Project the same approved worker document DTO. */ (context) =>
				this.documents.get(context, id),
		)
	}
	/** List one selected object's immutable Ready versions. */
	@Get('worker-documents/:id/versions')
	versions(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Restrict continuation and sort to the version collection. */ (context) =>
				this.documents.versions(
					context,
					id,
					parseVersionQuery(new URL(request.originalUrl, 'http://local.invalid').searchParams),
				),
		)
	}
	/** Supply enabled type choices under worker document-management authority. */
	@Get('worker-document-type-options')
	types(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Keep picker filtering server-owned and bounded. */ (context) =>
				this.documents.types(
					context,
					parseDocumentTypeQuery(new URL(request.originalUrl, 'http://local.invalid').searchParams),
				),
		)
	}
	/** Offer real workers including identities without accounts. */
	@Get('workers')
	workers(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Use bounded tenant-only worker search. */ (context) =>
				this.documents.workers(
					context,
					parseWorkerQuery(new URL(request.originalUrl, 'http://local.invalid').searchParams),
				),
		)
	}
	/** Change sharing for exactly one immutable version under its own revision. */
	@Put('worker-documents/:id/versions/:versionId/visibility')
	share(
		@Param('id') id: string,
		@Param('versionId') versionId: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Preserve the existing write-origin and idempotency contract. */ (context) =>
				this.documents.share(
					context,
					id,
					versionId,
					body,
					accessWriteKey(request, this.origin, this.context.requestId),
					this.context.requestId,
				),
		)
	}
	/** Create an worker-linked aggregate with its first committed immutable version. */
	@Post('worker-documents')
	create(
		@Req() request: RoleRequest & IncomingMessage,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.upload(null, request, response)
	}
	/** Append exactly one immutable version at the supplied aggregate revision. */
	@Post('worker-documents/:id/versions')
	@HttpCode(200)
	append(
		@Param('id') id: string,
		@Req() request: RoleRequest & IncomingMessage,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.upload(id, request, response)
	}
	/** Verify origin and current authority before streaming bounded multipart input. */
	private upload(
		id: string | null,
		request: RoleRequest & IncomingMessage,
		response: RoleResponse,
	) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Keep parser mechanics out of domain/application logic. */ (context) => {
				const key = accessWriteKey(request, this.origin, this.context.requestId, 'multipart')
				return documentMultipart(
					request,
					/** Validate target metadata before file storage. */ (metadata) =>
						this.documents.prepare(context, id, metadata, key),
					/** Store bytes and publish only a committed result. */ (
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
	/** Stream a private attachment only after current authorization and access-audit commit. */
	@Get('worker-documents/:id/versions/:versionId/download')
	download(
		@Param('id') id: string,
		@Param('versionId') versionId: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: ServerResponse,
	) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Open one exact authorized attachment with no public storage URL. */ async (context) => {
				queryParameters(request, [])
				const download = await this.documents.download(
					context,
					id,
					versionId,
					this.context.requestId,
				)
				return documentAttachment(download, response, this.logger)
			},
		)
	}
}
