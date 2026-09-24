import { Controller, Get, Put, Param, Body, Req, Res, Inject, Logger } from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { Notifications } from '@empflowyee/hcm-api-notifications-application'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	queryParameters,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { runNotificationRequest } from './notification-request'
@Controller('v1/notifications')
export class NotificationConfigurationController {
	private readonly logger = new Logger(NotificationConfigurationController.name)
	/** Compose registered-event administration with verified context and same-origin writes. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(Notifications) private readonly notifications: Notifications,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}
	/** Return the bounded actual template collection without accepting tenant selectors. */
	@Get('templates')
	templates(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runNotificationRequest(
			this.context,
			this.logger,
			response,
			/** Reject unapproved query controls. */ (context) => {
				queryParameters(request, [])
				return this.notifications.templates(context)
			},
		)
	}
	/** Return supported tenant event switches. */
	@Get('rules')
	rules(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runNotificationRequest(
			this.context,
			this.logger,
			response,
			/** Enforce exact bounded read contract. */ (context) => {
				queryParameters(request, [])
				return this.notifications.rules(context)
			},
		)
	}
	/** Save one validated plain-text template under current persisted authority. */
	@Put('templates/:eventType')
	saveTemplate(
		@Param('eventType') event: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runNotificationRequest(
			this.context,
			this.logger,
			response,
			/** Pass verified caller and safe receipt identity to the use case. */ (context) =>
				this.notifications.saveTemplate(
					context,
					event,
					body,
					accessWriteKey(request, this.origin, this.context.requestId),
					this.context.requestId,
				),
		)
	}
	/** Toggle one supported rule without accepting custom delivery destinations. */
	@Put('rules/:eventType')
	saveRule(
		@Param('eventType') event: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runNotificationRequest(
			this.context,
			this.logger,
			response,
			/** Preserve current authorization and optimistic concurrency. */ (context) =>
				this.notifications.saveRule(
					context,
					event,
					body,
					accessWriteKey(request, this.origin, this.context.requestId),
					this.context.requestId,
				),
		)
	}
}
