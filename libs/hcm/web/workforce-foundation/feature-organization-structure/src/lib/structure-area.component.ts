import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	effect,
	inject,
	input,
	output,
	signal,
	untracked,
} from '@angular/core'
import { NgTemplateOutlet } from '@angular/common'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { EMPTY, expand, finalize, reduce, type Subscription } from 'rxjs'
import { form, FormField } from '@angular/forms/signals'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { DatePicker } from '@fundamental-ngx/ui5-webcomponents/date-picker'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableGrowing } from '@fundamental-ngx/ui5-webcomponents/table-growing'
import { TableRowActionNavigation } from '@fundamental-ngx/ui5-webcomponents/table-row-action-navigation'
import { Tree } from '@fundamental-ngx/ui5-webcomponents/tree'
import { TreeItem } from '@fundamental-ngx/ui5-webcomponents/tree-item'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	OrganisationStructureApi,
	structureDenied,
	structureErrorMessage,
} from '@empflowyee/hcm-web-workforce-foundation-data-access'
import type {
	StructureArea,
	StructureItemDto,
	UnitSummaryDto,
} from '@empflowyee/hcm-workforce-foundation-contract'
import type { StructureAreaInfo } from './structure-areas'
import { AREA_COLUMNS, toRow, unitSubtitle, type StructureRow } from './structure-rows'

interface Branch {
	items: UnitSummaryDto[]
	cursor: string | null
	state: 'loading' | 'content' | 'error'
}
type TableArea = Exclude<StructureArea, 'units'>

const PAGE = 25
const TREE_PAGE = 100
const CLIENT_LIMIT = 200

/** Mid column: one structure area as a table, or units as an effective-dated tree. */
@Component({
	selector: 'ef-hcm-structure-area',
	imports: [
		NgTemplateOutlet,
		FormField,
		ObjectStatusComponent,
		Form,
		FormItem,
		Label,
		Input,
		Select,
		Option,
		Button,
		CheckBox,
		DatePicker,
		MessageStrip,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableGrowing,
		TableRowActionNavigation,
		Tree,
		TreeItem,
		HcmDynamicPage,
	],
	templateUrl: './structure-area.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StructureAreaComponent {
	readonly area = input.required<StructureAreaInfo>()
	readonly asOf = input('')
	readonly selectedId = input<string | null>(null)
	readonly refresh = input(0)
	readonly canManage = input(false)
	readonly opened = output<string>()
	readonly create = output<void>()
	readonly asOfChange = output<string>()
	readonly closed = output<void>()
	private readonly api = inject(OrganisationStructureApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly filters = signal({ q: '', active: '' })
	readonly filterForm = form(this.filters)
	readonly applied = signal({ q: '', active: '' })
	readonly state = signal<HcmPageState>('loading')
	readonly busy = signal(false)
	readonly message = signal('')
	readonly items = signal<StructureItemDto[]>([])
	readonly cursor = signal<string | null>(null)
	readonly truncated = signal(false)
	readonly roots = signal<UnitSummaryDto[]>([])
	readonly branches = signal<Record<string, Branch>>({})
	readonly expanded = signal<ReadonlySet<string>>(new Set())
	readonly units = computed(/** Select the tree presentation. */ () => this.area().id === 'units')
	readonly searching = computed(
		/** Searching units returns a flat result instead of hierarchy levels. */ () =>
			this.units() && this.applied().q !== '' && this.state() !== 'loading',
	)
	readonly columns = computed(
		/** Area-specific table columns between name and status. */ () =>
			this.units() ? [] : AREA_COLUMNS[this.area().id as TableArea],
	)
	readonly rows = computed(
		/** Project DTOs to the generic table; client areas filter the bounded list locally. */ () => {
			if (this.units()) return [] as StructureRow[]
			const area = this.area()
			const rows = this.items().map(
				/** Project one DTO. */ (item) => toRow(area.id as TableArea, item),
			)
			if (!area.client) return rows
			const q = this.applied().q.toLowerCase()
			return rows.filter(
				/** Apply the same code/name and active filters as the server. */ (row) =>
					(!q || row.name.toLowerCase().includes(q) || row.code.toLowerCase().includes(q)) &&
					(this.applied().active === '' || String(row.active) === this.applied().active),
			)
		},
	)
	readonly actions = computed(
		/** Offer create to authorized managers and a return path for narrow screens. */ () => [
			{ id: 'close', label: 'Back to areas' },
			{
				id: 'create',
				label: `Create ${this.area().singular.toLowerCase()}`,
				mutates: true,
				emphasized: true,
				disabled: this.busy(),
			},
		],
	)

	/** Reload when the area, as-of date, committed changes or verified context change. */
	constructor() {
		effect(
			/** Track the inputs that define the visible data. */ () => {
				this.area()
				this.asOf()
				this.refresh()
				const context = this.runtime.context()
				untracked(
					/** Clear prior-context state before loading. */ () => {
						this.clear()
						if (context) this.load()
					},
				)
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.request?.unsubscribe())
	}

	/** Reset visible data so another area or tenant never shows stale rows. */
	private clear(): void {
		this.request?.unsubscribe()
		this.items.set([])
		this.roots.set([])
		this.branches.set({})
		this.expanded.set(new Set())
		this.cursor.set(null)
		this.truncated.set(false)
	}

	/** Apply filters and request the first page. */
	load(): void {
		this.clear()
		this.applied.set({ ...this.filters() })
		this.state.set('loading')
		if (this.area().client) this.fetchAll()
		else this.fetch(false)
	}

	/** Apply the filter bar without changing the selected area. */
	apply(): void {
		this.load()
	}

	/** Load the next server page for growing tables and unit roots. */
	more(): void {
		if (this.cursor() && !this.busy()) this.fetch(true)
	}

	/** Server filters for the current area. */
	private query(cursor?: string) {
		const active = this.applied().active === '' ? undefined : this.applied().active === 'true'
		return {
			q: this.applied().q.trim(),
			sort: 'name:asc',
			limit: this.units() ? TREE_PAGE : PAGE,
			...(cursor ? { cursor } : {}),
			...(active === undefined ? {} : { active }),
			...(this.units() && this.asOf() ? { asOf: this.asOf() } : {}),
		}
	}

	/** Fetch one server page; units without a search read the root level. */
	private fetch(append: boolean): void {
		this.busy.set(true)
		this.message.set('')
		this.request = this.api
			.list(this.area().id as StructureArea, this.query(append ? (this.cursor() ?? '') : undefined))
			.pipe(
				takeUntilDestroyed(this.destroy),
				finalize(/** Release the pending state. */ () => this.busy.set(false)),
			)
			.subscribe({
				next: /** Publish the page under the current context. */ (page) => {
					if (this.units())
						this.roots.update(
							/** Append only explicit growing pages. */ (rows) =>
								append
									? [...rows, ...(page.items as UnitSummaryDto[])]
									: (page.items as UnitSummaryDto[]),
						)
					else
						this.items.update(
							/** Append only explicit growing pages. */ (rows) =>
								append ? [...rows, ...page.items] : page.items,
						)
					this.cursor.set(page.nextCursor)
					this.state.set('content')
				},
				error: /** Distinguish denial from temporary failure. */ (error) => this.fail(error),
			})
	}

	/** Load a bounded client list by following at most two server pages. */
	private fetchAll(): void {
		this.busy.set(true)
		this.message.set('')
		const area = this.area().id as StructureArea
		/** Read one page of 100. */
		const page = (cursor?: string) =>
			this.api.list(area, { q: '', sort: 'name:asc', limit: 100, ...(cursor ? { cursor } : {}) })
		let pages = 0
		this.request = page()
			.pipe(
				expand(
					/** Follow the cursor until the bound is reached. */ (result) =>
						++pages * 100 < CLIENT_LIMIT && result.nextCursor ? page(result.nextCursor) : EMPTY,
				),
				reduce(
					/** Collect the bounded list and whether more exist. */ (all, result) => ({
						items: [...all.items, ...result.items],
						more: result.nextCursor !== null,
					}),
					{ items: [] as StructureItemDto[], more: false },
				),
				takeUntilDestroyed(this.destroy),
				finalize(/** Release the pending state. */ () => this.busy.set(false)),
			)
			.subscribe({
				next: /** Publish the bounded list. */ (result) => {
					this.items.set(result.items)
					this.truncated.set(result.more)
					this.state.set('content')
				},
				error: /** Distinguish denial from temporary failure. */ (error) => this.fail(error),
			})
	}

	/** Map a failed load to truthful page feedback without stale data. */
	private fail(error: unknown): void {
		this.message.set(structureErrorMessage(error))
		this.state.set(structureDenied(error) ? 'denied' : 'error')
	}

	/** Expand or collapse a unit, loading its children on first expansion. */
	toggle(item: HTMLElement | null): void {
		const id = item?.dataset['id']
		if (!id) return
		const open = new Set(this.expanded())
		if (open.has(id)) open.delete(id)
		else {
			open.add(id)
			if (!this.branches()[id]) this.loadChildren(id, false)
		}
		this.expanded.set(open)
	}

	/** Load one page of a parent's children at the as-of date. */
	loadChildren(parentId: string, append: boolean): void {
		const existing = this.branches()[parentId]
		this.setBranch(parentId, {
			items: append ? (existing?.items ?? []) : [],
			cursor: existing?.cursor ?? null,
			state: 'loading',
		})
		const cursor = append ? existing?.cursor : undefined
		this.api
			.list('units', {
				q: '',
				sort: 'name:asc',
				limit: TREE_PAGE,
				parentId,
				...(cursor ? { cursor } : {}),
				...(this.applied().active === '' ? {} : { active: this.applied().active === 'true' }),
				...(this.asOf() ? { asOf: this.asOf() } : {}),
			})
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Append the children under their parent. */ (page) =>
					this.setBranch(parentId, {
						items: [
							...(append ? (existing?.items ?? []) : []),
							...(page.items as UnitSummaryDto[]),
						],
						cursor: page.nextCursor,
						state: 'content',
					}),
				error: /** Keep a failed branch retryable. */ () =>
					this.setBranch(parentId, {
						items: existing?.items ?? [],
						cursor: existing?.cursor ?? null,
						state: 'error',
					}),
			})
	}

	/** Replace one branch immutably. */
	private setBranch(id: string, branch: Branch): void {
		this.branches.update(/** Replace one entry. */ (all) => ({ ...all, [id]: branch }))
	}

	/** Open a unit, or load more or retry children from their service node. */
	treeClick(item: HTMLElement | null): void {
		const more = item?.dataset['more']
		if (more) {
			this.loadChildren(more, this.branches()[more]?.state !== 'error')
			return
		}
		const id = item?.dataset['id']
		if (id) this.opened.emit(id)
	}

	/** Describe a unit's type and legal entity. */
	subtitle(unit: UnitSummaryDto): string {
		return unitSubtitle(unit)
	}

	/** Open the row selected by native pointer or keyboard activation. */
	openRow(key: string | undefined): void {
		if (key) this.opened.emit(key)
	}

	/** Route floorplan actions to the owning shell. */
	action(id: string): void {
		if (id === 'create') this.create.emit()
		else if (id === 'close') this.closed.emit()
	}

	/** Publish a chosen as-of date to the deep-linkable URL. */
	changeAsOf(value: string): void {
		this.asOfChange.emit(value ?? '')
	}
}
