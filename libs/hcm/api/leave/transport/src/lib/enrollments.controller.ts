import { Body, Controller, Get, Inject, Logger, Param, Post, Req, Res } from '@nestjs/common'
import { LeaveEnrollmentCommands } from '@empflowyee/hcm-api-leave-application'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { invalidField } from '@empflowyee/hcm-runtime-contract'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'

/** Expose source-authorized enrollment without client-controlled balances or implicit period creation. */
@Controller('v1/leave/enrollments')
export class LeaveEnrollmentsController {
	private readonly logger = new Logger(LeaveEnrollmentsController.name)
	/** Receive only the verified request context and the owning business command. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(LeaveEnrollmentCommands) private readonly commands: LeaveEnrollmentCommands,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}
	/** Require same-origin JSON and a durable command key before admitting enrollment. */
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
			/** Read actor and tenant only from the verified request boundary. */ (context) =>
				this.commands.create(
					context,
					accessWriteKey(request, this.origin, this.context.requestId, 'json', []),
					body,
				),
		)
	}
	/** Reload one safe enrollment using current operation and complete dated-scope checks. */
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
			/** Reject undeclared selectors rather than widening the read. */ (context) => {
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
