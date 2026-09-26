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
import { LookupValues } from '@empflowyee/hcm-api-workforce-foundation-application'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'

/** Parse the query string of the verified request URL. */
function query(request: RoleRequest): URLSearchParams {
	return new URL(request.originalUrl, 'http://local.invalid').searchParams
}

/** Tenant and product lookup sets; there is no delete route. */
@Controller('v1/workforce-foundation/lookup-sets')
export class LookupValuesController {
	private readonly logger = new Logger(LookupValuesController.name)
	/** Compose verified tenant context with the lookup use cases. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(LookupValues) private readonly lookups: LookupValues,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}

	/** Run a write after origin, media and idempotency-key validation. */
	private write<T>(
		request: RoleRequest,
		response: RoleResponse,
		work: (context: AuthenticatedHcmContext, key: string) => Promise<T>,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Validate browser write headers before the owning command. */ (context) =>
				work(context, accessWriteKey(request, this.origin, this.context.requestId)),
		)
	}

	/** List the eight sets with ownership and active value counts. */
	@Get()
	sets(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Read sets. */ (context) => this.lookups.sets(context, query(request)),
		)
	}

	/** Read one page of a set's values. */
	@Get(':setKey/values')
	values(
		@Param('setKey') setKey: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Read values. */ (context) => this.lookups.values(context, setKey, query(request)),
		)
	}

	/** Create a tenant value. */
	@Post(':setKey/values')
	create(
		@Param('setKey') setKey: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Create the value. */ (context, key) =>
				this.lookups.create(context, setKey, body, key, this.context.requestId),
		)
	}

	/** Update a tenant value's mutable fields. */
	@Put(':setKey/values/:id')
	update(
		@Param('setKey') setKey: string,
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Update the value. */ (context, key) =>
				this.lookups.update(context, setKey, id, body, key, this.context.requestId),
		)
	}

	/** Retire or reactivate a tenant value. */
	@Post(':setKey/values/:id/active')
	@HttpCode(200)
	setActive(
		@Param('setKey') setKey: string,
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Toggle availability. */ (context, key) =>
				this.lookups.setActive(context, setKey, id, body, key, this.context.requestId),
		)
	}
}
