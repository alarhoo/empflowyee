import { Body, Controller, HttpCode, Inject, Logger, Param, Post, Req, Res } from '@nestjs/common'
import { AttendancePolicyPublication } from '@empflowyee/hcm-api-attendance-application'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'

/** Expose policy-rule review separately from workday impact and dated assignment commands. */
@Controller('v1/attendance/policies')
export class PolicyPublicationController {
	private readonly logger = new Logger(PolicyPublicationController.name)
	/** Compose source publication with existing authenticated same-origin request protections. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(AttendancePolicyPublication) private readonly lifecycle: AttendancePolicyPublication,
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
	/** Review complete explicit rules of a currently unassigned Draft policy. */
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
			/** Bind policy rule review to source revision and actor without creating a schedule. */ (
				context,
				key,
			) => this.lifecycle.preview(context, id, version, key, body),
		)
	}
	/** Publish the reviewed immutable policy while leaving dated assignments explicit. */
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
			) => this.lifecycle.publish(context, id, version, key, body),
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
			) => this.lifecycle.retire(context, id, version, key, body),
		)
	}
}
