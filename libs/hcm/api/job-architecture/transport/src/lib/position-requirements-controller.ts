import { Body, Controller, Get, Inject, Logger, Param, Post, Put, Req, Res } from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { Positions } from '@empflowyee/hcm-api-job-architecture-application'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { query } from './request'

/** Position Requirements: effective requirements and variance proposals on position change requests. */
@Controller('v1/job-architecture')
export class PositionRequirementsController {
	private readonly logger = new Logger(PositionRequirementsController.name)
	/** Compose verified tenant context with the positions use cases. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(Positions) private readonly positions: Positions,
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

	/** Positions with their variance counts. */
	@Get('position-requirements')
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** Page positions. */ (context) =>
				this.positions.requirementPositions(context, query(request)),
		)
	}

	/** Effective requirements of a position. */
	@Get('positions/:id/requirements')
	effective(@Param('id') id: string, @Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** Read the effective set. */ (context) => this.positions.effectiveRequirements(context, id),
		)
	}

	/** Requirements of a position's job profile version. */
	@Get('positions/:id/profile-requirements')
	profile(@Param('id') id: string, @Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** Read the profile requirements. */ (context) =>
				this.positions.profileRequirements(context, id),
		)
	}

	/** Propose variances as a draft change request. */
	@Post('positions/:id/requirement-changes')
	create(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Create the request. */ (context, key, requestId) =>
				this.positions.createRequirementChange(context, id, body, key, requestId),
		)
	}

	/** Replace the variances of a draft change request. */
	@Put('position-change-requests/:id/requirements')
	update(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Update the variances. */ (context, key, requestId) =>
				this.positions.updateRequirementChange(context, id, body, key, requestId),
		)
	}
}
