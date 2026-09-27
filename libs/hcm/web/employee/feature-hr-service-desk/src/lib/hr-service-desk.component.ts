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
	HrServiceDeskApi,
	employeeDenied,
	hrServiceErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import {
	HR_CONFIG_KINDS,
	HR_PRIORITIES,
	HR_STATUSES,
	SLA_STATES,
	type HrConfigKind,
	type HrServiceConfigDto,
	type HrServiceLevelPolicyDto,
	type HrServiceMembershipDto,
	type HrServiceRequestSummaryDto,
	type HrServiceRequestTypeDto,
	type HrServiceTeamDto,
} from '@empflowyee/hcm-employee-contract'
import {
	BASE_ROUTE,
	CATEGORY_LABELS,
	CONFIGURE_PERMISSION,
	CONFIG_LABELS,
	HANDLE_PERMISSION,
	PRIORITY_LABELS,
	STATUS_LABELS,
	priorityStatus,
	requestStatus,
	slaStatus,
} from './labels'
import { RequestPageComponent } from './request-page.component'
import { RequestDialog, type RequestDialogInput } from './request-dialog.component'
import { ConfigDialog, type ConfigDialogInput } from './config-dialog.component'

type DeskView = 'assigned' | 'teams' | 'all' | 'configuration'

/** One configuration row for display. */
interface ConfigRow {
	id: string
	name: string
	detail: string
	state: string
	item: HrServiceConfigDto
}

/** HR Service Desk: native two-column FCL of the queue or configuration and the selected request. */
@Component({
	selector: 'ef-hcm-hr-service-desk',
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
		RequestPageComponent,
		RequestDialog,
		ConfigDialog,
	],
	templateUrl: './hr-service-desk.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrServiceDeskComponent {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(HrServiceDeskApi)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly status = requestStatus
	readonly priority = priorityStatus
	readonly sla = slaStatus
	readonly statuses = HR_STATUSES
	readonly statusLabels = STATUS_LABELS
	readonly priorities = HR_PRIORITIES
	readonly priorityLabels = PRIORITY_LABELS
	readonly slaStates = SLA_STATES
	readonly configKinds = HR_CONFIG_KINDS
	readonly configLabels = CONFIG_LABELS
	readonly selected = toSignal(
		this.router.events.pipe(
			filter(/** Completed navigations only. */ (event) => event instanceof NavigationEnd),
			map(/** Read the child segment. */ () => this.childSelection()),
		),
		{ initialValue: this.childSelection() },
	)
	readonly view = signal<DeskView>('all')
	readonly configKind = signal<HrConfigKind>('teams')
	readonly requests = signal<HrServiceRequestSummaryDto[]>([])
	readonly configItems = signal<HrServiceConfigDto[]>([])
	readonly cursor = signal<string | null>(null)
	readonly filters = signal({ q: '', status: '', priority: '', slaState: '' })
	readonly filterForm = form(this.filters)
	readonly state = signal<HcmPageState>('loading')
	readonly listState = signal<'loading' | 'content' | 'error'>('loading')
	readonly message = signal('')
	readonly notice = signal('')
	readonly refresh = signal(0)
	readonly dialog = signal<RequestDialogInput | null>(null)
	readonly configDialog = signal<ConfigDialogInput | null>(null)
	private readonly requestEditor = viewChild(RequestDialog)
	private readonly configEditor = viewChild(ConfigDialog)
	private readonly page = viewChild(RequestPageComponent)
	readonly canHandle = computed(
		/** Presentation only; every endpoint re-authorizes on the server. */ () =>
			this.runtime.context()?.access.permissions.includes(HANDLE_PERMISSION) === true,
	)
	readonly canConfigure = computed(
		/** Presentation only; every endpoint re-authorizes on the server. */ () =>
			this.runtime.context()?.access.permissions.includes(CONFIGURE_PERMISSION) === true,
	)
	readonly configuring = computed(
		/** The configuration view. */ () => this.view() === 'configuration',
	)
	readonly actions = computed(
		/** Create a request, or a configuration item in the configuration view. */ () => {
			if (this.configuring()) return this.canConfigure() ? [this.configureAction()] : []
			return this.canHandle()
				? [{ id: 'create', label: 'New request', mutates: true, emphasized: true }]
				: []
		},
	)
	readonly configRows = computed(
		/** Configuration items with a common name, detail and state. */ () =>
			this.configItems().map(/** Row. */ (item) => this.configRow(item)),
	)
	readonly noData = computed(
		/** Explain an empty table truthfully. */ () => {
			if (this.listState() === 'error') return 'The list could not be loaded'
			if (this.configuring())
				return `No ${CONFIG_LABELS[this.configKind()].plural.toLowerCase()} yet`
			const f = this.filters()
			if (f.q || f.status || f.priority || f.slaState) return 'No request matches the filters'
			if (this.view() === 'assigned') return 'Nothing is assigned to you'
			if (this.view() === 'teams') return 'Nothing is routed to your teams'
			return 'No HR requests yet'
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
						this.configItems.set([])
						this.dialog.set(null)
						this.configDialog.set(null)
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

	/** Load a page of the view; growing appends. */
	load(append: boolean): void {
		this.request?.unsubscribe()
		if (!append) this.listState.set('loading')
		this.message.set('')
		const cursor = append && this.cursor() ? (this.cursor() as string) : undefined
		if (this.configuring()) {
			this.request = this.api
				.configuration(this.configKind(), cursor)
				.pipe(takeUntilDestroyed(this.destroy))
				.subscribe({
					next: /** Publish the page. */ (page) => {
						this.configItems.update(
							/** Append on growing. */ (rows) => (append ? [...rows, ...page.items] : page.items),
						)
						this.published(page.nextCursor)
					},
					error: /** Publish a failure truthfully. */ (error) => this.failed(error),
				})
			return
		}
		const f = this.filters()
		this.request = this.api
			.queue({
				view: this.view(),
				q: f.q.trim(),
				status: f.status,
				priority: f.priority,
				slaState: f.slaState,
				cursor,
			})
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the page. */ (page) => {
					this.requests.update(
						/** Append on growing. */ (rows) => (append ? [...rows, ...page.items] : page.items),
					)
					this.published(page.nextCursor)
				},
				error: /** Publish a failure truthfully. */ (error) => this.failed(error),
			})
	}

	/** Record a loaded page. */
	private published(cursor: string | null): void {
		this.cursor.set(cursor)
		this.listState.set('content')
		this.state.set('content')
	}

	/** Record a failed page. */
	private failed(error: unknown): void {
		this.message.set(hrServiceErrorMessage(error))
		if (employeeDenied(error) && !this.configuring()) this.state.set('denied')
		else this.listState.set('error')
		if (this.state() === 'loading') this.state.set('error')
	}

	/** Switch between the queue views and configuration. */
	chooseView(item: HTMLElement | undefined): void {
		const view = item?.dataset['view'] as DeskView | undefined
		if (view && view !== this.view()) {
			this.view.set(view)
			this.cursor.set(null)
			this.load(false)
		}
	}

	/** Switch the configuration kind. */
	chooseKind(kind: string): void {
		if ((HR_CONFIG_KINDS as readonly string[]).includes(kind) && kind !== this.configKind()) {
			this.configKind.set(kind as HrConfigKind)
			this.configItems.set([])
			this.load(false)
		}
	}

	/** The action that creates an item of the current configuration kind. */
	private configureAction() {
		const label = `New ${CONFIG_LABELS[this.configKind()].singular}`
		return { id: 'configure', label, mutates: true, emphasized: true }
	}

	/** A configuration item for display. */
	private configRow(item: HrServiceConfigDto): ConfigRow {
		const kind = this.configKind()
		/** Active or inactive. */
		const active = (value: boolean) => (value ? 'Active' : 'Inactive')
		if (kind === 'teams') {
			const team = item as HrServiceTeamDto
			return {
				id: team.id,
				name: team.name,
				detail: `${team.code}, ${team.memberCount} members`,
				state: active(team.isActive),
				item,
			}
		}
		if (kind === 'memberships') {
			const member = item as HrServiceMembershipDto
			return {
				id: member.id,
				name: member.account.name,
				detail: `${member.team.name}, ${member.memberRole}`,
				state: active(member.isActive),
				item,
			}
		}
		if (kind === 'request-types') {
			const type = item as HrServiceRequestTypeDto
			const audience = type.audience === 'HrOnly' ? 'HR only' : 'Employees and HR'
			return {
				id: type.id,
				name: type.name,
				detail: `${CATEGORY_LABELS[type.category]}, ${audience}, ${type.defaultTeam.name}, ${type.serviceLevelCode}`,
				state: active(type.isActive),
				item,
			}
		}
		const policy = item as HrServiceLevelPolicyDto
		return {
			id: policy.id,
			name: policy.name,
			detail: `${policy.code} version ${policy.versionNumber}`,
			state: policy.status,
			item,
		}
	}

	/** Open a queue row in the mid column, or a configuration row in its edit Dialog. */
	open(id: string | undefined): void {
		if (!id) return
		if (this.configuring()) {
			const row = this.configRows().find(/** The row. */ (item) => item.id === id)
			if (row && this.canConfigure())
				this.configDialog.set({ kind: this.configKind(), item: row.item })
			return
		}
		void this.router.navigateByUrl(`${BASE_ROUTE}/${encodeURIComponent(id)}`)
	}

	/** Close the request column. */
	close(): void {
		void this.router.navigateByUrl(BASE_ROUTE)
	}

	/** Route list actions. */
	action(id: string): void {
		if (id === 'create' && this.canHandle()) this.dialog.set({ mode: 'create' })
		if (id === 'configure' && this.canConfigure())
			this.configDialog.set({ kind: this.configKind(), item: null })
	}

	/** A request dialog committed a command: refresh and show the request. */
	dialogSaved(result: { message: string; request: { id: string } }): void {
		this.dialog.set(null)
		this.notice.set(result.message)
		this.refresh.update(/** Invalidate the request. */ (count) => count + 1)
		this.load(false)
		if (this.selected() !== result.request.id) this.open(result.request.id)
	}

	/** A configuration dialog committed a change. */
	configSaved(result: { message: string }): void {
		this.configDialog.set(null)
		this.notice.set(result.message)
		this.load(false)
	}

	/** Consult any open draft before leaving the feature. */
	async canLeave(): Promise<boolean> {
		for (const editor of [this.requestEditor(), this.configEditor(), this.page()])
			if (editor && !(await editor.canLeave())) return false
		return true
	}
}
