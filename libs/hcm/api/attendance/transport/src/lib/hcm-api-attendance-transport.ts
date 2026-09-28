import {
	Body,
	Controller,
	Get,
	HttpCode,
	Inject,
	Logger,
	Param,
	Patch,
	Post,
	Req,
	Res,
} from '@nestjs/common'
import {
	AttendanceScheduleDrafts,
	AttendanceScheduleQueries,
	AttendanceTemplatePublication,
} from '@empflowyee/hcm-api-attendance-application'
import { parseScheduleVersionQuery } from '@empflowyee/hcm-attendance-contract'
import { invalidField } from '@empflowyee/hcm-runtime-contract'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'

/** Parse only the URL; identity comes exclusively from authenticated runtime context. */
function query(request: RoleRequest): URLSearchParams {
	return new URL(request.originalUrl, 'http://local.invalid').searchParams
}

/** Require an exact version on mutations targeting existing template content. */
function requiredVersion(request: RoleRequest): string {
	const version = parseScheduleVersionQuery(query(request), true)
	if (!version) invalidField('version', 'required')
	return version
}

/** Admitted template endpoints only; this controller cannot publish a live work schedule. */
@Controller('v1/attendance/schedule-templates')
export class ScheduleTemplatesController {
	private readonly logger = new Logger(ScheduleTemplatesController.name)
	/** Compose verified request authority and application services without database access. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(AttendanceScheduleDrafts) private readonly drafts: AttendanceScheduleDrafts,
		@Inject(AttendanceScheduleQueries) private readonly reads: AttendanceScheduleQueries,
		@Inject(AttendanceTemplatePublication)
		private readonly lifecycle: AttendanceTemplatePublication,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}

	/** Enforce existing origin/media/idempotency protections and only the declared version query. */
	private write<T>(
		request: RoleRequest,
		response: RoleResponse,
		versioned: boolean,
		work: (context: AuthenticatedHcmContext, key: string) => Promise<T>,
	): Promise<T> {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Authenticate and validate headers before invoking a domain command. */ (context) =>
				work(
					context,
					accessWriteKey(
						request,
						this.origin,
						this.context.requestId,
						'json',
						versioned ? ['version'] : [],
					),
				),
		)
	}

	/** Read latest versions with fresh grant and cursor checks. */
	@Get()
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Load authorized configurations without cacheable tenant data. */ (context) =>
				this.reads.list(context, 'Templates', query(request)),
		)
	}

	/** Read an incomplete draft proposal before the parameterized root route is considered. */
	@Get('defaults')
	defaults(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Require the same current read authority as the template catalogue. */ (context) =>
				this.reads.defaults(context, query(request)),
		)
	}

	/** Read an exact version or the latest when GET omits the selector. */
	@Get(':id')
	detail(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Hide foreign and wrong-family roots through the source query. */ (context) =>
				this.reads.detail(context, 'Templates', id, query(request)),
		)
	}

	/** Create a Draft template from the closed contract. */
	@Post()
	create(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			false,
			/** Create without implicit publication. */ (context, key) =>
				this.drafts.create(context, 'Templates', key, body),
		)
	}

	/** Replace exactly one mutable Draft revision. */
	@Patch(':id')
	update(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			true,
			/** Never silently choose the latest Draft on a mutation. */ (context, key) =>
				this.drafts.update(context, 'Templates', id, requiredVersion(request), key, body),
		)
	}

	/** Create a successor Draft from its explicitly named immutable source. */
	@Post(':id/versions')
	version(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			false,
			/** Preserve lineage without changing published content. */ (context, key) =>
				this.drafts.newVersion(context, 'Templates', id, key, body),
		)
	}

	/** Persist a reusable-pattern preview with zero live-assignment impact. */
	@Post(':id/preview')
	@HttpCode(200)
	preview(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			true,
			/** Bind review to this actor and exact source revision. */ (context, key) =>
				this.lifecycle.preview(context, id, requiredVersion(request), key, body),
		)
	}

	/** Publish only from current evidence and separate publication permission. */
	@Post(':id/publish')
	@HttpCode(200)
	publish(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			true,
			/** Consume reviewed evidence atomically with publication. */ (context, key) =>
				this.lifecycle.publish(context, id, requiredVersion(request), key, body),
		)
	}

	/** Copy a reusable template into an independent ordinary Draft. */
	@Post(':id/copy')
	copy(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			false,
			/** Require the Published source version in the body. */ (context, key) =>
				this.drafts.copyTemplate(context, id, key, body),
		)
	}

	/** Remove future reuse without altering copies or publication history. */
	@Post(':id/retire')
	@HttpCode(200)
	retire(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			true,
			/** Retain encrypted reason and current source evidence. */ (context, key) =>
				this.lifecycle.retire(context, id, requiredVersion(request), key, body),
		)
	}
}
