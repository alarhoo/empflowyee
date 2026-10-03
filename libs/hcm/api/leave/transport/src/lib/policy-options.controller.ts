import { Controller, Get, Inject, Logger, Req, Res } from '@nestjs/common'
import { LeavePolicyCommands } from '@empflowyee/hcm-api-leave-application'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import {
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'

/** Expose authorized Leave-owned references for policy configuration. */
@Controller('v1/leave/policy-options')
export class LeavePolicyOptionsController {
	private readonly logger = new Logger(LeavePolicyOptionsController.name)
	/** Reuse the current request authority and source query service. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(LeavePolicyCommands) private readonly commands: LeavePolicyCommands,
	) {}
	/** Keep picker search, filtering and continuation on the authenticated API. */
	@Get()
	options(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** A reference label does not grant publication or request authority. */ (context) =>
				this.commands.options(
					context,
					new URL(request.originalUrl, 'http://local.invalid').searchParams,
				),
		)
	}
}
