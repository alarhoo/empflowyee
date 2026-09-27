import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	ImportRowDto,
	ImportRowPage,
	ImportRunDetailDto,
	ImportRunPage,
	ImportTemplateDetailDto,
	ImportTemplatePage,
} from '@empflowyee/hcm-employee-contract'

const limit = 15000
/** Validation and commit read the whole file, so they may take longer than a read. */
const longLimit = 120000

/** Employee Import API; the server remains the authority for every rule. */
@Injectable({ providedIn: 'root' })
export class EmployeeImportApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/employee/import'

	/** Attach the caller-retained idempotency key to one command. */
	private headers(key: string) {
		return { headers: { 'Idempotency-Key': key } }
	}

	/** Query parameters from defined values. */
	private params(values: object): HttpParams {
		let params = new HttpParams().set('limit', '25')
		for (const [name, value] of Object.entries(values))
			if (value) params = params.set(name, String(value))
		return params
	}

	/** An encoded template path. */
	private template(id: string): string {
		return `${this.base}/templates/${encodeURIComponent(id)}`
	}

	/** An encoded run path. */
	private run(id: string): string {
		return `${this.base}/runs/${encodeURIComponent(id)}`
	}

	/** One page of templates, most recently changed first. */
	templates(query: { status?: string; cursor?: string }) {
		return this.http
			.get<ImportTemplatePage>(`${this.base}/templates`, { params: this.params(query) })
			.pipe(timeout(limit))
	}

	/** One template with its columns. */
	readTemplate(id: string) {
		return this.http.get<ImportTemplateDetailDto>(this.template(id)).pipe(timeout(limit))
	}

	/** Create a draft template. */
	createTemplate(body: Record<string, unknown>, key: string) {
		return this.http
			.post<ImportTemplateDetailDto>(`${this.base}/templates`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Replace a draft template. */
	updateTemplate(id: string, body: Record<string, unknown>, key: string) {
		return this.http
			.put<ImportTemplateDetailDto>(this.template(id), body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Publish a draft, or start the next draft version of a published template. */
	templateCommand(
		id: string,
		operation: 'publish' | 'versions',
		body: Record<string, unknown>,
		key: string,
	) {
		return this.http
			.post<ImportTemplateDetailDto>(`${this.template(id)}/${operation}`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** One page of runs, newest first. */
	runs(query: { status?: string; cursor?: string }) {
		return this.http
			.get<ImportRunPage>(`${this.base}/runs`, { params: this.params(query) })
			.pipe(timeout(limit))
	}

	/** One run with its counts. */
	readRun(id: string) {
		return this.http.get<ImportRunDetailDto>(this.run(id)).pipe(timeout(limit))
	}

	/** One page of a run's rows. */
	rows(id: string, query: { status?: string; matchStatus?: string; cursor?: string }) {
		return this.http
			.get<ImportRowPage>(`${this.run(id)}/rows`, { params: this.params(query) })
			.pipe(timeout(limit))
	}

	/** Upload a source file: bounded metadata first, then the file, with the caller's retry key. */
	upload(metadata: { templateId: string; intendedAction: string }, file: File, key: string) {
		const form = new FormData()
		form.append('metadata', JSON.stringify(metadata))
		form.append('file', file, file.name)
		return this.http
			.post<ImportRunDetailDto>(`${this.base}/runs`, form, this.headers(key))
			.pipe(timeout(60000))
	}

	/** Validate, commit or cancel a run. */
	command(
		id: string,
		operation: 'validate' | 'commit' | 'cancel',
		body: Record<string, unknown>,
		key: string,
	) {
		return this.http
			.post<ImportRunDetailDto>(`${this.run(id)}/${operation}`, body, this.headers(key))
			.pipe(timeout(operation === 'cancel' ? limit : longLimit))
	}

	/** Record the resolution of one matched row. */
	resolve(id: string, rowId: string, body: Record<string, unknown>, key: string) {
		return this.http
			.post<ImportRowDto>(
				`${this.run(id)}/rows/${encodeURIComponent(rowId)}/resolve`,
				body,
				this.headers(key),
			)
			.pipe(timeout(limit))
	}

	/** The safe issue report as CSV, through authenticated HTTP. */
	report(id: string) {
		return this.http
			.get(`${this.run(id)}/issues.csv`, { responseType: 'blob' })
			.pipe(timeout(60000))
	}
}

/** Labels of import command fields, for field errors. */
const IMPORT_FIELD_LABELS: Record<string, string> = {
	code: 'Code',
	name: 'Name',
	description: 'Description',
	fileFormat: 'File format',
	dateFormat: 'Date format',
	timeZone: 'Time zone',
	columns: 'Columns',
	sourceColumnName: 'Source column',
	sourceColumnOrdinal: 'Column position',
	fieldCode: 'Field',
	transformationCode: 'Transformation',
	isMatchKey: 'Match key',
	templateId: 'Template',
	intendedAction: 'Action',
	file: 'File',
	resolution: 'Resolution',
	candidateWorkerId: 'Existing worker',
	reason: 'Reason',
	rows: 'Rows',
}

/** Messages of field-level codes. */
const IMPORT_FIELD_MESSAGES: Record<string, string> = {
	duplicate: '{label} is already used; choose another.',
	required: '{label} is required.',
	'not-published': 'Choose a published template.',
	'not-importable': 'That field cannot be imported.',
	'not-match-key': 'Only worker number and work email can be match keys.',
	'not-allowed': 'That resolution does not fit this row.',
	unknown: 'Choose one of the listed options for {label}.',
	unresolved: 'Resolve every matched row before committing.',
	'format-mismatch': 'The file format does not match the template.',
	'macro-enabled': 'Macro-enabled workbooks are not accepted.',
	encrypted: 'Encrypted or password-protected files are not accepted.',
	'invalid-encoding': 'Save the CSV file as UTF-8 and try again.',
	'too-many-rows': 'The file has more than 2,000 data rows. Split it into smaller files.',
	'too-many-columns': 'The file has more than 100 columns.',
	'cell-too-long': 'A cell is longer than 1,000 characters.',
	'archive-too-large': 'The workbook expands beyond the allowed size.',
	'unsupported-file': 'The file could not be read as CSV or XLSX.',
}

/** A safe, specific message for an import failure. */
export function importErrorMessage(error: unknown): string {
	const body = error instanceof HttpErrorResponse ? error.error : undefined
	const code = body?.code
	const first = Array.isArray(body?.fieldErrors) ? body.fieldErrors[0] : undefined
	const field = typeof first?.field === 'string' ? (first.field as string) : ''
	const label = IMPORT_FIELD_LABELS[field.split('.').at(-1) ?? ''] ?? field
	const specific = typeof first?.code === 'string' ? IMPORT_FIELD_MESSAGES[first.code] : undefined
	if (specific) return specific.replace('{label}', label || 'This field')
	const messages: Record<string, string> = {
		'invalid-request': label ? `Check ${label}.` : 'Check the highlighted fields.',
		'file-too-large': 'Choose a file no larger than 5 MiB.',
		'unsupported-file': 'Choose a CSV or XLSX file that matches the template format.',
		'version-published': 'A published template cannot change. Start a new version instead.',
		'revision-conflict': 'This item changed. Your draft is preserved; reload before continuing.',
		'invalid-state': 'This run or template no longer allows that action. Reload its current state.',
		'idempotency-conflict': 'This retry belongs to another command. Reload before continuing.',
		forbidden: 'You do not have permission for this operation.',
		unauthenticated: 'Your session is no longer available.',
		'not-found': 'This item is no longer available.',
	}
	return typeof code === 'string' && messages[code]
		? messages[code]
		: 'The operation could not be completed. Retry safely with the same draft.'
}
