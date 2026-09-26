import { Controller, Get, Inject, Logger, Req, Res } from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { IdentificationTypes } from '@empflowyee/hcm-api-workforce-foundation-application'
import {
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'

/** Parse the query string of the verified request URL. */
function query(request: RoleRequest): URLSearchParams {
	return new URL(request.originalUrl, 'http://local.invalid').searchParams
}

/** Read-only product identification-type catalogue; no mutation handler exists (DEC-HCM2-016). */
@Controller('v1/workforce-foundation/identification-types')
export class IdentificationTypesController {
	private readonly logger = new Logger(IdentificationTypesController.name)
	/** Compose verified tenant context with the read use cases. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(IdentificationTypes) private readonly types: IdentificationTypes,
	) {}

	/** Read the bounded product catalogue. */
	@Get()
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Read the catalogue. */ (context) => this.types.list(context, query(request)),
		)
	}

	/** Read issuing countries for the country filter. */
	@Get('options/countries')
	countries(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Read countries. */ (context) => this.types.countries(context, query(request)),
		)
	}
}
