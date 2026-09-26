import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	ElementRef,
	computed,
	inject,
	input,
	output,
	signal,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { Subject, catchError, debounceTime, of, switchMap } from 'rxjs'
import { ComboBox } from '@fundamental-ngx/ui5-webcomponents/combo-box'
import { ComboBoxItem } from '@fundamental-ngx/ui5-webcomponents/combo-box-item'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import type {
	StructureOption,
	StructureOptionKind,
} from '@empflowyee/hcm-workforce-foundation-contract'
import { OrganisationStructureApi } from '@empflowyee/hcm-web-workforce-foundation-data-access'

export interface OptionRef {
	id: string
	name: string
}

/** Server-filtered UI5 ComboBox bound to a stable identifier rather than display text. */
@Component({
	selector: 'ef-hcm-structure-option-box',
	imports: [ComboBox, ComboBoxItem, Text],
	template: `<ui5-combobox
		[id]="controlId()"
		[accessibleName]="label()"
		filter="None"
		[showClearIcon]="true"
		[loading]="loading()"
		[disabled]="disabled()"
		[required]="required()"
		[value]="selected()?.name ?? ''"
		[selectedValue]="selected()?.id ?? ''"
		[valueState]="invalid() ? 'Negative' : 'None'"
		[open]="expanded()"
		(focusin)="prime()"
		(ui5Open)="expanded.set(true); prime()"
		(ui5Close)="expanded.set(false)"
		(ui5Input)="type($any($event.target).value)"
		(ui5SelectionChange)="choose($event.detail.item)"
		(ui5Change)="changed($any($event.target).value)"
	>
		@for (option of items(); track option.id) {
			<ui5-cb-item
				[value]="option.id"
				[text]="option.name"
				[additionalText]="option.code"
			></ui5-cb-item>
		}
		@if (message()) {
			<ui5-text slot="valueStateMessage">{{ message() }}</ui5-text>
		}
	</ui5-combobox>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StructureOptionBox {
	readonly kind = input.required<StructureOptionKind>()
	readonly label = input.required<string>()
	readonly controlId = input.required<string>()
	readonly selected = input<OptionRef | null>(null)
	readonly disabled = input(false)
	readonly required = input(false)
	readonly invalid = input(false)
	readonly message = input('')
	/** Identifiers that may not be chosen, such as the item being edited. */
	readonly exclude = input<readonly string[]>([])
	readonly selectedChange = output<OptionRef | null>()
	private readonly api = inject(OrganisationStructureApi)
	private readonly host = inject<ElementRef<HTMLElement>>(ElementRef)
	readonly loading = signal(false)
	readonly expanded = signal(false)
	private typed = ''
	private readonly found = signal<StructureOption[]>([])
	private readonly queries = new Subject<string>()
	readonly items = computed(
		/** Keep the current selection resolvable while the server results change. */ () => {
			const current = this.selected()
			const rows = this.found().filter(
				/** Drop excluded identities. */ (row) => !this.exclude().includes(row.id),
			)
			if (current && !rows.some(/** Detect the selection. */ (row) => row.id === current.id))
				return [{ id: current.id, code: '', name: current.name, active: true }, ...rows]
			return rows
		},
	)

	/** Debounce typing and cancel superseded server searches. */
	constructor() {
		this.queries
			.pipe(
				debounceTime(250),
				switchMap(
					/** Query one bounded option page; a failure leaves the picker empty but usable. */ (
						q,
					) => {
						this.loading.set(true)
						return this.api
							.options(this.kind(), q)
							.pipe(
								catchError(
									/** Treat a failed search as no suggestions. */ () =>
										of({ items: [] as StructureOption[], nextCursor: null }),
								),
							)
					},
				),
				takeUntilDestroyed(inject(DestroyRef)),
			)
			.subscribe(
				/** Publish the latest server suggestions. */ (page) => {
					this.found.set(page.items)
					this.loading.set(false)
					// Suggestions arrive after typing began; show them while the user is still in the field.
					if (this.typed && this.host.nativeElement.contains(document.activeElement))
						this.expanded.set(true)
				},
			)
	}

	private primed = false

	/** Load the first suggestion page once, so typing opens a populated popover. */
	prime(): void {
		if (this.primed) return
		this.primed = true
		this.search('')
	}

	/** Record typed text and request matching suggestions. */
	type(q: string): void {
		this.typed = (q ?? '').trim()
		this.search(this.typed)
	}

	/** Request suggestions matching the text. */
	search(q: string): void {
		this.queries.next((q ?? '').trim())
	}

	/** Emit the chosen identity; the display text alone never identifies a record. */
	choose(item: { value?: string; text?: string } | null): void {
		if (item?.value) this.selectedChange.emit({ id: item.value, name: item.text ?? '' })
	}

	/** Clearing the text clears the selection. */
	changed(value: string): void {
		if (!value) this.selectedChange.emit(null)
	}
}
