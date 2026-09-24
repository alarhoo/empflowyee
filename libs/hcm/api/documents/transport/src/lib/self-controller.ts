import { Controller, Get, Post, Param, Req, Res, Inject, Logger, HttpCode } from '@nestjs/common'
import type { ServerResponse } from 'node:http'
import { documentAttachment } from './document-attachment'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { SelfDocuments } from '@empflowyee/hcm-api-documents-application'
import { parseTemplateQuery, parseVersionQuery } from '@empflowyee/hcm-documents-contract'
import {
	queryParameters,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { runDocumentRequest } from './document-request'
@Controller('v1/documents')
export class SelfDocumentController {
	private readonly logger = new Logger(SelfDocumentController.name)
	/** Compose current request context, durable document service and the configured browser write origin. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(SelfDocuments) private readonly documents: SelfDocuments,
	) {}
	/** Query server-owned self-document filtering and pagination. */
	@Get('me/documents')
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Parse only approved list controls. */ (context) =>
				this.documents.list(
					context,
					parseTemplateQuery(new URL(request.originalUrl, 'http://local.invalid').searchParams),
				),
		)
	}
	/** Resolve exact deep links without scanning or loading an unbounded list. */
	@Get('me/documents/:id')
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
			/** Project the same approved self-document DTO. */ (context) =>
				this.documents.get(context, id),
		)
	}
	/** List one selected object's immutable Ready versions. */
	@Get('me/documents/:id/versions')
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
	/** Stream a private attachment only after current authorization and access-audit commit. */
	@Get('me/documents/:id/versions/:versionId/download')
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
