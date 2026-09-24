import {
	Controller,
	Get,
	Post,
	Param,
	Req,
	Res,
	Inject,
	Logger,
	HttpCode,
	StreamableFile,
} from '@nestjs/common'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { TemplateFiles } from '@empflowyee/hcm-api-documents-application'
import {
	parseDocumentTypeQuery,
	parseTemplateQuery,
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
export class TemplateController {
	private readonly logger = new Logger(TemplateController.name)
	/** Compose current request context, durable document service and the configured browser write origin. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(TemplateFiles) private readonly templates: TemplateFiles,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}
	/** Query server-owned template filtering and pagination. */
	@Get('templates')
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Parse only approved list controls. */ (context) =>
				this.templates.list(
					context,
					parseTemplateQuery(new URL(request.originalUrl, 'http://local.invalid').searchParams),
				),
		)
	}
	/** Resolve exact deep links without scanning or loading an unbounded list. */
	@Get('templates/:id')
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
			/** Project the same approved template DTO. */ (context) => this.templates.get(context, id),
		)
	}
	/** List one selected object's immutable Ready versions. */
	@Get('templates/:id/versions')
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
				this.templates.versions(
					context,
					id,
					parseVersionQuery(new URL(request.originalUrl, 'http://local.invalid').searchParams),
				),
		)
	}
	/** Supply enabled type choices under template-management authority. */
	@Get('template-type-options')
	types(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Keep picker filtering server-owned and bounded. */ (context) =>
				this.templates.types(
					context,
					parseDocumentTypeQuery(new URL(request.originalUrl, 'http://local.invalid').searchParams),
				),
		)
	}
	/** Create an HR-only reference aggregate with its first committed immutable version. */
	@Post('templates')
	create(
		@Req() request: RoleRequest & IncomingMessage,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.upload(null, request, response)
	}
	/** Append exactly one immutable version at the supplied aggregate revision. */
	@Post('templates/:id/versions')
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
						this.templates.prepare(context, id, metadata, key),
					/** Store bytes and publish only a committed result. */ (
						intent,
						bytes,
						filename,
						mediaType,
					) =>
						this.templates.upload(
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
	@Get('templates/:id/versions/:versionId/download')
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
				const download = await this.templates.download(
					context,
					id,
					versionId,
					this.context.requestId,
				)
				let observed = false
				/** Close the descriptor and record at most one observable stream outcome. */
				const finish = async (ok: boolean) => {
					if (observed) return
					observed = true
					try {
						await download.close()
						await download.complete(ok)
					} catch {
						this.logger.warn('Document stream outcome could not be recorded')
					}
				}
				response.once(
					'finish',
					/** Server completion does not assert client receipt. */ () => {
						void finish(true)
					},
				)
				response.once(
					'close',
					/** Early client disconnect records failure when observable. */ () => {
						void finish(response.writableFinished)
					},
				)
				response.setHeader('X-Content-Type-Options', 'nosniff')
				response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
				const fallback = download.file.filename.replace(/[^a-zA-Z0-9._ -]/g, '_')
				return new StreamableFile(Readable.from(download.bytes), {
					type: download.file.mediaType,
					length: download.file.byteLength,
					disposition: `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(download.file.filename).replace(/'/g, '%27')}`,
				})
			},
		)
	}
}
