import type {
	ImportAction,
	ImportDateFormat,
	ImportTransformation,
	MatchStatus,
	Resolution,
	RowStatus,
	RunStatus,
	TemplateStatus,
} from '@empflowyee/hcm-employee-contract'

export const MANAGE_PERMISSION = 'hcm.employee.import.manage'
export const BASE_ROUTE = '/employee/employee-import'

type Semantic = 'positive' | 'critical' | 'negative' | 'informative' | 'neutral'
type Presented = { label: string; status: Semantic }

export const ACTION_LABELS: Record<ImportAction, string> = {
	Create: 'Create new workers',
	Update: 'Update existing workers',
	Upsert: 'Create or update',
}

export const PROPOSED_LABELS: Record<string, string> = {
	Create: 'Create',
	Update: 'Update',
	Skip: 'Skip',
	Reject: 'Reject',
}

export const RESOLUTION_LABELS: Record<Resolution, string> = {
	UseExisting: 'Use the existing worker',
	CreateNew: 'Create a new worker',
	Skip: 'Skip this row',
}

export const TRANSFORMATION_LABELS: Record<ImportTransformation, string> = {
	none: 'None',
	trim: 'Trim spaces',
	uppercase: 'Upper case',
	lowercase: 'Lower case',
}

export const DATE_FORMAT_LABELS: Record<ImportDateFormat, string> = {
	'yyyy-MM-dd': 'yyyy-MM-dd (2026-01-31)',
	'dd/MM/yyyy': 'dd/MM/yyyy (31/01/2026)',
	'MM/dd/yyyy': 'MM/dd/yyyy (01/31/2026)',
	'dd.MM.yyyy': 'dd.MM.yyyy (31.01.2026)',
}

const RUN_STATUS: Record<RunStatus, Presented> = {
	Uploaded: { label: 'Uploaded, not validated', status: 'neutral' },
	Validating: { label: 'Validating', status: 'informative' },
	ReadyToCommit: { label: 'Ready to commit', status: 'informative' },
	Committing: { label: 'Committing', status: 'informative' },
	Completed: { label: 'Completed', status: 'positive' },
	CompletedWithErrors: { label: 'Completed with errors', status: 'critical' },
	Failed: { label: 'Failed', status: 'negative' },
	Cancelled: { label: 'Cancelled', status: 'neutral' },
}

const ROW_STATUS: Record<RowStatus, Presented> = {
	Valid: { label: 'Valid', status: 'positive' },
	Invalid: { label: 'Invalid', status: 'negative' },
	Committed: { label: 'Committed', status: 'positive' },
	CommitFailed: { label: 'Commit failed', status: 'negative' },
	Skipped: { label: 'Skipped', status: 'neutral' },
}

const MATCH_STATUS: Record<MatchStatus, Presented> = {
	NotRequired: { label: 'Not checked', status: 'neutral' },
	None: { label: 'No match', status: 'positive' },
	Unique: { label: 'One match', status: 'critical' },
	Ambiguous: { label: 'Several matches', status: 'critical' },
}

const TEMPLATE_STATUS: Record<TemplateStatus, Presented> = {
	Draft: { label: 'Draft', status: 'informative' },
	Published: { label: 'Published', status: 'positive' },
	Retired: { label: 'Retired', status: 'neutral' },
}

/** Semantic presentation of a run status. */
export function runStatus(value: RunStatus): Presented {
	return RUN_STATUS[value]
}

/** Semantic presentation of a row status. */
export function rowStatus(value: RowStatus): Presented {
	return ROW_STATUS[value]
}

/** Semantic presentation of a match status. */
export function matchStatus(value: MatchStatus): Presented {
	return MATCH_STATUS[value]
}

/** Semantic presentation of a template status. */
export function templateStatus(value: TemplateStatus): Presented {
	return TEMPLATE_STATUS[value]
}

/** Safe explanations of run and row failure codes. */
export const FAILURE_MESSAGES: Record<string, string> = {
	'header-mismatch': 'The file header does not name the mapped columns.',
	'match-key-required': 'Update and Upsert need a template with a match key column.',
	'too-many-rows': 'The file has more than 2,000 data rows.',
	'unsupported-file': 'The file could not be read as the template format.',
	'invalid-encoding': 'The CSV file is not UTF-8.',
	'macro-enabled': 'Macro-enabled workbooks are not accepted.',
	encrypted: 'Encrypted files are not accepted.',
	'no-row-committed': 'No row could be committed.',
	'source-changed': 'The stored file no longer matches the validated row.',
	'duplicate-code': 'The worker number is already in use.',
	'commit-refused': 'The workforce rules refused this row.',
}

/** The explanation of a failure code. */
export function failureText(code: string | null): string {
	if (!code) return ''
	return FAILURE_MESSAGES[code] ?? 'The workforce rules refused this row.'
}

/** Resolutions that fit a row's proposed action. */
export function resolutionsFor(proposed: string): Resolution[] {
	if (proposed === 'Update') return ['UseExisting', 'Skip']
	return ['UseExisting', 'CreateNew', 'Skip']
}

/** Save a downloaded file without an inline preview or a lasting object URL. */
export function saveFile(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = fileName
	link.click()
	setTimeout(
		/** Release the temporary object URL after saving starts. */ () => URL.revokeObjectURL(url),
		1000,
	)
}
