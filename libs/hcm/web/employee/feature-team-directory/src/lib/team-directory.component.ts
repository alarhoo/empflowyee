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
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { FlexibleColumnLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout'
import { Avatar } from '@fundamental-ngx/ui5-webcomponents/avatar'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableGrowing } from '@fundamental-ngx/ui5-webcomponents/table-growing'
import { TableRowActionNavigation } from '@fundamental-ngx/ui5-webcomponents/table-row-action-navigation'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	TeamDirectoryApi,
	employeeDenied,
	employeeErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import type { DirectoryOptionDto, TeamMemberSummaryDto } from '@empflowyee/hcm-employee-contract'
import { TeamLocationBox } from './location-option-box.component'
import { TeamMemberComponent } from './team-member.component'
import { personInitials, personName } from './person-label'
import { PROBATION_FILTERS, employmentStatus, probationStatus } from './status'

/** Team Directory: native FCL of the manager's direct reports and one member's facts. */
@Component({
	selector: 'ef-hcm-team-directory',
	imports: [
		ObjectStatusComponent,
		FlexibleColumnLayout,
		Avatar,
		Form,
		FormItem,
		Label,
		Input,
		Select,
		Option,
		Button,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableGrowing,
		TableRowActionNavigation,
		HcmDynamicPage,
		TeamLocationBox,
		TeamMemberComponent,
	],
	templateUrl: './team-directory.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamDirectoryComponent {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(TeamDirectoryApi)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly name = personName
	readonly initials = personInitials
	readonly employment = employmentStatus
	readonly probation = probationStatus
	readonly probationFilters = PROBATION_FILTERS
	readonly selectedId = toSignal(
		this.router.events.pipe(
			filter(/** Completed navigations only. */ (event) => event instanceof NavigationEnd),
			map(/** Read the child segment. */ () => this.childId()),
		),
		{ initialValue: this.childId() },
	)
	readonly query = signal('')
	readonly location = signal<DirectoryOptionDto | null>(null)
	readonly probationFilter = signal('')
	readonly applied = signal({ q: '', location: null as DirectoryOptionDto | null, probation: '' })
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly busy = signal(false)
	readonly items = signal<TeamMemberSummaryDto[]>([])
	readonly cursor = signal<string | null>(null)
	readonly layout = computed(
		/** Show the detail column only for a selected member. */ () =>
			this.selectedId() ? 'TwoColumnsMidExpanded' : 'OneColumn',
	)
	readonly filtered = computed(
		/** Whether any search or filter is applied. */ () => {
			const applied = this.applied()
			return Boolean(applied.q || applied.location || applied.probation)
		},
	)

	/** Reload when the verified context changes. */
	constructor() {
		effect(
			/** Track the context that defines the team. */ () => {
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

	/** Read the selected member from the child route segment. */
	private childId(): string | null {
		return this.route.snapshot.firstChild?.paramMap.get('workerId') ?? null
	}

	/** Apply the search and filters. */
	apply(): void {
		this.applied.set({
			q: this.query().trim(),
			location: this.location(),
			probation: this.probationFilter(),
		})
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
			.list({
				q: applied.q,
				cursor: append ? this.cursor() : null,
				...(applied.location ? { locationId: applied.location.id } : {}),
				...(applied.probation ? { probationStatus: applied.probation } : {}),
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

	/** Update the probation filter. */
	setProbation(target: EventTarget | null): void {
		this.probationFilter.set((target as HTMLSelectElement | null)?.value ?? '')
	}

	/** Open a member; the opaque id stays one encoded path segment. */
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
