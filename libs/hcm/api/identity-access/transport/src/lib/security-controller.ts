import { runIdentityRequest } from './identity-request'
import { Controller, Get, Inject, Logger, Req, Res } from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { SecuritySummaryReader } from '@empflowyee/hcm-api-identity-access-application'
import { RoleError } from '@empflowyee/hcm-access-control-contract'
import {
	queryParameters,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'

@Controller('v1/identity-access/me/security')
export class SecuritySummaryController {
	private readonly logger = new Logger(SecuritySummaryController.name)
	/** Bind self-service reads to verified context; accept no account identity from the browser. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(SecuritySummaryReader) private readonly reader: SecuritySummaryReader,
	) {}
	/** Return own identity and truthful local-session limitations. */
	@Get()
	summary(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runIdentityRequest(
			this.context,
			this.logger,
			response,
			/** Reject caller-selected scope. */ (context) => {
				queryParameters(request, [])
				return this.reader.summary(context)
			},
		)
	}
	/** Return bounded label-ordered roles using only approved query controls. */
	@Get('roles')
	roles(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runIdentityRequest(
			this.context,
			this.logger,
			response,
			/** Validate exact controls before executing self-scoped SQL. */ (context) => {
				const params = queryParameters(request, ['q', 'limit', 'cursor']),
					q = params.get('q') ?? '',
					size = params.get('limit') ?? '25',
					cursor = params.get('cursor') ?? undefined
				if (
					q.length > 200 ||
					!/^[1-9][0-9]{0,2}$/.test(size) ||
					Number(size) > 100 ||
					(cursor !== undefined && (!cursor || cursor.length > 2048))
				)
					throw new RoleError('invalid-request')
				return this.reader.roles(context, { q, limit: Number(size), ...(cursor ? { cursor } : {}) })
			},
		)
	}
}
