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
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { FlexibleColumnLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
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
	MyHrRequestsApi,
	employeeDenied,
	hrServiceErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import type { HrServiceRequestSelfSummaryDto } from '@empflowyee/hcm-employee-contract'
import { BASE_ROUTE, MANAGE_PERMISSION, requestStatus } from './labels'
import { RequestPageComponent } from './request-page.component'
import { RequestDialog, type RequestDialogInput } from './request-dialog.component'

type SelfView = 'open' | 'closed'

/** My HR Requests: native two-column FCL of the worker's own requests and the selected one. */
@Component({
	selector: 'ef-hcm-my-hr-requests',
	imports: [
		ObjectStatusComponent,
		FlexibleColumnLayout,
		Form,
		FormItem,
		Label,
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
		RequestPageComponent,
		RequestDialog,
	],
	templateUrl: './my-hr-requests.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyHrRequestsComponent {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(MyHrRequestsApi)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly status = requestStatus
	readonly selected = toSignal(
		this.router.events.pipe(
			filter(/** Completed navigations only. */ (event) => event instanceof NavigationEnd),
			map(/** Read the child segment. */ () => this.childSelection()),
		),
		{ initialValue: this.childSelection() },
	)
	readonly view = signal<SelfView>('open')
	readonly requests = signal<HrServiceRequestSelfSummaryDto[]>([])
	readonly cursor = signal<string | null>(null)
	readonly state = signal<HcmPageState>('loading')
	readonly listState = signal<'loading' | 'content' | 'error'>('loading')
	readonly message = signal('')
	readonly notice = signal('')
	readonly refresh = signal(0)
	readonly dialog = signal<RequestDialogInput | null>(null)
	private readonly editor = viewChild(RequestDialog)
	private readonly page = viewChild(RequestPageComponent)
	readonly canManage = computed(
		/** Presentation only; every endpoint re-authorizes on the server. */ () =>
			this.runtime.context()?.access.permissions.includes(MANAGE_PERMISSION) === true,
	)
	readonly actions = computed(
		/** Requests are raised in a Dialog. */ () =>
			this.canManage()
				? [{ id: 'create', label: 'New request', mutates: true, emphasized: true }]
				: [],
	)
	readonly noData = computed(
		/** Explain an empty table truthfully. */ () => {
			if (this.listState() === 'error') return 'Your requests could not be loaded'
			return this.view() === 'open'
				? 'You have no open HR requests'
				: 'You have no closed HR requests'
		},
	)
	readonly layout = computed(
		/** Show the request column only for a selection. */ () =>
			this.selected() ? 'TwoColumnsMidExpanded' : 'OneColumn',
	)

	/** Reload when the verified context changes and honour a prefilled new request. */
	constructor() {
		effect(
			/** Track the context that defines the data. */ () => {
				const context = this.runtime.context()
				untracked(
					/** Clear prior-context state before loading. */ () => {
						this.request?.unsubscribe()
						this.requests.set([])
						this.dialog.set(null)
						if (context) {
							this.load(false)
							this.prefill()
						}
					},
				)
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.request?.unsubscribe())
	}

	/** Open the create Dialog from `?new=<type code>&field=<field code>`; nothing is submitted. */
	private prefill(): void {
		const params = this.route.snapshot.queryParamMap
		const typeCode = params.get('new')
		if (!typeCode || !this.canManage()) return
		this.dialog.set({ mode: 'create', typeCode, field: params.get('field') ?? undefined })
	}

	/** The selected request from the child route segment. */
	private childSelection(): string | null {
		return this.route.snapshot.firstChild?.paramMap.get('requestId') ?? null
	}

	/** Load a page of the view; growing appends. */
	load(append: boolean): void {
		this.request?.unsubscribe()
		if (!append) this.listState.set('loading')
		this.message.set('')
		const cursor = append && this.cursor() ? (this.cursor() as string) : undefined
		this.request = this.api
			.list({ view: this.view(), cursor })
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
					this.message.set(hrServiceErrorMessage(error))
					if (employeeDenied(error)) this.state.set('denied')
					else this.listState.set('error')
					if (this.state() === 'loading') this.state.set('error')
				},
			})
	}

	/** Switch between open and closed requests. */
	chooseView(item: HTMLElement | undefined): void {
		const view = item?.dataset['view'] as SelfView | undefined
		if (view && view !== this.view()) {
			this.view.set(view)
			this.load(false)
		}
	}

	/** Open a request in the mid column. */
	open(id: string | undefined): void {
		if (id) void this.router.navigateByUrl(`${BASE_ROUTE}/${encodeURIComponent(id)}`)
	}

	/** Close the request column. */
	close(): void {
		void this.router.navigateByUrl(BASE_ROUTE)
	}

	/** Route list actions. */
	action(id: string): void {
		if (id === 'create' && this.canManage()) this.dialog.set({ mode: 'create' })
	}

	/** Close the Dialog and drop any prefill from the address. */
	dialogClosed(): void {
		this.dialog.set(null)
		if (this.route.snapshot.queryParamMap.has('new'))
			void this.router.navigate([], { relativeTo: this.route, queryParams: {} })
	}

	/** A dialog committed a command: refresh and show the request. */
	dialogSaved(result: { message: string; request: { id: string } }): void {
		this.dialog.set(null)
		this.notice.set(result.message)
		this.refresh.update(/** Invalidate the request. */ (count) => count + 1)
		this.load(false)
		if (this.selected() !== result.request.id || this.route.snapshot.queryParamMap.has('new'))
			this.open(result.request.id)
	}

	/** Consult any open draft before leaving the feature. */
	async canLeave(): Promise<boolean> {
		for (const editor of [this.editor(), this.page()])
			if (editor && !(await editor.canLeave())) return false
		return true
	}
}
