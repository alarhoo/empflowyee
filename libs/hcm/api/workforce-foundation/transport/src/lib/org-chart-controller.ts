import { Controller, Get, Inject, Logger, Param, Req, Res } from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { OrgChart } from '@empflowyee/hcm-api-workforce-foundation-application'
import {
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'

/** Parse the query string of the verified request URL. */
function query(request: RoleRequest): URLSearchParams {
	return new URL(request.originalUrl, 'http://local.invalid').searchParams
}

/** Read-only org chart; there are no mutation routes. */
@Controller('v1/workforce-foundation/org-chart')
export class OrgChartController {
	private readonly logger = new Logger(OrgChartController.name)
	/** Compose verified tenant context with the org chart use cases. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(OrgChart) private readonly chart: OrgChart,
	) {}

	/** Root nodes. */
	@Get('roots')
	roots(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Page roots. */ (context) => this.chart.roots(context, query(request)),
		)
	}

	/** Search by name or worker number prefix. */
	@Get('search')
	search(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Search. */ (context) => this.chart.search(context, query(request)),
		)
	}

	/** One node. */
	@Get('nodes/:assignmentId')
	node(
		@Param('assignmentId') assignmentId: string,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Read one node. */ (context) => this.chart.node(context, assignmentId),
		)
	}

	/** Direct reports of a node. */
	@Get('nodes/:assignmentId/reports')
	reports(
		@Param('assignmentId') assignmentId: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Page reports. */ (context) => this.chart.reports(context, assignmentId, query(request)),
		)
	}

	/** Ancestor path of a node. */
	@Get('nodes/:assignmentId/path')
	path(
		@Param('assignmentId') assignmentId: string,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Resolve the path. */ (context) => this.chart.path(context, assignmentId),
		)
	}
}
