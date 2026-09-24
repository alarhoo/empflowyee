import {
	Body,
	Controller,
	Get,
	Post,
	Param,
	Req,
	Res,
	Inject,
	HttpCode,
	Logger,
} from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { AccessAssignments } from '@empflowyee/hcm-api-access-control-application'
import { AssignmentError, type AssignmentQuery } from '@empflowyee/hcm-access-control-contract'
import {
	HCM_ROLE_WRITE_ORIGIN,
	queryParameters,
	accessWriteKey,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from './access-request'
/** Parse bounded page controls shared by account-role and role-picker endpoints. */
function pageQuery(params: URLSearchParams) {
	const size = params.get('limit') ?? '25',
		cursor = params.get('cursor')
	if (
		!/^[1-9][0-9]{0,2}$/.test(size) ||
		Number(size) > 100 ||
		(cursor !== null && (!/^[A-Za-z0-9_-]+$/.test(cursor) || cursor.length > 2048))
	)
		throw new AssignmentError('invalid-request')
	return { limit: Number(size), ...(cursor ? { cursor } : {}) }
}
/** Bound literal search input before sending it to a parameterized query. */
function queryText(params: URLSearchParams): string {
	const q = params.get('q') ?? ''
	if (q.length > 200) throw new AssignmentError('invalid-request')
	return q
}
@Controller('v1/access-control')
export class AssignmentController {
	private readonly logger = new Logger(AssignmentController.name)
	/** Compose framework-independent assignment use cases with verified request authority. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(AccessAssignments) private readonly assignments: AccessAssignments,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}
	/** Return one bounded server-filtered page of tenant accounts and current roles. */
	@Get('assignments')
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Reject unsupported controls before querying accounts. */ (context) => {
				const params = queryParameters(request, ['q', 'enabled', 'sort', 'limit', 'cursor']),
					enabled = params.get('enabled'),
					sort = params.get('sort') ?? 'displayName:asc'
				if (
					(enabled !== null && !['true', 'false'].includes(enabled)) ||
					!['displayName:asc', 'displayName:desc'].includes(sort)
				)
					throw new AssignmentError('invalid-request')
				return this.assignments.list(context, {
					...pageQuery(params),
					q: queryText(params),
					sort: sort as AssignmentQuery['sort'],
					...(enabled !== null ? { enabled: enabled === 'true' } : {}),
				})
			},
		)
	}
	/** Resolve a selected account through its authorized safe projection. */
	@Get('assignments/:id')
	get(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** No hidden filters or tenant selector are accepted. */ (context) => {
				queryParameters(request, [])
				return this.assignments.get(context, id)
			},
		)
	}
	/** Continue one account's role collection under assignment-read authority. */
	@Get('assignments/:id/roles')
	roles(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Pass only explicit pagination controls. */ (context) =>
				this.assignments.roles(
					context,
					id,
					pageQuery(queryParameters(request, ['limit', 'cursor'])),
				),
		)
	}
	/** Search persisted role choices for a focused assignment action. */
	@Get('assignment-role-options')
	options(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Enforce the picker-specific query contract. */ (context) => {
				const params = queryParameters(request, ['q', 'limit', 'cursor'])
				return this.assignments.options(context, { ...pageQuery(params), q: queryText(params) })
			},
		)
	}
	/** Grant one registered role with an expected account revision and attributable reason. */
	@Post('assignments/:id/grant')
	@HttpCode(200)
	grant(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Reauthorize inside the shared transaction before the command or receipt replay. */ (
				context,
			) =>
				this.assignments.command(
					context,
					'grant',
					id,
					body,
					accessWriteKey(request, this.origin, this.context.requestId),
					this.context.requestId,
				),
		)
	}
	/** Revoke only the identified grant occurrence, preserving administrator continuity. */
	@Post('assignments/:id/revoke')
	@HttpCode(200)
	revoke(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Delegate revision and occurrence policy to the sole assignment owner. */ (context) =>
				this.assignments.command(
					context,
					'revoke',
					id,
					body,
					accessWriteKey(request, this.origin, this.context.requestId),
					this.context.requestId,
				),
		)
	}
}
