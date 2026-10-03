import {
	Body,
	Controller,
	Get,
	HttpCode,
	Inject,
	Logger,
	Param,
	Patch,
	Post,
	Req,
	Res,
} from '@nestjs/common'
import {
	AttendanceWorkConfigurationDrafts,
	type WorkConfigurationFamily,
} from '@empflowyee/hcm-api-attendance-application'
import { invalidField } from '@empflowyee/hcm-runtime-contract'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'

/** Resolve only the two admitted HTTP resource names; URL text never becomes a database identifier. */
function family(request: RoleRequest): WorkConfigurationFamily {
	const pathname = new URL(request.originalUrl, 'http://local.invalid').pathname
	return /\/attendance\/shifts(?:\/|$)/.test(pathname) ? 'Shift' : 'Policy'
}

/** Expose exact shift/policy Draft routes through existing authenticated transport protections. */
@Controller(['v1/attendance/shifts', 'v1/attendance/policies'])
export class WorkConfigurationsController {
	private readonly logger = new Logger(WorkConfigurationsController.name)
	/** Compose source use cases and verified request context without persistence dependencies. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(AttendanceWorkConfigurationDrafts)
		private readonly drafts: AttendanceWorkConfigurationDrafts,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}

	/** Enforce origin, media, idempotency and closed query rules before invoking a mutation. */
	private write<T>(
		request: RoleRequest,
		response: RoleResponse,
		work: (context: AuthenticatedHcmContext, key: string) => Promise<T>,
	): Promise<T> {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Bind commands to server-authenticated identity and the caller's stable retry key. */ (
				context,
			) => work(context, accessWriteKey(request, this.origin, this.context.requestId, 'json', [])),
		)
	}
	/** Read a bounded latest-version list using current operation authority. */
	@Get()
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Preserve source filtering and opaque continuation at the application boundary. */ (
				context,
			) =>
				this.drafts.list(
					context,
					family(request),
					new URL(request.originalUrl, 'http://local.invalid').searchParams,
				),
		)
	}
	/** Return the exact version and reject undeclared query fields. */
	@Get(':id/versions/:version')
	detail(
		@Param('id') id: string,
		@Param('version') version: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Keep both version selectors explicit and foreign identities indistinguishable. */ (
				context,
			) => {
				for (const field of new URL(
					request.originalUrl,
					'http://local.invalid',
				).searchParams.keys())
					invalidField(field, 'unknown')
				return this.drafts.detail(context, family(request), id, version)
			},
		)
	}
	/** Create a Draft using the selected resource's closed universal validator. */
	@Post()
	create(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Never publish or assign configuration implicitly during creation. */ (context, key) =>
				this.drafts.create(context, family(request), key, body),
		)
	}
	/** Replace the expected Draft revision with a complete validated business payload. */
	@Patch(':id/versions/:version')
	@HttpCode(200)
	update(
		@Param('id') id: string,
		@Param('version') version: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Let the source transaction own lifecycle, optimistic concurrency and replay. */ (
				context,
				key,
			) => this.drafts.update(context, family(request), id, version, key, body),
		)
	}
	/** Create an editable successor from an exact immutable source revision. */
	@Post(':id/versions')
	newVersion(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Preserve source lineage and encrypted versioning reason within the receipt transaction. */ (
				context,
				key,
			) => this.drafts.newVersion(context, family(request), id, key, body),
		)
	}
}
