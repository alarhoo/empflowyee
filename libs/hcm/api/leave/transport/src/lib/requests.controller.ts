import { Body, Controller, Get, Inject, Logger, Param, Post, Req, Res } from '@nestjs/common'
import { LeaveRequestDraftCommands } from '@empflowyee/hcm-api-leave-application'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { invalidField } from '@empflowyee/hcm-runtime-contract'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'

/** Admit explicit self Drafts without exposing submission or approval as successful placeholders. */
@Controller('v1/leave/me/requests')
export class LeaveRequestsController {
	private readonly logger = new Logger(LeaveRequestsController.name)
	/** Receive only verified request context and owning business commands. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(LeaveRequestDraftCommands) private readonly commands: LeaveRequestDraftCommands,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}
	/** Require same-origin JSON and a durable command key before creating any request rows. */
	@Post()
	create(
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
		@Body() body: unknown,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Derive actor and tenant solely from authenticated runtime context. */ (context) =>
				this.commands.create(
					context,
					accessWriteKey(request, this.origin, this.context.requestId, 'json', []),
					body,
				),
		)
	}
	/** Reload one safe own-employment request with no client-controlled field or tenant selectors. */
	@Get(':id')
	read(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Unknown selectors cannot widen a private source read. */ (context) => {
				for (const field of new URL(
					request.originalUrl,
					'http://local.invalid',
				).searchParams.keys())
					invalidField(field, 'unknown')
				return this.commands.read(context, id)
			},
		)
	}
}
