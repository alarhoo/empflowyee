import {
	Body,
	Controller,
	Get,
	Post,
	Param,
	Req,
	Res,
	Inject,
	HttpCode,
	Logger,
} from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { AccessReviews } from '@empflowyee/hcm-api-access-control-application'
import { parseReviewQuery, parseReviewItemsQuery } from '@empflowyee/hcm-access-control-contract'
import {
	HCM_ROLE_WRITE_ORIGIN,
	queryParameters,
	accessWriteKey,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from './access-request'
@Controller('v1/access-control/reviews')
export class AccessReviewController {
	private readonly logger = new Logger(AccessReviewController.name)
	/** Bind review use cases to verified context and the established local write-origin boundary. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(AccessReviews) private readonly reviews: AccessReviews,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}
	/** Query bounded review summaries using explicit server controls. */
	@Get()
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Parse only the approved review query shape. */ (context) =>
				this.reviews.list(
					context,
					parseReviewQuery(new URL(request.originalUrl, 'http://local.invalid').searchParams),
				),
		)
	}
	/** Resolve a review deep link without a client-side scan of collection pages. */
	@Get(':id')
	get(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Reject hidden selectors on an explicit object read. */ (context) => {
				queryParameters(request, [])
				return this.reviews.get(context, id)
			},
		)
	}
	/** Page snapshot items, preserving historical labels and explicit drift. */
	@Get(':id/items')
	items(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Pass bounded controls to the owning read use case. */ (context) =>
				this.reviews.items(
					context,
					id,
					parseReviewItemsQuery(new URL(request.originalUrl, 'http://local.invalid').searchParams),
				),
		)
	}
	/** Create one attributable snapshot with idempotency and protected-access serialization. */
	@Post()
	start(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Preserve the existing write-origin and JSON contract. */ (context) =>
				this.reviews.start(
					context,
					body,
					accessWriteKey(request, this.origin, this.context.requestId),
					this.context.requestId,
				),
		)
	}
	/** Decide one pending snapshot, reusing the assignment-owned revoke operation when selected. */
	@Post(':id/items/:itemId/decide')
	@HttpCode(200)
	decide(
		@Param('id') id: string,
		@Param('itemId') itemId: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.command('decide', id, itemId, body, request, response)
	}
	/** Refresh outdated evidence without silently deciding a retained or missing grant. */
	@Post(':id/items/:itemId/refresh')
	@HttpCode(200)
	refresh(
		@Param('id') id: string,
		@Param('itemId') itemId: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.command('refresh', id, itemId, body, request, response)
	}
	/** Close only a fully decided review with current retained evidence. */
	@Post(':id/close')
	@HttpCode(200)
	close(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.command('close', id, undefined, body, request, response)
	}
	/** Apply uniform verified context, origin, idempotency and sanitized failure handling. */
	private command(
		operation: 'decide' | 'refresh' | 'close',
		id: string,
		itemId: string | undefined,
		body: unknown,
		request: RoleRequest,
		response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Reauthorize the operation before replay or state changes. */ (context) =>
				this.reviews.command(
					context,
					operation,
					id,
					itemId,
					body,
					accessWriteKey(request, this.origin, this.context.requestId),
					this.context.requestId,
				),
		)
	}
}
