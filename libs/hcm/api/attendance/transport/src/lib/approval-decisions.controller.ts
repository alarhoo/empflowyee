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
import { AttendanceApprovalDecisions } from '@empflowyee/hcm-api-attendance-application'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { invalidField } from '@empflowyee/hcm-runtime-contract'

/** Internal source approval routes required by Work Schedules; this does not deliver the broader Approve Attendance UI. */
@Controller('v1/attendance')
export class AttendanceApprovalDecisionsController {
	private readonly logger = new Logger(AttendanceApprovalDecisionsController.name)
	/** Bind authenticated source authority and the established same-origin write boundary. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(AttendanceApprovalDecisions) private readonly approvals: AttendanceApprovalDecisions,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}

	/** Read only safe source obligations after the independent dated read operation. */
	@Get('approval-cases/:id')
	read(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Query payload cannot alter source identity or scope. */ (context) => {
				if (new URL(request.originalUrl, 'http://local.invalid').search) invalidField('query')
				return this.approvals.read(context, id)
			},
		)
	}

	/** Persist ActionPending and a real dispatch intent; only a subsequent source receipt proves a decision. */
	@Post('approval-cases/:id/slots/:slotId/decisions')
	@HttpCode(202)
	decide(
		@Param('id') id: string,
		@Param('slotId') slotId: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Preserve the original write key and explicit source revisions. */ (context) => {
				if (new URL(request.originalUrl, 'http://local.invalid').search) invalidField('query')
				return this.approvals.decide(
					context,
					id,
					slotId,
					accessWriteKey(request, this.origin, this.context.requestId),
					body,
				)
			},
		)
	}

	/** Recover the original actor's safe attempt without sending a replacement command. */
	@Get('decision-receipts/:key')
	receipt(
		@Param('key') key: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Fresh source visibility applies even to completed decisions. */ (context) => {
				if (new URL(request.originalUrl, 'http://local.invalid').search) invalidField('query')
				return this.approvals.receipt(context, key)
			},
		)
	}
}
