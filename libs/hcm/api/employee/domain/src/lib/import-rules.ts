import { createHash } from 'node:crypto'
import {
	EMPLOYMENT_TYPES,
	IMPORT_FIELDS,
	WORK_MODES,
	type ImportAction,
	type ImportDateFormat,
	type ImportTransformation,
	type MatchStatus,
	type Resolution,
} from '@empflowyee/hcm-employee-contract'

/** One parsed cell: a typed value, an empty cell, or a safe issue code. */
export type CellResult = { value: string | number | null } | { issue: string }

const WORKER_NUMBER = /^[A-Z0-9][A-Z0-9_-]{1,39}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Apply an allow-listed deterministic transformation. */
export function transform(value: string, code: ImportTransformation): string {
	if (code === 'trim') return value.trim()
	if (code === 'uppercase') return value.toUpperCase()
	if (code === 'lowercase') return value.toLowerCase()
	return value
}

/** A valid ISO date from parts, or null. */
function isoDate(year: number, month: number, day: number): string | null {
	const value = new Date(Date.UTC(year, month - 1, day))
	if (
		value.getUTCFullYear() !== year ||
		value.getUTCMonth() !== month - 1 ||
		value.getUTCDate() !== day
	)
		return null
	return value.toISOString().slice(0, 10)
}

/**
 * Parse a date in the template's format. Workbook dates arrive as serial day numbers of the 1900
 * date system and are read as such; a text date must match the format exactly.
 */
export function parseImportDate(
	raw: string,
	format: ImportDateFormat,
	workbook: boolean,
): string | null {
	const text = raw.trim()
	if (workbook && /^\d{1,6}(\.\d+)?$/.test(text)) {
		const serial = Math.floor(Number(text))
		if (serial < 1 || serial > 2958465) return null
		return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
	}
	const patterns: Record<ImportDateFormat, [RegExp, number, number, number]> = {
		'yyyy-MM-dd': [/^(\d{4})-(\d{2})-(\d{2})$/, 1, 2, 3],
		'dd/MM/yyyy': [/^(\d{2})\/(\d{2})\/(\d{4})$/, 3, 2, 1],
		'MM/dd/yyyy': [/^(\d{2})\/(\d{2})\/(\d{4})$/, 3, 1, 2],
		'dd.MM.yyyy': [/^(\d{2})\.(\d{2})\.(\d{4})$/, 3, 2, 1],
	}
	const [pattern, y, m, d] = patterns[format]
	const match = pattern.exec(text)
	return match ? isoDate(Number(match[y]), Number(match[m]), Number(match[d])) : null
}

/** A bounded decimal with at most two fraction digits. */
function decimal(text: string, min: number, max: number): number | null {
	if (!/^\d+(\.\d{1,2})?$/.test(text)) return null
	const value = Number(text)
	return value >= min && value <= max ? value : null
}

/**
 * Parse one source cell for a standard field. Empty cells are null; a refused value returns a safe
 * issue code and never echoes the value. References stay codes until the caller resolves them.
 */
export function parseCell(
	fieldCode: string,
	raw: string,
	transformation: ImportTransformation,
	dateFormat: ImportDateFormat,
	workbook: boolean,
): CellResult {
	const policy = IMPORT_FIELDS[fieldCode]
	if (!policy) return { issue: 'not-importable' }
	const text = transform(raw, transformation).trim()
	if (!text) return { value: null }
	if (policy.maxLength && text.length > policy.maxLength) return { issue: 'too-long' }
	switch (policy.kind) {
		case 'date': {
			const value = parseImportDate(text, dateFormat, workbook)
			return value ? { value } : { issue: 'invalid-date' }
		}
		case 'email':
			return EMAIL.test(text) ? { value: text.toLowerCase() } : { issue: 'invalid-email' }
		case 'worker-number':
			return WORKER_NUMBER.test(text) ? { value: text } : { issue: 'invalid-worker-number' }
		case 'employment-type': {
			const value = EMPLOYMENT_TYPES.find(
				/** Case-insensitive. */ (item) => item.toLowerCase() === text.toLowerCase(),
			)
			return value ? { value } : { issue: 'unknown-value' }
		}
		case 'work-mode': {
			const compact = text.replace(/[\s-]/g, '').toLowerCase()
			const value = WORK_MODES.find(
				/** Case-insensitive. */ (item) => item.toLowerCase() === compact,
			)
			return value ? { value } : { issue: 'unknown-value' }
		}
		case 'integer':
			return /^\d{1,3}$/.test(text) && Number(text) <= 365
				? { value: Number(text) }
				: { issue: 'invalid-number' }
		case 'decimal': {
			const value =
				fieldCode === 'full-time-equivalent' ? decimal(text, 0.01, 1) : decimal(text, 0.25, 168)
			return value === null ? { issue: 'invalid-number' } : { value }
		}
		case 'reference':
			return text.length <= 60 ? { value: text } : { issue: 'too-long' }
		default:
			return { value: text }
	}
}

/** A digest of a row's source cells, so commit can detect a changed source without keeping it. */
export function rowDigest(cells: readonly string[]): string {
	return createHash('sha256').update(JSON.stringify(cells)).digest('hex')
}

/** Header cells that do not name their mapped column, by ordinal; names compare case-insensitively. */
export function headerMismatches(
	header: readonly string[],
	columns: readonly { sourceColumnName: string; sourceColumnOrdinal: number }[],
): string[] {
	return columns
		.filter(
			/** Mismatch. */ (column) =>
				(header[column.sourceColumnOrdinal - 1] ?? '').trim().toLowerCase() !==
				column.sourceColumnName.trim().toLowerCase(),
		)
		.map(/** Name. */ (column) => column.sourceColumnName)
}

/**
 * The action a validated row proposes. Create creates unless the key names an existing worker;
 * Update needs a key match; Upsert updates a key match and creates otherwise.
 */
export function proposedAction(
	action: ImportAction,
	keyMatched: boolean,
): 'Create' | 'Update' | 'Reject' {
	if (action === 'Create') return keyMatched ? 'Reject' : 'Create'
	if (action === 'Update') return keyMatched ? 'Update' : 'Reject'
	return keyMatched ? 'Update' : 'Create'
}

/** DEC-HCM2-001: every matched row needs a human resolution before it commits. */
export function needsResolution(match: MatchStatus, resolution: Resolution | null): boolean {
	return (match === 'Unique' || match === 'Ambiguous') && resolution === null
}

/** A resolution must fit the row's proposed action: an update uses the existing worker. */
export function resolutionAllowed(
	proposed: 'Create' | 'Update' | 'Skip' | 'Reject',
	resolution: Resolution,
): boolean {
	if (resolution === 'Skip') return true
	if (proposed === 'Update') return resolution === 'UseExisting'
	if (proposed === 'Create') return resolution === 'CreateNew' || resolution === 'UseExisting'
	return false
}
