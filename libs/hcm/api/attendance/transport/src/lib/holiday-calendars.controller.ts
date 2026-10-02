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
	AttendanceHolidayDrafts,
	AttendanceHolidayPublication,
	AttendanceHolidayReferences,
	AttendanceHolidayQueries,
} from '@empflowyee/hcm-api-attendance-application'
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

/** Calendar curation endpoints; publication and assignment require their own impact implementation. */
@Controller('v1/attendance/holiday-calendars')
export class HolidayCalendarsController {
	private readonly logger = new Logger(HolidayCalendarsController.name)
	/** Retire an exact published version without editing historical holidays. */
	@Post(':id/versions/:version/retire')
	@HttpCode(200)
	retire(
		@Param('id') id: string,
		@Param('version') version: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Retain the original retry key and independently checked authority. */ (context, key) =>
				this.drafts.retire(context, id, version, key, body),
		)
	}
	/** Compose verified request context and owner application services without accessing SQL. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(AttendanceHolidayDrafts) private readonly drafts: AttendanceHolidayDrafts,
		@Inject(AttendanceHolidayQueries) private readonly reads: AttendanceHolidayQueries,
		@Inject(AttendanceHolidayPublication)
		private readonly publication: AttendanceHolidayPublication,
		@Inject(AttendanceHolidayReferences) private readonly references: AttendanceHolidayReferences,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}
	/** Search minimal scope choices under the independent calendar manage permission. */
	@Get('assignment-references/:kind')
	assignmentReferences(
		@Param('kind') kind: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Parse closed dated search parameters in the source application. */ (context) =>
				this.references.assignmentReferences(
					context,
					kind,
					new URL(request.originalUrl, 'http://local.invalid').searchParams,
				),
		)
	}
	/** Load distinct employment and assignment choices for one selected worker. */
	@Get('assignment-references/workers/:worker/context')
	assignmentContext(
		@Param('worker') worker: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Retain verified actor identity separately from the selected worker. */ (context) =>
				this.references.assignmentContext(
					context,
					worker,
					new URL(request.originalUrl, 'http://local.invalid').searchParams,
				),
		)
	}
	/** Return minimal reference choices with current calendar operation authorization. */
	@Get('references/:kind')
	options(
		@Param('kind') kind: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Validate the closed dated search before selecting owner references. */ (context) =>
				this.references.options(
					context,
					kind,
					new URL(request.originalUrl, 'http://local.invalid').searchParams,
				),
		)
	}
	/** Return distinct employments without an Employee Changes permission dependency. */
	@Get('references/workers/:worker/employments')
	employmentOptions(
		@Param('worker') worker: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Keep worker identity separate from verified actor identity. */ (context) =>
				this.references.employments(
					context,
					worker,
					new URL(request.originalUrl, 'http://local.invalid').searchParams,
				),
		)
	}
	/** Return accepted durable work; Running is not a successful publication review. */
	@Post(':id/versions/:version/preview')
	@HttpCode(202)
	preview(
		@Param('id') id: string,
		@Param('version') version: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Retain the producer's original command key. */ (context, key) =>
				this.publication.preview(context, id, version, key, body),
		)
	}
	/** Read actor-bound progress after durable validation without exposing another actor's context. */
	@Get(':id/versions/:version/previews/:preview')
	previewStatus(
		@Param('id') id: string,
		@Param('version') version: string,
		@Param('preview') preview: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Reject competing selectors before reading source evidence. */ (context) => {
				for (const field of new URL(
					request.originalUrl,
					'http://local.invalid',
				).searchParams.keys())
					invalidField(field, 'unknown')
				return this.publication.read(context, id, version, preview)
			},
		)
	}
	/** Freeze only an exact draft whose completed context review remains current. */
	@Post(':id/versions/:version/publish')
	@HttpCode(200)
	publish(
		@Param('id') id: string,
		@Param('version') version: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Preserve original key for an uncertain publication response. */ (context, key) =>
				this.publication.publish(context, id, version, key, body),
		)
	}
	/** Enforce same-origin, media and idempotency contracts; all calendar writes reject query keys. */
	private write<T>(
		request: RoleRequest,
		response: RoleResponse,
		work: (context: AuthenticatedHcmContext, key: string) => Promise<T>,
	): Promise<T> {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Resolve current session before invoking a validated command. */ (context) =>
				work(context, accessWriteKey(request, this.origin, this.context.requestId)),
		)
	}
	/** Return latest versions with server-controlled continuation and fresh authorization. */
	@Get()
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Keep route parameters separate from verified identity. */ (context) =>
				this.reads.list(context, new URL(request.originalUrl, 'http://local.invalid').searchParams),
		)
	}
	/** Read the exact declared root/version path without a competing query selector. */
	@Get(':id/versions/:version')
	detail(
		@Param('id') id: string,
		@Param('version') version: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Reject unknown input before the current-authority read. */ (context) => {
				for (const field of new URL(
					request.originalUrl,
					'http://local.invalid',
				).searchParams.keys())
					invalidField(field, 'unknown')
				return this.drafts.read(context, id, version)
			},
		)
	}
	/** Create a calendar draft without manufacturing observed dates, publication or assignments. */
	@Post()
	create(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Preserve the command key for atomic receipt recovery. */ (context, key) =>
				this.drafts.create(context, key, body),
		)
	}
	/** Replace only the explicitly selected draft revision. */
	@Patch(':id/versions/:version')
	update(
		@Param('id') id: string,
		@Param('version') version: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Never substitute another latest version. */ (context, key) =>
				this.drafts.update(context, id, version, key, body),
		)
	}
	/** Create an independently editable successor of an immutable source version. */
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
			/** Keep source identity and private reason in the declared body. */ (context, key) =>
				this.drafts.newVersion(context, id, key, body),
		)
	}
}
