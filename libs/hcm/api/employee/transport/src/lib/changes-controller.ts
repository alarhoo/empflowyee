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
import { EmploymentChanges } from '@empflowyee/hcm-api-employee-application'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { query } from './request'

/** Employment Changes: typed, effective-dated requests with an independent approval. */
@Controller('v1/employee/changes')
export class EmploymentChangesController {
	private readonly logger = new Logger(EmploymentChangesController.name)
	/** Compose verified tenant context with the change use cases. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(EmploymentChanges) private readonly changes: EmploymentChanges,
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

	/** Page the requests. */
	@Get('')
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		void request
		return this.read(
			response,
			/** Page the requests. */ (context) => this.changes.list(context, query(request)),
		)
	}

	/** Page one option kind. */
	@Get('options/:kind')
	options(
		@Param('kind') kind: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		void request
		return this.read(
			response,
			/** Page one option kind. */ (context) => this.changes.options(context, kind, query(request)),
		)
	}

	/** Read a worker's current facts. */
	@Get('context/:workerId')
	workerContext(
		@Param('workerId') workerId: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		void request
		return this.read(
			response,
			/** Read a worker's current facts. */ (context) => this.changes.context(context, workerId),
		)
	}

	/** Read one request. */
	@Get(':id')
	detail(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		void request
		return this.read(response, /** Read one request. */ (context) => this.changes.read(context, id))
	}

	/** Create a draft request. */
	@Post('')
	create(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Create a draft request. */ (context, key, requestId) =>
				this.changes.create(context, body, key, requestId),
		)
	}

	/** Edit a draft request. */
	@Put(':id')
	update(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Edit a draft request. */ (context, key, requestId) =>
				this.changes.update(context, id, body, key, requestId),
		)
	}

	/** Submit a draft for approval. */
	@Post(':id/submit')
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
			/** Submit a draft for approval. */ (context, key, requestId) =>
				this.changes.submit(context, id, body, key, requestId),
		)
	}

	/** Decide the approval slot. */
	@Post(':id/decide')
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
			/** Decide the approval slot. */ (context, key, requestId) =>
				this.changes.decide(context, id, body, key, requestId),
		)
	}

	/** Apply an approved request. */
	@Post(':id/apply')
	@HttpCode(200)
	apply(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Apply an approved request. */ (context, key, requestId) =>
				this.changes.apply(context, id, body, key, requestId),
		)
	}

	/** Cancel a request. */
	@Post(':id/cancel')
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
			/** Cancel a request. */ (context, key, requestId) =>
				this.changes.cancel(context, id, body, key, requestId),
		)
	}
}
