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
import { Avatar } from '@fundamental-ngx/ui5-webcomponents/avatar'
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
	EmployeeRecordsApi,
	employeeDenied,
	recordsErrorMessage,
	type RecordListQuery,
} from '@empflowyee/hcm-web-employee-data-access'
import {
	EMPLOYMENT_STATUSES,
	RECORD_STATES,
	type WorkerRecordDto,
	type WorkerRecordSummaryDto,
} from '@empflowyee/hcm-employee-contract'
import { BASE_ROUTE, MANAGE_PERMISSION, employmentStatus, initials, recordState } from './labels'
import { RecordOptionBox, type OptionRef } from './option-box.component'
import { RecordComponent } from './record.component'
import { RecordDialog, type RecordDialogInput } from './record-dialog.component'

/** Employee Records: native two-column FCL of worker records and the selected record. */
@Component({
	selector: 'ef-hcm-employee-records',
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
		Avatar,
		MessageStrip,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableGrowing,
		TableRowActionNavigation,
		HcmDynamicPage,
		RecordOptionBox,
		RecordComponent,
		RecordDialog,
	],
	templateUrl: './employee-records.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeeRecordsComponent {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(EmployeeRecordsApi)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly statuses = EMPLOYMENT_STATUSES
	readonly states = RECORD_STATES
	readonly employment = employmentStatus
	readonly record = recordState
	readonly initials = initials
	readonly selected = toSignal(
		this.router.events.pipe(
			filter(/** Completed navigations only. */ (event) => event instanceof NavigationEnd),
			map(/** Read the child segment. */ () => this.childSelection()),
		),
		{ initialValue: this.childSelection() },
	)
	readonly records = signal<WorkerRecordSummaryDto[]>([])
	readonly cursor = signal<string | null>(null)
	readonly filters = signal({ q: '', status: 'all', recordState: 'all', sort: 'name:asc' })
	readonly filterForm = form(this.filters)
	readonly unit = signal<OptionRef | null>(null)
	readonly state = signal<HcmPageState>('loading')
	readonly listState = signal<'loading' | 'content' | 'error'>('loading')
	readonly message = signal('')
	readonly notice = signal('')
	readonly refresh = signal(0)
	readonly dialog = signal<RecordDialogInput | null>(null)
	private readonly dialogEditor = viewChild(RecordDialog)
	readonly canManage = computed(
		/** Presentation only; every endpoint re-authorizes on the server. */ () =>
			this.runtime.context()?.access.permissions.includes(MANAGE_PERMISSION) === true,
	)
	readonly actions = computed(
		/** New workers are created on their dedicated wizard route. */ () =>
			this.canManage()
				? [{ id: 'create', label: 'New worker', mutates: true, emphasized: true }]
				: [],
	)
	readonly layout = computed(
		/** Show the record column only for a selection. */ () =>
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
						this.records.set([])
						this.dialog.set(null)
						if (context) this.load(false)
					},
				)
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.request?.unsubscribe())
	}

	/** The selected worker from the child route segment. */
	private childSelection(): string | null {
		return this.route.snapshot.firstChild?.paramMap.get('workerId') ?? null
	}

	/** Load a page for the applied filters; growing appends. */
	load(append: boolean): void {
		this.request?.unsubscribe()
		if (!append) this.listState.set('loading')
		this.message.set('')
		const cursor = append ? (this.cursor() ?? undefined) : undefined
		this.request = this.api
			.records(this.query(cursor))
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the page. */ (page) => {
					this.records.update(
						/** Append on growing. */ (rows) => (append ? [...rows, ...page.items] : page.items),
					)
					this.cursor.set(page.nextCursor)
					this.listState.set('content')
					this.state.set('content')
				},
				error: /** Publish a failure truthfully. */ (error) => {
					this.message.set(recordsErrorMessage(error))
					if (employeeDenied(error)) this.state.set('denied')
					else this.listState.set('error')
					if (this.state() === 'loading') this.state.set('error')
				},
			})
	}

	/** The query of the applied filters. */
	private query(cursor: string | undefined): RecordListQuery {
		const f = this.filters()
		const unit = this.unit()
		return {
			q: f.q.trim(),
			sort: f.sort === 'workerNumber:asc' ? 'workerNumber:asc' : 'name:asc',
			...(f.status !== 'all' ? { status: f.status } : {}),
			...(f.recordState !== 'all' ? { recordState: f.recordState } : {}),
			...(unit ? { unitId: unit.id } : {}),
			...(cursor ? { cursor } : {}),
		}
	}

	/** Open a record in the mid column. */
	open(workerId: string | undefined): void {
		if (workerId) void this.router.navigateByUrl(`${BASE_ROUTE}/${encodeURIComponent(workerId)}`)
	}

	/** Close the record column. */
	close(): void {
		void this.router.navigateByUrl(BASE_ROUTE)
	}

	/** Route list actions. */
	action(id: string): void {
		if (id === 'create' && this.canManage()) void this.router.navigateByUrl(`${BASE_ROUTE}/new`)
	}

	/** A dialog committed a change: refresh the list and the record. */
	dialogSaved(result: { message: string; record: WorkerRecordDto | null }): void {
		this.dialog.set(null)
		this.notice.set(result.message)
		this.refresh.update(/** Invalidate the record. */ (count) => count + 1)
		this.load(false)
		if (result.record && result.record.workerId !== this.selected())
			this.open(result.record.workerId)
	}

	/** Consult any open dialog draft before leaving the feature. */
	canLeave(): Promise<boolean> {
		return this.dialogEditor()?.canLeave() ?? Promise.resolve(true)
	}
}
