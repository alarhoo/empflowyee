import {
	Body,
	Controller,
	Get,
	HttpCode,
	Inject,
	Logger,
	Param,
	Post,
	Req,
	Res,
} from '@nestjs/common'
import { AttendanceOverrides } from '@empflowyee/hcm-api-attendance-application'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { invalidField } from '@empflowyee/hcm-runtime-contract'

/** Transport for dated override drafts and reviews; production approval remains a separate source command. */
@Controller('v1/attendance/overrides')
export class AttendanceOverridesController {
	private readonly logger = new Logger(AttendanceOverridesController.name)
	/** Compose verified session context and origin enforcement with Attendance-owned commands. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(AttendanceOverrides) private readonly overrides: AttendanceOverrides,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}
	/** Reload a safe dated source without exposing narrative or attachment identities. */
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
			/** Reject undeclared query fields before selecting the exact resource. */ (context) => {
				if (new URL(request.originalUrl, 'http://local.invalid').search) invalidField('query')
				return this.overrides.read(context, id)
			},
		)
	}
	/** Create an idempotent Draft under current Work Schedules manage authority. */
	@Post()
	@HttpCode(201)
	create(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Verify trusted origin and retain the caller's original retry identity. */ (context) => {
				if (new URL(request.originalUrl, 'http://local.invalid').search) invalidField('query')
				return this.overrides.create(
					context,
					accessWriteKey(request, this.origin, this.context.requestId),
					body,
				)
			},
		)
	}
	/** Return exact proposed dated impact without leaving approval or worker side effects. */
	@Post(':id/preview')
	@HttpCode(200)
	preview(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Check current source preview authority independently from draft creation. */ (
				context,
			) => {
				if (new URL(request.originalUrl, 'http://local.invalid').search) invalidField('query')
				return this.overrides.preview(
					context,
					id,
					accessWriteKey(request, this.origin, this.context.requestId),
					body,
				)
			},
		)
	}
	/** Consume current impact and persist either required approval work or an explicitly permitted approval with dated resolution intents. */
	@Post(':id/submit')
	@HttpCode(200)
	submit(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Retain origin, current manage permission and the caller's retry identity. */ (
				context,
			) => {
				if (new URL(request.originalUrl, 'http://local.invalid').search) invalidField('query')
				return this.overrides.submit(
					context,
					id,
					accessWriteKey(request, this.origin, this.context.requestId),
					body,
				)
			},
		)
	}
}
