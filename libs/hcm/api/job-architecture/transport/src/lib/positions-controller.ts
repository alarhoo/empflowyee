import {
	Body,
	Controller,
	Get,
	HttpCode,
	Inject,
	Logger,
	Param,
	Post,
	Put,
	Req,
	Res,
} from '@nestjs/common'
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

/** Positions: occupancy-backed reads and previewed, independently approved change requests. */
@Controller('v1/job-architecture')
export class PositionsController {
	private readonly logger = new Logger(PositionsController.name)
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

	/** Positions with occupancy. */
	@Get('positions')
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** Page positions. */ (context) => this.positions.list(context, query(request)),
		)
	}

	/** One position. */
	@Get('positions/:id')
	detail(@Param('id') id: string, @Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** Read the position. */ (context) => this.positions.detail(context, id),
		)
	}

	/** Incumbents of a position. */
	@Get('positions/:id/incumbents')
	incumbents(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.read(
			response,
			/** Page incumbents. */ (context) => this.positions.incumbents(context, id, query(request)),
		)
	}

	/** Published versions of a position. */
	@Get('positions/:id/versions')
	versions(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.read(
			response,
			/** Page versions. */ (context) => this.positions.versions(context, id, query(request)),
		)
	}

	/** Change requests. */
	@Get('position-change-requests')
	requests(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** Page requests. */ (context) => this.positions.requests(context, query(request)),
		)
	}

	/** One change request. */
	@Get('position-change-requests/:id')
	request(@Param('id') id: string, @Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** Read the request. */ (context) => this.positions.request(context, id),
		)
	}

	/** Options for a proposal's references. */
	@Get('position-options/:kind')
	options(
		@Param('kind') kind: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.read(
			response,
			/** Page options. */ (context) => this.positions.options(context, kind, query(request)),
		)
	}

	/** Raise a change request. */
	@Post('position-change-requests')
	create(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Create the request. */ (context, key, requestId) =>
				this.positions.createRequest(context, body, key, requestId),
		)
	}

	/** Replace a draft proposal. */
	@Put('position-change-requests/:id')
	update(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Update the request. */ (context, key, requestId) =>
				this.positions.updateRequest(context, id, body, key, requestId),
		)
	}

	/** Calculate the impact preview. */
	@Post('position-change-requests/:id/preview')
	@HttpCode(200)
	preview(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Preview the request. */ (context, key, requestId) =>
				this.positions.preview(context, id, body, key, requestId),
		)
	}

	/** Submit with a valid preview. */
	@Post('position-change-requests/:id/submit')
	@HttpCode(200)
	submit(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Submit the request. */ (context, key, requestId) =>
				this.positions.submit(context, id, body, key, requestId),
		)
	}

	/** Withdraw an open request. */
	@Post('position-change-requests/:id/withdraw')
	@HttpCode(200)
	withdraw(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Withdraw the request. */ (context, key, requestId) =>
				this.positions.withdraw(context, id, body, key, requestId),
		)
	}

	/** Approve or reject a request. */
	@Post('position-change-requests/:id/decide')
	@HttpCode(200)
	decide(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Decide the request. */ (context, key, requestId) =>
				this.positions.decide(context, id, body, key, requestId),
		)
	}
}
