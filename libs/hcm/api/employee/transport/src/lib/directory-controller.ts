import { Controller, Get, Inject, Logger, Param, Req, Res } from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { EmployeeDirectory } from '@empflowyee/hcm-api-employee-application'
import {
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { query } from './request'

/** Employee Directory: read-only, Organization-visible fields of the current workforce. */
@Controller('v1/employee/directory')
export class DirectoryController {
	private readonly logger = new Logger(DirectoryController.name)
	/** Compose verified tenant context with the directory use cases. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(EmployeeDirectory) private readonly directory: EmployeeDirectory,
	) {}

	/** One page of colleagues. */
	@Get()
	search(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Search. */ (context) => this.directory.search(context, query(request)),
		)
	}

	/** Filter options of a structure kind. */
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
			/** Read options. */ (context) => this.directory.options(context, kind, query(request)),
		)
	}

	/** One colleague. */
	@Get(':workerId')
	person(@Param('workerId') workerId: string, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Read one entry. */ (context) => this.directory.person(context, workerId),
		)
	}

	/** One page of a colleague's direct reports. */
	@Get(':workerId/reports')
	reports(
		@Param('workerId') workerId: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Page reports. */ (context) => this.directory.reports(context, workerId, query(request)),
		)
	}
}
