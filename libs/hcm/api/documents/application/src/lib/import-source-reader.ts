import { inflateRawSync } from 'node:zlib'

/**
 * Bounded readers for import source files (documents IMPORT-SOURCE-FILES#POLICY). CSV is UTF-8
 * with or without BOM. XLSX is read as cell values only: formulas are never evaluated (a cached
 * value is read as text), external links are ignored, macro-enabled and encrypted workbooks are
 * rejected, only the first worksheet is read, and every archive entry is inflated under a size
 * budget so a decompression bomb fails safely.
 */
export const IMPORT_SOURCE_MEDIA_TYPES = [
	'text/csv',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const
export type ImportSourceMediaType = (typeof IMPORT_SOURCE_MEDIA_TYPES)[number]
export const IMPORT_SOURCE_MAX_BYTES = 5 * 1024 * 1024

export type ImportSourceErrorCode =
	| 'unsupported-file'
	| 'file-too-large'
	| 'macro-enabled'
	| 'encrypted'
	| 'invalid-encoding'
	| 'too-many-rows'
	| 'too-many-columns'
	| 'cell-too-long'
	| 'archive-too-large'

/** A refused import source; the code is safe to show and never carries file content. */
export class ImportSourceError extends Error {
	/** Keep the safe code. */
	constructor(readonly code: ImportSourceErrorCode) {
		super(code)
	}
}

export interface ImportTableLimits {
	/** Rows read including a header row; one more row than allowed reports too-many-rows. */
	maxRows: number
	maxColumns: number
	maxCellLength: number
	/** Total bytes an XLSX archive may inflate to. */
	maxInflatedBytes: number
}

export const DEFAULT_IMPORT_LIMITS: ImportTableLimits = {
	maxRows: 2001,
	maxColumns: 100,
	maxCellLength: 1000,
	maxInflatedBytes: 40 * 1024 * 1024,
}

const XLSX = IMPORT_SOURCE_MEDIA_TYPES[1]
const ZIP_LOCAL = 0x04034b50
const ZIP_CENTRAL = 0x02014b50
const ZIP_END = 0x06054b50
const CFB = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

/**
 * Decide an upload's media type from its content and name; extension and browser type alone are
 * never trusted. Workbooks are opened far enough to refuse macros and encryption.
 */
export function inspectImportSource(bytes: Buffer, filename: string): ImportSourceMediaType {
	if (bytes.length > IMPORT_SOURCE_MAX_BYTES) throw new ImportSourceError('file-too-large')
	if (!bytes.length) throw new ImportSourceError('unsupported-file')
	const name = filename.toLowerCase()
	// Encrypted OOXML workbooks are OLE compound files, not zip archives.
	if (bytes.subarray(0, 8).equals(CFB))
		throw new ImportSourceError(name.endsWith('.xlsx') ? 'encrypted' : 'unsupported-file')
	if (name.endsWith('.xlsx')) {
		if (!zipped(bytes)) throw new ImportSourceError('unsupported-file')
		workbookSheet(bytes, DEFAULT_IMPORT_LIMITS)
		return XLSX
	}
	if (name.endsWith('.csv')) {
		if (zipped(bytes) || bytes.includes(0)) throw new ImportSourceError('unsupported-file')
		decodeUtf8(bytes)
		return 'text/csv'
	}
	throw new ImportSourceError('unsupported-file')
}

/** Whether bytes start with a zip local file header. */
function zipped(bytes: Buffer): boolean {
	return bytes.length >= 4 && bytes.readUInt32LE(0) === ZIP_LOCAL
}

/** Read the rows of an import source as text cells. */
export function readImportTable(
	bytes: Buffer,
	mediaType: ImportSourceMediaType,
	limits: ImportTableLimits = DEFAULT_IMPORT_LIMITS,
): string[][] {
	const rows = mediaType === XLSX ? readXlsx(bytes, limits) : readCsv(decodeUtf8(bytes), limits)
	// Trailing blank rows are not data.
	while (rows.length && rows[rows.length - 1]?.every(/** Blank. */ (cell) => cell === ''))
		rows.pop()
	return rows
}

/** Decode strict UTF-8 and drop a byte order mark. */
function decodeUtf8(bytes: Buffer): string {
	try {
		return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
	} catch {
		throw new ImportSourceError('invalid-encoding')
	}
}

/** Check one row and cell against the limits. */
function bounded(rows: string[][], row: string[], limits: ImportTableLimits): void {
	if (row.length > limits.maxColumns) throw new ImportSourceError('too-many-columns')
	if (row.some(/** Oversized. */ (cell) => cell.length > limits.maxCellLength))
		throw new ImportSourceError('cell-too-long')
	if (rows.length >= limits.maxRows) throw new ImportSourceError('too-many-rows')
	rows.push(row)
}

/** RFC 4180 CSV: quoted fields, doubled quotes, and CRLF or LF line ends. */
function readCsv(text: string, limits: ImportTableLimits): string[][] {
	const rows: string[][] = []
	let row: string[] = []
	let cell = ''
	let quoted = false
	for (let i = 0; i < text.length; i++) {
		const char = text[i]
		if (quoted) {
			if (char === '"' && text[i + 1] === '"') {
				cell += '"'
				i++
			} else if (char === '"') quoted = false
			else cell += char
			if (cell.length > limits.maxCellLength) throw new ImportSourceError('cell-too-long')
			continue
		}
		if (char === '"' && cell === '') quoted = true
		else if (char === ',') {
			row.push(cell)
			cell = ''
		} else if (char === '\n' || char === '\r') {
			if (char === '\r' && text[i + 1] === '\n') i++
			row.push(cell)
			bounded(rows, row, limits)
			row = []
			cell = ''
		} else cell += char
	}
	if (quoted) throw new ImportSourceError('unsupported-file')
	if (cell !== '' || row.length) {
		row.push(cell)
		bounded(rows, row, limits)
	}
	return rows
}

interface ZipEntry {
	name: string
	method: number
	flags: number
	compressed: number
	size: number
	offset: number
}

/** The central directory of a zip archive; zip64 and encrypted entries are refused. */
function entries(bytes: Buffer): Map<string, ZipEntry> {
	const start = Math.max(0, bytes.length - 65557)
	let end = -1
	for (let i = bytes.length - 22; i >= start; i--)
		if (bytes.readUInt32LE(i) === ZIP_END) {
			end = i
			break
		}
	if (end < 0) throw new ImportSourceError('unsupported-file')
	const count = bytes.readUInt16LE(end + 10)
	let position = bytes.readUInt32LE(end + 16)
	const result = new Map<string, ZipEntry>()
	for (let i = 0; i < count; i++) {
		if (position + 46 > bytes.length || bytes.readUInt32LE(position) !== ZIP_CENTRAL)
			throw new ImportSourceError('unsupported-file')
		const flags = bytes.readUInt16LE(position + 8)
		const method = bytes.readUInt16LE(position + 10)
		const compressed = bytes.readUInt32LE(position + 20)
		const size = bytes.readUInt32LE(position + 24)
		const nameLength = bytes.readUInt16LE(position + 28)
		const extraLength = bytes.readUInt16LE(position + 30)
		const commentLength = bytes.readUInt16LE(position + 32)
		const offset = bytes.readUInt32LE(position + 42)
		const name = bytes.subarray(position + 46, position + 46 + nameLength).toString('utf8')
		if (flags & 1) throw new ImportSourceError('encrypted')
		if (compressed === 0xffffffff || size === 0xffffffff || offset === 0xffffffff)
			throw new ImportSourceError('archive-too-large')
		result.set(name, { name, method, flags, compressed, size, offset })
		position += 46 + nameLength + extraLength + commentLength
	}
	return result
}

/** Inflate one entry within the remaining budget. */
function inflate(bytes: Buffer, entry: ZipEntry, budget: { left: number }): string {
	if (entry.size > budget.left) throw new ImportSourceError('archive-too-large')
	if (entry.offset + 30 > bytes.length || bytes.readUInt32LE(entry.offset) !== ZIP_LOCAL)
		throw new ImportSourceError('unsupported-file')
	const data =
		entry.offset +
		30 +
		bytes.readUInt16LE(entry.offset + 26) +
		bytes.readUInt16LE(entry.offset + 28)
	const raw = bytes.subarray(data, data + entry.compressed)
	let out: Buffer
	if (entry.method === 0) out = raw
	else if (entry.method === 8) {
		try {
			out = inflateRawSync(raw, {
				maxOutputLength: Math.max(1, Math.min(budget.left, entry.size + 1)),
			})
		} catch {
			throw new ImportSourceError('archive-too-large')
		}
	} else throw new ImportSourceError('unsupported-file')
	if (out.length !== entry.size) throw new ImportSourceError('unsupported-file')
	budget.left -= out.length
	return out.toString('utf8')
}

/** Decode XML character entities. */
function unescape(text: string): string {
	return text.replace(
		/&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|apos);/g,
		/** One entity. */ (_, code: string) => {
			if (code[0] === '#')
				return String.fromCodePoint(
					code[1] === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10),
				)
			return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[code] as string
		},
	)
}

/** One attribute of an XML start tag. */
function attribute(tag: string, name: string): string | undefined {
	return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
}

/** Text runs of an element body, concatenated. */
function textOf(body: string): string {
	let text = ''
	for (const match of body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g))
		text += unescape(match[1] ?? '')
	return text
}

/** The first worksheet XML and shared strings, after refusing macros. */
function workbookSheet(
	bytes: Buffer,
	limits: ImportTableLimits,
): { sheet: string; strings: string[] } {
	const zip = entries(bytes)
	const budget = { left: limits.maxInflatedBytes }
	/** Read one archive entry. */
	const read = (name: string) => {
		const entry = zip.get(name)
		return entry ? inflate(bytes, entry, budget) : undefined
	}
	const types = read('[Content_Types].xml')
	if (!types) throw new ImportSourceError('unsupported-file')
	if (zip.has('xl/vbaProject.bin') || /macroEnabled/i.test(types))
		throw new ImportSourceError('macro-enabled')
	const workbook = read('xl/workbook.xml')
	const rels = read('xl/_rels/workbook.xml.rels')
	if (!workbook || !rels) throw new ImportSourceError('unsupported-file')
	const firstSheet = /<sheet\s[^>]*>/.exec(workbook)?.[0]
	const relation = firstSheet ? attribute(firstSheet, 'r:id') : undefined
	const target = [...rels.matchAll(/<Relationship\s[^>]*>/g)]
		.map(/** Tag. */ (match) => match[0])
		.find(/** The first sheet's relation. */ (tag) => attribute(tag, 'Id') === relation)
	const path = target ? attribute(target, 'Target') : undefined
	if (!path || attribute(target ?? '', 'TargetMode') === 'External')
		throw new ImportSourceError('unsupported-file')
	const sheet = read(path.startsWith('/') ? path.slice(1) : `xl/${path}`)
	if (!sheet) throw new ImportSourceError('unsupported-file')
	const shared = read('xl/sharedStrings.xml') ?? ''
	const strings = [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(
		/** One string. */ (match) => textOf(match[1] ?? ''),
	)
	return { sheet, strings }
}

/** Zero-based column of a cell reference such as `AB12`. */
function column(reference: string): number {
	let value = 0
	for (const char of reference.replace(/[0-9]+$/, ''))
		value = value * 26 + (char.charCodeAt(0) - 64)
	return value - 1
}

/** Cell values of the first worksheet, by row number; formulas are read as cached values. */
function readXlsx(bytes: Buffer, limits: ImportTableLimits): string[][] {
	const { sheet, strings } = workbookSheet(bytes, limits)
	const rows: string[][] = []
	for (const rowMatch of sheet.matchAll(/<row\s([^>]*)>([\s\S]*?)<\/row>|<row\s([^>]*)\/>/g)) {
		const number = Number(attribute(` ${rowMatch[1] ?? rowMatch[3] ?? ''}`, 'r') ?? rows.length + 1)
		while (rows.length < number - 1) bounded(rows, [], limits)
		const row: string[] = []
		for (const cell of (rowMatch[2] ?? '').matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
			const tag = ` ${cell[1] ?? ''}`
			const index = column(attribute(tag, 'r') ?? 'A1')
			if (index < 0 || index >= limits.maxColumns) throw new ImportSourceError('too-many-columns')
			const body = cell[2] ?? ''
			const type = attribute(tag, 't')
			const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
			let value = ''
			if (type === 's') value = strings[Number(raw)] ?? ''
			else if (type === 'inlineStr') value = textOf(body)
			else if (raw !== undefined) value = unescape(raw)
			while (row.length < index) row.push('')
			row[index] = value
		}
		bounded(rows, row, limits)
	}
	return rows
}
