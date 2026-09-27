import { describe, expect, it } from 'vitest'
import {
	headerMismatches,
	needsResolution,
	parseCell,
	parseImportDate,
	proposedAction,
	resolutionAllowed,
	rowDigest,
} from './import-rules'

describe('employee import rules', /** Employee Import TDD#RULES. */ () => {
	it('parses dates in the template format and workbook serial dates', /** REQ-EMPLOYEE-IMPORT-003. */ () => {
		expect(parseImportDate('2026-02-03', 'yyyy-MM-dd', false)).toBe('2026-02-03')
		expect(parseImportDate('03/02/2026', 'dd/MM/yyyy', false)).toBe('2026-02-03')
		expect(parseImportDate('02/03/2026', 'MM/dd/yyyy', false)).toBe('2026-02-03')
		expect(parseImportDate('31/02/2026', 'dd/MM/yyyy', false)).toBeNull()
		expect(parseImportDate('45292', 'yyyy-MM-dd', true)).toBe('2024-01-01')
		expect(parseImportDate('45292', 'yyyy-MM-dd', false)).toBeNull()
	})

	it('types cells by field and refuses values with safe codes that never echo them', /** REQ-EMPLOYEE-IMPORT-003. */ () => {
		expect(parseCell('legal-given-name', '  Kevin ', 'trim', 'yyyy-MM-dd', false)).toEqual({
			value: 'Kevin',
		})
		expect(parseCell('worker-number', 'dm-kevin', 'uppercase', 'yyyy-MM-dd', false)).toEqual({
			value: 'DM-KEVIN',
		})
		expect(parseCell('worker-number', 'dm kevin', 'none', 'yyyy-MM-dd', false)).toEqual({
			issue: 'invalid-worker-number',
		})
		expect(parseCell('work-email', 'Kevin@Dunder.example', 'none', 'yyyy-MM-dd', false)).toEqual({
			value: 'kevin@dunder.example',
		})
		expect(parseCell('work-mode', 'On site', 'none', 'yyyy-MM-dd', false)).toEqual({
			value: 'OnSite',
		})
		expect(parseCell('employment-type', 'fixedterm', 'none', 'yyyy-MM-dd', false)).toEqual({
			value: 'FixedTerm',
		})
		expect(parseCell('full-time-equivalent', '1.5', 'none', 'yyyy-MM-dd', false)).toEqual({
			issue: 'invalid-number',
		})
		expect(parseCell('notice-period', '30', 'none', 'yyyy-MM-dd', false)).toEqual({ value: 30 })
		expect(parseCell('blood-group', 'O+', 'none', 'yyyy-MM-dd', false)).toEqual({
			issue: 'not-importable',
		})
		expect(parseCell('birth-date', '', 'none', 'yyyy-MM-dd', false)).toEqual({ value: null })
	})

	it('matches headers by ordinal and digests rows without keeping values', /** REQ-EMPLOYEE-IMPORT-002. */ () => {
		const columns = [
			{ sourceColumnName: 'Given', sourceColumnOrdinal: 1 },
			{ sourceColumnName: 'Family', sourceColumnOrdinal: 2 },
		]
		expect(headerMismatches(['given', 'Surname'], columns)).toEqual(['Family'])
		expect(rowDigest(['a', 'b'])).toMatch(/^[a-f0-9]{64}$/)
		expect(rowDigest(['a', 'b'])).not.toBe(rowDigest(['a', 'c']))
	})

	it('proposes actions and requires fitting resolutions for matched rows', /** REQ-EMPLOYEE-IMPORT-004. */ () => {
		expect(proposedAction('Create', false)).toBe('Create')
		expect(proposedAction('Create', true)).toBe('Reject')
		expect(proposedAction('Update', false)).toBe('Reject')
		expect(proposedAction('Upsert', true)).toBe('Update')
		expect(needsResolution('Ambiguous', null)).toBe(true)
		expect(needsResolution('None', null)).toBe(false)
		expect(needsResolution('Unique', 'Skip')).toBe(false)
		expect(resolutionAllowed('Update', 'CreateNew')).toBe(false)
		expect(resolutionAllowed('Create', 'CreateNew')).toBe(true)
	})
})
