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
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { filter, finalize, map, type Subscription } from 'rxjs'
import { FlexibleColumnLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout'
import { Avatar } from '@fundamental-ngx/ui5-webcomponents/avatar'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableGrowing } from '@fundamental-ngx/ui5-webcomponents/table-growing'
import { TableRowActionNavigation } from '@fundamental-ngx/ui5-webcomponents/table-row-action-navigation'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmViewSettings } from '@empflowyee/hcm-web-ux-tables'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	EmployeeDirectoryApi,
	employeeDenied,
	employeeErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import type { DirectoryEntryDto, DirectoryOptionDto } from '@empflowyee/hcm-employee-contract'
import { DirectoryOptionBox } from './directory-option-box.component'
import { DirectoryPersonComponent } from './directory-person.component'
import { personInitials, personName } from './person-label'

interface Filters {
	unit: DirectoryOptionDto | null
	department: DirectoryOptionDto | null
	location: DirectoryOptionDto | null
	designation: DirectoryOptionDto | null
}

/** Employee Directory: native FCL of the current workforce and one colleague's details. */
@Component({
	selector: 'ef-hcm-employee-directory',
	imports: [
		FlexibleColumnLayout,
		Avatar,
		Form,
		FormItem,
		Label,
		Input,
		Button,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableGrowing,
		TableRowActionNavigation,
		HcmDynamicPage,
		HcmViewSettings,
		DirectoryOptionBox,
		DirectoryPersonComponent,
	],
	templateUrl: './employee-directory.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeeDirectoryComponent {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(EmployeeDirectoryApi)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly name = personName
	readonly initials = personInitials
	readonly sortFields = [{ key: 'name', label: 'Name' }]
	readonly selectedId = toSignal(
		this.router.events.pipe(
			filter(/** Completed navigations only. */ (event) => event instanceof NavigationEnd),
			map(/** Read the child segment. */ () => this.childId()),
		),
		{ initialValue: this.childId() },
	)
	readonly query = signal('')
	readonly filters = signal<Filters>({
		unit: null,
		department: null,
		location: null,
		designation: null,
	})
	readonly sort = signal('name:asc')
	readonly applied = signal({ q: '', filters: this.filters() })
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly busy = signal(false)
	readonly items = signal<DirectoryEntryDto[]>([])
	readonly cursor = signal<string | null>(null)
	readonly layout = computed(
		/** Show the detail column only for a selected colleague. */ () =>
			this.selectedId() ? 'TwoColumnsMidExpanded' : 'OneColumn',
	)
	readonly filtered = computed(
		/** Whether any search or filter is applied. */ () => {
			const applied = this.applied()
			return Boolean(applied.q || Object.values(applied.filters).some(Boolean))
		},
	)

	/** Reload when the verified context or the sort changes. */
	constructor() {
		effect(
			/** Track the context and sort that define the list. */ () => {
				this.sort()
				const context = this.runtime.context()
				untracked(
					/** Clear prior-context state before loading. */ () => {
						this.request?.unsubscribe()
						this.items.set([])
						if (context) this.fetch(false)
					},
				)
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.request?.unsubscribe())
	}

	/** Read the selected worker from the child route segment. */
	private childId(): string | null {
		return this.route.snapshot.firstChild?.paramMap.get('workerId') ?? null
	}

	/** Apply the search and filters. */
	apply(): void {
		this.applied.set({ q: this.query().trim(), filters: { ...this.filters() } })
		this.fetch(false)
	}

	/** Retry the first page. */
	load(): void {
		this.fetch(false)
	}

	/** Load the next page. */
	more(): void {
		if (this.cursor() && !this.busy()) this.fetch(true)
	}

	/** Fetch one server page. */
	private fetch(append: boolean): void {
		const applied = this.applied()
		if (!append) this.state.set('loading')
		this.busy.set(true)
		this.message.set('')
		this.request?.unsubscribe()
		this.request = this.api
			.search({
				q: applied.q,
				descending: this.sort() === 'name:desc',
				cursor: append ? this.cursor() : null,
				...(applied.filters.unit ? { unitId: applied.filters.unit.id } : {}),
				...(applied.filters.department ? { departmentId: applied.filters.department.id } : {}),
				...(applied.filters.location ? { locationId: applied.filters.location.id } : {}),
				...(applied.filters.designation ? { designationId: applied.filters.designation.id } : {}),
			})
			.pipe(
				takeUntilDestroyed(this.destroy),
				finalize(/** Release the pending state. */ () => this.busy.set(false)),
			)
			.subscribe({
				next: /** Publish the page. */ (page) => {
					this.items.update(
						/** Append on growing. */ (rows) => (append ? [...rows, ...page.items] : page.items),
					)
					this.cursor.set(page.nextCursor)
					this.state.set('content')
				},
				error: /** Distinguish denial from temporary failure. */ (error) => {
					this.message.set(employeeErrorMessage(error))
					this.state.set(employeeDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Update the search text. */
	setQuery(target: EventTarget | null): void {
		this.query.set((target as HTMLInputElement | null)?.value ?? '')
	}

	/** Update one filter. */
	setFilter(key: keyof Filters, value: DirectoryOptionDto | null): void {
		this.filters.update(/** Replace one filter. */ (filters) => ({ ...filters, [key]: value }))
	}

	/** Open a colleague; the opaque id stays one encoded path segment. */
	open(workerId: string | undefined): void {
		if (!workerId) return
		const base = this.router.serializeUrl(
			this.router.createUrlTree(['.'], { relativeTo: this.route }),
		)
		void this.router.navigateByUrl(`${base}/${encodeURIComponent(workerId)}`)
	}

	/** Close the mid column. */
	close(): void {
		void this.router.navigate(['.'], { relativeTo: this.route })
	}
}
