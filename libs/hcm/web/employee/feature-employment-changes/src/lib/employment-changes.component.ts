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
import { DatePicker } from '@fundamental-ngx/ui5-webcomponents/date-picker'
import { SegmentedButton } from '@fundamental-ngx/ui5-webcomponents/segmented-button'
import { SegmentedButtonItem } from '@fundamental-ngx/ui5-webcomponents/segmented-button-item'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableGrowing } from '@fundamental-ngx/ui5-webcomponents/table-growing'
import { TableRowActionNavigation } from '@fundamental-ngx/ui5-webcomponents/table-row-action-navigation'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmDatePipe, HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	EmploymentChangesApi,
	changesErrorMessage,
	employeeDenied,
	type ChangeListQuery,
} from '@empflowyee/hcm-web-employee-data-access'
import {
	CHANGE_STATUSES,
	CHANGE_TYPES,
	type EmploymentChangeRequestDto,
	type EmploymentChangeSummaryDto,
} from '@empflowyee/hcm-employee-contract'
import {
	APPROVE_PERMISSION,
	BASE_ROUTE,
	CHANGE_TYPE_LABELS,
	REQUEST_PERMISSION,
	requestStatus,
} from './labels'
import { ChangeRequestComponent } from './change-request.component'
import { ChangeDialog, type ChangeDialogInput } from './change-dialog.component'

type View = 'all' | 'mine' | 'awaiting-my-decision'

/** Employment Changes: native two-column FCL of change requests and the selected request. */
@Component({
	selector: 'ef-hcm-employment-changes',
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
		DatePicker,
		SegmentedButton,
		SegmentedButtonItem,
		MessageStrip,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableGrowing,
		TableRowActionNavigation,
		HcmDynamicPage,
		HcmDatePipe,
		ChangeRequestComponent,
		ChangeDialog,
	],
	templateUrl: './employment-changes.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmploymentChangesComponent {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(EmploymentChangesApi)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly types = CHANGE_TYPES
	readonly typeLabels = CHANGE_TYPE_LABELS
	readonly statuses = CHANGE_STATUSES
	readonly status = requestStatus
	readonly selected = toSignal(
		this.router.events.pipe(
			filter(/** Completed navigations only. */ (event) => event instanceof NavigationEnd),
			map(/** Read the child segment. */ () => this.childSelection()),
		),
		{ initialValue: this.childSelection() },
	)
	readonly view = signal<View>('all')
	readonly requests = signal<EmploymentChangeSummaryDto[]>([])
	readonly cursor = signal<string | null>(null)
	readonly filters = signal({ q: '', changeType: 'all', status: 'all', sort: 'effectiveDate:desc' })
	readonly filterForm = form(this.filters)
	readonly from = signal('')
	readonly to = signal('')
	readonly state = signal<HcmPageState>('loading')
	readonly listState = signal<'loading' | 'content' | 'error'>('loading')
	readonly message = signal('')
	readonly notice = signal('')
	readonly refresh = signal(0)
	readonly dialog = signal<ChangeDialogInput | null>(null)
	private readonly dialogEditor = viewChild(ChangeDialog)
	readonly canRequest = computed(
		/** Presentation only; every endpoint re-authorizes on the server. */ () =>
			this.runtime.context()?.access.permissions.includes(REQUEST_PERMISSION) === true,
	)
	readonly canApprove = computed(
		/** Presentation only; every endpoint re-authorizes on the server. */ () =>
			this.runtime.context()?.access.permissions.includes(APPROVE_PERMISSION) === true,
	)
	readonly actions = computed(
		/** New requests are raised on their dedicated wizard route. */ () =>
			this.canRequest()
				? [{ id: 'create', label: 'New request', mutates: true, emphasized: true }]
				: [],
	)
	readonly noData = computed(
		/** Explain an empty table truthfully. */ () => {
			if (this.listState() === 'error') return 'Change requests could not be loaded'
			if (this.view() === 'awaiting-my-decision') return 'No requests are waiting for your decision'
			return 'No change requests match these filters'
		},
	)
	readonly layout = computed(
		/** Show the request column only for a selection. */ () =>
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
						this.requests.set([])
						this.dialog.set(null)
						if (context) this.load(false)
					},
				)
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.request?.unsubscribe())
	}

	/** The selected request from the child route segment. */
	private childSelection(): string | null {
		return this.route.snapshot.firstChild?.paramMap.get('requestId') ?? null
	}

	/** Load a page for the applied view and filters; growing appends. */
	load(append: boolean): void {
		this.request?.unsubscribe()
		if (!append) this.listState.set('loading')
		this.message.set('')
		const cursor = append ? (this.cursor() ?? undefined) : undefined
		this.request = this.api
			.list(this.query(cursor))
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the page. */ (page) => {
					this.requests.update(
						/** Append on growing. */ (rows) => (append ? [...rows, ...page.items] : page.items),
					)
					this.cursor.set(page.nextCursor)
					this.listState.set('content')
					this.state.set('content')
				},
				error: /** Publish a failure truthfully. */ (error) => {
					this.message.set(changesErrorMessage(error))
					if (employeeDenied(error)) this.state.set('denied')
					else this.listState.set('error')
					if (this.state() === 'loading') this.state.set('error')
				},
			})
	}

	/** The query of the applied view and filters. */
	private query(cursor: string | undefined): ChangeListQuery {
		const f = this.filters()
		return {
			view: this.view(),
			q: f.q.trim(),
			sort: f.sort === 'createdAt:desc' ? 'createdAt:desc' : 'effectiveDate:desc',
			...(f.changeType !== 'all' ? { changeType: f.changeType } : {}),
			...(f.status !== 'all' ? { status: f.status } : {}),
			...(this.from() ? { from: this.from() } : {}),
			...(this.to() ? { to: this.to() } : {}),
			...(cursor ? { cursor } : {}),
		}
	}

	/** Switch between all requests, mine and those awaiting my decision. */
	chooseView(item: HTMLElement | undefined): void {
		const view = item?.dataset['view'] as View | undefined
		if (view && view !== this.view()) {
			this.view.set(view)
			this.load(false)
		}
	}

	/** Open a request in the mid column. */
	open(requestId: string | undefined): void {
		if (requestId) void this.router.navigateByUrl(`${BASE_ROUTE}/${encodeURIComponent(requestId)}`)
	}

	/** Close the request column. */
	close(): void {
		void this.router.navigateByUrl(BASE_ROUTE)
	}

	/** Route list actions. */
	action(id: string): void {
		if (id === 'create' && this.canRequest()) void this.router.navigateByUrl(`${BASE_ROUTE}/new`)
	}

	/** Open the draft on the wizard route. */
	edit(requestId: string): void {
		void this.router.navigateByUrl(`${BASE_ROUTE}/${encodeURIComponent(requestId)}/edit`)
	}

	/** A dialog committed a command: refresh the list and the request. */
	dialogSaved(result: { message: string; request: EmploymentChangeRequestDto }): void {
		this.dialog.set(null)
		this.notice.set(result.message)
		this.refresh.update(/** Invalidate the request. */ (count) => count + 1)
		this.load(false)
	}

	/** Consult any open dialog draft before leaving the feature. */
	canLeave(): Promise<boolean> {
		return this.dialogEditor()?.canLeave() ?? Promise.resolve(true)
	}
}
