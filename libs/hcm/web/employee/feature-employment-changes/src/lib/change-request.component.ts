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
import type { Subscription } from 'rxjs'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { Timeline } from '@fundamental-ngx/ui5-webcomponents-fiori/timeline'
import { TimelineItem } from '@fundamental-ngx/ui5-webcomponents-fiori/timeline-item'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import { HcmDatePipe } from '@empflowyee/hcm-web-runtime-context'
import {
	CHANGE_FAILURE_MESSAGES,
	CHANGE_FIELD_LABELS,
	EmploymentChangesApi,
	changesErrorMessage,
	employeeDenied,
	employeeMissing,
} from '@empflowyee/hcm-web-employee-data-access'
import type { EmploymentChangeRequestDto } from '@empflowyee/hcm-employee-contract'
import {
	CHANGE_TYPE_LABELS,
	REASON_LABELS,
	STEP_LABELS,
	comparisonText,
	outcomeStatus,
	requestStatus,
} from './labels'
import type { ChangeDialogInput } from './change-dialog.component'

interface HistoryEntry {
	title: string
	at: string
	detail: string
}

/** Mid column: one change request with its comparison, approvals, execution and history. */
@Component({
	selector: 'ef-hcm-change-request',
	imports: [
		ObjectStatusComponent,
		Form,
		FormItem,
		Label,
		Text,
		MessageStrip,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		Timeline,
		TimelineItem,
		HcmObjectPage,
		HcmObjectSection,
		HcmDatePipe,
	],
	templateUrl: './change-request.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangeRequestComponent {
	readonly requestId = input.required<string>()
	readonly refresh = input(0)
	readonly edited = output<string>()
	readonly dialogRequested = output<ChangeDialogInput>()
	readonly closed = output<void>()
	private readonly api = inject(EmploymentChangesApi)
	private readonly destroy = inject(DestroyRef)
	private load$?: Subscription
	readonly status = requestStatus
	readonly outcome = outcomeStatus
	readonly types = CHANGE_TYPE_LABELS
	readonly reasons = REASON_LABELS
	readonly steps = STEP_LABELS
	readonly fields = CHANGE_FIELD_LABELS
	readonly text = comparisonText
	readonly request = signal<EmploymentChangeRequestDto | null>(null)
	readonly pageState = signal<'content' | 'loading' | 'error' | 'denied'>('loading')
	readonly message = signal('')
	readonly failure = computed(
		/** The safe explanation of a failed execution. */ () => {
			const code = this.request()?.failureCode
			return code
				? (CHANGE_FAILURE_MESSAGES[code] ?? CHANGE_FAILURE_MESSAGES['execution-refused'])
				: ''
		},
	)
	readonly history = computed(
		/** Lifecycle moments, newest first. */ () => {
			const r = this.request()
			if (!r) return []
			const entries: HistoryEntry[] = [
				{
					title: 'Requested',
					at: r.requestedAt,
					detail: r.requestedByMe ? 'By you' : `By ${r.requestedBy}`,
				},
			]
			if (r.submittedAt)
				entries.push({ title: 'Submitted for approval', at: r.submittedAt, detail: '' })
			for (const approval of r.approvals)
				entries.push({
					title: approval.decision === 'Approved' ? 'Approved' : 'Rejected',
					at: approval.decidedAt,
					detail: `${approval.decidedByMe ? 'You' : approval.decidedBy}: ${approval.reason}`,
				})
			if (r.completedAt) entries.push({ title: 'Executed', at: r.completedAt, detail: '' })
			if (r.cancelledAt)
				entries.push({ title: 'Cancelled', at: r.cancelledAt, detail: r.cancelReason ?? '' })
			return entries.sort(/** Newest first. */ (a, b) => b.at.localeCompare(a.at))
		},
	)
	readonly actions = computed(
		/** Commands the server says the viewer may use. */ () => {
			const r = this.request()
			const actions: { id: string; label: string; mutates?: boolean; emphasized?: boolean }[] = []
			if (r?.actions.submit)
				actions.push({
					id: 'submit',
					label: 'Submit for approval',
					mutates: true,
					emphasized: true,
				})
			if (r?.actions.edit) actions.push({ id: 'edit', label: 'Edit draft', mutates: true })
			if (r?.actions.decide) {
				actions.push({ id: 'approve', label: 'Approve', mutates: true, emphasized: true })
				actions.push({ id: 'reject', label: 'Reject', mutates: true })
			}
			if (r?.actions.apply)
				actions.push({
					id: 'apply',
					label: r.status === 'Failed' ? 'Retry' : 'Apply',
					mutates: true,
					emphasized: true,
				})
			if (r?.actions.cancel) actions.push({ id: 'cancel', label: 'Cancel request', mutates: true })
			actions.push({ id: 'close', label: 'Close' })
			return actions
		},
	)

	/** Reload when the request or a refresh changes. */
	constructor() {
		effect(
			/** Track the inputs that define the visible data. */ () => {
				this.requestId()
				this.refresh()
				untracked(/** Load outside the reactive context. */ () => this.load())
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.load$?.unsubscribe())
	}

	/** Load the request. */
	load(): void {
		this.load$?.unsubscribe()
		if (this.request()?.id !== this.requestId()) this.pageState.set('loading')
		this.message.set('')
		this.load$ = this.api
			.read(this.requestId())
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the request. */ (request) => {
					this.request.set(request)
					this.pageState.set('content')
				},
				error: /** Truthful failure without stale data. */ (error) => {
					this.request.set(null)
					this.message.set(
						employeeMissing(error)
							? 'This request is no longer available.'
							: changesErrorMessage(error),
					)
					this.pageState.set(employeeDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Route Object Page actions. */
	action(id: string): void {
		const request = this.request()
		if (id === 'close') this.closed.emit()
		else if (!request) return
		else if (id === 'edit') this.edited.emit(request.id)
		else if (
			id === 'submit' ||
			id === 'approve' ||
			id === 'reject' ||
			id === 'apply' ||
			id === 'cancel'
		)
			this.dialogRequested.emit({ mode: id, request })
	}
}
