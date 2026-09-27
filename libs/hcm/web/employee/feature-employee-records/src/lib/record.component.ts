import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	effect,
	inject,
	input,
	output,
	signal,
	untracked,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { forkJoin, type Subscription } from 'rxjs'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Link } from '@fundamental-ngx/ui5-webcomponents/link'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableRowAction } from '@fundamental-ngx/ui5-webcomponents/table-row-action'
import { Timeline } from '@fundamental-ngx/ui5-webcomponents-fiori/timeline'
import { TimelineItem } from '@fundamental-ngx/ui5-webcomponents-fiori/timeline-item'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import { HcmDatePipe, HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	EmployeeRecordsApi,
	employeeDenied,
	employeeMissing,
	recordsErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import type {
	RecordAddressDto,
	RecordAssignmentDto,
	WorkerEventDto,
	WorkerRecordDto,
} from '@empflowyee/hcm-employee-contract'
import {
	ADDRESS_TYPE_LABELS,
	CONTACT_TYPE_LABELS,
	EMERGENCY_PERMISSION,
	EMPLOYMENT_CHANGES_ROUTE,
	EMPLOYMENT_TYPE_LABELS,
	WORK_MODE_LABELS,
	decimal,
	employmentStatus,
	recordState,
} from './labels'
import type { RecordDialogInput, RecordDialogRequest } from './record-dialog.component'

/** Mid column: one worker record for HR; employment and assignment facts are read-only here. */
@Component({
	selector: 'ef-hcm-worker-record',
	imports: [
		ObjectStatusComponent,
		Form,
		FormItem,
		Label,
		Text,
		Link,
		CheckBox,
		Button,
		Title,
		MessageStrip,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableRowAction,
		Timeline,
		TimelineItem,
		HcmObjectPage,
		HcmObjectSection,
		HcmDatePipe,
	],
	templateUrl: './record.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordComponent {
	readonly workerId = input.required<string>()
	readonly refresh = input(0)
	readonly canManage = input(false)
	readonly opened = output<string>()
	readonly dialogRequested = output<RecordDialogInput>()
	readonly closed = output<void>()
	private readonly api = inject(EmployeeRecordsApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly employment = employmentStatus
	readonly state = recordState
	readonly addressTypes = ADDRESS_TYPE_LABELS
	readonly contactTypes = CONTACT_TYPE_LABELS
	readonly employmentTypes = EMPLOYMENT_TYPE_LABELS
	readonly workModes = WORK_MODE_LABELS
	readonly decimal = decimal
	readonly changesRoute = EMPLOYMENT_CHANGES_ROUTE
	readonly record = signal<WorkerRecordDto | null>(null)
	readonly events = signal<WorkerEventDto[]>([])
	readonly eventCursor = signal<string | null>(null)
	readonly pageState = signal<'content' | 'loading' | 'error' | 'denied'>('loading')
	readonly message = signal('')
	readonly canReveal = computed(
		/** Presentation only; the reveal re-authorizes on the server. */ () =>
			this.runtime.context()?.access.permissions.includes(EMERGENCY_PERMISSION) === true,
	)
	readonly editable = computed(
		/** A merged-away record is never edited through its survivor's URL. */ () =>
			this.canManage() && this.record()?.mergedFromWorkerId === null,
	)
	readonly actions = computed(
		/** Record commands the viewer may use. */ () => {
			const actions: { id: string; label: string; mutates?: boolean; emphasized?: boolean }[] = []
			if (this.record() && this.editable()) {
				actions.push({
					id: 'person',
					label: 'Correct personal details',
					mutates: true,
					emphasized: true,
				})
				actions.push({ id: 'merge', label: 'Merge duplicate', mutates: true })
			}
			if (this.record() && this.canReveal())
				actions.push({ id: 'reveal', label: 'Reveal emergency information' })
			actions.push({ id: 'close', label: 'Close' })
			return actions
		},
	)

	/** Reload when the worker or a refresh changes. */
	constructor() {
		effect(
			/** Track the inputs that define the visible data. */ () => {
				this.workerId()
				this.refresh()
				untracked(/** Load outside the reactive context. */ () => this.load())
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.request?.unsubscribe())
	}

	/** Load the record with its first page of events. */
	load(): void {
		this.request?.unsubscribe()
		if (this.record()?.workerId !== this.workerId()) this.pageState.set('loading')
		this.message.set('')
		const id = this.workerId()
		this.request = forkJoin({ record: this.api.read(id), events: this.api.events(id) })
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the record. */ (result) => {
					this.record.set(result.record)
					this.events.set(result.events.items)
					this.eventCursor.set(result.events.nextCursor)
					this.pageState.set('content')
				},
				error: /** Truthful failure without stale data. */ (error) => {
					this.record.set(null)
					this.message.set(
						employeeMissing(error)
							? 'This record is no longer available.'
							: recordsErrorMessage(error),
					)
					this.pageState.set(employeeDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Load more events. */
	moreEvents(): void {
		const cursor = this.eventCursor()
		if (!cursor) return
		this.api
			.events(this.workerId(), cursor)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Append the page. */ (page) => {
					this.events.update(/** Append. */ (rows) => [...rows, ...page.items])
					this.eventCursor.set(page.nextCursor)
				},
				error: /** Keep what is shown and explain. */ (error) =>
					this.message.set(recordsErrorMessage(error)),
			})
	}

	/** One-line address text. */
	addressText(address: RecordAddressDto): string {
		return [
			address.line1,
			address.line2,
			address.locality,
			address.city,
			address.stateOrProvince,
			address.postalCode,
			address.countryName,
		]
			.filter(Boolean)
			.join(', ')
	}

	/** Whether an address is still in effect or starts later. */
	inEffect(address: RecordAddressDto): boolean {
		return address.effectiveTo === null
	}

	/** Designation, unit, department and location of an assignment. */
	placement(assignment: RecordAssignmentDto): string {
		return (
			[assignment.designation, assignment.unit, assignment.department, assignment.location]
				.filter(Boolean)
				.join(' · ') || '—'
		)
	}

	/** Timeline subtitle of an event. */
	eventSubtitle(event: WorkerEventDto): string {
		const change = [event.previousValueSummary, event.newValueSummary].filter(Boolean).join(' → ')
		return [change, event.reason].filter(Boolean).join(' · ')
	}

	/** Request one of the record dialogs. */
	ask(request: RecordDialogRequest): void {
		const record = this.record()
		if (record) this.dialogRequested.emit({ ...request, record })
	}

	/** Route Object Page actions. */
	action(id: string): void {
		if (id === 'close') this.closed.emit()
		else if (id === 'person' || id === 'merge' || id === 'reveal') this.ask({ mode: id })
	}
}
