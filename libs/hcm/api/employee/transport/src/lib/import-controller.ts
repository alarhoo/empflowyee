import type { IncomingMessage } from 'node:http'
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
	StreamableFile,
} from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import { EmployeeImport } from '@empflowyee/hcm-api-employee-application'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	HCM_ROLE_WRITE_ORIGIN,
	accessWriteKey,
	queryParameters,
	runAccessRequest,
	type RoleRequest,
	type RoleResponse,
} from '@empflowyee/hcm-api-access-control-transport'
import { importMultipart } from './import-multipart'
import { query } from './request'

/** Employee Import: versioned templates and validated, resolved, per-row committed runs. */
@Controller('v1/employee/import')
export class EmployeeImportController {
	private readonly logger = new Logger(EmployeeImportController.name)
	/** Compose verified tenant context with the import use cases. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(EmployeeImport) private readonly imports: EmployeeImport,
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
		media: 'json' | 'multipart' = 'json',
	) {
		return runAccessRequest(
			this.context,
			this.logger,
			response,
			/** Validate browser write headers before the owning command. */ (context) =>
				work(
					context,
					accessWriteKey(request, this.origin, this.context.requestId, media),
					this.context.requestId,
				),
		)
	}

	/** Page the templates. */
	@Get('templates')
	templates(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** Page the templates. */ (context) => this.imports.templates(context, query(request)),
		)
	}

	/** Read one template. */
	@Get('templates/:id')
	template(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.read(
			response,
			/** Read one template. */ (context) => {
				queryParameters(request, [])
				return this.imports.template(context, id)
			},
		)
	}

	/** Create a draft template. */
	@Post('templates')
	createTemplate(
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Create a draft template. */ (context, key, requestId) =>
				this.imports.createTemplate(context, body, key, requestId),
		)
	}

	/** Replace a draft template. */
	@Put('templates/:id')
	updateTemplate(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Replace a draft template. */ (context, key, requestId) =>
				this.imports.updateTemplate(context, id, body, key, requestId),
		)
	}

	/** Publish a draft template. */
	@Post('templates/:id/publish')
	@HttpCode(200)
	publishTemplate(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Publish a draft template. */ (context, key, requestId) =>
				this.imports.publishTemplate(context, id, body, key, requestId),
		)
	}

	/** Start the next draft version of a template. */
	@Post('templates/:id/versions')
	newTemplateVersion(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Start the next draft version. */ (context, key, requestId) =>
				this.imports.newTemplateVersion(context, id, body, key, requestId),
		)
	}

	/** Page the runs. */
	@Get('runs')
	runs(@Req() request: RoleRequest, @Res({ passthrough: true }) response: RoleResponse) {
		return this.read(
			response,
			/** Page the runs. */ (context) => this.imports.runs(context, query(request)),
		)
	}

	/** Upload a source file: metadata first, then the file. */
	@Post('runs')
	createRun(
		@Req() request: RoleRequest & IncomingMessage,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Parse the bounded upload, then stage and record the run. */ async (
				context,
				key,
				requestId,
			) => {
				const upload = await importMultipart(request)
				return this.imports.createRun(
					context,
					upload.metadata,
					upload.fileName,
					upload.bytes,
					key,
					requestId,
				)
			},
			'multipart',
		)
	}

	/** Read one run. */
	@Get('runs/:id')
	run(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.read(
			response,
			/** Read one run. */ (context) => {
				queryParameters(request, [])
				return this.imports.run(context, id)
			},
		)
	}

	/** Page a run's rows. */
	@Get('runs/:id/rows')
	rows(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.read(
			response,
			/** Page a run's rows. */ (context) => this.imports.rows(context, id, query(request)),
		)
	}

	/** Download the safe issue report as CSV. */
	@Get('runs/:id/issues.csv')
	report(
		@Param('id') id: string,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.read(
			response,
			/** Build and audit the report. */ async (context) => {
				queryParameters(request, [])
				const report = await this.imports.report(context, id, this.context.requestId)
				response.setHeader('Cache-Control', 'no-store')
				return new StreamableFile(Buffer.from(report.csv, 'utf8'), {
					type: 'text/csv; charset=utf-8',
					disposition: `attachment; filename="${report.fileName}"`,
				})
			},
		)
	}

	/** Validate an uploaded run. */
	@Post('runs/:id/validate')
	@HttpCode(200)
	validate(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Validate the run. */ (context, key, requestId) =>
				this.imports.validate(context, id, body, key, requestId),
		)
	}

	/** Resolve one matched row. */
	@Post('runs/:id/rows/:rowId/resolve')
	@HttpCode(200)
	resolve(
		@Param('id') id: string,
		@Param('rowId') rowId: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Resolve the row. */ (context, key, requestId) =>
				this.imports.resolve(context, id, rowId, body, key, requestId),
		)
	}

	/** Commit a validated run. */
	@Post('runs/:id/commit')
	@HttpCode(200)
	commit(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Commit the run. */ (context, key, requestId) =>
				this.imports.commit(context, id, body, key, requestId),
		)
	}

	/** Cancel a run before commit. */
	@Post('runs/:id/cancel')
	@HttpCode(200)
	cancel(
		@Param('id') id: string,
		@Body() body: unknown,
		@Req() request: RoleRequest,
		@Res({ passthrough: true }) response: RoleResponse,
	) {
		return this.write(
			request,
			response,
			/** Cancel the run. */ (context, key, requestId) =>
				this.imports.cancel(context, id, body, key, requestId),
		)
	}
}
