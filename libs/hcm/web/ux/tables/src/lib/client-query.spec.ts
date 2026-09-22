import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { queryClientRows } from './client-query'
import { HcmEnterpriseTable } from './enterprise-table.component'
import { DEFAULT_TABLE_QUERY } from './table.models'

const columns = [{ id: 'name', label: 'Name', sortable: true }]
const rows = [
	{ id: 'a', cells: { name: 'Item 10' } },
	{ id: 'b', cells: { name: 'Item 2' } },
	{ id: 'c', cells: { name: 'Other' } },
]

describe('Enterprise table contracts', /** Verify our data ownership and query transforms, not SAP table internals. */ () => {
	it('filters, naturally sorts and pages without mutating source data', /** Client mode may transform only its bounded supplied collection. */ () => {
		const page = queryClientRows(rows, columns, {
			search: 'item',
			page: 0,
			pageSize: 1,
			sort: { column: 'name', direction: 'asc' },
		})
		expect(page.total).toBe(2)
		expect(page.rows[0].id).toBe('b')
		expect(rows[0].id).toBe('a')
	})
	it('clamps invalid page sizes and pages after the result shrinks', /** Malformed paging cannot produce NaN counts or unbounded slices. */ () => {
		const page = queryClientRows(rows, columns, { search: '', page: 99, pageSize: 0 })
		expect(page.rows).toHaveLength(1)
		expect(page.page).toBe(2)
	})
	it('preserves server rows and delegates search with a first-page reset', /** A server page is never treated as the complete collection. */ () => {
		const fixture = TestBed.createComponent(HcmEnterpriseTable)
		fixture.componentRef.setInput('label', 'Fixture')
		fixture.componentRef.setInput('mode', 'server')
		fixture.componentRef.setInput('columns', columns)
		fixture.componentRef.setInput('rows', rows)
		fixture.componentRef.setInput('total', 200)
		fixture.componentRef.setInput('query', { ...DEFAULT_TABLE_QUERY, page: 4, search: 'absent' })
		expect(fixture.componentInstance.page().rows).toBe(rows)
		expect(fixture.componentInstance.page().total).toBe(200)
		const request = vi.fn()
		fixture.componentInstance.queryRequested.subscribe(request)
		fixture.componentInstance.search('next')
		expect(request).toHaveBeenCalledWith({ ...DEFAULT_TABLE_QUERY, search: 'next', page: 0 })
	})
})
