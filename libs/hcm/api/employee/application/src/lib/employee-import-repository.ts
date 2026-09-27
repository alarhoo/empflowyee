import type { HcmPage } from '@empflowyee/hcm-runtime-contract'
import type {
	ImportAction,
	ImportColumnInput,
	ImportDateFormat,
	ImportFileFormat,
	ImportTransformation,
	MatchStatus,
	Resolution,
	RowStatus,
	RunStatus,
	TemplateStatus,
} from '@empflowyee/hcm-employee-contract'

export interface ImportTemplateRow {
	id: string
	code: string
	versionNumber: number
	name: string
	description: string
	fileFormat: ImportFileFormat
	status: TemplateStatus
	hasHeaderRow: boolean
	dateFormat: ImportDateFormat
	timeZone: string
	columnCount: number
	publishedAt: string | null
	updatedAt: string
	revision: number
}

export interface ImportColumnRow {
	id: string
	sourceColumnName: string
	sourceColumnOrdinal: number
	fieldCode: string
	transformationCode: ImportTransformation
	isMatchKey: boolean
	sortOrder: number
}

export interface ImportRunRow {
	id: string
	templateId: string
	templateCode: string
	templateName: string
	templateVersion: number
	sourceBlobId: string
	fileName: string
	status: RunStatus
	intendedAction: ImportAction
	parserVersion: string | null
	sourceDigest: string
	totalRowCount: number
	validRowCount: number
	invalidRowCount: number
	committedRowCount: number
	failedRowCount: number
	skippedRowCount: number
	unresolvedRowCount: number
	issueCount: number
	failureCode: string | null
	cancelReason: string | null
	requestedBy: string
	requestedByAccountId: string
	requestedAt: string
	validationCompletedAt: string | null
	commitRequestedAt: string | null
	completedAt: string | null
	revision: number
}

export interface ImportRowRow {
	id: string
	rowNumber: number
	digest: string
	status: RowStatus
	matchStatus: MatchStatus
	proposedAction: 'Create' | 'Update' | 'Skip' | 'Reject'
	matchedWorkerIds: string[]
	resolution: Resolution | null
	resolutionWorkerId: string | null
	resolutionReason: string | null
	failureCode: string | null
	resultWorkerId: string | null
	revision: number
}

export interface ImportIssueRow {
	rowId: string | null
	rowNumber: number | null
	fieldCode: string | null
	sourceColumnName: string | null
	severity: 'Warning' | 'Error'
	code: string
	message: string
}

export interface NewImportRow {
	rowNumber: number
	digest: string
	status: RowStatus
	matchStatus: MatchStatus
	proposedAction: 'Create' | 'Update' | 'Skip' | 'Reject'
	matchedWorkerIds: string[]
	issues: Omit<ImportIssueRow, 'rowId' | 'rowNumber'>[]
}

/** Status and timestamps a run transition sets; omitted properties keep their value. */
export interface RunPatch {
	status?: RunStatus
	parserVersion?: string
	failureCode?: string | null
	cancelReason?: string
	validated?: boolean
	commitRequested?: boolean
	completed?: boolean
}

/** Employee-owned import persistence in the caller's transaction. */
export interface EmployeeImportRepository {
	templates(query: {
		limit: number
		cursor?: string
		status?: TemplateStatus
	}): Promise<HcmPage<ImportTemplateRow>>
	template(id: string, lock?: boolean): Promise<ImportTemplateRow | undefined>
	columns(templateId: string): Promise<ImportColumnRow[]>
	/** The next version number of a code, and whether a draft of it exists. */
	versions(code: string): Promise<{ next: number; draft: boolean; latestId: string | null }>
	insertTemplate(input: {
		code: string
		versionNumber: number
		name: string
		description: string
		fileFormat: ImportFileFormat
		hasHeaderRow: boolean
		dateFormat: ImportDateFormat
		timeZone: string
		supersedesId: string | null
	}): Promise<string>
	updateTemplate(
		id: string,
		facts: {
			name: string
			description: string
			fileFormat: ImportFileFormat
			hasHeaderRow: boolean
			dateFormat: ImportDateFormat
			timeZone: string
		},
	): Promise<void>
	replaceColumns(templateId: string, columns: ImportColumnInput[]): Promise<void>
	/** Publish a draft and retire the code's previously published version. */
	publishTemplate(id: string, code: string): Promise<void>
	runs(query: {
		limit: number
		cursor?: string
		status?: RunStatus
	}): Promise<HcmPage<ImportRunRow>>
	run(id: string, lock?: boolean): Promise<ImportRunRow | undefined>
	insertRun(input: {
		id: string
		templateId: string
		sourceBlobId: string
		fileName: string
		intendedAction: ImportAction
		sourceDigest: string
	}): Promise<string>
	updateRun(id: string, patch: RunPatch): Promise<void>
	/** Recount the run's row totals from its rows. */
	recount(id: string): Promise<void>
	rows(
		runId: string,
		query: { limit: number; cursor?: string; status?: RowStatus; matchStatus?: MatchStatus },
	): Promise<HcmPage<ImportRowRow>>
	row(runId: string, rowId: string, lock?: boolean): Promise<ImportRowRow | undefined>
	allRows(runId: string): Promise<ImportRowRow[]>
	insertRows(runId: string, rows: NewImportRow[]): Promise<void>
	/** Record run-level issues, not tied to a row. */
	insertRunIssues(
		runId: string,
		issues: Omit<ImportIssueRow, 'rowId' | 'rowNumber'>[],
	): Promise<void>
	resolveRow(
		rowId: string,
		resolution: { resolution: Resolution; workerId: string | null; reason: string | null },
	): Promise<void>
	markRow(
		rowId: string,
		outcome: { status: RowStatus; resultWorkerId?: string | null; failureCode?: string | null },
	): Promise<void>
	issues(runId: string, rowIds?: string[]): Promise<ImportIssueRow[]>
	/** Run work in a savepoint: a failure rolls back only that work and is rethrown. */
	savepoint<T>(work: () => Promise<T>): Promise<T>
	/** Names and numbers of workers for candidate display. */
	workers(ids: string[]): Promise<Map<string, { name: string; workerNumber: string }>>
	/** Workers whose number is one of the given numbers. */
	workersByNumber(numbers: string[]): Promise<Map<string, string>>
}
