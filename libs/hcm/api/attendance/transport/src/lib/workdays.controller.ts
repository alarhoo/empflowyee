import { Controller, Get, Inject, Logger, Req, Res } from '@nestjs/common'
import { AttendanceWorkdayQueries } from '@empflowyee/hcm-api-attendance-application'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import {
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'

/** Read-only stored workday inspector; opening a range never queues or computes work. */
@Controller('v1/attendance/workdays')
export class AttendanceWorkdaysController {
	private readonly logger = new Logger(AttendanceWorkdaysController.name)
	/** Bind verified request context to the owning read use case. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(AttendanceWorkdayQueries) private readonly queries: AttendanceWorkdayQueries,
	) {}
	/** Reject undeclared selectors and require a bounded, authorized employment range. */
	@Get() list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Preserve authenticated actor identity independently of the requested employment. */ (
				context,
			) =>
				this.queries.list(
					context,
					new URL(request.originalUrl, 'http://local.invalid').searchParams,
				),
		)
	}
}
