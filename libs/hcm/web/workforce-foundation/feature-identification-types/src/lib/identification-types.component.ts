import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	effect,
	inject,
	signal,
	untracked,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { HttpErrorResponse } from '@angular/common/http'
import { forkJoin, type Subscription } from 'rxjs'
import { form, FormField } from '@angular/forms/signals'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { ComboBox } from '@fundamental-ngx/ui5-webcomponents/combo-box'
import { ComboBoxItem } from '@fundamental-ngx/ui5-webcomponents/combo-box-item'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmViewSettings } from '@empflowyee/hcm-web-ux-tables'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { IdentificationTypesApi } from '@empflowyee/hcm-web-workforce-foundation-data-access'
import {
	IDENTIFICATION_TYPE_LIMIT,
	type IdentificationTypeDto,
	type ReferenceItemDto,
} from '@empflowyee/hcm-workforce-foundation-contract'

const ALL_COUNTRIES = 'All countries'

/** Read-only product identification-type catalogue on a native Dynamic Page (DEC-HCM2-016). */
@Component({
	selector: 'ef-hcm-identification-types',
	imports: [
		FormField,
		ObjectStatusComponent,
		Form,
		FormItem,
		Label,
		Input,
		Select,
		Option,
		ComboBox,
		ComboBoxItem,
		CheckBox,
		MessageStrip,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		HcmDynamicPage,
		HcmViewSettings,
	],
	templateUrl: './identification-types.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IdentificationTypesComponent {
	private readonly api = inject(IdentificationTypesApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly limit = IDENTIFICATION_TYPE_LIMIT
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly types = signal<IdentificationTypeDto[]>([])
	readonly countries = signal<ReferenceItemDto[]>([])
	readonly filters = signal({ q: '', active: '' })
	readonly filterForm = form(this.filters)
	readonly country = signal('')
	readonly sort = signal('name:asc')
	readonly names = computed(
		/** Resolve country codes to product names. */ () =>
			new Map(this.countries().map(/** Code to name. */ (item) => [item.code, item.name])),
	)
	readonly rows = computed(
		/** Filter by code/name, country and status, then sort by the chosen field. */ () => {
			const { q, active } = this.filters()
			const search = q.trim().toLocaleLowerCase()
			const country = this.country()
			const [field, direction] = this.sort().split(':')
			const rows = this.types().filter(
				/** Apply the header filters. */ (item) =>
					(!search ||
						item.code.toLocaleLowerCase().includes(search) ||
						item.name.toLocaleLowerCase().includes(search)) &&
					(!country ||
						(country === 'ALL' ? item.countryCode === null : item.countryCode === country)) &&
					(active === '' || String(item.active) === active),
			)
			/** Read the primary sort key. */
			const key = (item: IdentificationTypeDto) => (field === 'code' ? item.code : item.name)
			return rows.sort(
				/** Primary field, then code for a stable order. */ (a, b) =>
					(direction === 'desc' ? -1 : 1) *
					(key(a).localeCompare(key(b)) || a.code.localeCompare(b.code)),
			)
		},
	)
	readonly filtered = computed(
		/** Tell whether any header filter narrows the catalogue. */ () =>
			!!this.filters().q.trim() || !!this.filters().active || !!this.country(),
	)

	/** Clear prior-context data and reload whenever the verified context changes. */
	constructor() {
		effect(
			/** Track context replacement, including persona switches. */ () => {
				const context = this.runtime.context()
				untracked(
					/** Discard stale rows before any new request. */ () => {
						this.request?.unsubscribe()
						this.types.set([])
						this.countries.set([])
						if (context) this.load()
					},
				)
			},
		)
	}

	/** Load the catalogue and issuing countries together. */
	load(): void {
		this.request?.unsubscribe()
		this.state.set('loading')
		this.message.set('')
		this.request = forkJoin({ types: this.api.list(), countries: this.api.countries() })
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the real product catalogue. */ (result) => {
					this.types.set(result.types.items)
					this.countries.set(result.countries.items)
					this.state.set('content')
				},
				error: /** Distinguish denial from a temporary failure. */ (error) => {
					this.message.set('The identification types could not be loaded. Try again.')
					this.state.set(
						error instanceof HttpErrorResponse && [401, 403].includes(error.status)
							? 'denied'
							: 'error',
					)
				},
			})
	}

	/** Display the issuing country or the product label for types issued anywhere. */
	countryName(code: string | null): string {
		return code === null ? ALL_COUNTRIES : (this.names().get(code) ?? code)
	}

	/** Apply a country chosen by identity; clearing the text removes the filter. */
	chooseCountry(value: string | undefined): void {
		this.country.set(value ?? '')
	}

	/** Clear the filter when the ComboBox text is emptied. */
	countryText(text: string): void {
		if (!text) this.country.set('')
	}
}
