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
import { OrganisationStructure } from '@empflowyee/hcm-api-workforce-foundation-application'
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

@Controller('v1/workforce-foundation/structure')
export class OrganisationStructureController {
	private readonly logger = new Logger(OrganisationStructureController.name)
	/** Compose verified tenant context with workforce-owned structure use cases. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(OrganisationStructure) private readonly structure: OrganisationStructure,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}

	/** Run a read with shared safe error handling. */
	private read<T>(response: RoleResponse, work: (context: AuthenticatedHcmContext) => Promise<T>) {
		return runAccessRequest(this.context, this.logger, response, work)
	}

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

	/** Read organisation HR defaults and the Account-owned display name. */
	@Get('organisation-profile')
	profile(@Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** Read the profile. */ (context) => this.structure.profile(context),
		)
	}

	/** Create or update organisation HR defaults. */
	@Put('organisation-profile')
	saveProfile(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Save the profile. */ (context, key) =>
				this.structure.saveProfile(context, body, key, this.context.requestId),
		)
	}

	/** Read bounded picker options. */
	@Get('options/:kind')
	options(
		@Param('kind') kind: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.read(
			response,
			/** Read options. */ (context) => this.structure.options(context, kind, query(request)),
		)
	}

	/** Add an effective-dated unit version. */
	@Post('units/:id/versions')
	@HttpCode(200)
	addVersion(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Supersede the latest version. */ (context, key) =>
				this.structure.addUnitVersion(context, id, body, key, this.context.requestId),
		)
	}

	/** Retire a unit from a date. */
	@Post('units/:id/retire')
	@HttpCode(200)
	retire(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Close the unit. */ (context, key) =>
				this.structure.retireUnit(context, id, body, key, this.context.requestId),
		)
	}

	/** List one structure area. */
	@Get(':area')
	list(
		@Param('area') area: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.read(
			response,
			/** Read one page. */ (context) => this.structure.list(context, area, query(request)),
		)
	}

	/** Read one structure item. */
	@Get(':area/:id')
	detail(
		@Param('area') area: string,
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.read(
			response,
			/** Read one item. */ (context) => this.structure.detail(context, area, id, query(request)),
		)
	}

	/** Create one structure item. */
	@Post(':area')
	create(
		@Param('area') area: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Create the item. */ (context, key) =>
				this.structure.create(context, area, body, key, this.context.requestId),
		)
	}

	/** Update mutable fields of one structure item. */
	@Put(':area/:id')
	update(
		@Param('area') area: string,
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Update the item. */ (context, key) =>
				this.structure.update(context, area, id, body, key, this.context.requestId),
		)
	}

	/** Retire or reactivate one structure item. */
	@Post(':area/:id/active')
	@HttpCode(200)
	setActive(
		@Param('area') area: string,
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Toggle availability. */ (context, key) =>
				this.structure.setActive(context, area, id, body, key, this.context.requestId),
		)
	}
}
