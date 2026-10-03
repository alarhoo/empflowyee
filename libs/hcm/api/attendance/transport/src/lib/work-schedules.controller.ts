import { Body, Controller, Get, Inject, Logger, Param, Patch, Post, Req, Res } from '@nestjs/common'
import {
	AttendanceScheduleDrafts,
	AttendanceScheduleQueries,
	AttendanceWorkReferences,
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

/** Compose ordinary schedules over the existing typed schedule owner; templates retain their separate authority. */
@Controller('v1/attendance/work-schedules')
export class WorkSchedulesController {
	private readonly logger = new Logger(WorkSchedulesController.name)
	/** Reuse schedule use cases and authenticated transport without duplicating business storage. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(AttendanceScheduleDrafts) private readonly drafts: AttendanceScheduleDrafts,
		@Inject(AttendanceScheduleQueries) private readonly reads: AttendanceScheduleQueries,
		@Inject(AttendanceWorkReferences) private readonly references: AttendanceWorkReferences,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}
	/** Search minimal dated selectors under this app's own current read grant. */
	@Get('references/:kind')
	referenceOptions(
		@Param('kind') kind: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Parse the closed bounded search in the owning use case. */ (context) =>
				this.references.options(
					context,
					kind,
					new URL(request.originalUrl, 'http://local.invalid').searchParams,
				),
		)
	}
	/** Keep employment identity explicit without exposing private HR changes. */
	@Get('references/workers/:worker/context')
	referenceContext(
		@Param('worker') worker: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Retain the authenticated actor separately from the selected worker. */ (context) =>
				this.references.context(
					context,
					worker,
					new URL(request.originalUrl, 'http://local.invalid').searchParams,
				),
		)
	}
	/** Require the original retry key, same-origin media checks and an empty mutation query. */
	private write<T>(
		request: RoleRequest,
		response: RoleResponse,
		work: (context: AuthenticatedHcmContext, key: string) => Promise<T>,
	): Promise<T> {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Use only runtime-authenticated account/tenant facts. */ (context) =>
				work(context, accessWriteKey(request, this.origin, this.context.requestId, 'json', [])),
		)
	}
	/** Read latest ordinary schedule versions using server-owned filtering and continuation. */
	@Get()
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Preserve the existing schedule/template family boundary. */ (context) =>
				this.reads.list(
					context,
					'Schedules',
					new URL(request.originalUrl, 'http://local.invalid').searchParams,
				),
		)
	}
	/** Read the incomplete canonical proposal under ordinary schedule read authority. */
	@Get('defaults')
	defaults(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Reuse persisted seed proposals without inventing break placement or timezone. */ (
				context,
			) =>
				this.reads.defaults(
					context,
					new URL(request.originalUrl, 'http://local.invalid').searchParams,
					'Schedules',
				),
		)
	}
	/** Read an exact schedule version while keeping foreign/template identities hidden. */
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
			/** Translate the exact path selector to the existing closed query use case. */ (context) => {
				for (const field of new URL(
					request.originalUrl,
					'http://local.invalid',
				).searchParams.keys())
					invalidField(field, 'unknown')
				return this.reads.detail(context, 'Schedules', id, new URLSearchParams({ version }))
			},
		)
	}
	/** Create a complete ordinary Draft without publication or assignment side effects. */
	@Post()
	create(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Reject isTemplate=true at the source application boundary. */ (context, key) =>
				this.drafts.create(context, 'Schedules', key, body),
		)
	}
	/** Replace exactly the requested editable version. */
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
			/** Retain atomic optimistic concurrency and encrypted command receipts. */ (context, key) =>
				this.drafts.update(context, 'Schedules', id, version, key, body),
		)
	}
	/** Create a successor Draft while retaining immutable Published source history. */
	@Post(':id/versions')
	newVersion(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Version only the exact source and expected revision declared by the caller. */ (
				context,
				key,
			) => this.drafts.newVersion(context, 'Schedules', id, key, body),
		)
	}
}
