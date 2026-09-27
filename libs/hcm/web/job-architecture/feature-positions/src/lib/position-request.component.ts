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
import type { Observable, Subscription } from 'rxjs'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import { HcmDatePipe } from '@empflowyee/hcm-web-runtime-context'
import {
	PositionsApi,
	jobArchitectureDenied,
	jobArchitectureErrorMessage,
	jobArchitectureMissing,
} from '@empflowyee/hcm-web-job-architecture-data-access'
import type {
	PositionChangeRequestDto,
	PositionDecision,
} from '@empflowyee/hcm-job-architecture-contract'
import { POSITION_TYPE_LABELS, REQUEST_TYPE_LABELS, decimal, requestStatus } from './labels'

/** End column: one change request with its proposal, impact preview and decision. */
@Component({
	selector: 'ef-hcm-position-request',
	imports: [
		ObjectStatusComponent,
		Form,
		FormItem,
		Label,
		Text,
		CheckBox,
		MessageStrip,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		HcmObjectPage,
		HcmObjectSection,
		HcmDatePipe,
	],
	templateUrl: './position-request.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PositionRequestComponent {
	readonly requestId = input.required<string>()
	readonly refresh = input(0)
	readonly edited = output<string>()
	readonly withdrawRequested = output<PositionChangeRequestDto>()
	readonly decisionRequested = output<{
		request: PositionChangeRequestDto
		decision: PositionDecision
	}>()
	readonly updated = output<string>()
	readonly closed = output<void>()
	private readonly api = inject(PositionsApi)
	private readonly destroy = inject(DestroyRef)
	private read?: Subscription
	/** Retry keys per command and revision, so a repeated click never applies twice. */
	private readonly keys = new Map<string, string>()
	readonly status = requestStatus
	readonly types = REQUEST_TYPE_LABELS
	readonly positionTypes = POSITION_TYPE_LABELS
	readonly decimal = decimal
	readonly request = signal<PositionChangeRequestDto | null>(null)
	readonly state = signal<'content' | 'loading' | 'error' | 'denied'>('loading')
	readonly message = signal('')
	readonly commandError = signal('')
	readonly busy = signal(false)
	readonly previewUsable = computed(
		/** A preview authorizes submission only while valid and unexpired. */ () => {
			const preview = this.request()?.preview
			return Boolean(preview?.valid && new Date(preview.expiresAt).getTime() > Date.now())
		},
	)
	readonly actions = computed(
		/** Steps allowed for the viewer and the request status. */ () => {
			const request = this.request()
			const actions: { id: string; label: string; mutates?: boolean; emphasized?: boolean }[] = []
			if (request?.requestedByMe) {
				const editable = request.status === 'Draft' || request.status === 'Previewed'
				const submittable = request.status === 'Previewed' && this.previewUsable()
				// The next step comes first so it stays visible in a narrow column.
				if (submittable)
					actions.push({ id: 'submit', label: 'Submit', mutates: true, emphasized: true })
				if (editable)
					actions.push({
						id: 'preview',
						label: 'Preview impact',
						mutates: true,
						emphasized: !submittable,
					})
				if (editable && request.proposed)
					actions.push({ id: 'edit', label: 'Edit proposal', mutates: true })
				if (editable || request.status === 'PendingApproval')
					actions.push({ id: 'withdraw', label: 'Withdraw', mutates: true })
			}
			if (request?.canDecide) {
				actions.push({ id: 'approve', label: 'Approve', mutates: true, emphasized: true })
				actions.push({ id: 'reject', label: 'Reject', mutates: true })
			}
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
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.read?.unsubscribe())
	}

	/** Load the request. */
	load(): void {
		this.read?.unsubscribe()
		if (this.request()?.id !== this.requestId()) this.state.set('loading')
		this.message.set('')
		this.read = this.api
			.readRequest(this.requestId())
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the request. */ (request) => {
					this.request.set(request)
					this.state.set('content')
				},
				error: /** Truthful failure without stale data. */ (error) => {
					this.request.set(null)
					this.message.set(
						jobArchitectureMissing(error)
							? 'This change request is no longer available.'
							: jobArchitectureErrorMessage(error),
					)
					this.state.set(jobArchitectureDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** One stable retry key per command and revision. */
	private key(command: string, request: PositionChangeRequestDto): string {
		const name = `${command}:${request.id}:${request.revision}`
		let key = this.keys.get(name)
		if (!key) {
			key = crypto.randomUUID()
			this.keys.set(name, key)
		}
		return key
	}

	/** Run one command and publish its result. */
	private run(call: Observable<PositionChangeRequestDto>, done: string): void {
		this.busy.set(true)
		this.commandError.set('')
		call.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Publish the committed request. */ (request) => {
				this.busy.set(false)
				this.request.set(request)
				this.updated.emit(done)
			},
			error: /** Keep the request and explain. */ (error) => {
				this.busy.set(false)
				this.commandError.set(jobArchitectureErrorMessage(error))
			},
		})
	}

	/** Route Object Page actions. */
	action(id: string): void {
		const request = this.request()
		if (id === 'close') this.closed.emit()
		else if (!request || this.busy()) return
		else if (id === 'edit') this.edited.emit(request.id)
		else if (id === 'withdraw') this.withdrawRequested.emit(request)
		else if (id === 'approve') this.decisionRequested.emit({ request, decision: 'Approved' })
		else if (id === 'reject') this.decisionRequested.emit({ request, decision: 'Rejected' })
		else if (id === 'preview')
			this.run(
				this.api.preview(
					request.id,
					{ expectedRevision: request.revision },
					this.key('preview', request),
				),
				'Impact previewed. Submit within 15 minutes.',
			)
		else if (id === 'submit' && request.preview)
			this.run(
				this.api.submit(
					request.id,
					{ previewId: request.preview.id, expectedRevision: request.revision },
					this.key('submit', request),
				),
				'Request submitted for approval.',
			)
	}
}
