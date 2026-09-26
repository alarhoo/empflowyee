import { Controller, Get, Inject, Logger, Param, Req, Res } from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { TeamDirectory } from '@empflowyee/hcm-api-employee-application'
import {
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { query } from './request'

/** Team Directory: the actor's direct reports with Manager-visible fields; read-only. */
@Controller('v1/employee/team')
export class TeamController {
	private readonly logger = new Logger(TeamController.name)
	/** Compose verified tenant context with the team use cases. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(TeamDirectory) private readonly team: TeamDirectory,
	) {}

	/** One page of the actor's team. */
	@Get()
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Page the team. */ (context) => this.team.list(context, query(request)),
		)
	}

	/** One team member. */
	@Get(':workerId')
	member(@Param('workerId') workerId: string, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Read one member. */ (context) => this.team.member(context, workerId),
		)
	}
}
