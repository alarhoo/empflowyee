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
	HttpException,
	HttpCode,
	Logger,
} from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import {
	HcmRuntimeError,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import { RoleManagement, HcmAccessError } from '@empflowyee/hcm-api-access-control-application'
import {
	RoleError,
	type RoleQuery,
	type PermissionKind,
} from '@empflowyee/hcm-access-control-contract'
export const HCM_ROLE_WRITE_ORIGIN = Symbol('HCM_ROLE_WRITE_ORIGIN')
interface RoleRequest {
	originalUrl: string
	headers: Record<string, string | string[] | undefined>
}
interface RoleResponse {
	setHeader(name: string, value: string): void
}

/** Reject unknown and duplicate parameters before converting bounded list query values. */
function queryParameters(request: RoleRequest, allowed: string[]): URLSearchParams {
	const query = new URL(request.originalUrl, 'http://local.invalid').searchParams
	for (const key of query.keys())
		if (!allowed.includes(key) || query.getAll(key).length !== 1)
			throw new RoleError('invalid-request')
	return query
}
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
	/** Reject cross-origin, missing-origin, non-JSON and duplicate/unknown mutation query input. */
	private writeKey(request: RoleRequest): string {
		queryParameters(request, [])
		if (
			!this.origin ||
			request.headers['origin'] !== this.origin ||
			(request.headers['sec-fetch-site'] !== undefined &&
				request.headers['sec-fetch-site'] !== 'same-origin')
		)
			throw new HcmAccessError('forbidden')
		if (
			typeof request.headers['content-type'] !== 'string' ||
			!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'])
		)
			throw new HttpException(
				{ code: 'unsupported-media-type', requestId: this.context.requestId },
				415,
			)
		const key = request.headers['idempotency-key']
		if (typeof key !== 'string') throw new RoleError('invalid-request')
		return key
	}
	/** Resolve server authority, prevent caching and sanitize failures without leaking SQL or payloads. */
	private async run<T>(
		response: RoleResponse,
		work: (context: AuthenticatedHcmContext) => Promise<T>,
	): Promise<T> {
		response.setHeader('Cache-Control', 'no-store')
		response.setHeader('X-Request-ID', this.context.requestId)
		try {
			return await work(await this.context.authenticated())
		} catch (error) {
			if (error instanceof HttpException) throw error
			const code =
				error instanceof RoleError ||
				error instanceof HcmAccessError ||
				error instanceof HcmRuntimeError
					? error.code
					: 'runtime-unavailable'
			const statuses: Record<string, number> = {
				'invalid-request': 400,
				unauthenticated: 401,
				forbidden: 403,
				'not-found': 404,
				'tenant-not-found': 404,
				'tenant-suspended': 423,
				'runtime-unavailable': 503,
			}
			const status = statuses[code] ?? 409
			if (status === 503) this.logger.error({ code, requestId: this.context.requestId })
			throw new HttpException({ code, requestId: this.context.requestId }, status)
		}
	}
}
