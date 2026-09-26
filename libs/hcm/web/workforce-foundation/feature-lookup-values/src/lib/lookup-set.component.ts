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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { finalize, type Subscription } from 'rxjs'
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
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableGrowing } from '@fundamental-ngx/ui5-webcomponents/table-growing'
import {
	HcmDynamicPage,
	type HcmPageAction,
	type HcmPageState,
} from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	LookupValuesApi,
	lookupErrorMessage,
	structureDenied,
} from '@empflowyee/hcm-web-workforce-foundation-data-access'
import type { LookupSetDto, LookupValueDto } from '@empflowyee/hcm-workforce-foundation-contract'
import { ATTRIBUTE_COLUMNS, attributesOf } from './lookup-columns'

const PAGE = 25

/** Mid column: one lookup set's values as a server-mode table. */
@Component({
	selector: 'ef-hcm-lookup-set',
	imports: [
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
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableGrowing,
		HcmDynamicPage,
	],
	templateUrl: './lookup-set.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LookupSetComponent {
	readonly set = input.required<LookupSetDto>()
	readonly refresh = input(0)
	readonly canManage = input(false)
	readonly fullScreen = input(false)
	readonly create = output<void>()
	readonly edit = output<LookupValueDto>()
	readonly active = output<LookupValueDto>()
	readonly fullScreenChange = output<boolean>()
	readonly closed = output<void>()
	private readonly api = inject(LookupValuesApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly filters = signal({ q: '', active: '' })
	readonly filterForm = form(this.filters)
	readonly applied = signal({ q: '', active: '' })
	readonly state = signal<HcmPageState>('loading')
	readonly busy = signal(false)
	readonly message = signal('')
	readonly items = signal<LookupValueDto[]>([])
	readonly cursor = signal<string | null>(null)
	readonly columns = computed(
		/** Set-specific attributes. */ () => ATTRIBUTE_COLUMNS[this.set().key],
	)
	readonly editable = computed(
		/** Only tenant sets are maintained, and only by authorized managers. */ () =>
			this.canManage() && this.set().ownership === 'Tenant',
	)
	readonly actions = computed(
		/** Add value for tenant sets; column controls for every viewer. */ () => {
			const actions: HcmPageAction[] = []
			if (this.set().ownership === 'Tenant')
				actions.push({
					id: 'create',
					label: 'Add value',
					mutates: true,
					emphasized: true,
					disabled: this.busy(),
				})
			actions.push(
				{ id: 'full-screen', label: this.fullScreen() ? 'Exit full screen' : 'Full screen' },
				{ id: 'close', label: 'Close' },
			)
			return actions
		},
	)
	readonly rows = computed(
		/** Project values with their attribute cells. */ () =>
			this.items().map(
				/** One row. */ (value) => ({
					value,
					cells: this.columns().map(
						/** One attribute cell. */ (column) => column.read(attributesOf(value)),
					),
				}),
			),
	)

	/** Reload when the set, committed changes or the verified context change. */
	constructor() {
		effect(
			/** Track the inputs that define the visible data. */ () => {
				this.set()
				this.refresh()
				const context = this.runtime.context()
				untracked(
					/** Clear prior-context state before loading. */ () => {
						this.request?.unsubscribe()
						this.items.set([])
						this.cursor.set(null)
						if (context) this.load()
					},
				)
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.request?.unsubscribe())
	}

	/** Apply filters and request the first page. */
	load(): void {
		this.applied.set({ ...this.filters() })
		this.state.set('loading')
		this.fetch(false)
	}

	/** Load the next server page. */
	more(): void {
		if (this.cursor() && !this.busy()) this.fetch(true)
	}

	/** Fetch one server page for the applied filters. */
	private fetch(append: boolean): void {
		const cursor = append ? this.cursor() : null
		const active = this.applied().active
		this.request?.unsubscribe()
		this.busy.set(true)
		this.message.set('')
		this.request = this.api
			.values(this.set().key, {
				q: this.applied().q.trim(),
				limit: PAGE,
				...(cursor ? { cursor } : {}),
				...(active === '' ? {} : { active: active === 'true' }),
			})
			.pipe(
				takeUntilDestroyed(this.destroy),
				finalize(/** Release the pending state. */ () => this.busy.set(false)),
			)
			.subscribe({
				next: /** Publish the page. */ (page) => {
					this.items.update(
						/** Append only explicit growing pages. */ (rows) =>
							append ? [...rows, ...page.items] : page.items,
					)
					this.cursor.set(page.nextCursor)
					this.state.set('content')
				},
				error: /** Distinguish denial from temporary failure. */ (error) => {
					this.message.set(lookupErrorMessage(error))
					this.state.set(structureDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Route floorplan actions to the owning shell. */
	action(id: string): void {
		if (id === 'create' && this.editable()) this.create.emit()
		else if (id === 'full-screen') this.fullScreenChange.emit(!this.fullScreen())
		else if (id === 'close') this.closed.emit()
	}
}
