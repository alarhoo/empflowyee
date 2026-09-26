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
import { ProfileConfiguration } from '@empflowyee/hcm-api-employee-application'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { query } from './request'

/** Employee Profile Configuration: tenant narrowing of the product field policy and custom fields. */
@Controller('v1/employee')
export class ProfileConfigurationController {
	private readonly logger = new Logger(ProfileConfigurationController.name)
	/** Compose verified tenant context with the configuration use cases. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(ProfileConfiguration) private readonly configuration: ProfileConfiguration,
		@Inject(HCM_ROLE_WRITE_ORIGIN) private readonly origin: string | null,
	) {}

	/** Run a read with the shared failure classification. */
	private read<T>(response: RoleResponse, work: (context: AuthenticatedHcmContext) => Promise<T>) {
		return runAccessRequest(this.context, this.logger, response, work)
	}

	/** Run a write after origin, media and idempotency-key validation. */
	private write<T>(
		request: RoleRequest,
		response: RoleResponse,
		work: (context: AuthenticatedHcmContext, key: string) => Promise<T>,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Validate browser write headers before the owning command. */ (context) =>
				work(context, accessWriteKey(request, this.origin, this.context.requestId)),
		)
	}

	/** List standard and custom fields. */
	@Get('profile-fields')
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** Read the catalogue. */ (context) => this.configuration.list(context, query(request)),
		)
	}

	/** Read one field with its tenant policy and preview. */
	@Get('profile-fields/:fieldRef')
	detail(@Param('fieldRef') fieldRef: string, @Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** Read one field. */ (context) => this.configuration.detail(context, fieldRef),
		)
	}

	/** Narrow the tenant policy of a field. */
	@Put('profile-fields/:fieldRef/tenant-policy/:context')
	setPolicy(
		@Param('fieldRef') fieldRef: string,
		@Param('context') policyContext: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Replace the tenant policy. */ (context, key) =>
				this.configuration.setPolicy(
					context,
					fieldRef,
					policyContext,
					body,
					key,
					this.context.requestId,
				),
		)
	}

	/** Reset a field to the product default. */
	@Post('profile-fields/:fieldRef/tenant-policy/:context/reset')
	@HttpCode(200)
	resetPolicy(
		@Param('fieldRef') fieldRef: string,
		@Param('context') policyContext: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Close the tenant policy. */ (context, key) =>
				this.configuration.resetPolicy(
					context,
					fieldRef,
					policyContext,
					body,
					key,
					this.context.requestId,
				),
		)
	}

	/** Define a custom field. */
	@Post('custom-fields')
	createCustomField(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Create the definition. */ (context, key) =>
				this.configuration.createCustomField(context, body, key, this.context.requestId),
		)
	}

	/** Edit, retire or reactivate a custom field. */
	@Put('custom-fields/:id')
	updateCustomField(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Update the definition. */ (context, key) =>
				this.configuration.updateCustomField(context, id, body, key, this.context.requestId),
		)
	}

	/** Add an option to a select field. */
	@Post('custom-fields/:id/options')
	addOption(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Add the option. */ (context, key) =>
				this.configuration.addOption(context, id, body, key, this.context.requestId),
		)
	}

	/** Edit, retire or reactivate an option. */
	@Put('custom-fields/:id/options/:optionId')
	updateOption(
		@Param('id') id: string,
		@Param('optionId') optionId: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Update the option. */ (context, key) =>
				this.configuration.updateOption(context, id, optionId, body, key, this.context.requestId),
		)
	}
}
