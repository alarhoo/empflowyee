import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	effect,
	inject,
	signal,
	untracked,
	viewChild,
} from '@angular/core'
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { filter, map, type Subscription } from 'rxjs'
import { form, FormField } from '@angular/forms/signals'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { FlexibleColumnLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
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
	PositionsApi,
	jobArchitectureDenied,
	jobArchitectureErrorMessage,
} from '@empflowyee/hcm-web-job-architecture-data-access'
import type { PositionRequirementSummaryDto } from '@empflowyee/hcm-job-architecture-contract'
import { BASE_ROUTE, REQUEST_PERMISSION, lifecycleStatus } from './labels'
import { PositionRequirementSetComponent } from './requirement-set.component'

/** Position Requirements: native FCL of positions and the selected position's requirements. */
@Component({
	selector: 'ef-hcm-position-requirements',
	imports: [
		FormField,
		ObjectStatusComponent,
		FlexibleColumnLayout,
		Form,
		FormItem,
		Label,
		Input,
		Select,
		Option,
		Button,
		MessageStrip,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableGrowing,
		TableRowActionNavigation,
		HcmDynamicPage,
		PositionRequirementSetComponent,
	],
	templateUrl: './position-requirements.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PositionRequirementsComponent {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(PositionsApi)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly lifecycle = lifecycleStatus
	readonly selected = toSignal(
		this.router.events.pipe(
			filter(/** Completed navigations only. */ (event) => event instanceof NavigationEnd),
			map(/** Read the child segment. */ () => this.childSelection()),
		),
		{ initialValue: this.childSelection() },
	)
	readonly positions = signal<PositionRequirementSummaryDto[]>([])
	readonly cursor = signal<string | null>(null)
	readonly filters = signal({ q: '', variances: 'all' })
	readonly filterForm = form(this.filters)
	readonly state = signal<HcmPageState>('loading')
	readonly listState = signal<'loading' | 'content' | 'error'>('loading')
	readonly message = signal('')
	readonly notice = signal('')
	readonly refresh = signal(0)
	private readonly detail = viewChild(PositionRequirementSetComponent)
	readonly canRequest = computed(
		/** Presentation only; every endpoint re-authorizes on the server. */ () =>
			this.runtime.context()?.access.permissions.includes(REQUEST_PERMISSION) === true,
	)
	readonly layout = computed(
		/** Show the detail column only for a selection. */ () =>
			this.selected() ? 'TwoColumnsMidExpanded' : 'OneColumn',
	)

	/** Reload when the verified context changes. */
	constructor() {
		effect(
			/** Track the context that defines the data. */ () => {
				const context = this.runtime.context()
				untracked(
					/** Clear prior-context state before loading. */ () => {
						this.request?.unsubscribe()
						this.positions.set([])
						if (context) this.load(false)
					},
				)
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.request?.unsubscribe())
	}

	/** The selected position from the child route segment. */
	private childSelection(): string | null {
		return this.route.snapshot.firstChild?.paramMap.get('positionId') ?? null
	}

	/** Load a page of positions for the applied filters; growing appends. */
	load(append: boolean): void {
		this.request?.unsubscribe()
		if (!append) this.listState.set('loading')
		this.message.set('')
		const f = this.filters()
		const cursor = append ? (this.cursor() ?? undefined) : undefined
		this.request = this.api
			.requirementPositions({
				q: f.q.trim(),
				...(f.variances !== 'all'
					? { hasVariances: f.variances === 'with' ? 'true' : 'false' }
					: {}),
				...(cursor ? { cursor } : {}),
			})
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the page. */ (page) => {
					this.positions.update(
						/** Append on growing. */ (rows) => (append ? [...rows, ...page.items] : page.items),
					)
					this.cursor.set(page.nextCursor)
					this.listState.set('content')
					this.state.set('content')
				},
				error: /** Distinguish denial from temporary failure. */ (error) => {
					this.message.set(jobArchitectureErrorMessage(error))
					if (jobArchitectureDenied(error)) this.state.set('denied')
					else {
						this.listState.set('error')
						if (this.state() === 'loading') this.state.set('error')
					}
				},
			})
	}

	/** Open a position in the mid column. */
	open(positionId: string | undefined): void {
		if (positionId)
			void this.router.navigateByUrl(`${BASE_ROUTE}/${encodeURIComponent(positionId)}`)
	}

	/** Close the mid column. */
	close(): void {
		void this.router.navigateByUrl(BASE_ROUTE)
	}

	/** The detail changed a proposal: refresh the list. */
	updated(message: string): void {
		this.notice.set(message)
		this.load(false)
	}

	/** Consult any open dialog draft before leaving the feature. */
	canLeave(): Promise<boolean> {
		return this.detail()?.canLeave() ?? Promise.resolve(true)
	}
}
