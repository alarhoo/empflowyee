import {
	Body,
	Controller,
	Get,
	HttpCode,
	Inject,
	Logger,
	Param,
	Post,
	Put,
	Req,
	Res,
} from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { MyProfile } from '@empflowyee/hcm-api-employee-application'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { query } from './request'

/** My Profile: the verified account's own record; no subject id is ever accepted. */
@Controller('v1/employee/me/profile')
export class MyProfileController {
	private readonly logger = new Logger(MyProfileController.name)
	/** Compose verified tenant context with the self-service use cases. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(MyProfile) private readonly profile: MyProfile,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}

	/** Run a write after origin, media and idempotency-key validation. */
	private write<T>(
		request: RoleRequest,
		response: RoleResponse,
		work: (context: AuthenticatedHcmContext, key: string, requestId: string) => Promise<T>,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Validate browser write headers before the owning command. */ (context) =>
				work(
					context,
					accessWriteKey(request, this.origin, this.context.requestId),
					this.context.requestId,
				),
		)
	}

	/** The own profile. */
	@Get()
	read(@Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Read the own profile. */ (context) => this.profile.read(context),
		)
	}

	/** Relationship type or gender options. */
	@Get('options/:kind')
	options(
		@Param('kind') kind: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Read reference options. */ (context) =>
				this.profile.options(context, kind, query(request)),
		)
	}

	/** Change the preferred name or blood group. */
	@Put('personal')
	personal(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Update personal facts. */ (context, key, id) =>
				this.profile.updatePersonal(context, body, key, id),
		)
	}

	/** Add a personal email or mobile number. */
	@Post('contact-points')
	addContact(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Add the contact point. */ (context, key, id) =>
				this.profile.addContactPoint(context, body, key, id),
		)
	}

	/** Change a contact point. */
	@Put('contact-points/:id')
	updateContact(
		@Param('id') contactId: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Update the contact point. */ (context, key, id) =>
				this.profile.updateContactPoint(context, contactId, body, key, id),
		)
	}

	/** Remove a contact point. */
	@Post('contact-points/:id/deactivate')
	@HttpCode(200)
	deactivateContact(
		@Param('id') contactId: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Deactivate the contact point. */ (context, key, id) =>
				this.profile.deactivateContactPoint(context, contactId, body, key, id),
		)
	}

	/** Add an emergency contact or family member. */
	@Post('relationships')
	addRelationship(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Add the relationship. */ (context, key, id) =>
				this.profile.addRelationship(context, body, key, id),
		)
	}

	/** Change an emergency contact or family member. */
	@Put('relationships/:id')
	updateRelationship(
		@Param('id') relationshipId: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Update the relationship. */ (context, key, id) =>
				this.profile.updateRelationship(context, relationshipId, body, key, id),
		)
	}

	/** Remove an emergency contact or family member. */
	@Post('relationships/:id/deactivate')
	@HttpCode(200)
	deactivateRelationship(
		@Param('id') relationshipId: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Deactivate the relationship. */ (context, key, id) =>
				this.profile.deactivateRelationship(context, relationshipId, body, key, id),
		)
	}

	/** Set or clear a Direct custom value. */
	@Put('custom-fields/:fieldId')
	customValue(
		@Param('fieldId') fieldId: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Record the value. */ (context, key, id) =>
				this.profile.setCustomValue(context, fieldId, body, key, id),
		)
	}

	/** Narrow or reset a field's visibility for the worker. */
	@Put('visibility/:fieldRef')
	visibility(
		@Param('fieldRef') fieldRef: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Replace the preference. */ (context, key, id) =>
				this.profile.setVisibility(context, fieldRef, body, key, id),
		)
	}
}
