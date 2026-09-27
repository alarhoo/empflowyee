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
	PositionsApi,
	jobArchitectureDenied,
	jobArchitectureErrorMessage,
	type PositionListQuery,
	type PositionRequestListQuery,
} from '@empflowyee/hcm-web-job-architecture-data-access'
import {
	POSITION_LIFECYCLE,
	POSITION_REQUEST_STATUSES,
	type PositionChangeRequestDto,
	type PositionChangeRequestSummaryDto,
	type PositionLifecycle,
	type PositionRequestStatus,
	type PositionSummaryDto,
} from '@empflowyee/hcm-job-architecture-contract'
import {
	APPROVE_PERMISSION,
	BASE_ROUTE,
	REQUEST_PERMISSION,
	REQUEST_TYPE_LABELS,
	decimal,
	lifecycleStatus,
	requestStatus,
} from './labels'
import { PositionComponent } from './position.component'
import { PositionRequestComponent } from './position-request.component'
import { RequestDialog, type RequestDialogInput } from './request-dialog.component'

interface Selection {
	positionId: string
	requestId: string | null
}

/** Positions: native three-column FCL of positions, the selected position and a change request. */
@Component({
	selector: 'ef-hcm-positions',
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
		PositionComponent,
		PositionRequestComponent,
		RequestDialog,
	],
	templateUrl: './positions.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PositionsComponent {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(PositionsApi)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly lifecycles = POSITION_LIFECYCLE
	readonly requestStatuses = POSITION_REQUEST_STATUSES
	readonly lifecycle = lifecycleStatus
	readonly status = requestStatus
	readonly types = REQUEST_TYPE_LABELS
	readonly decimal = decimal
	readonly selected = toSignal(
		this.router.events.pipe(
			filter(/** Completed navigations only. */ (event) => event instanceof NavigationEnd),
			map(/** Read the child segments. */ () => this.childSelection()),
		),
		{ initialValue: this.childSelection() },
	)
	readonly scope = signal<'positions' | 'requests'>('positions')
	readonly positions = signal<PositionSummaryDto[]>([])
	readonly requests = signal<PositionChangeRequestSummaryDto[]>([])
	readonly cursor = signal<string | null>(null)
	readonly filters = signal({
		q: '',
		status: 'all',
		vacancy: 'all',
		view: 'all',
		requestStatus: 'all',
	})
	readonly filterForm = form(this.filters)
	readonly state = signal<HcmPageState>('loading')
	readonly listState = signal<'loading' | 'content' | 'error'>('loading')
	readonly message = signal('')
	readonly notice = signal('')
	readonly refresh = signal(0)
	readonly dialog = signal<RequestDialogInput | null>(null)
	private readonly dialogEditor = viewChild(RequestDialog)
	readonly canRequest = computed(
		/** Presentation only; every endpoint re-authorizes on the server. */ () =>
			this.runtime.context()?.access.permissions.includes(REQUEST_PERMISSION) === true,
	)
	readonly canApprove = computed(
		/** Presentation only; every endpoint re-authorizes on the server. */ () =>
			this.runtime.context()?.access.permissions.includes(APPROVE_PERMISSION) === true,
	)
	readonly actions = computed(
		/** New positions are requested on their dedicated route. */ () =>
			this.canRequest()
				? [{ id: 'create', label: 'New position', mutates: true, emphasized: true }]
				: [],
	)
	readonly layout = computed(
		/** Show the detail columns only for a selection. */ () => {
			const selection = this.selected()
			if (!selection) return 'OneColumn'
			return selection.requestId ? 'ThreeColumnsEndExpanded' : 'TwoColumnsMidExpanded'
		},
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
						this.requests.set([])
						this.dialog.set(null)
						if (context) this.load(false)
					},
				)
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.request?.unsubscribe())
	}

	/** The selected position and request from the child route segments. */
	private childSelection(): Selection | null {
		const params = this.route.snapshot.firstChild?.paramMap
		const positionId = params?.get('positionId')
		return positionId ? { positionId, requestId: params?.get('requestId') ?? null } : null
	}

	/** Load a page of the current scope for the applied filters; growing appends. */
	load(append: boolean): void {
		this.request?.unsubscribe()
		if (!append) this.listState.set('loading')
		this.message.set('')
		const cursor = append ? (this.cursor() ?? undefined) : undefined
		/** Publish a failure truthfully. */
		const failed = (error: unknown) => {
			this.message.set(jobArchitectureErrorMessage(error))
			if (jobArchitectureDenied(error)) this.state.set('denied')
			else this.listState.set('error')
			if (this.state() === 'loading') this.state.set('error')
		}
		if (this.scope() === 'positions') {
			this.request = this.api
				.positions(this.positionQuery(cursor))
				.pipe(takeUntilDestroyed(this.destroy))
				.subscribe({
					next: /** Publish the page. */ (page) => {
						this.positions.update(
							/** Append on growing. */ (rows) => (append ? [...rows, ...page.items] : page.items),
						)
						this.published(page.nextCursor)
					},
					error: failed,
				})
			return
		}
		this.request = this.api
			.requests(this.requestQuery(cursor))
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the page. */ (page) => {
					this.requests.update(
						/** Append on growing. */ (rows) => (append ? [...rows, ...page.items] : page.items),
					)
					this.published(page.nextCursor)
				},
				error: failed,
			})
	}

	/** Record a loaded page. */
	private published(cursor: string | null): void {
		this.cursor.set(cursor)
		this.listState.set('content')
		this.state.set('content')
	}

	/** The position query of the applied filters. */
	private positionQuery(cursor: string | undefined): PositionListQuery {
		const f = this.filters()
		return {
			q: f.q.trim(),
			...(f.status !== 'all' ? { status: f.status as PositionLifecycle } : {}),
			...(f.vacancy !== 'all' ? { hasVacancy: f.vacancy === 'vacant' ? 'true' : 'false' } : {}),
			...(cursor ? { cursor } : {}),
		}
	}

	/** The change request query of the applied filters. */
	private requestQuery(cursor: string | undefined): PositionRequestListQuery {
		const f = this.filters()
		return {
			...(f.view === 'mine' || f.view === 'awaiting-my-decision' ? { view: f.view } : {}),
			...(f.requestStatus !== 'all' ? { status: f.requestStatus as PositionRequestStatus } : {}),
			...(cursor ? { cursor } : {}),
		}
	}

	/** Switch between positions and change requests. */
	chooseScope(item: HTMLElement | undefined): void {
		const scope = item?.dataset['scope']
		if ((scope === 'positions' || scope === 'requests') && scope !== this.scope()) {
			this.scope.set(scope)
			this.load(false)
		}
	}

	/** Remaining capacity wording; unavailable occupancy is never shown as zero. */
	remaining(position: PositionSummaryDto): string {
		if (!position.occupancyComplete || position.remainingHeadcount === null) return ''
		return `${position.remainingHeadcount} seats, ${decimal(position.remainingFte)} FTE`
	}

	/** Open a position in the mid column. */
	open(positionId: string | undefined): void {
		if (positionId)
			void this.router.navigateByUrl(`${BASE_ROUTE}/${encodeURIComponent(positionId)}`)
	}

	/** Open a change request in the end column next to its position. */
	openRequest(requestId: string | undefined, positionId?: string): void {
		const position =
			positionId ??
			this.requests().find(/** The listed request. */ (row) => row.id === requestId)?.positionId
		if (!requestId || !position) return
		void this.router.navigateByUrl(
			`${BASE_ROUTE}/${encodeURIComponent(position)}/requests/${encodeURIComponent(requestId)}`,
		)
	}

	/** Close the detail columns. */
	close(): void {
		void this.router.navigateByUrl(BASE_ROUTE)
	}

	/** Close the end column. */
	closeRequest(): void {
		this.open(this.selected()?.positionId)
	}

	/** Route list actions. */
	action(id: string): void {
		if (id === 'create' && this.canRequest()) void this.router.navigateByUrl(`${BASE_ROUTE}/new`)
	}

	/** Open the dedicated change page of a position. */
	change(positionId: string): void {
		void this.router.navigateByUrl(`${BASE_ROUTE}/${encodeURIComponent(positionId)}/change`)
	}

	/** Open the dedicated edit page of a draft request. */
	edit(requestId: string): void {
		void this.router.navigateByUrl(`${BASE_ROUTE}/requests/${encodeURIComponent(requestId)}/edit`)
	}

	/** A detail column changed data: refresh the list and both detail columns. */
	updated(message: string): void {
		this.notice.set(message)
		this.refresh.update(/** Invalidate the details. */ (count) => count + 1)
		this.load(false)
	}

	/** A dialog confirmed its command: show the resulting request. */
	dialogSaved(result: PositionChangeRequestDto): void {
		const input = this.dialog()
		this.dialog.set(null)
		const verb = {
			lifecycle: 'raised as a draft; preview and submit it next',
			withdraw: 'withdrawn',
			decide: result.status === 'Applied' ? 'approved and applied' : 'rejected',
		}[input?.mode ?? 'lifecycle']
		this.updated(`${this.types[result.requestType]} request ${verb}.`)
		this.openRequest(result.id, result.positionId)
	}

	/** Consult any open dialog draft before leaving the feature. */
	canLeave(): Promise<boolean> {
		return this.dialogEditor()?.canLeave() ?? Promise.resolve(true)
	}
}
