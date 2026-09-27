import { Body, Controller, Get, Inject, Logger, Param, Post, Req, Res } from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { ProbationReview } from '@empflowyee/hcm-api-employee-application'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	queryParameters,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { query } from './request'

/** Probation Review: the stored reviewer's own reviews and assessments. */
@Controller('v1/employee/me/probation-reviews')
export class ProbationReviewController {
	private readonly logger = new Logger(ProbationReviewController.name)
	/** Compose verified tenant context with the reviewer use cases. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(ProbationReview) private readonly reviews: ProbationReview,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}

	/** Page the actor's assigned reviews. */
	@Get('')
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Page own reviews. */ (context) => this.reviews.list(context, query(request)),
		)
	}

	/** Read one assigned review. */
	@Get(':id')
	read(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Read one review. */ (context) => {
				queryParameters(request, [])
				return this.reviews.read(context, id)
			},
		)
	}

	/** Submit an assessment. */
	@Post(':id/assessments')
	assess(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Validate write headers, then assess. */ (context) =>
				this.reviews.assess(
					context,
					id,
					body,
					accessWriteKey(request, this.origin, this.context.requestId),
					this.context.requestId,
				),
		)
	}
}
