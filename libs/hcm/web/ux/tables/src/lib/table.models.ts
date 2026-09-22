export interface HcmTableRow {
	readonly id: string
	readonly cells: Readonly<Record<string, string | number>>
}

export interface HcmTableColumn {
	readonly id: string
	readonly label: string
	readonly sortable?: boolean
	readonly importance?: number
}

export interface HcmTableQuery {
	readonly search: string
	readonly page: number
	readonly pageSize: number
	readonly sort?: { readonly column: string; readonly direction: 'asc' | 'desc' }
}

export interface HcmTablePage {
	readonly rows: readonly HcmTableRow[]
	readonly total: number
	readonly page: number
}

export const DEFAULT_TABLE_QUERY: HcmTableQuery = { search: '', page: 0, pageSize: 5 }
