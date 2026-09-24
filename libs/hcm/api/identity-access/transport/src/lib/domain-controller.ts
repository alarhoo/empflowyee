import { Controller, Get, Inject, Logger, Req, Res } from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { DomainProjectionReader } from '@empflowyee/hcm-api-identity-access-application'
import {
	queryParameters,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'

@Controller('v1/identity-access/domains')
export class DomainProjectionController {
	private readonly logger = new Logger(DomainProjectionController.name)
	/** Bind the current-tenant projection to the verified request boundary. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(DomainProjectionReader) private readonly reader: DomainProjectionReader,
	) {}
	/** Expose no hostname mutations, external DNS lookup or alternate tenant selector. */
	@Get()
	read(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Reject every unapproved query control. */ (context) => {
				queryParameters(request, [])
				return this.reader.read(context)
			},
		)
	}
}
