import { Body, Controller, Get, HttpCode, Inject, Logger, Post, Req, Res } from '@nestjs/common'
import { AttendanceWorkAssignments } from '@empflowyee/hcm-api-attendance-application'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { invalidField } from '@empflowyee/hcm-runtime-contract'

/** Select only the two admitted assignment families from the matched resource URL. */
function family(request: RoleRequest): 'Schedule' | 'Policy' {
	return new URL(request.originalUrl, 'http://local.invalid').pathname.endsWith(
		'/schedule-assignments',
	)
		? 'Schedule'
		: 'Policy'
}

/** Transport for explicit schedule and policy assignments; independent manage authority lives in the application transaction. */
@Controller(['v1/attendance/schedule-assignments', 'v1/attendance/policy-assignments'])
export class WorkAssignmentsController {
	private readonly logger = new Logger(WorkAssignmentsController.name)
	/** Compose verified request context, source commands and the maintained write-origin boundary. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(AttendanceWorkAssignments)
		private readonly assignments: AttendanceWorkAssignments,
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
					family(request),
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
					family(request),
					accessWriteKey(request, this.origin, this.context.requestId),
					body,
				)
			},
		)
	}
}
