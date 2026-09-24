import { Controller, Get, Post, Put, Param, Body, Req, Res, Inject, Logger } from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { DocumentTypes } from '@empflowyee/hcm-api-documents-application'
import { parseDocumentTypeQuery } from '@empflowyee/hcm-documents-contract'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { runDocumentRequest } from './document-request'
@Controller('v1/documents/types')
export class DocumentTypesController {
	private readonly logger = new Logger(DocumentTypesController.name)
	/** Compose verified HR context and document-owned classification operations. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(DocumentTypes) private readonly types: DocumentTypes,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}
	/** List bounded tenant classifications after independent business authorization. */
	@Get()
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Parse only documented query controls. */ (context) =>
				this.types.list(
					context,
					parseDocumentTypeQuery(new URL(request.originalUrl, 'http://local.invalid').searchParams),
				),
		)
	}
	/** Create one unique classification with an explicit reason and stable retry identity. */
	@Post()
	create(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Enforce write origin before executing the owning command. */ (context) =>
				this.types.create(
					context,
					body,
					accessWriteKey(request, this.origin, this.context.requestId),
					this.context.requestId,
				),
		)
	}
	/** Edit mutable classification fields only under the current revision. */
	@Put(':id')
	update(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Keep route identities separate from verified tenant authority. */ (context) =>
				this.types.update(
					context,
					id,
					body,
					accessWriteKey(request, this.origin, this.context.requestId),
					this.context.requestId,
				),
		)
	}
}
