import { describe, expect, it } from 'vitest'
import { deflateRawSync } from 'node:zlib'
import {
	ImportSourceError,
	inspectImportSource,
	readImportTable,
	type ImportTableLimits,
} from './import-source-reader'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** A CRC-32 of a buffer, as zip headers carry it. */
function crc32(data: Buffer): number {
	let crc = ~0
	for (const byte of data) {
		crc ^= byte
		for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
	}
	return ~crc >>> 0
}

/** A minimal zip archive of deflated entries; `declared` overrides an entry's stated size. */
function zip(
	files: Record<string, string | Buffer>,
	declared: Record<string, number> = {},
): Buffer {
	const locals: Buffer[] = []
	const centrals: Buffer[] = []
	let offset = 0
	for (const [name, content] of Object.entries(files)) {
		const data = Buffer.isBuffer(content) ? content : Buffer.from(content)
		const packed = deflateRawSync(data)
		const nameBytes = Buffer.from(name)
		const size = declared[name] ?? data.length
		const local = Buffer.alloc(30)
		local.writeUInt32LE(0x04034b50, 0)
		local.writeUInt16LE(20, 4)
		local.writeUInt16LE(8, 8)
		local.writeUInt32LE(crc32(data), 14)
		local.writeUInt32LE(packed.length, 18)
		local.writeUInt32LE(size, 22)
		local.writeUInt16LE(nameBytes.length, 26)
		locals.push(local, nameBytes, packed)
		const central = Buffer.alloc(46)
		central.writeUInt32LE(0x02014b50, 0)
		central.writeUInt16LE(20, 4)
		central.writeUInt16LE(20, 6)
		central.writeUInt16LE(8, 10)
		central.writeUInt32LE(crc32(data), 16)
		central.writeUInt32LE(packed.length, 20)
		central.writeUInt32LE(size, 24)
		central.writeUInt16LE(nameBytes.length, 28)
		central.writeUInt32LE(offset, 42)
		centrals.push(central, nameBytes)
		offset += 30 + nameBytes.length + packed.length
	}
	const directory = Buffer.concat(centrals)
	const end = Buffer.alloc(22)
	end.writeUInt32LE(0x06054b50, 0)
	end.writeUInt16LE(Object.keys(files).length, 8)
	end.writeUInt16LE(Object.keys(files).length, 10)
	end.writeUInt32LE(directory.length, 12)
	end.writeUInt32LE(offset, 16)
	return Buffer.concat([...locals, directory, end])
}

/** A one-sheet workbook with the given sheet body and shared strings. */
function workbook(
	rows: string,
	strings: string[] = [],
	extra: Record<string, string> = {},
): Buffer {
	return zip({
		'[Content_Types].xml':
			'<Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
		'xl/workbook.xml':
			'<workbook><sheets><sheet name="People" sheetId="1" r:id="rId1"/><sheet name="Other" sheetId="2" r:id="rId2"/></sheets></workbook>',
		'xl/_rels/workbook.xml.rels':
			'<Relationships><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
		'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${rows}</sheetData></worksheet>`,
		'xl/worksheets/sheet2.xml':
			'<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Ignored</t></is></c></row></sheetData></worksheet>',
		'xl/sharedStrings.xml': `<sst>${strings.map(/** One string. */ (text) => `<si><t>${text}</t></si>`).join('')}</sst>`,
		...extra,
	})
}

/** The safe code of a refused source. */
function code(run: () => unknown): string {
	try {
		run()
		return 'ok'
	} catch (error) {
		return error instanceof ImportSourceError ? error.code : 'other'
	}
}

describe('import source reader', /** Documents IMPORT-SOURCE-FILES. */ () => {
	it('reads UTF-8 CSV with a BOM, quotes, doubled quotes and CRLF line ends', /** POLICY. */ () => {
		const bytes = Buffer.from(
			'﻿given,family,note\r\nJim,"Halpert","says ""hi"", often"\r\nPam,Beesly,\r\n\r\n',
		)
		expect(inspectImportSource(bytes, 'people.csv')).toBe('text/csv')
		expect(readImportTable(bytes, 'text/csv')).toEqual([
			['given', 'family', 'note'],
			['Jim', 'Halpert', 'says "hi", often'],
			['Pam', 'Beesly', ''],
		])
		expect(
			code(
				/** Latin-1 bytes. */ () => inspectImportSource(Buffer.from([0x4a, 0xe9, 0x0a]), 'x.csv'),
			),
		).toBe('invalid-encoding')
	})

	it('reads the first worksheet as cell values, shared and inline strings and cached formula values', /** POLICY. */ () => {
		const bytes = workbook(
			'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Hire &amp; date</t></is></c></row>' +
				'<row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3"><f>1+1</f><v>2</v></c><c r="C3"><v>45292</v></c></row>',
			['Given', 'Jim'],
		)
		expect(inspectImportSource(bytes, 'people.xlsx')).toBe(XLSX)
		expect(readImportTable(bytes, XLSX)).toEqual([
			['Given', '', 'Hire & date'],
			[],
			['Jim', '2', '45292'],
		])
	})

	it('refuses spoofed, macro-enabled and encrypted files', /** TEST. */ () => {
		const csv = Buffer.from('a,b\n1,2\n')
		expect(
			code(/** CSV named as a workbook. */ () => inspectImportSource(csv, 'people.xlsx')),
		).toBe('unsupported-file')
		expect(
			code(/** Workbook named as CSV. */ () => inspectImportSource(workbook(''), 'people.csv')),
		).toBe('unsupported-file')
		expect(code(/** Other extension. */ () => inspectImportSource(csv, 'people.txt'))).toBe(
			'unsupported-file',
		)
		expect(
			code(
				/** A VBA project. */ () =>
					inspectImportSource(workbook('', [], { 'xl/vbaProject.bin': 'x' }), 'p.xlsx'),
			),
		).toBe('macro-enabled')
		const cfb = Buffer.concat([
			Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
			Buffer.alloc(512),
		])
		expect(code(/** An encrypted package. */ () => inspectImportSource(cfb, 'people.xlsx'))).toBe(
			'encrypted',
		)
		expect(
			code(
				/** Too large. */ () => inspectImportSource(Buffer.alloc(5 * 1024 * 1024 + 1, 65), 'p.csv'),
			),
		).toBe('file-too-large')
	})

	it('stops a decompression bomb and bounds rows, columns and cells', /** TEST. */ () => {
		const bomb = zip(
			{
				'[Content_Types].xml': '<Types/>',
				'xl/workbook.xml': '<workbook><sheets><sheet r:id="rId1"/></sheets></workbook>',
				'xl/_rels/workbook.xml.rels':
					'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
				'xl/worksheets/sheet1.xml': Buffer.alloc(8 * 1024 * 1024, 32),
			},
			{ 'xl/worksheets/sheet1.xml': 1024 },
		)
		expect(
			code(/** Inflates beyond its stated size. */ () => inspectImportSource(bomb, 'bomb.xlsx')),
		).toBe('archive-too-large')
		const limits: ImportTableLimits = {
			maxRows: 3,
			maxColumns: 2,
			maxCellLength: 5,
			maxInflatedBytes: 1024 * 1024,
		}
		expect(
			code(/** Rows. */ () => readImportTable(Buffer.from('a\nb\nc\nd\n'), 'text/csv', limits)),
		).toBe('too-many-rows')
		expect(
			code(/** Columns. */ () => readImportTable(Buffer.from('a,b,c\n'), 'text/csv', limits)),
		).toBe('too-many-columns')
		expect(
			code(/** Cells. */ () => readImportTable(Buffer.from('abcdef\n'), 'text/csv', limits)),
		).toBe('cell-too-long')
	})
})
