import { Controller, Get, Inject, Logger, Req, Res, HttpException } from '@nestjs/common'
import { AuditReader } from '@empflowyee/hcm-api-audit-application'
import { AuditQueryError, parseAuditQuery } from '@empflowyee/hcm-audit-contract'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import {
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
@Controller('v1/audit/events')
export class AuditLogController {
	private readonly logger = new Logger(AuditLogController.name)
	/** Bind safe audit queries to the current verified request. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(AuditReader) private readonly reader: AuditReader,
	) {}
	/** Read only the allowed business evidence projection, never arbitrary audit JSON. */
	@Get()
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Classify safe query failures independently of authorization and database outages. */ async (
				context,
			) => {
				try {
					return await this.reader.list(
						context,
						parseAuditQuery(new URL(request.originalUrl, 'http://local.invalid').searchParams),
					)
				} catch (error) {
					if (error instanceof AuditQueryError)
						throw new HttpException(
							{ code: 'invalid-request', requestId: this.context.requestId },
							400,
						)
					throw error
				}
			},
		)
	}
}
