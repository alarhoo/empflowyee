import { Body, Controller, Get, HttpCode, Inject, Logger, Post, Req, Res } from '@nestjs/common'
import { AttendanceHolidayAssignments } from '@empflowyee/hcm-api-attendance-application'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { invalidField } from '@empflowyee/hcm-runtime-contract'

/** Transport for explicit calendar scope assignments; independent manage authority lives in the application transaction. */
@Controller('v1/attendance/holiday-calendar-assignments')
export class HolidayAssignmentsController {
	private readonly logger = new Logger(HolidayAssignmentsController.name)
	/** Compose verified request context, source commands and the maintained write-origin boundary. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(AttendanceHolidayAssignments)
		private readonly assignments: AttendanceHolidayAssignments,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}
	/** Read the exact authorized target/date with no worker or mutation side effects. */
	@Get()
	find(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Keep dated scope validation in the shared owner contract. */ (context) =>
				this.assignments.find(
					context,
					new URL(request.originalUrl, 'http://local.invalid').searchParams,
				),
		)
	}
	/** Return the committed assignment and honest queued/unavailable workday counts. */
	@Post()
	@HttpCode(201)
	assign(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Validate origin and stable retry key before invoking the owner command. */ (context) => {
				if (new URL(request.originalUrl, 'http://local.invalid').search) invalidField('query')
				return this.assignments.assign(
					context,
					accessWriteKey(request, this.origin, this.context.requestId),
					body,
				)
			},
		)
	}
}
