import { Controller, Get, Post, HttpCode, Inject, Logger, Param, Req, Res } from '@nestjs/common'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { AttendanceEvidence } from '@empflowyee/hcm-api-attendance-application'
import { parseAttendanceEvidenceStage } from '@empflowyee/hcm-attendance-contract'
import {
	documentMultipart,
	documentAttachment,
	runDocumentRequest,
} from '@empflowyee/hcm-api-documents-transport'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	queryParameters,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'

@Controller('v1/attendance/evidence')
export class AttendanceEvidenceController {
	private readonly logger = new Logger(AttendanceEvidenceController.name)
	/** Bind verified request context and the existing multipart/private attachment protocol. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(AttendanceEvidence) private readonly evidence: AttendanceEvidence,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}
	/** Accept exactly metadata followed by one bounded file under current dated field authority. */
	@Post('staged')
	@HttpCode(201)
	stage(
		@Req() request: RoleRequest & IncomingMessage,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		queryParameters(request, [])
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Reject origin and metadata before storing any input. */ (context) => {
				const key = accessWriteKey(request, this.origin, this.context.requestId, 'multipart')
				return documentMultipart(
					request,
					/** Parse the closed dated evidence subject. */ async (value) =>
						parseAttendanceEvidenceStage(value),
					/** The application authorizes before it consumes this stream. */ (
						input,
						bytes,
						filename,
						mediaType,
					) => this.evidence.stage(context, input, key, bytes, filename, mediaType),
				)
			},
		)
	}
	/** Reload only currently visible source-bound evidence, with no hidden-class counts. */
	@Get('overrides/:id')
	list(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		queryParameters(request, [])
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Source read and field permissions remain independent. */ (context) =>
				this.evidence.list(context, id),
		)
	}

	/** Open only owner-bound clean evidence with fresh content permission and safe attachment headers. */
	@Get(':id/content')
	content(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse & ServerResponse,
	) {
		queryParameters(request, [])
		return runDocumentRequest(
			this.context,
			this.logger,
			response,
			/** Keep content out of public DTOs and audit the observed download. */ async (context) =>
				documentAttachment(
					await this.evidence.open(context, id, this.context.requestId),
					response,
					this.logger,
				),
		)
	}
}
