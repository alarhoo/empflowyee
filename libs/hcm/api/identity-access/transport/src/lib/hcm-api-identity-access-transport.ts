import { runIdentityRequest } from './identity-request'
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
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import { IdentityAdministration } from '@empflowyee/hcm-api-identity-access-application'
import { parseIdentityQuery } from '@empflowyee/hcm-identity-access-contract'
import {
	HCM_ROLE_WRITE_ORIGIN,
	queryParameters,
	accessWriteKey,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
@Controller('v1/identity-access')
export class IdentityAdministrationController {
	private readonly logger = new Logger(IdentityAdministrationController.name)
	/** Bind identity use cases to verified request context and the common local write boundary. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(IdentityAdministration) private readonly accounts: IdentityAdministration,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}
	/** Classify only domain-known identity failures, preserving common safe transport handling. */
	private run<T>(
		response: RoleResponse,
		work: (context: AuthenticatedHcmContext) => Promise<T>,
	): Promise<T> {
		return runIdentityRequest(this.context, this.logger, response, work)
	}
	/** Return a real bounded account page with strict supported controls. */
	@Get('accounts')
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return this.run(
			response,
			/** Parse controls before invoking tenant account queries. */ (context) =>
				this.accounts.list(
					context,
					parseIdentityQuery(new URL(request.originalUrl, 'http://local.invalid').searchParams),
				),
		)
	}
	/** Resolve one opaque account ID without accepting a tenant override. */
	@Get('accounts/:id')
	get(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.run(
			response,
			/** Reject unlisted detail controls. */ (context) => {
				queryParameters(request, [])
				return this.accounts.get(context, id)
			},
		)
	}
	/** Offer a scoped existing-person projection only for approved account creation. */
	@Get('account-person-options')
	people(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return this.run(
			response,
			/** Keep picker filtering separate from account filter capability. */ (context) =>
				this.accounts.people(
					context,
					parseIdentityQuery(
						new URL(request.originalUrl, 'http://local.invalid').searchParams,
						true,
					),
				),
		)
	}
	/** Create a local account record with no production authentication side effects. */
	@Post('accounts')
	create(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.run(
			response,
			/** Require the exact same-origin JSON command boundary as role assignments. */ (context) =>
				this.accounts.create(
					context,
					body,
					accessWriteKey(request, this.origin, this.context.requestId),
					this.context.requestId,
				),
		)
	}
	/** Change only account enablement under the shared tenant administration invariant. */
	@Post('accounts/:id/enabled')
	@HttpCode(200)
	enabled(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.run(
			response,
			/** Domain policy owns revision and protected-administrator behavior. */ (context) =>
				this.accounts.enabled(
					context,
					id,
					body,
					accessWriteKey(request, this.origin, this.context.requestId),
					this.context.requestId,
				),
		)
	}
}
