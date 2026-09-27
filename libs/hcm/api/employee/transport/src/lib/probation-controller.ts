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
import { ProbationManagement } from '@empflowyee/hcm-api-employee-application'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	queryParameters,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { query } from './request'

/** Probation Management: HR cases, reviews, reviewer assignment and decisions. */
@Controller('v1/employee/probation')
export class ProbationManagementController {
	private readonly logger = new Logger(ProbationManagementController.name)
	/** Compose verified tenant context with the probation use cases. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(ProbationManagement) private readonly probation: ProbationManagement,
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
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Validate browser write headers before the owning command. */ (context) =>
				work(
					context,
					accessWriteKey(request, this.origin, this.context.requestId),
					this.context.requestId,
				),
		)
	}

	/** Page the probation cases. */
	@Get('cases')
	cases(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** Page cases. */ (context) => this.probation.cases(context, query(request)),
		)
	}

	/** Page the reviews. */
	@Get('reviews')
	reviews(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** Page reviews. */ (context) => this.probation.reviews(context, query(request)),
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
			/** Page options. */ (context) => this.probation.options(context, kind, query(request)),
		)
	}

	/** Read one review. */
	@Get('reviews/:id')
	review(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.read(
			response,
			/** Read one review. */ (context) => {
				queryParameters(request, [])
				return this.probation.review(context, id)
			},
		)
	}

	/** Schedule a review. */
	@Post('reviews')
	schedule(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Schedule a review. */ (context, key, requestId) =>
				this.probation.schedule(context, body, key, requestId),
		)
	}

	/** Assign or replace the reviewer. */
	@Post('reviews/:id/reviewer')
	@HttpCode(200)
	reviewer(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Assign the reviewer. */ (context, key, requestId) =>
				this.probation.assignReviewer(context, id, body, key, requestId),
		)
	}

	/** Cancel a review. */
	@Post('reviews/:id/cancel')
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
			/** Cancel the review. */ (context, key, requestId) =>
				this.probation.cancel(context, id, body, key, requestId),
		)
	}

	/** Record the HR decision. */
	@Post('reviews/:id/decision')
	@HttpCode(200)
	decision(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Decide the review. */ (context, key, requestId) =>
				this.probation.decide(context, id, body, key, requestId),
		)
	}
}
