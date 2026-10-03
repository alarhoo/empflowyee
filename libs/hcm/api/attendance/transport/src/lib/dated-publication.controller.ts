import { invalidField } from '@empflowyee/hcm-runtime-contract'
import {
	Body,
	Get,
	Controller,
	HttpCode,
	Inject,
	Logger,
	Param,
	Post,
	Req,
	Res,
} from '@nestjs/common'
import { AttendanceDatedPublication } from '@empflowyee/hcm-api-attendance-application'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'

/** Map matched resource routes to the closed dated source family. */
function family(request: RoleRequest): 'Schedule' | 'Shift' {
	return /\/attendance\/shifts(?:\/|$)/.test(
		new URL(request.originalUrl, 'http://local.invalid').pathname,
	)
		? 'Shift'
		: 'Schedule'
}

/** Expose durable dated-source review while leaving assignment and workday production explicit. */
@Controller(['v1/attendance/work-schedules', 'v1/attendance/shifts'])
export class DatedPublicationController {
	private readonly logger = new Logger(DatedPublicationController.name)
	/** Compose source publication with existing authenticated same-origin request protections. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(AttendanceDatedPublication) private readonly lifecycle: AttendanceDatedPublication,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}
	/** Admit only closed mutation URLs with the original stable idempotency key. */
	private write<T>(
		request: RoleRequest,
		response: RoleResponse,
		work: (context: AuthenticatedHcmContext, key: string) => Promise<T>,
	): Promise<T> {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Derive identity from the trusted runtime rather than command fields. */ (context) =>
				work(context, accessWriteKey(request, this.origin, this.context.requestId, 'json', [])),
		)
	}
	/** Admit a dated Draft review with explicit employment and current policy/calendar inputs. */
	@Post(':id/versions/:version/preview')
	@HttpCode(200)
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
			/** Bind the durable review to the exact source revision and validation employment. */ (
				context,
				key,
			) => this.lifecycle.preview(context, family(request), id, version, key, body),
		)
	}
	/** Publish reviewed schedule or shift content while leaving dated assignments explicit. */
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
			/** Consume current source evidence and keep audit, reason and receipt atomic. */ (
				context,
				key,
			) => this.lifecycle.publish(context, family(request), id, version, key, body),
		)
	}
	/** Retire the exact published version while preserving its immutable historical payload. */
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
			/** Require independent retirement permission and expected source revision. */ (
				context,
				key,
			) => this.lifecycle.retire(context, family(request), id, version, key, body),
		)
	}
	/** Read the exact actor-bound durable preview without scheduling or mutating work. */
	@Get(':id/versions/:version/previews/:preview')
	read(
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
			/** Preserve current read authority and exact source identity on every poll. */ (context) => {
				if (new URL(request.originalUrl, 'http://local.invalid').search) invalidField('query')
				return this.lifecycle.read(context, family(request), id, version, preview)
			},
		)
	}
}
