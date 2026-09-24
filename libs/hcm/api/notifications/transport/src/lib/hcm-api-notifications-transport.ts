import {
	Body,
	Controller,
	Get,
	Post,
	Put,
	Param,
	Req,
	Res,
	Inject,
	HttpCode,
	Logger,
} from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { Notifications } from '@empflowyee/hcm-api-notifications-application'
import { parseInboxQuery } from '@empflowyee/hcm-notifications-contract'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	queryParameters,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { runNotificationRequest } from './notification-request'
@Controller('v1/notifications/me')
export class NotificationSelfController {
	private readonly logger = new Logger(NotificationSelfController.name)
	/** Bind own-account operations to verified context and the existing local same-origin boundary. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(Notifications) private readonly notifications: Notifications,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}
	/** Query a bounded inbox without accepting recipient or tenant selectors. */
	@Get('inbox')
	inbox(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runNotificationRequest(
			this.context,
			this.logger,
			response,
			/** Validate only registered inbox query controls. */ (context) =>
				this.notifications.inbox(
					context,
					parseInboxQuery(new URL(request.originalUrl, 'http://local.invalid').searchParams),
				),
		)
	}
	/** Mark one own notification read under revision and receipt protection. */
	@Post('inbox/:id/read')
	@HttpCode(200)
	read(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runNotificationRequest(
			this.context,
			this.logger,
			response,
			/** Same-origin validation cannot substitute for server subject authorization. */ (context) =>
				this.notifications.read(
					context,
					id,
					body,
					accessWriteKey(request, this.origin, this.context.requestId),
					this.context.requestId,
				),
		)
	}
	/** Read the fixed supported category set for the authenticated account only. */
	@Get('preferences')
	preferences(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runNotificationRequest(
			this.context,
			this.logger,
			response,
			/** Reject hidden account selectors before reading the own projection. */ (context) => {
				queryParameters(request, [])
				return this.notifications.preferences(context)
			},
		)
	}
	/** Persist an explicit own-category preference; no external delivery channel is introduced. */
	@Put('preferences/:eventType')
	savePreference(
		@Param('eventType') event: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runNotificationRequest(
			this.context,
			this.logger,
			response,
			/** Pass one revisioned command through the owning application. */ (context) =>
				this.notifications.savePreference(
					context,
					event,
					body,
					accessWriteKey(request, this.origin, this.context.requestId),
					this.context.requestId,
				),
		)
	}
}
