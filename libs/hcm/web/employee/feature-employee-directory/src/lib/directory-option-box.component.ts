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
import { Subject, catchError, debounceTime, map, of, switchMap } from 'rxjs'
import { ComboBox } from '@fundamental-ngx/ui5-webcomponents/combo-box'
import { ComboBoxItem } from '@fundamental-ngx/ui5-webcomponents/combo-box-item'
import { EmployeeDirectoryApi } from '@empflowyee/hcm-web-employee-data-access'
import type { DirectoryOptionDto, DirectoryOptionKindKey } from '@empflowyee/hcm-employee-contract'

/** Server-filtered UI5 ComboBox keyed by option id rather than display text. */
@Component({
	selector: 'ef-hcm-directory-option-box',
	imports: [ComboBox, ComboBoxItem],
	template: `<ui5-combobox
		[id]="controlId()"
		[accessibleName]="label()"
		filter="None"
		[showClearIcon]="true"
		[loading]="loading()"
		[value]="selected()?.name ?? ''"
		[selectedValue]="selected()?.id ?? ''"
		[open]="expanded()"
		(focusin)="prime()"
		(ui5Open)="expanded.set(true); prime()"
		(ui5Close)="expanded.set(false)"
		(ui5Input)="type($any($event.target).value)"
		(ui5SelectionChange)="choose($event.detail.item)"
		(ui5Change)="changed($any($event.target).value)"
	>
		@for (option of items(); track option.id) {
			<ui5-cb-item [value]="option.id" [text]="option.name"></ui5-cb-item>
		}
	</ui5-combobox>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectoryOptionBox {
	readonly kind = input.required<DirectoryOptionKindKey>()
	readonly label = input.required<string>()
	readonly controlId = input.required<string>()
	readonly selected = input<DirectoryOptionDto | null>(null)
	readonly selectedChange = output<DirectoryOptionDto | null>()
	private readonly api = inject(EmployeeDirectoryApi)
	private readonly host = inject<ElementRef<HTMLElement>>(ElementRef)
	readonly loading = signal(false)
	readonly expanded = signal(false)
	private typed = ''
	private primed = false
	private readonly found = signal<DirectoryOptionDto[]>([])
	private readonly queries = new Subject<string>()
	readonly items = computed(
		/** Keep the current selection resolvable while results change. */ () => {
			const current = this.selected()
			const rows = this.found()
			if (current && !rows.some(/** Detect the selection. */ (row) => row.id === current.id))
				return [current, ...rows]
			return rows
		},
	)

	/** Debounce typing and cancel superseded searches. */
	constructor() {
		this.queries
			.pipe(
				debounceTime(250),
				switchMap(
					/** Query one bounded page; a failure leaves the picker empty but usable. */ (q) => {
						this.loading.set(true)
						return this.api.options(this.kind(), q).pipe(
							catchError(
								/** Treat a failed search as no suggestions. */ () =>
									of({ items: [] as DirectoryOptionDto[], nextCursor: null }),
							),
							map(/** Keep the query that produced the page. */ (page) => ({ q, page })),
						)
					},
				),
				takeUntilDestroyed(inject(DestroyRef)),
			)
			.subscribe(
				/** Publish the latest suggestions; open only for the text still being typed. */ ({
					q,
					page,
				}) => {
					this.found.set(page.items)
					this.loading.set(false)
					if (q && q === this.typed && this.host.nativeElement.contains(document.activeElement))
						this.expanded.set(true)
				},
			)
	}

	/** Load the first page once, so typing opens a populated popover. */
	prime(): void {
		if (this.primed) return
		this.primed = true
		this.queries.next('')
	}

	/** Record typed text and request matching suggestions. */
	type(q: string): void {
		this.typed = (q ?? '').trim()
		this.queries.next(this.typed)
	}

	/** Emit the chosen identity. */
	choose(item: { value?: string; text?: string } | null): void {
		if (!item?.value) return
		this.typed = ''
		this.expanded.set(false)
		this.selectedChange.emit({ id: item.value, name: item.text ?? '' })
	}

	/** Clearing the text clears the selection. */
	changed(value: string): void {
		if (!value) this.selectedChange.emit(null)
	}
}
