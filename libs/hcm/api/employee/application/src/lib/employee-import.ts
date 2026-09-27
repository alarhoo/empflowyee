import { randomUUID } from 'node:crypto'
import {
	IMPORT_FIELDS,
	IMPORT_MAX_ROWS,
	IMPORT_PARSER_VERSION,
	parseCancelRun,
	parseCreateTemplate,
	parseImportRevision,
	parseNewTemplateVersion,
	parsePublishTemplate,
	parseResolveRow,
	parseRowQuery,
	parseRunMetadata,
	parseRunQuery,
	parseTemplateQuery,
	parseUpdateTemplate,
	type ImportRowDto,
	type ImportRowPage,
	type ImportRunDto,
	type ImportRunPage,
	type ImportTemplateDetailDto,
	type ImportTemplatePage,
	type MatchStatus,
	type PersonFactsInput,
} from '@empflowyee/hcm-employee-contract'
import { HcmDomainError, idValue, invalidField } from '@empflowyee/hcm-runtime-contract'
import {
	commandHash,
	runIdempotent,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import {
	ImportSourceError,
	readImportTable,
	type ImportSourceMediaType,
} from '@empflowyee/hcm-api-documents-application'
import {
	headerMismatches,
	needsResolution,
	parseCell,
	proposedAction,
	resolutionAllowed,
	rowDigest,
} from '@empflowyee/hcm-api-employee-domain'
import type { EmployeeUnitOfWork, EmployeeWork } from './employee-unit'
import type {
	ImportColumnRow,
	ImportIssueRow,
	ImportRowRow,
	ImportRunRow,
	ImportTemplateRow,
	NewImportRow,
} from './employee-import-repository'

const READ = 'import.read'
const MANAGE = 'import.manage'
const XLSX: ImportSourceMediaType =
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Safe messages of issue codes; none ever contains a source value. */
const MESSAGES: Record<string, string> = {
	required: 'A value is required to create a worker.',
	'too-long': 'The value is longer than the field allows.',
	'invalid-date': 'The date does not match the template date format.',
	'invalid-email': 'The value is not an email address.',
	'invalid-worker-number':
		'Worker numbers use 2 to 40 upper-case letters, digits, dashes or underscores.',
	'unknown-value': 'The value is not one of the allowed values.',
	'invalid-number': 'The number is outside the allowed range.',
	'unknown-reference': 'No active record has this code.',
	'worker-number-in-use': 'Another worker already has this worker number.',
	'duplicate-in-file': 'An earlier row of this file has the same worker number.',
	'already-exists': 'The match key names an existing worker; use Update or Upsert.',
	'no-match': 'The match key names no existing worker.',
	'ignored-on-update': 'Only person facts change on an update; this column is ignored.',
	'header-mismatch': 'The header does not name this mapped column.',
	'match-key-required': 'Update and Upsert need a mapped match key column.',
	'too-many-rows': 'The file has more than 2,000 data rows.',
	'unsupported-file': 'The file could not be read as the template format.',
	'not-importable': 'The field cannot be imported.',
}

/** A reference resolved from a source code. */
interface Ref {
	id: string
	name: string
}

/** A row's typed values, resolved references and issues. */
interface Evaluated {
	values: Record<string, string | number | null>
	refs: Record<string, Ref | null>
	issues: Omit<ImportIssueRow, 'rowId' | 'rowNumber'>[]
}

/** Resolved reference lists of one command, filled on demand. */
type RefCache = Map<string, Map<string, Ref | null>>

/** The issue of one refused cell. */
function issue(
	fieldCode: string | null,
	column: string | null,
	code: string,
	severity: 'Warning' | 'Error' = 'Error',
): Omit<ImportIssueRow, 'rowId' | 'rowNumber'> {
	return {
		fieldCode,
		sourceColumnName: column,
		severity,
		code,
		message: MESSAGES[code] ?? 'The value is not valid.',
	}
}

/** The safe code of a failed row command. */
function failureCode(error: HcmDomainError): string {
	const field = error.fieldErrors?.[0]
	const code = field ? `${field.code}` : error.code
	return /^[a-z][a-z0-9-]{1,59}$/.test(code) ? code : 'commit-refused'
}

/**
 * Employee Import use cases (Employee Import TDD#API): versioned templates, bounded runs validated
 * without workforce side effects, per-row match resolution (DEC-HCM2-001) and a commit that
 * applies each row in its own savepoint through WorkforceFactsPort. Rows keep digests, not values.
 */
export class EmployeeImport {
	/** Compose the import use cases on the employee unit of work. */
	constructor(private readonly unit: EmployeeUnitOfWork) {}

	/** A page of templates. */
	templates(
		context: AuthenticatedHcmContext,
		params: URLSearchParams,
	): Promise<ImportTemplatePage> {
		const query = parseTemplateQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Page templates. */ (w) => w.imports.templates(query),
		)
	}

	/** One template with its columns. */
	template(context: AuthenticatedHcmContext, id: string): Promise<ImportTemplateDetailDto> {
		idValue(id, 'id')
		return this.unit.execute(context, READ, false, /** Read. */ (w) => this.templateDetail(w, id))
	}

	/** Create the first draft version of a template code. */
	createTemplate(
		context: AuthenticatedHcmContext,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ImportTemplateDetailDto> {
		const command = parseCreateTemplate(body)
		return this.command(
			context,
			'template.create',
			command,
			key,
			/** Create. */ async (w) => {
				const versions = await w.imports.versions(command.code)
				if (versions.latestId) invalidField('code', 'duplicate')
				const id = await w.imports.insertTemplate({
					...command,
					versionNumber: 1,
					supersedesId: null,
				})
				await w.imports.replaceColumns(id, command.columns)
				await this.audit(
					w,
					'employee.import-template-created',
					'import-template',
					id,
					requestId,
					command.reason,
					null,
					'Draft',
				)
				return this.templateDetail(w, id)
			},
		)
	}

	/** Replace a draft template's facts and columns. */
	updateTemplate(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ImportTemplateDetailDto> {
		idValue(id, 'id')
		const command = parseUpdateTemplate(body)
		return this.command(
			context,
			'template.update',
			{ id, command },
			key,
			/** Update. */ async (w) => {
				const template = await this.lockTemplate(w, id, command.expectedRevision)
				if (template.status !== 'Draft') throw new HcmDomainError('version-published')
				await w.imports.updateTemplate(id, command)
				await w.imports.replaceColumns(id, command.columns)
				await this.audit(
					w,
					'employee.import-template-updated',
					'import-template',
					id,
					requestId,
					command.reason,
					'Draft',
					'Draft',
				)
				return this.templateDetail(w, id)
			},
		)
	}

	/** Publish a draft; the code's previous published version retires. */
	publishTemplate(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ImportTemplateDetailDto> {
		idValue(id, 'id')
		const command = parsePublishTemplate(body)
		return this.command(
			context,
			'template.publish',
			{ id, command },
			key,
			/** Publish. */ async (w) => {
				const template = await this.lockTemplate(w, id, command.expectedRevision)
				if (template.status !== 'Draft') throw new HcmDomainError('version-published')
				if (!(await w.imports.columns(id)).length) invalidField('columns', 'required')
				await w.imports.publishTemplate(id, template.code)
				await this.audit(
					w,
					'employee.import-template-published',
					'import-template',
					id,
					requestId,
					command.reason,
					'Draft',
					'Published',
				)
				return this.templateDetail(w, id)
			},
		)
	}

	/** Start the next draft version of a published template, copying its facts and columns. */
	newTemplateVersion(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ImportTemplateDetailDto> {
		idValue(id, 'id')
		const command = parseNewTemplateVersion(body)
		return this.command(
			context,
			'template.version',
			{ id, command },
			key,
			/** New version. */ async (w) => {
				const template = await w.imports.template(id, true)
				if (!template) throw new HcmDomainError('not-found')
				const versions = await w.imports.versions(template.code)
				if (versions.draft || template.status === 'Draft') throw new HcmDomainError('invalid-state')
				const columns = await w.imports.columns(id)
				const next = await w.imports.insertTemplate({
					...template,
					versionNumber: versions.next,
					supersedesId: id,
				})
				await w.imports.replaceColumns(next, columns)
				await this.audit(
					w,
					'employee.import-template-versioned',
					'import-template',
					next,
					requestId,
					command.reason,
					null,
					'Draft',
				)
				return this.templateDetail(w, next)
			},
		)
	}

	/** A page of runs, newest first. */
	runs(context: AuthenticatedHcmContext, params: URLSearchParams): Promise<ImportRunPage> {
		const query = parseRunQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Page runs. */ async (w) => {
				const page = await w.imports.runs(query)
				const manage = await w.holds(MANAGE)
				return {
					items: page.items.map(/** Run. */ (row) => this.runDto(w, row, manage)),
					nextCursor: page.nextCursor,
				}
			},
		)
	}

	/** One run with its counts. */
	run(context: AuthenticatedHcmContext, id: string): Promise<ImportRunDto> {
		idValue(id, 'id')
		return this.unit.execute(context, READ, false, /** Read. */ (w) => this.runDetail(w, id))
	}

	/** A page of a run's rows with their issues and candidates. */
	rows(
		context: AuthenticatedHcmContext,
		id: string,
		params: URLSearchParams,
	): Promise<ImportRowPage> {
		idValue(id, 'id')
		const query = parseRowQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Page rows. */ async (w) => {
				if (!(await w.imports.run(id))) throw new HcmDomainError('not-found')
				const page = await w.imports.rows(id, query)
				return { items: await this.rowDtos(w, id, page.items), nextCursor: page.nextCursor }
			},
		)
	}

	/** Upload a file for a published template; the run starts Uploaded. */
	createRun(
		context: AuthenticatedHcmContext,
		metadata: unknown,
		fileName: string,
		bytes: Buffer,
		key: string,
		requestId: string,
	): Promise<ImportRunDto> {
		const command = parseRunMetadata(metadata)
		const payload = { command, fileName, digest: rowDigest([bytes.toString('base64')]) }
		return this.command(
			context,
			'run.create',
			payload,
			key,
			/** Stage and record. */ async (w) => {
				const template = await w.imports.template(command.templateId)
				if (!template || template.status !== 'Published')
					invalidField('templateId', 'not-published')
				const id = randomUUID()
				let staged
				try {
					staged = await w.sources.stageImportSource({ runId: id, fileName, bytes })
				} catch (error) {
					if (!(error instanceof ImportSourceError)) throw error
					if (error.code === 'file-too-large') throw new HcmDomainError('file-too-large')
					throw new HcmDomainError('unsupported-file', [{ field: 'file', code: error.code }])
				}
				if ((staged.contentType === XLSX) !== (template.fileFormat === 'Xlsx'))
					throw new HcmDomainError('unsupported-file', [{ field: 'file', code: 'format-mismatch' }])
				await w.imports.insertRun({
					id,
					templateId: template.id,
					sourceBlobId: staged.blobId,
					fileName,
					intendedAction: command.intendedAction,
					sourceDigest: staged.sha256,
				})
				await this.audit(
					w,
					'employee.import-run-created',
					'import-run',
					id,
					requestId,
					null,
					null,
					'Uploaded',
				)
				return this.runDetail(w, id)
			},
		)
	}

	/** Validate every row without changing workforce facts; the parser version is fixed now. */
	validate(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ImportRunDto> {
		idValue(id, 'id')
		const command = parseImportRevision(body)
		return this.command(
			context,
			'run.validate',
			{ id, command },
			key,
			/** Validate. */ async (w) => {
				const run = await this.lockRun(w, id, command.expectedRevision)
				if (run.status !== 'Uploaded') throw new HcmDomainError('invalid-state')
				const template = (await w.imports.template(run.templateId)) as ImportTemplateRow
				const columns = await w.imports.columns(template.id)
				const table = await this.table(w, run)
				if ('failure' in table) {
					await w.imports.insertRunIssues(id, [issue(null, null, table.failure)])
					await w.imports.updateRun(id, {
						status: 'Failed',
						parserVersion: IMPORT_PARSER_VERSION,
						failureCode: table.failure,
						validated: true,
					})
				} else await this.validateRows(w, run, template, columns, table.rows, table.workbook)
				const after = (await w.imports.run(id)) as ImportRunRow
				await this.audit(
					w,
					'employee.import-run-validated',
					'import-run',
					id,
					requestId,
					null,
					'Uploaded',
					after.status,
				)
				return this.runDetail(w, id)
			},
		)
	}

	/** Record HR's resolution of a matched row. */
	resolve(
		context: AuthenticatedHcmContext,
		id: string,
		rowId: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ImportRowDto> {
		idValue(id, 'id')
		idValue(rowId, 'rowId')
		const command = parseResolveRow(body)
		return this.command(
			context,
			'row.resolve',
			{ id, rowId, command },
			key,
			/** Resolve. */ async (w) => {
				const run = await w.imports.run(id, true)
				if (!run) throw new HcmDomainError('not-found')
				if (run.status !== 'ReadyToCommit') throw new HcmDomainError('invalid-state')
				const row = await w.imports.row(id, rowId, true)
				if (!row) throw new HcmDomainError('not-found')
				if (row.revision !== command.expectedRevision) throw new HcmDomainError('revision-conflict')
				if (
					row.status !== 'Valid' ||
					!(row.matchStatus === 'Unique' || row.matchStatus === 'Ambiguous')
				)
					throw new HcmDomainError('invalid-state')
				if (!resolutionAllowed(row.proposedAction, command.resolution))
					invalidField('resolution', 'not-allowed')
				if (
					command.resolution === 'UseExisting' &&
					!row.matchedWorkerIds.includes(command.candidateWorkerId ?? '')
				)
					invalidField('candidateWorkerId', 'unknown')
				await w.imports.resolveRow(rowId, {
					resolution: command.resolution,
					workerId: command.resolution === 'UseExisting' ? command.candidateWorkerId : null,
					reason: command.reason,
				})
				await this.audit(
					w,
					'employee.import-row-resolved',
					'import-run',
					id,
					requestId,
					command.reason,
					null,
					command.resolution,
					['resolution'],
				)
				const [dto] = await this.rowDtos(w, id, [(await w.imports.row(id, rowId)) as ImportRowRow])
				return dto as ImportRowDto
			},
		)
	}

	/** Commit every valid, resolved row in order, each in its own savepoint. */
	commit(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ImportRunDto> {
		idValue(id, 'id')
		const command = parseImportRevision(body)
		return this.command(
			context,
			'run.commit',
			{ id, command },
			key,
			/** Commit. */ async (w) => {
				const run = await this.lockRun(w, id, command.expectedRevision)
				if (run.status !== 'ReadyToCommit' && run.status !== 'Committing')
					throw new HcmDomainError('invalid-state')
				const rows = await w.imports.allRows(id)
				if (
					rows.some(
						/** Unresolved. */ (row) =>
							row.status === 'Valid' && needsResolution(row.matchStatus, row.resolution),
					)
				)
					throw new HcmDomainError('invalid-state', [{ field: 'rows', code: 'unresolved' }])
				await w.imports.updateRun(id, { status: 'Committing', commitRequested: true })
				const template = (await w.imports.template(run.templateId)) as ImportTemplateRow
				const columns = await w.imports.columns(template.id)
				const table = await this.table(w, run)
				if ('failure' in table)
					throw new HcmDomainError('invalid-state', [{ field: 'file', code: table.failure }])
				const cache: RefCache = new Map()
				const byNumber = new Map(
					table.rows.map(/** Source line. */ (cells, index) => [index + 1, cells] as const),
				)
				for (const row of rows) {
					if (row.status !== 'Valid') continue
					if (row.resolution === 'Skip') {
						await w.imports.markRow(row.id, { status: 'Skipped' })
						continue
					}
					const cells = byNumber.get(row.rowNumber) ?? []
					if (rowDigest(cells) !== row.digest) {
						await w.imports.markRow(row.id, {
							status: 'CommitFailed',
							failureCode: 'source-changed',
						})
						continue
					}
					try {
						const workerId = await w.imports.savepoint(
							/** Apply the row alone. */ async () => {
								const evaluated = await this.evaluate(
									w,
									cache,
									template,
									columns,
									cells,
									table.workbook,
								)
								// Every update row is matched, so it commits only through a UseExisting resolution.
								const existing = row.resolution === 'UseExisting' ? row.resolutionWorkerId : null
								return existing
									? this.updatePerson(w, existing, evaluated)
									: this.createWorker(w, evaluated, `Import ${run.id}`)
							},
						)
						await w.imports.markRow(row.id, { status: 'Committed', resultWorkerId: workerId })
					} catch (error) {
						if (!(error instanceof HcmDomainError)) throw error
						await w.imports.markRow(row.id, {
							status: 'CommitFailed',
							failureCode: failureCode(error),
						})
					}
				}
				await w.imports.recount(id)
				const counted = (await w.imports.run(id)) as ImportRunRow
				let status: ImportRunRow['status'] = 'Completed'
				if (counted.failedRowCount || counted.invalidRowCount) status = 'CompletedWithErrors'
				if (!counted.committedRowCount && counted.failedRowCount) status = 'Failed'
				await w.imports.updateRun(id, {
					status,
					completed: true,
					failureCode: status === 'Failed' ? 'no-row-committed' : null,
				})
				await this.audit(
					w,
					'employee.import-run-committed',
					'import-run',
					id,
					requestId,
					null,
					'ReadyToCommit',
					status,
				)
				return this.runDetail(w, id)
			},
		)
	}

	/** Cancel a run before it commits. */
	cancel(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ImportRunDto> {
		idValue(id, 'id')
		const command = parseCancelRun(body)
		return this.command(
			context,
			'run.cancel',
			{ id, command },
			key,
			/** Cancel. */ async (w) => {
				const run = await this.lockRun(w, id, command.expectedRevision)
				if (run.status !== 'Uploaded' && run.status !== 'ReadyToCommit')
					throw new HcmDomainError('invalid-state')
				await w.imports.updateRun(id, { status: 'Cancelled', cancelReason: command.reason })
				await this.audit(
					w,
					'employee.import-run-cancelled',
					'import-run',
					id,
					requestId,
					command.reason,
					run.status,
					'Cancelled',
				)
				return this.runDetail(w, id)
			},
		)
	}

	/** The safe issue report as CSV: row numbers, fields, codes and severities; audited as an export. */
	report(
		context: AuthenticatedHcmContext,
		id: string,
		requestId: string,
	): Promise<{ fileName: string; csv: string }> {
		idValue(id, 'id')
		return this.unit.execute(
			context,
			READ,
			true,
			/** Build and audit. */ async (w) => {
				const run = await w.imports.run(id)
				if (!run) throw new HcmDomainError('not-found')
				const issues = await w.imports.issues(id)
				/** One CSV cell; every value here is product text, never source data. */
				const cell = (value: string | number | null) => {
					const text = value === null ? '' : String(value)
					return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
				}
				const lines = [
					'row,field,column,severity,code,message',
					...issues.map(
						/** One issue. */ (item) =>
							[
								item.rowNumber,
								item.fieldCode ? (IMPORT_FIELDS[item.fieldCode]?.name ?? item.fieldCode) : null,
								item.sourceColumnName,
								item.severity,
								item.code,
								item.message,
							]
								.map(cell)
								.join(','),
					),
				]
				await w.audit.append({
					action: 'employee.import-issues-exported',
					category: 'export',
					targetType: 'import-run',
					targetId: id,
					requestId,
					summary: { reason: null, changedFields: [], fromState: null, toState: null },
				})
				return { fileName: `import-issues-${id}.csv`, csv: `${lines.join('\n')}\n` }
			},
		)
	}

	/** Run one idempotent command in a business transaction. */
	private command<T>(
		context: AuthenticatedHcmContext,
		operation: string,
		payload: unknown,
		key: string,
		work: (w: EmployeeWork) => Promise<T>,
	): Promise<T> {
		const hash = commandHash(operation, payload)
		return this.unit.execute(
			context,
			MANAGE,
			true,
			/** Keep receipts in the business transaction. */ (w) =>
				runIdempotent(w.receipts, `import.${operation}`, key, hash, /** Run once. */ () => work(w)),
		)
	}

	/** Read the run's own source table, or the safe code of why it cannot be read. */
	private async table(
		w: EmployeeWork,
		run: ImportRunRow,
	): Promise<{ rows: string[][]; workbook: boolean } | { failure: string }> {
		const source = await w.sources.openImportSource(run.sourceBlobId)
		try {
			return {
				rows: readImportTable(source.bytes, source.contentType),
				workbook: source.contentType === XLSX,
			}
		} catch (error) {
			if (error instanceof ImportSourceError) return { failure: error.code }
			throw error
		}
	}

	/** Validate the data rows of a readable table and record rows, issues and counts. */
	private async validateRows(
		w: EmployeeWork,
		run: ImportRunRow,
		template: ImportTemplateRow,
		columns: ImportColumnRow[],
		table: string[][],
		workbook: boolean,
	): Promise<void> {
		const runIssues: Omit<ImportIssueRow, 'rowId' | 'rowNumber'>[] = []
		const header = template.hasHeaderRow ? (table[0] ?? []) : null
		if (header)
			for (const name of headerMismatches(header, columns)) {
				const column = columns.find(/** Mapped. */ (item) => item.sourceColumnName === name)
				runIssues.push(issue(column?.fieldCode ?? null, name, 'header-mismatch'))
			}
		const keyColumn = columns.find(/** Match key. */ (column) => column.isMatchKey)
		if (run.intendedAction !== 'Create' && !keyColumn)
			runIssues.push(issue(null, null, 'match-key-required'))
		if (run.intendedAction !== 'Create')
			for (const column of columns)
				if (!column.isMatchKey && !IMPORT_FIELDS[column.fieldCode]?.updatable)
					runIssues.push(
						issue(column.fieldCode, column.sourceColumnName, 'ignored-on-update', 'Warning'),
					)
		const first = template.hasHeaderRow ? 1 : 0
		const data = table.slice(first)
		if (data.length > IMPORT_MAX_ROWS) runIssues.push(issue(null, null, 'too-many-rows'))
		const blocking = runIssues.some(/** Blocks the run. */ (item) => item.severity === 'Error')
		if (runIssues.length) await w.imports.insertRunIssues(run.id, runIssues)
		if (blocking) {
			await w.imports.updateRun(run.id, {
				status: 'Failed',
				parserVersion: IMPORT_PARSER_VERSION,
				failureCode:
					runIssues.find(/** First error. */ (item) => item.severity === 'Error')?.code ??
					'invalid-template',
				validated: true,
			})
			return
		}
		const cache: RefCache = new Map()
		const numbers = new Set<string>()
		const rows: NewImportRow[] = []
		for (const [index, cells] of data.entries()) {
			const evaluated = await this.evaluate(w, cache, template, columns, cells, workbook)
			const issues = [...evaluated.issues]
			const number = evaluated.values['worker-number']
			const keyValue = keyColumn ? evaluated.values[keyColumn.fieldCode] : null
			const keyed = keyValue
				? await this.keyMatches(w, keyColumn as ImportColumnRow, String(keyValue), evaluated)
				: []
			let action: NewImportRow['proposedAction'] =
				run.intendedAction === 'Create' && !keyColumn
					? 'Create'
					: proposedAction(run.intendedAction, keyed.length > 0)
			let matchStatus: MatchStatus = 'NotRequired'
			let matched: string[] = []
			if (action === 'Reject')
				issues.push(
					issue(
						keyColumn?.fieldCode ?? null,
						keyColumn?.sourceColumnName ?? null,
						run.intendedAction === 'Create' ? 'already-exists' : 'no-match',
					),
				)
			else if (action === 'Update') {
				matched = keyed
				matchStatus = keyed.length > 1 ? 'Ambiguous' : 'Unique'
			} else {
				for (const [code, policy] of Object.entries(IMPORT_FIELDS))
					if (
						policy.requiredForCreate &&
						(evaluated.values[code] ?? null) === null &&
						!evaluated.issues.some(/** Already refused. */ (item) => item.fieldCode === code)
					) {
						const column = columns.find(/** Mapped. */ (item) => item.fieldCode === code)
						issues.push(issue(code, column?.sourceColumnName ?? null, 'required'))
					}
				if (typeof number === 'string') {
					if (numbers.has(number)) issues.push(issue('worker-number', null, 'duplicate-in-file'))
					else if ((await w.imports.workersByNumber([number])).size)
						issues.push(issue('worker-number', null, 'worker-number-in-use'))
					numbers.add(number)
				}
				if (!issues.length) {
					matched = await this.candidates(w, evaluated)
					matchStatus = ['None', 'Unique'][Math.min(matched.length, 1)] as MatchStatus
					if (matched.length > 1) matchStatus = 'Ambiguous'
				}
			}
			const invalid = issues.some(/** Blocks the row. */ (item) => item.severity === 'Error')
			if (invalid) {
				action = 'Reject'
				matchStatus = 'NotRequired'
				matched = []
			}
			rows.push({
				rowNumber: index + 1 + first,
				digest: rowDigest(cells),
				status: invalid ? 'Invalid' : 'Valid',
				matchStatus,
				proposedAction: action,
				matchedWorkerIds: matched,
				issues,
			})
		}
		await w.imports.insertRows(run.id, rows)
		await w.imports.recount(run.id)
		await w.imports.updateRun(run.id, {
			status: 'ReadyToCommit',
			parserVersion: IMPORT_PARSER_VERSION,
			validated: true,
		})
	}

	/** Workers named by a match key value. */
	private async keyMatches(
		w: EmployeeWork,
		key: ImportColumnRow,
		value: string,
		evaluated: Evaluated,
	): Promise<string[]> {
		if (key.fieldCode === 'worker-number') {
			const found = await w.imports.workersByNumber([value])
			return [...found.values()]
		}
		const candidates = await w.reads.duplicateCandidates({
			givenName: String(evaluated.values['legal-given-name'] ?? ''),
			familyName: String(evaluated.values['legal-family-name'] ?? ''),
			birthDate: null,
			workEmail: value,
		})
		return candidates
			.filter(/** Email matches only. */ (item) => item.reason === 'work-email' && item.workerId)
			.map(/** Worker. */ (item) => item.workerId as string)
	}

	/** DEC-HCM2-001 candidates of a new person: same normalized name and birth date, or work email. */
	private async candidates(w: EmployeeWork, evaluated: Evaluated): Promise<string[]> {
		const found = await w.reads.duplicateCandidates({
			givenName: String(evaluated.values['legal-given-name'] ?? ''),
			familyName: String(evaluated.values['legal-family-name'] ?? ''),
			birthDate: (evaluated.values['birth-date'] as string | null) ?? null,
			workEmail: (evaluated.values['work-email'] as string | null) ?? null,
		})
		return [
			...new Set(
				found
					.map(/** Worker. */ (item) => item.workerId)
					.filter(/** Has one. */ (id): id is string => !!id),
			),
		].slice(0, 20)
	}

	/** Parse, transform and resolve one row's cells. */
	private async evaluate(
		w: EmployeeWork,
		cache: RefCache,
		template: ImportTemplateRow,
		columns: ImportColumnRow[],
		cells: string[],
		workbook: boolean,
	): Promise<Evaluated> {
		const result: Evaluated = { values: {}, refs: {}, issues: [] }
		for (const column of columns) {
			const parsed = parseCell(
				column.fieldCode,
				cells[column.sourceColumnOrdinal - 1] ?? '',
				column.transformationCode,
				template.dateFormat,
				workbook,
			)
			if ('issue' in parsed) {
				result.issues.push(issue(column.fieldCode, column.sourceColumnName, parsed.issue))
				continue
			}
			result.values[column.fieldCode] = parsed.value
			const reference = IMPORT_FIELDS[column.fieldCode]?.reference
			if (reference && parsed.value !== null) {
				const ref = await this.resolveRef(w, cache, reference, String(parsed.value))
				if (!ref)
					result.issues.push(issue(column.fieldCode, column.sourceColumnName, 'unknown-reference'))
				result.refs[column.fieldCode] = ref
			}
		}
		return result
	}

	/** Resolve a source code against a reference list, case-insensitively. */
	private async resolveRef(
		w: EmployeeWork,
		cache: RefCache,
		kind: string,
		code: string,
	): Promise<Ref | null> {
		let known = cache.get(kind)
		if (!known) cache.set(kind, (known = new Map()))
		const key = code.toLowerCase()
		if (known.has(key)) return known.get(key) ?? null
		let ref: Ref | null = null
		if (kind === 'genders' || kind === 'marital-statuses' || kind === 'countries') {
			const rows = await w.profile.references(kind)
			const row = rows.find(/** Same code. */ (item) => item.code.toLowerCase() === key)
			ref = row ? { id: row.code, name: row.name } : null
		} else if (kind === 'worker-types') {
			const rows = await w.records.workerTypes()
			const row = rows.find(
				/** Same name or identity. */ (item) =>
					item.name.toLowerCase() === key || item.id.toLowerCase().endsWith(`/${key}`),
			)
			ref = row ?? null
		} else if (kind === 'workers') {
			const found = await w.imports.workersByNumber([code.toUpperCase()])
			const id = found.get(code.toUpperCase())
			ref = id ? { id, name: code.toUpperCase() } : null
		} else {
			const page = await w.structure.options(
				kind as 'legal-entities' | 'units' | 'departments' | 'designations' | 'locations',
				{ q: code, sort: 'name:asc', activeOnly: true, limit: 50 },
				w.today,
			)
			const row = page.items.find(/** Same code. */ (item) => item.code.toLowerCase() === key)
			ref = row ? { id: row.id, name: row.name } : null
		}
		known.set(key, ref)
		return ref
	}

	/** Person facts from a row, over current facts where the row leaves them empty. */
	private personFacts(evaluated: Evaluated, current?: Partial<PersonFactsInput>): PersonFactsInput {
		const v = evaluated.values
		/** A row value, or the current fact. */
		const pick = (code: string, fallback: string | null | undefined) =>
			code in v && v[code] !== null ? String(v[code]) : (fallback ?? null)
		return {
			givenName: pick('legal-given-name', current?.givenName) ?? '',
			middleName: pick('legal-middle-name', current?.middleName) ?? '',
			familyName: pick('legal-family-name', current?.familyName) ?? '',
			preferredName: pick('preferred-name', current?.preferredName) ?? '',
			formerName: pick('former-name', current?.formerName) ?? '',
			birthDate: pick('birth-date', current?.birthDate),
			genderCode: evaluated.refs['gender']?.id ?? current?.genderCode ?? null,
			maritalStatusCode: evaluated.refs['marital-status']?.id ?? current?.maritalStatusCode ?? null,
			nationalityCountryCode:
				evaluated.refs['nationality']?.id ?? current?.nationalityCountryCode ?? null,
		}
	}

	/** Correct an existing worker's person facts; employment facts change only through Employment Changes. */
	private async updatePerson(
		w: EmployeeWork,
		workerId: string,
		evaluated: Evaluated,
	): Promise<string> {
		const lock = await w.records.lockWorker(workerId)
		if (!lock || lock.mergedIntoWorkerId) throw new HcmDomainError('not-found')
		const record = await w.records.record(workerId, w.today)
		const facts = this.personFacts(evaluated, record ?? undefined)
		await w.facts.correctPersonFacts(lock.personId, lock.personRevision, facts)
		return workerId
	}

	/** Create a person, worker, employment, primary assignment and manager line from a row. */
	private async createWorker(
		w: EmployeeWork,
		evaluated: Evaluated,
		reason: string,
	): Promise<string> {
		const v = evaluated.values
		const refs = evaluated.refs
		const hire = String(v['hire-date'])
		let workerType = refs['worker-type']?.id
		if (!workerType) {
			const types = await w.records.workerTypes()
			workerType = (types.find(/** Default. */ (item) => /employee/i.test(item.name)) ?? types[0])
				?.id
		}
		const { worker } = await w.facts.createPersonWithWorker({
			facts: this.personFacts(evaluated),
			workerCode: String(v['worker-number']),
			workerTypeId: workerType ?? '',
		})
		const probation = (v['probation'] as string | null) ?? null
		const employment = await w.facts.createEmployment({
			workerId: worker.id,
			legalEntityId: refs['legal-entity']?.id ?? '',
			employmentType: ((v['employment-type'] as string | null) ?? 'Permanent') as 'Permanent',
			employmentStatus: hire > w.today ? 'Pending' : 'Active',
			hireDate: hire,
			isPrimary: true,
			workEmail: (v['work-email'] as string | null) ?? null,
			continuousServiceStartDate: hire,
			probationEndDate: probation,
			probationStatus: probation ? 'InProgress' : 'NotApplicable',
			noticePeriodDays: (v['notice-period'] as number | null) ?? null,
		})
		const assignment = await w.facts.openAssignment(employment.id, {
			organisationId: refs['organisation-unit']?.id ?? '',
			locationId: refs['location']?.id ?? '',
			departmentId: refs['department']?.id ?? null,
			designationId: refs['designation']?.id ?? null,
			jobTitle: refs['designation']?.name ?? 'Imported worker',
			workMode: ((v['work-mode'] as string | null) ?? 'OnSite') as 'OnSite',
			fullTimeEquivalent: (v['full-time-equivalent'] as number | null) ?? 1,
			standardHoursPerWeek: (v['standard-hours'] as number | null) ?? null,
			isPrimary: true,
			isBillable: false,
			costCenterCode: (v['cost-centre'] as string | null) ?? '',
			effectiveFrom: hire,
			changeNote: 'Imported',
		})
		const manager = refs['manager']?.id
		if (manager) {
			const managed = await w.reads.currentAssignments(manager, hire)
			const line = managed.find(/** Primary. */ (item) => item.isPrimary) ?? managed[0]
			if (!line) invalidField('manager', 'no-assignment')
			await w.facts.setReportingLine({
				assignmentId: assignment.id,
				managerAssignmentId: line.id,
				type: 'Solid',
				isPrimary: true,
				effectiveFrom: hire,
				reason,
			})
		}
		await w.facts.recordWorkerEvent({
			workerId: worker.id,
			employmentId: employment.id,
			assignmentId: assignment.id,
			eventTypeCode: 'HIRED',
			effectiveDate: hire,
			reason,
			previousValueSummary: '',
			newValueSummary: '',
			approvedByAccountId: null,
			approvedOn: null,
		})
		return worker.id
	}

	/** Lock a template and check its revision. */
	private async lockTemplate(
		w: EmployeeWork,
		id: string,
		expected: number,
	): Promise<ImportTemplateRow> {
		const template = await w.imports.template(id, true)
		if (!template) throw new HcmDomainError('not-found')
		if (template.revision !== expected) throw new HcmDomainError('revision-conflict')
		return template
	}

	/** Lock a run and check its revision. */
	private async lockRun(w: EmployeeWork, id: string, expected: number): Promise<ImportRunRow> {
		const run = await w.imports.run(id, true)
		if (!run) throw new HcmDomainError('not-found')
		if (run.revision !== expected) throw new HcmDomainError('revision-conflict')
		return run
	}

	/** A template with its columns and action hints. */
	private async templateDetail(w: EmployeeWork, id: string): Promise<ImportTemplateDetailDto> {
		const template = await w.imports.template(id)
		if (!template) throw new HcmDomainError('not-found')
		const [columns, manage, versions] = await Promise.all([
			w.imports.columns(id),
			w.holds(MANAGE),
			w.imports.versions(template.code),
		])
		return {
			...template,
			columns: columns.map(
				/** Column. */ (column) => ({
					...column,
					fieldName: IMPORT_FIELDS[column.fieldCode]?.name ?? column.fieldCode,
				}),
			),
			actions: {
				edit: manage && template.status === 'Draft',
				publish: manage && template.status === 'Draft',
				newVersion: manage && template.status === 'Published' && !versions.draft,
			},
		}
	}

	/** A run for display. */
	private runDto(w: EmployeeWork, row: ImportRunRow, manage: boolean): ImportRunDto {
		return {
			id: row.id,
			template: {
				id: row.templateId,
				code: row.templateCode,
				name: row.templateName,
				versionNumber: row.templateVersion,
			},
			fileName: row.fileName,
			intendedAction: row.intendedAction,
			status: row.status,
			totalRowCount: row.totalRowCount,
			validRowCount: row.validRowCount,
			invalidRowCount: row.invalidRowCount,
			committedRowCount: row.committedRowCount,
			failedRowCount: row.failedRowCount,
			skippedRowCount: row.skippedRowCount,
			unresolvedRowCount: row.unresolvedRowCount,
			issueCount: row.issueCount,
			parserVersion: row.parserVersion,
			failureCode: row.failureCode,
			requestedBy: row.requestedBy,
			requestedByMe: row.requestedByAccountId === w.accountId,
			requestedAt: row.requestedAt,
			validationCompletedAt: row.validationCompletedAt,
			commitRequestedAt: row.commitRequestedAt,
			completedAt: row.completedAt,
			cancelReason: row.cancelReason,
			actions: {
				validate: manage && row.status === 'Uploaded',
				commit:
					manage &&
					row.status === 'ReadyToCommit' &&
					row.unresolvedRowCount === 0 &&
					row.validRowCount > 0,
				cancel: manage && (row.status === 'Uploaded' || row.status === 'ReadyToCommit'),
			},
			revision: row.revision,
		}
	}

	/** One run for display. */
	private async runDetail(w: EmployeeWork, id: string): Promise<ImportRunDto> {
		const row = await w.imports.run(id)
		if (!row) throw new HcmDomainError('not-found')
		return this.runDto(w, row, await w.holds(MANAGE))
	}

	/** Rows with their issues and candidate names. */
	private async rowDtos(
		w: EmployeeWork,
		runId: string,
		rows: ImportRowRow[],
	): Promise<ImportRowDto[]> {
		const issues = await w.imports.issues(
			runId,
			rows.map(/** Id. */ (row) => row.id),
		)
		const workers = await w.imports.workers([
			...new Set(rows.flatMap(/** Matches. */ (row) => row.matchedWorkerIds)),
		])
		return rows.map(
			/** Row. */ (row) => ({
				id: row.id,
				rowNumber: row.rowNumber,
				status: row.status,
				matchStatus: row.matchStatus,
				proposedAction: row.proposedAction,
				candidates: row.matchedWorkerIds.map(
					/** Candidate. */ (workerId) => ({
						workerId,
						name: workers.get(workerId)?.name ?? '',
						workerNumber: workers.get(workerId)?.workerNumber ?? '',
					}),
				),
				resolution: row.resolution,
				resolutionWorkerId: row.resolutionWorkerId,
				resolutionReason: row.resolutionReason,
				needsResolution: row.status === 'Valid' && needsResolution(row.matchStatus, row.resolution),
				issues: issues
					.filter(/** This row. */ (item) => item.rowId === row.id)
					.map(
						/** Issue. */ (item) => ({
							fieldCode: item.fieldCode,
							fieldName: item.fieldCode
								? (IMPORT_FIELDS[item.fieldCode]?.name ?? item.fieldCode)
								: null,
							sourceColumnName: item.sourceColumnName,
							severity: item.severity,
							code: item.code,
							message: item.message,
						}),
					),
				failureCode: row.failureCode,
				resultWorkerId: row.resultWorkerId,
				revision: row.revision,
			}),
		)
	}

	/** Append one audit event naming states and fields only. */
	private async audit(
		w: EmployeeWork,
		action: string,
		targetType: string,
		id: string,
		requestId: string,
		reason: string | null,
		fromState: string | null,
		toState: string,
		changedFields: string[] = [],
	): Promise<void> {
		await w.audit.append({
			action,
			category: 'business',
			targetType,
			targetId: id,
			requestId,
			summary: { reason, changedFields, fromState, toState },
		})
	}
}
