import {
	boolValue,
	codeValue,
	enumValue,
	idValue,
	intValue,
	invalidField,
	readBody,
	readListQuery,
	revisionValue,
	textValue,
	timeZoneValue,
	type HcmPage,
} from '@empflowyee/hcm-runtime-contract'

/**
 * Employee Import vocabulary (Employee Import TDD#API): versioned templates that map source
 * columns to importable standard fields, bounded runs validated without side effects, per-row
 * match resolution under DEC-HCM2-001, and an idempotent commit. No DTO carries a source value.
 */
export const IMPORT_FILE_FORMATS = ['Csv', 'Xlsx'] as const
export type ImportFileFormat = (typeof IMPORT_FILE_FORMATS)[number]
export const IMPORT_DATE_FORMATS = ['yyyy-MM-dd', 'dd/MM/yyyy', 'MM/dd/yyyy', 'dd.MM.yyyy'] as const
export type ImportDateFormat = (typeof IMPORT_DATE_FORMATS)[number]
export const IMPORT_TRANSFORMATIONS = ['none', 'trim', 'uppercase', 'lowercase'] as const
export type ImportTransformation = (typeof IMPORT_TRANSFORMATIONS)[number]
export const IMPORT_ACTIONS = ['Create', 'Update', 'Upsert'] as const
export type ImportAction = (typeof IMPORT_ACTIONS)[number]
export const TEMPLATE_STATUSES = ['Draft', 'Published', 'Retired'] as const
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number]
export const RUN_STATUSES = [
	'Uploaded',
	'Validating',
	'ReadyToCommit',
	'Committing',
	'Completed',
	'CompletedWithErrors',
	'Failed',
	'Cancelled',
] as const
export type RunStatus = (typeof RUN_STATUSES)[number]
export const ROW_STATUSES = ['Valid', 'Invalid', 'Committed', 'CommitFailed', 'Skipped'] as const
export type RowStatus = (typeof ROW_STATUSES)[number]
export const MATCH_STATUSES = ['NotRequired', 'None', 'Unique', 'Ambiguous'] as const
export type MatchStatus = (typeof MATCH_STATUSES)[number]
export const RESOLUTIONS = ['UseExisting', 'CreateNew', 'Skip'] as const
export type Resolution = (typeof RESOLUTIONS)[number]

/** The parser version recorded when validation starts. */
export const IMPORT_PARSER_VERSION = 'hcm-import-1'
/** DEC-EMPLOYEE-IMPORT-003: synchronous runs are bounded. */
export const IMPORT_MAX_ROWS = 2000

export type ImportFieldKind =
	| 'text'
	| 'date'
	| 'email'
	| 'worker-number'
	| 'reference'
	| 'employment-type'
	| 'work-mode'
	| 'integer'
	| 'decimal'

/**
 * Standard fields whose product policy allows import. `updatable` fields may be corrected by an
 * Update; employment and assignment facts change only through Employment Changes (business rule 16).
 */
export interface ImportFieldPolicy {
	name: string
	kind: ImportFieldKind
	/** Required in a row that creates a worker. */
	requiredForCreate: boolean
	updatable: boolean
	/** May identify an existing worker for an Update. */
	matchKey: boolean
	/** The reference list a code resolves against. */
	reference?:
		| 'genders'
		| 'marital-statuses'
		| 'countries'
		| 'worker-types'
		| 'legal-entities'
		| 'units'
		| 'departments'
		| 'designations'
		| 'locations'
		| 'workers'
	maxLength?: number
}

export const IMPORT_FIELDS: Record<string, ImportFieldPolicy> = {
	'legal-given-name': {
		name: 'Legal first name',
		kind: 'text',
		requiredForCreate: true,
		updatable: true,
		matchKey: false,
		maxLength: 100,
	},
	'legal-middle-name': {
		name: 'Legal middle name',
		kind: 'text',
		requiredForCreate: false,
		updatable: true,
		matchKey: false,
		maxLength: 100,
	},
	'legal-family-name': {
		name: 'Legal last name',
		kind: 'text',
		requiredForCreate: true,
		updatable: true,
		matchKey: false,
		maxLength: 100,
	},
	'preferred-name': {
		name: 'Preferred name',
		kind: 'text',
		requiredForCreate: false,
		updatable: true,
		matchKey: false,
		maxLength: 100,
	},
	'former-name': {
		name: 'Former name',
		kind: 'text',
		requiredForCreate: false,
		updatable: true,
		matchKey: false,
		maxLength: 100,
	},
	'birth-date': {
		name: 'Birth date',
		kind: 'date',
		requiredForCreate: false,
		updatable: true,
		matchKey: false,
	},
	gender: {
		name: 'Gender',
		kind: 'reference',
		reference: 'genders',
		requiredForCreate: false,
		updatable: true,
		matchKey: false,
	},
	'marital-status': {
		name: 'Marital status',
		kind: 'reference',
		reference: 'marital-statuses',
		requiredForCreate: false,
		updatable: true,
		matchKey: false,
	},
	nationality: {
		name: 'Nationality',
		kind: 'reference',
		reference: 'countries',
		requiredForCreate: false,
		updatable: true,
		matchKey: false,
	},
	'worker-number': {
		name: 'Worker number',
		kind: 'worker-number',
		requiredForCreate: true,
		updatable: false,
		matchKey: true,
	},
	'worker-type': {
		name: 'Worker type',
		kind: 'reference',
		reference: 'worker-types',
		requiredForCreate: false,
		updatable: false,
		matchKey: false,
	},
	'work-email': {
		name: 'Work email',
		kind: 'email',
		requiredForCreate: false,
		updatable: false,
		matchKey: true,
		maxLength: 254,
	},
	'legal-entity': {
		name: 'Legal entity',
		kind: 'reference',
		reference: 'legal-entities',
		requiredForCreate: true,
		updatable: false,
		matchKey: false,
	},
	'employment-type': {
		name: 'Employment type',
		kind: 'employment-type',
		requiredForCreate: false,
		updatable: false,
		matchKey: false,
	},
	'hire-date': {
		name: 'Hire date',
		kind: 'date',
		requiredForCreate: true,
		updatable: false,
		matchKey: false,
	},
	probation: {
		name: 'Probation end date',
		kind: 'date',
		requiredForCreate: false,
		updatable: false,
		matchKey: false,
	},
	'notice-period': {
		name: 'Notice period in days',
		kind: 'integer',
		requiredForCreate: false,
		updatable: false,
		matchKey: false,
	},
	'organisation-unit': {
		name: 'Organisation unit',
		kind: 'reference',
		reference: 'units',
		requiredForCreate: true,
		updatable: false,
		matchKey: false,
	},
	department: {
		name: 'Department',
		kind: 'reference',
		reference: 'departments',
		requiredForCreate: false,
		updatable: false,
		matchKey: false,
	},
	designation: {
		name: 'Designation',
		kind: 'reference',
		reference: 'designations',
		requiredForCreate: true,
		updatable: false,
		matchKey: false,
	},
	location: {
		name: 'Location',
		kind: 'reference',
		reference: 'locations',
		requiredForCreate: true,
		updatable: false,
		matchKey: false,
	},
	manager: {
		name: 'Manager',
		kind: 'reference',
		reference: 'workers',
		requiredForCreate: false,
		updatable: false,
		matchKey: false,
	},
	'work-mode': {
		name: 'Work mode',
		kind: 'work-mode',
		requiredForCreate: false,
		updatable: false,
		matchKey: false,
	},
	'full-time-equivalent': {
		name: 'Full-time equivalent',
		kind: 'decimal',
		requiredForCreate: false,
		updatable: false,
		matchKey: false,
	},
	'standard-hours': {
		name: 'Standard weekly hours',
		kind: 'decimal',
		requiredForCreate: false,
		updatable: false,
		matchKey: false,
	},
	'cost-centre': {
		name: 'Cost centre',
		kind: 'text',
		requiredForCreate: false,
		updatable: false,
		matchKey: false,
		maxLength: 40,
	},
}

export interface ImportColumnDto {
	id: string
	sourceColumnName: string
	sourceColumnOrdinal: number
	fieldCode: string
	fieldName: string
	transformationCode: ImportTransformation
	isMatchKey: boolean
	sortOrder: number
}

export interface ImportTemplateDto {
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

export interface ImportTemplateDetailDto extends ImportTemplateDto {
	columns: ImportColumnDto[]
	/** Presentation hints; every command re-authorizes on the server. */
	actions: { edit: boolean; publish: boolean; newVersion: boolean }
}

export type ImportTemplatePage = HcmPage<ImportTemplateDto>

export interface ImportRunDto {
	id: string
	template: { id: string; code: string; name: string; versionNumber: number }
	fileName: string
	intendedAction: ImportAction
	status: RunStatus
	totalRowCount: number
	validRowCount: number
	invalidRowCount: number
	committedRowCount: number
	failedRowCount: number
	skippedRowCount: number
	/** Valid matched rows that still need a resolution. */
	unresolvedRowCount: number
	issueCount: number
	parserVersion: string | null
	failureCode: string | null
	requestedBy: string
	requestedByMe: boolean
	requestedAt: string
	validationCompletedAt: string | null
	commitRequestedAt: string | null
	completedAt: string | null
	cancelReason: string | null
	actions: { validate: boolean; commit: boolean; cancel: boolean }
	revision: number
}

export type ImportRunPage = HcmPage<ImportRunDto>

/** A run with the issues that concern the whole file rather than one row. */
export interface ImportRunDetailDto extends ImportRunDto {
	issues: ImportIssueDto[]
}

export interface ImportIssueDto {
	fieldCode: string | null
	fieldName: string | null
	sourceColumnName: string | null
	severity: 'Warning' | 'Error'
	code: string
	message: string
}

export interface ImportCandidateDto {
	workerId: string
	name: string
	workerNumber: string
}

export interface ImportRowDto {
	id: string
	rowNumber: number
	status: RowStatus
	matchStatus: MatchStatus
	proposedAction: 'Create' | 'Update' | 'Skip' | 'Reject'
	candidates: ImportCandidateDto[]
	resolution: Resolution | null
	resolutionWorkerId: string | null
	resolutionReason: string | null
	/** Whether the row needs a resolution before it can commit. */
	needsResolution: boolean
	issues: ImportIssueDto[]
	failureCode: string | null
	resultWorkerId: string | null
	revision: number
}

export type ImportRowPage = HcmPage<ImportRowDto>

// Commands and queries.

export interface ImportColumnInput {
	sourceColumnName: string
	sourceColumnOrdinal: number
	fieldCode: string
	transformationCode: ImportTransformation
	isMatchKey: boolean
}

export interface TemplateFactsInput {
	name: string
	description: string
	fileFormat: ImportFileFormat
	hasHeaderRow: boolean
	dateFormat: ImportDateFormat
	timeZone: string
	columns: ImportColumnInput[]
}

export interface CreateTemplateCommand extends TemplateFactsInput {
	code: string
	reason: string
}

export interface UpdateTemplateCommand extends TemplateFactsInput {
	expectedRevision: number
	reason: string
}

export interface ResolveRowCommand {
	resolution: Resolution
	candidateWorkerId: string | null
	reason: string | null
	expectedRevision: number
}

/** Parse the mapped columns: importable fields, allow-listed transformations, unique ordinals. */
function columns(value: unknown): ImportColumnInput[] {
	if (!Array.isArray(value) || !value.length || value.length > 100) invalidField('columns')
	const seenFields = new Set<string>()
	const seenOrdinals = new Set<number>()
	return value.map(
		/** One column. */ (item, index) => {
			const v = readBody(
				item,
				['sourceColumnName', 'sourceColumnOrdinal', 'fieldCode'],
				['transformationCode', 'isMatchKey'],
			)
			const field = `columns.${index}`
			const fieldCode = textValue(v['fieldCode'], `${field}.fieldCode`, 60)
			const policy = IMPORT_FIELDS[fieldCode]
			if (!policy) invalidField(`${field}.fieldCode`, 'not-importable')
			const ordinal = intValue(v['sourceColumnOrdinal'], `${field}.sourceColumnOrdinal`, 1, 100)
			if (seenFields.has(fieldCode)) invalidField(`${field}.fieldCode`, 'duplicate')
			if (seenOrdinals.has(ordinal)) invalidField(`${field}.sourceColumnOrdinal`, 'duplicate')
			seenFields.add(fieldCode)
			seenOrdinals.add(ordinal)
			const isMatchKey =
				v['isMatchKey'] === undefined ? false : boolValue(v['isMatchKey'], `${field}.isMatchKey`)
			if (isMatchKey && !policy.matchKey) invalidField(`${field}.isMatchKey`, 'not-match-key')
			return {
				sourceColumnName: textValue(v['sourceColumnName'], `${field}.sourceColumnName`, 100),
				sourceColumnOrdinal: ordinal,
				fieldCode,
				transformationCode: transformationValue(v['transformationCode'], field),
				isMatchKey,
			}
		},
	)
}

/** Parse the facts a template draft carries. */
function templateFacts(v: Record<string, unknown>): TemplateFactsInput {
	return {
		name: textValue(v['name'], 'name', 100),
		description:
			v['description'] === undefined || v['description'] === null
				? ''
				: textValue(v['description'], 'description', 500, false),
		fileFormat: enumValue(v['fileFormat'], 'fileFormat', IMPORT_FILE_FORMATS),
		hasHeaderRow: boolValue(v['hasHeaderRow'], 'hasHeaderRow'),
		dateFormat: enumValue(v['dateFormat'], 'dateFormat', IMPORT_DATE_FORMATS),
		timeZone: timeZoneValue(v['timeZone'], 'timeZone'),
		columns: columns(v['columns']),
	}
}

const TEMPLATE_FIELDS = ['name', 'fileFormat', 'hasHeaderRow', 'dateFormat', 'timeZone', 'columns']

/** A column's transformation; `none` when absent. */
function transformationValue(value: unknown, field: string): ImportTransformation {
	if (value === undefined) return 'none'
	return enumValue(value, `${field}.transformationCode`, IMPORT_TRANSFORMATIONS)
}

/** Parse a new template. */
export function parseCreateTemplate(body: unknown): CreateTemplateCommand {
	const v = readBody(body, ['code', ...TEMPLATE_FIELDS, 'reason'], ['description'])
	return {
		code: codeValue(v['code'], 'code'),
		...templateFacts(v),
		reason: textValue(v['reason'], 'reason', 500),
	}
}

/** Parse a draft template update. */
export function parseUpdateTemplate(body: unknown): UpdateTemplateCommand {
	const v = readBody(body, [...TEMPLATE_FIELDS, 'expectedRevision', 'reason'], ['description'])
	return {
		...templateFacts(v),
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: textValue(v['reason'], 'reason', 500),
	}
}

/** Parse a publish command. */
export function parsePublishTemplate(body: unknown): { expectedRevision: number; reason: string } {
	const v = readBody(body, ['expectedRevision', 'reason'])
	return {
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: textValue(v['reason'], 'reason', 500),
	}
}

/** Parse a new-version command. */
export function parseNewTemplateVersion(body: unknown): { reason: string } {
	const v = readBody(body, ['reason'])
	return { reason: textValue(v['reason'], 'reason', 500) }
}

/** Parse the metadata part of a run upload. */
export function parseRunMetadata(body: unknown): {
	templateId: string
	intendedAction: ImportAction
} {
	const v = readBody(body, ['templateId', 'intendedAction'])
	return {
		templateId: idValue(v['templateId'], 'templateId'),
		intendedAction: enumValue(v['intendedAction'], 'intendedAction', IMPORT_ACTIONS),
	}
}

/** Parse a command that only quotes the revision. */
export function parseImportRevision(body: unknown): { expectedRevision: number } {
	const v = readBody(body, ['expectedRevision'])
	return { expectedRevision: revisionValue(v['expectedRevision']) }
}

/** Parse a run cancellation. */
export function parseCancelRun(body: unknown): { expectedRevision: number; reason: string } {
	const v = readBody(body, ['expectedRevision', 'reason'])
	return {
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: textValue(v['reason'], 'reason', 500),
	}
}

/** Parse a row resolution. */
export function parseResolveRow(body: unknown): ResolveRowCommand {
	const v = readBody(body, ['resolution', 'expectedRevision'], ['candidateWorkerId', 'reason'])
	const resolution = enumValue(v['resolution'], 'resolution', RESOLUTIONS)
	const candidateWorkerId =
		v['candidateWorkerId'] === undefined || v['candidateWorkerId'] === null
			? null
			: idValue(v['candidateWorkerId'], 'candidateWorkerId')
	const reason =
		v['reason'] === undefined || v['reason'] === null ? null : textValue(v['reason'], 'reason', 500)
	if (resolution === 'UseExisting' && !candidateWorkerId)
		invalidField('candidateWorkerId', 'required')
	if (resolution === 'CreateNew' && !reason) invalidField('reason', 'required')
	return {
		resolution,
		candidateWorkerId,
		reason,
		expectedRevision: revisionValue(v['expectedRevision']),
	}
}

/** Parse a template page query. */
export function parseTemplateQuery(params: URLSearchParams) {
	const query = readListQuery(params, ['createdAt:desc'], ['status'])
	return {
		limit: query.limit,
		...(query.cursor ? { cursor: query.cursor } : {}),
		...(query.filters['status']
			? { status: enumValue(query.filters['status'], 'status', TEMPLATE_STATUSES) }
			: {}),
	}
}

/** Parse a run page query. */
export function parseRunQuery(params: URLSearchParams) {
	const query = readListQuery(params, ['createdAt:desc'], ['status'])
	return {
		limit: query.limit,
		...(query.cursor ? { cursor: query.cursor } : {}),
		...(query.filters['status']
			? { status: enumValue(query.filters['status'], 'status', RUN_STATUSES) }
			: {}),
	}
}

/** Parse a row page query. */
export function parseRowQuery(params: URLSearchParams) {
	const query = readListQuery(params, ['rowNumber:asc'], ['status', 'matchStatus'])
	return {
		limit: query.limit,
		...(query.cursor ? { cursor: query.cursor } : {}),
		...(query.filters['status']
			? { status: enumValue(query.filters['status'], 'status', ROW_STATUSES) }
			: {}),
		...(query.filters['matchStatus']
			? { matchStatus: enumValue(query.filters['matchStatus'], 'matchStatus', MATCH_STATUSES) }
			: {}),
	}
}
