import type { HcmTableColumn, HcmTablePage, HcmTableQuery, HcmTableRow } from './table.models'

/** Clamp UI paging values before they reach array slicing or a feature's query mapper. */
export function normalizeTableQuery(query: HcmTableQuery): HcmTableQuery {
	return {
		...query,
		page: Number.isFinite(query.page) ? Math.max(0, Math.trunc(query.page)) : 0,
		pageSize: Number.isFinite(query.pageSize)
			? Math.max(1, Math.min(100, Math.trunc(query.pageSize)))
			: 5,
	}
}

/** Search, sort and page a bounded client collection without mutating rows or accessing a backend. */
export function queryClientRows(
	rows: readonly HcmTableRow[],
	columns: readonly HcmTableColumn[],
	requested: HcmTableQuery,
): HcmTablePage {
	const query = normalizeTableQuery(requested)
	const search = query.search.trim().toLocaleLowerCase('en')
	const filtered = rows.filter(
		/** Search only visible column values, not hidden metadata. */ (row) =>
			columns.some(
				/** Match a cell using a deterministic fixture-friendly locale. */ (column) =>
					String(row.cells[column.id] ?? '')
						.toLocaleLowerCase('en')
						.includes(search),
			),
	)
	const sort = query.sort
	if (
		sort &&
		columns.some(
			/** Ignore unsupported sort identifiers. */ (column) =>
				column.id === sort.column && column.sortable,
		)
	) {
		filtered.sort(
			/** Sort numeric values numerically and text with stable natural ordering. */ (a, b) => {
				const first = a.cells[sort.column] ?? ''
				const second = b.cells[sort.column] ?? ''
				const order =
					typeof first === 'number' && typeof second === 'number'
						? first - second
						: String(first).localeCompare(String(second), 'en', { numeric: true })
				return sort.direction === 'asc' ? order : -order
			},
		)
	}
	const page = Math.min(query.page, Math.max(0, Math.ceil(filtered.length / query.pageSize) - 1))
	return {
		total: filtered.length,
		page,
		rows: filtered.slice(page * query.pageSize, (page + 1) * query.pageSize),
	}
}
