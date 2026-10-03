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
import { LeavePolicyCommands } from '@empflowyee/hcm-api-leave-application'
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

/** Serve admitted Leave policy draft commands through the existing authenticated HTTP boundary. */
@Controller('v1/leave/policies')
export class LeavePoliciesController {
	private readonly logger = new Logger(LeavePoliciesController.name)
	/** Compose use cases with request-scoped verified identity and configured write origin. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(LeavePolicyCommands) private readonly commands: LeavePolicyCommands,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}

	/** Apply same-origin, JSON and idempotency protections before calling the source use case. */
	private write<T>(
		request: RoleRequest,
		response: RoleResponse,
		work: (context: AuthenticatedHcmContext, key: string) => Promise<T>,
	): Promise<T> {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Authority comes only from the authenticated request boundary. */ (context) =>
				work(context, accessWriteKey(request, this.origin, this.context.requestId, 'json', [])),
		)
	}

	/** Read a bounded latest-version page with server-owned filtering and continuation. */
	@Get()
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Current operation authority is checked before query execution. */ (context) =>
				this.commands.list(
					context,
					new URL(request.originalUrl, 'http://local.invalid').searchParams,
				),
		)
	}

	/** Return only the exact requested version and reject undeclared query selectors. */
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
			/** Missing and foreign resources share the source's not-found response. */ (context) => {
				for (const field of new URL(
					request.originalUrl,
					'http://local.invalid',
				).searchParams.keys())
					invalidField(field, 'unknown')
				return this.commands.detail(context, id, version)
			},
		)
	}

	/** Create a policy draft without publication, assignment or balance side effects. */
	@Post()
	create(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Keep the original browser retry identity. */ (context, key) =>
				this.commands.create(context, key, body),
		)
	}

	/** Replace a complete draft at its expected revision. */
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
			/** Current source lifecycle and authorization are checked in the transaction. */ (
				context,
				key,
			) => this.commands.update(context, id, version, key, body),
		)
	}

	/** Create a successor draft from an exact published source revision. */
	@Post(':id/versions')
	version(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** The required original reason is encrypted in the source receipt. */ (context, key) =>
				this.commands.version(context, id, key, body),
		)
	}
}
