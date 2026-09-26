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
import { JobCatalogue } from '@empflowyee/hcm-api-job-architecture-application'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { query } from './request'

/** Job Catalogue: versioned catalogue maintenance and job profiles (tenant configuration). */
@Controller('v1/job-architecture')
export class JobCatalogueController {
	private readonly logger = new Logger(JobCatalogueController.name)
	/** Compose verified tenant context with the catalogue use cases. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(JobCatalogue) private readonly catalogue: JobCatalogue,
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

	/** The tenant's catalogue with its versions. */
	@Get('catalogues')
	catalogues(@Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** Read the catalogue. */ (context) => this.catalogue.catalogues(context),
		)
	}

	/** One catalogue version. */
	@Get('catalogue-versions/:id')
	version(@Param('id') id: string, @Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** Read the version. */ (context) => this.catalogue.version(context, id),
		)
	}

	/** Families of a version under one parent. */
	@Get('catalogue-versions/:id/families')
	families(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.read(
			response,
			/** Page the families. */ (context) => this.catalogue.families(context, id, query(request)),
		)
	}

	/** Create a draft successor of the published version. */
	@Post('catalogues/:id/versions')
	createVersion(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Create the draft. */ (context, key, requestId) =>
				this.catalogue.createVersion(context, id, body, key, requestId),
		)
	}

	/** Submit a draft version for review. */
	@Post('catalogue-versions/:id/submit')
	@HttpCode(200)
	submitVersion(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Submit the version. */ (context, key, requestId) =>
				this.catalogue.submitVersion(context, id, body, key, requestId),
		)
	}

	/** Publish a reviewed version. */
	@Post('catalogue-versions/:id/publish')
	@HttpCode(200)
	publishVersion(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Publish the version. */ (context, key, requestId) =>
				this.catalogue.publishVersion(context, id, body, key, requestId),
		)
	}

	/** Add an element to a draft version. */
	@Post('catalogue-versions/:id/:elementKind')
	addElement(
		@Param('id') id: string,
		@Param('elementKind') kind: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Add the element. */ (context, key, requestId) =>
				this.catalogue.addElement(context, id, kind, body, key, requestId),
		)
	}

	/** Edit, retire or reactivate an element of a draft version. */
	@Put('catalogue-versions/:id/:elementKind/:elementId')
	updateElement(
		@Param('id') id: string,
		@Param('elementKind') kind: string,
		@Param('elementId') elementId: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Update the element. */ (context, key, requestId) =>
				this.catalogue.updateElement(context, id, kind, elementId, body, key, requestId),
		)
	}

	/** Job profiles. */
	@Get('profiles')
	profiles(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** Page the profiles. */ (context) => this.catalogue.profiles(context, query(request)),
		)
	}

	/** Create a job profile with its first draft version. */
	@Post('profiles')
	createProfile(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Create the profile. */ (context, key, requestId) =>
				this.catalogue.createProfile(context, body, key, requestId),
		)
	}

	/** Create a draft successor of a profile version. */
	@Post('profiles/:id/versions')
	createProfileVersion(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Create the draft. */ (context, key, requestId) =>
				this.catalogue.createProfileVersion(context, id, body, key, requestId),
		)
	}

	/** One profile version. */
	@Get('profile-versions/:id')
	profileVersion(@Param('id') id: string, @Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** Read the profile version. */ (context) => this.catalogue.profileVersion(context, id),
		)
	}

	/** Replace a draft profile version's content. */
	@Put('profile-versions/:id')
	updateProfileVersion(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Replace the draft. */ (context, key, requestId) =>
				this.catalogue.updateProfileVersion(context, id, body, key, requestId),
		)
	}

	/** Submit a draft profile version for review. */
	@Post('profile-versions/:id/submit')
	@HttpCode(200)
	submitProfileVersion(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Submit the profile version. */ (context, key, requestId) =>
				this.catalogue.submitProfileVersion(context, id, body, key, requestId),
		)
	}

	/** Publish a reviewed profile version. */
	@Post('profile-versions/:id/publish')
	@HttpCode(200)
	publishProfileVersion(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Publish the profile version. */ (context, key, requestId) =>
				this.catalogue.publishProfileVersion(context, id, body, key, requestId),
		)
	}
}
