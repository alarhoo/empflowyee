import {
	Body,
	Controller,
	Get,
	Post,
	Put,
	Param,
	Req,
	Res,
	Inject,
	HttpCode,
	Logger,
} from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { type AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import { RoleManagement, RoleContext } from '@empflowyee/hcm-api-access-control-application'
import {
	RoleError,
	type RoleQuery,
	type PermissionKind,
} from '@empflowyee/hcm-access-control-contract'
export { HCM_ROLE_WRITE_ORIGIN } from './access-request'
import {
	HCM_ROLE_WRITE_ORIGIN,
	queryParameters,
	accessWriteKey,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from './access-request'
/** Validate route identifiers without allowing arbitrary persistence selectors. */
function roleId(id: string): string {
	if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new RoleError('invalid-request')
	return id
}
@Controller('v1/access-control')
export class RoleManagementController {
	private readonly logger = new Logger(RoleManagementController.name)
	/** Compose request context and authorized use cases; the origin is explicit local configuration. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(RoleManagement) private readonly roles: RoleManagement,
		@Inject(RoleContext) private readonly roleContext: RoleContext,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}
	/** Return a bounded server-filtered role page. */
	@Get('roles')
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return this.run(
			response,
			/** Parse strict list controls before selecting an authorized page. */ (context) => {
				const params = queryParameters(request, ['q', 'systemRole', 'sort', 'limit', 'cursor'])
				const q = params.get('q') ?? '',
					sort = params.get('sort') ?? 'label:asc',
					size = params.get('limit') ?? '25',
					system = params.get('systemRole')
				if (
					q.length > 200 ||
					!['label:asc', 'label:desc'].includes(sort) ||
					!/^[1-9][0-9]{0,2}$/.test(size) ||
					Number(size) > 100 ||
					(system !== null && !['true', 'false'].includes(system)) ||
					(params.has('cursor') && !params.get('cursor'))
				)
					throw new RoleError('invalid-request')
				const query: RoleQuery = {
					q,
					sort: sort as RoleQuery['sort'],
					limit: Number(size),
					...(system !== null ? { systemRole: system === 'true' } : {}),
					...(params.has('cursor') ? { cursor: params.get('cursor') ?? '' } : {}),
				}
				return this.roles.list(context, query)
			},
		)
	}
	/** Return the registered inventory, optionally restricted by its explicit kind. */
	@Get('permissions')
	permissions(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return this.run(
			response,
			/** Keep permission filtering bounded to the approved enum. */ (context) => {
				const kind = queryParameters(request, ['kind']).get('kind')
				if (kind !== null && !['catalogue-discovery', 'business-operation'].includes(kind))
					throw new RoleError('invalid-request')
				return this.roles.permissions(context, (kind as PermissionKind | undefined) ?? undefined)
			},
		)
	}
	/** Load only a role belonging to the resolved tenant. */
	@Get('roles/:id')
	get(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.run(
			response,
			/** Reject hidden filters or tenant overrides. */ (context) => {
				queryParameters(request, [])
				return this.roles.get(context, roleId(id))
			},
		)
	}
	/** Read one assignment-owned assignee page under separate role and assignment authority. */
	@Get('roles/:id/assignees')
	assignees(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.run(
			response,
			/** Pass only validated context controls. */ (context) =>
				this.roleContext.assignees(context, roleId(id), this.contextQuery(request)),
		)
	}
	/** Read actual role events only when audit and role visibility are both authorized. */
	@Get('roles/:id/history')
	history(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.run(
			response,
			/** Keep audit data behind its business permission. */ (context) =>
				this.roleContext.history(context, roleId(id), this.contextQuery(request)),
		)
	}
	/** Bound contextual pages and reject hidden filters and malformed cursor envelopes. */
	private contextQuery(request: RoleRequest) {
		const params = queryParameters(request, ['limit', 'cursor']),
			size = params.get('limit') ?? '25',
			cursor = params.get('cursor')
		if (
			!/^[1-9][0-9]{0,2}$/.test(size) ||
			Number(size) > 100 ||
			(cursor !== null && (!/^[A-Za-z0-9_-]+$/.test(cursor) || cursor.length > 2048))
		)
			throw new RoleError('invalid-request')
		return { limit: Number(size), ...(cursor ? { cursor } : {}) }
	}
	/** Create a custom role through the same protected transaction and receipt boundary. */
	@Post('roles')
	@HttpCode(201)
	create(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.run(
			response,
			/** Validate local write provenance before executing the create command. */ (context) =>
				this.roles.command(
					context,
					'create',
					undefined,
					body,
					this.writeKey(request),
					this.context.requestId,
				),
		)
	}
	/** Require an expected revision for every role replacement. */
	@Put('roles/:id')
	update(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.run(
			response,
			/** Reject system edits and stale versions in the application transaction. */ (context) =>
				this.roles.command(
					context,
					'update',
					roleId(id),
					body,
					this.writeKey(request),
					this.context.requestId,
				),
		)
	}
	/** Delete only a mutable unassigned role, with explicit reason and successful receipt. */
	@Post('roles/:id/delete')
	@HttpCode(200)
	delete(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.run(
			response,
			/** Delegate all mutation invariants to the common role command. */ (context) =>
				this.roles.command(
					context,
					'delete',
					roleId(id),
					body,
					this.writeKey(request),
					this.context.requestId,
				),
		)
	}
	/** Reuse the domain transport's exact write-provenance and idempotency checks. */
	private writeKey(request: RoleRequest): string {
		return accessWriteKey(request, this.origin, this.context.requestId)
	}
	/** Reuse common safe status mapping and freshly verified request authority. */
	private run<T>(
		response: RoleResponse,
		work: (context: AuthenticatedHcmContext) => Promise<T>,
	): Promise<T> {
		return runAccessRequest(this.context, this.logger, response, work)
	}
}
