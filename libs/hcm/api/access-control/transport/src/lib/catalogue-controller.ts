import { Controller, Get, Param, Req, Res, Inject, Logger } from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { CatalogueInspection } from '@empflowyee/hcm-api-access-control-application'
import { RoleError } from '@empflowyee/hcm-access-control-contract'
import {
	queryParameters,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from './access-request'
@Controller('v1/access-control/catalogue')
export class CatalogueInspectionController {
	private readonly logger = new Logger(CatalogueInspectionController.name)
	/** Bind safe catalogue queries to verified caller authority. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(CatalogueInspection) private readonly catalogue: CatalogueInspection,
	) {}
	/** Return the bounded immutable inventory with tenant entitlement projection. */
	@Get()
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** No write or tenant override controls exist. */ (context) => {
				queryParameters(request, [])
				return this.catalogue.list(context)
			},
		)
	}
	/** List bounded subjects without impersonating them or exposing account lifecycle data. */
	@Get('accounts')
	accounts(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Parse only the approved person/email search and cursor controls. */ (context) => {
				const query = queryParameters(request, ['q', 'limit', 'cursor']),
					q = query.get('q') ?? '',
					size = query.get('limit') ?? '25',
					cursor = query.get('cursor') ?? undefined
				if (
					q.length > 200 ||
					!/^[1-9][0-9]{0,2}$/.test(size) ||
					Number(size) > 100 ||
					(cursor !== undefined && (!cursor || cursor.length > 2048))
				)
					throw new RoleError('invalid-request')
				return this.catalogue.accounts(context, {
					q,
					sort: 'displayName:asc',
					limit: Number(size),
					...(cursor ? { cursor } : {}),
				})
			},
		)
	}
	/** Explain discoverability for a same-tenant account while retaining caller authorization. */
	@Get('accounts/:id/discovery')
	discovery(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Reject hidden query scope on explicit account selection. */ (context) => {
				queryParameters(request, [])
				return this.catalogue.discovery(context, id)
			},
		)
	}
}
