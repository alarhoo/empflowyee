import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import {
	DEFAULT_TABLE_QUERY,
	type HcmTableColumn,
	type HcmTableQuery,
	type HcmTableRow,
} from './table.models'
import { normalizeTableQuery, queryClientRows } from './client-query'

/** Coordinate query presentation around the native table; server rows are never queried locally. */
@Component({
	selector: 'ef-hcm-enterprise-table',
	imports: [Table, TableRow, TableCell, TableHeaderRow, TableHeaderCell, Input, Button],
	templateUrl: './enterprise-table.component.html',
	styleUrl: './enterprise-table.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HcmEnterpriseTable {
	readonly label = input.required<string>()
	readonly mode = input.required<'client' | 'server'>()
	readonly columns = input.required<readonly HcmTableColumn[]>()
	readonly rows = input<readonly HcmTableRow[]>([])
	readonly total = input(0)
	readonly state = input<'content' | 'loading' | 'empty' | 'error' | 'denied' | 'unavailable'>(
		'content',
	)
	readonly query = model<HcmTableQuery>(DEFAULT_TABLE_QUERY)
	readonly queryRequested = output<HcmTableQuery>()
	readonly retry = output<void>()
	readonly page = computed(
		/** Keep server paging authoritative; only client mode transforms the supplied collection. */ () => {
			if (this.mode() === 'client')
				return queryClientRows(this.rows(), this.columns(), this.query())
			return {
				rows: this.rows(),
				total: Math.max(0, this.total()),
				page: normalizeTableQuery(this.query()).page,
			}
		},
	)
	readonly pageCount = computed(
		/** Keep an empty collection on a stable first page. */ () =>
			Math.max(1, Math.ceil(this.page().total / normalizeTableQuery(this.query()).pageSize)),
	)

	/** Reset paging when search changes and ask the feature to execute any server-mode query. */
	search(value: string): void {
		this.changeQuery({ ...this.query(), search: value, page: 0 })
	}

	/** Toggle a supported column's sort order and return to the first page. */
	sort(column: HcmTableColumn): void {
		if (!column.sortable) return
		const current = this.query().sort
		const direction = current?.column === column.id && current.direction === 'asc' ? 'desc' : 'asc'
		this.changeQuery({ ...this.query(), page: 0, sort: { column: column.id, direction } })
	}

	/** Move within known page bounds while leaving data retrieval to the owner. */
	goToPage(page: number): void {
		this.changeQuery({ ...this.query(), page: Math.max(0, Math.min(this.pageCount() - 1, page)) })
	}

	/** Expose the native sort indicator without implementing native table behavior. */
	sortIndicator(column: string): 'None' | 'Ascending' | 'Descending' {
		const sort = this.query().sort
		if (sort?.column !== column) return 'None'
		return sort.direction === 'asc' ? 'Ascending' : 'Descending'
	}

	/** Publish normalized state for both modes; this method never performs HTTP. */
	private changeQuery(query: HcmTableQuery): void {
		const normalized = normalizeTableQuery(query)
		this.query.set(normalized)
		this.queryRequested.emit(normalized)
	}
}
