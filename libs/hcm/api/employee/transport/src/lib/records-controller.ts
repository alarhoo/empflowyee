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
import { EmployeeRecords } from '@empflowyee/hcm-api-employee-application'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { query } from './request'

/** Employee Records: tenant-wide worker records, corrections, emergency reveal, creation and merge. */
@Controller('v1/employee/records')
export class EmployeeRecordsController {
	private readonly logger = new Logger(EmployeeRecordsController.name)
	/** Compose verified tenant context with the records use cases. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(EmployeeRecords) private readonly records: EmployeeRecords,
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

	/** Page the records. */
	@Get('')
	list(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		void request
		return this.read(
			response,
			/** Page the records. */ (context) => this.records.list(context, query(request)),
		)
	}

	/** Page one option kind. */
	@Get('options/:kind')
	options(
		@Param('kind') kind: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		void request
		return this.read(
			response,
			/** Page one option kind. */ (context) => this.records.options(context, kind, query(request)),
		)
	}

	/** Read one record. */
	@Get(':workerId')
	detail(
		@Param('workerId') workerId: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		void request
		return this.read(
			response,
			/** Read one record. */ (context) => this.records.detail(context, workerId),
		)
	}

	/** Page worker events. */
	@Get(':workerId/events')
	events(
		@Param('workerId') workerId: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		void request
		return this.read(
			response,
			/** Page worker events. */ (context) =>
				this.records.events(context, workerId, query(request)),
		)
	}

	/** Find duplicate candidates. */
	@Post('duplicate-check')
	@HttpCode(200)
	duplicateCheck(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Find duplicate candidates. */ (context) => this.records.duplicateCheck(context, body),
		)
	}

	/** Create a worker. */
	@Post('')
	create(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Create a worker. */ (context, key, requestId) =>
				this.records.create(context, body, key, requestId),
		)
	}

	/** Correct person facts. */
	@Put(':workerId/person')
	correctPerson(
		@Param('workerId') workerId: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Correct person facts. */ (context, key, requestId) =>
				this.records.correctPerson(context, workerId, body, key, requestId),
		)
	}

	/** Reveal emergency information for a purpose. */
	@Post(':workerId/emergency-reveal')
	@HttpCode(200)
	reveal(
		@Param('workerId') workerId: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Reveal emergency information for a purpose. */ (context, key, requestId) =>
				this.records.revealEmergency(context, workerId, body, requestId),
		)
	}

	/** Merge a duplicate into a survivor. */
	@Post(':workerId/merge')
	@HttpCode(200)
	merge(
		@Param('workerId') workerId: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Merge a duplicate into a survivor. */ (context, key, requestId) =>
				this.records.merge(context, workerId, body, key, requestId),
		)
	}

	/** Add a collection item. */
	@Post(':workerId/:collection')
	addItem(
		@Param('workerId') workerId: string,
		@Param('collection') collection: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Add a collection item. */ (context, key, requestId) =>
				this.records.addItem(context, workerId, collection, body, key, requestId),
		)
	}

	/** Change a collection item. */
	@Put(':workerId/:collection/:itemId')
	updateItem(
		@Param('workerId') workerId: string,
		@Param('collection') collection: string,
		@Param('itemId') itemId: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Change a collection item. */ (context, key, requestId) =>
				this.records.updateItem(context, workerId, collection, itemId, body, key, requestId),
		)
	}
}
