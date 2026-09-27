import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	type OnDestroy,
	type OnInit,
	computed,
	inject,
	input,
	output,
	signal,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import type { Observable } from 'rxjs'
import { form, FormField, maxLength, pattern, required } from '@angular/forms/signals'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { HrServiceDeskApi, hrServiceErrorMessage } from '@empflowyee/hcm-web-employee-data-access'
import {
	HR_PRIORITIES,
	HR_RESOLUTION_CODES,
	type HrServiceRequestDto,
	type HrStatus,
} from '@empflowyee/hcm-employee-contract'
import { PRIORITY_LABELS, RESOLUTION_LABELS, STATUS_LABELS } from './labels'
import { HrOptionBox, type OptionRef } from './option-box.component'

/** A request command, opened from the queue or a request's Object Page. */
export interface RequestDialogInput {
	mode: 'create' | 'assign' | 'status'
	request?: HrServiceRequestDto
}

/** Focused Dialog to raise, route or move an HR service request. */
@Component({
	selector: 'ef-hcm-hr-request-dialog',
	imports: [
		FormField,
		Dialog,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		Select,
		Option,
		Input,
		TextArea,
		Text,
		MessageStrip,
		HcmDiscardDialog,
		HrOptionBox,
	],
	templateUrl: './request-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestDialog implements OnInit, OnDestroy {
	readonly input = input.required<RequestDialogInput>()
	readonly saved = output<{ message: string; request: HrServiceRequestDto }>()
	readonly closed = output<void>()
	private readonly api = inject(HrServiceDeskApi)
	private readonly destroy = inject(DestroyRef)
	private allowClose = false
	readonly priorities = HR_PRIORITIES
	readonly priorityLabels = PRIORITY_LABELS
	readonly resolutions = HR_RESOLUTION_CODES
	readonly resolutionLabels = RESOLUTION_LABELS
	readonly statusLabels = STATUS_LABELS
	readonly touched = signal(false)
	readonly worker = signal<OptionRef | null>(null)
	readonly type = signal<OptionRef | null>(null)
	readonly team = signal<OptionRef | null>(null)
	readonly agent = signal<OptionRef | null>(null)
	readonly model = signal({
		priority: 'P3',
		subject: '',
		description: '',
		status: '',
		resolutionCode: '',
		resolutionSummary: '',
		reason: '',
	})
	readonly mode = computed(/** The command. */ () => this.input().mode)
	readonly request = computed(
		/** The request acted on, if any. */ () => this.input().request ?? null,
	)
	readonly transitions = computed(
		/** Statuses the server allows next. */ () => this.request()?.actions.transitions ?? [],
	)
	readonly reasonRequired = computed(
		/** A reason is needed except for plain status moves. */ () =>
			this.mode() !== 'status' || this.model().status === 'Cancelled',
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.reason, { when: /** Where needed. */ () => this.reasonRequired() })
			pattern(path.reason, /^$|\S/)
			maxLength(path.reason, 500)
			required(path.subject, { when: /** Create only. */ () => this.mode() === 'create' })
			pattern(path.subject, /^$|\S/)
			maxLength(path.subject, 200)
			required(path.description, { when: /** Create only. */ () => this.mode() === 'create' })
			maxLength(path.description, 5000)
			required(path.status, { when: /** Status only. */ () => this.mode() === 'status' })
			required(path.resolutionCode, {
				when: /** Resolving. */ () => this.model().status === 'Resolved',
			})
			required(path.resolutionSummary, {
				when: /** Resolving. */ () => this.model().status === 'Resolved',
			})
			maxLength(path.resolutionSummary, 1000)
		},
	)
	readonly draft = new HcmDraft(
		/** Track the draft. */ () => ({
			model: this.model(),
			worker: this.worker(),
			type: this.type(),
			team: this.team(),
			agent: this.agent(),
		}),
	)
	readonly copy = computed(
		/** Title, confirmation and explanation. */ () => {
			const number = this.request()?.requestNumber ?? ''
			const copies = {
				create: {
					title: 'New request',
					confirm: 'Create',
					text: 'The request is routed to the default team of its type; its service level targets start now.',
				},
				assign: {
					title: `Assign ${number}`,
					confirm: 'Assign',
					text: 'Team membership routes work only; every agent still needs the handle permission.',
				},
				status: {
					title: `Change status of ${number}`,
					confirm: 'Change status',
					text: 'The employee sees the change. Waiting for employee pauses the targets; resolving meets them.',
				},
			}
			return copies[this.mode()]
		},
	)

	/** Prefill from the request. */
	ngOnInit(): void {
		const request = this.request()
		if (this.mode() === 'assign' && request) {
			this.team.set(request.team)
			if (request.assignee)
				this.agent.set({ id: request.assignee.accountId, name: request.assignee.name })
		}
		if (this.mode() === 'status')
			this.model.update(
				/** First allowed status. */ (v) => ({ ...v, status: this.transitions()[0] ?? '' }),
			)
		this.draft.markClean()
	}

	/** Send the command, closing only after the server confirms it. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		this.touched.set(true)
		const f = this.fields
		for (const field of [
			f.subject,
			f.description,
			f.status,
			f.resolutionCode,
			f.resolutionSummary,
			f.reason,
		])
			if (field().invalid()) {
				field().focusBoundControl()
				return
			}
		const call = this.call()
		if (!call) return
		this.draft.saving.set(true)
		this.draft.error.set('')
		call.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Close after commit. */ (request) => {
				this.draft.saving.set(false)
				this.draft.markClean()
				this.allowClose = true
				this.saved.emit({ message: this.outcome(request), request })
			},
			error: /** Preserve the draft and retry key. */ (error) => {
				this.draft.saving.set(false)
				this.draft.error.set(hrServiceErrorMessage(error))
			},
		})
	}

	/** The call of the mode, or null when a required choice is missing. */
	private call(): Observable<HrServiceRequestDto> | null {
		const v = this.model()
		const reason = v.reason.trim()
		const request = this.request()
		if (this.mode() === 'create') {
			const worker = this.worker()
			const type = this.type()
			if (!worker || !type) return null
			const body = {
				subjectWorkerId: worker.id,
				typeId: type.id,
				priority: v.priority,
				subject: v.subject.trim(),
				description: v.description.trim(),
				reason,
			}
			return this.api.create(body, this.draft.key(body))
		}
		if (!request) return null
		if (this.mode() === 'assign') {
			const team = this.team()
			if (!team) return null
			const body = {
				teamId: team.id,
				assigneeAccountId: this.agent()?.id ?? null,
				reason,
				expectedRevision: request.revision,
			}
			return this.api.command(
				request.id,
				'assignment',
				body,
				this.draft.key({ id: request.id, body }),
			)
		}
		const body: Record<string, unknown> = { status: v.status, expectedRevision: request.revision }
		if (reason) body['reason'] = reason
		if (v.status === 'Resolved') {
			body['resolutionCode'] = v.resolutionCode
			body['resolutionSummary'] = v.resolutionSummary.trim()
		}
		return this.api.command(request.id, 'status', body, this.draft.key({ id: request.id, body }))
	}

	/** The confirmation of a committed command. */
	private outcome(request: HrServiceRequestDto): string {
		if (this.mode() === 'create') return `Request ${request.requestNumber} was created.`
		if (this.mode() === 'assign')
			return `${request.requestNumber} is assigned to ${request.assignee?.name ?? request.team.name}.`
		return `${request.requestNumber} is now ${STATUS_LABELS[request.status as HrStatus]}.`
	}

	/** Route Cancel and Escape through the same discard rule. */
	async cancel(): Promise<void> {
		if (await this.draft.canLeave()) {
			this.allowClose = true
			this.closed.emit()
		}
	}

	/** Keep dirty drafts when native Escape requests dismissal. */
	beforeClose(event: Event): void {
		if (event.target !== event.currentTarget || this.allowClose) return
		event.preventDefault()
		void this.cancel()
	}

	/** Allow the page's navigation guard to consult this draft. */
	canLeave(): Promise<boolean> {
		return this.draft.canLeave()
	}

	/** Release a pending navigation decision. */
	ngOnDestroy(): void {
		this.draft.release()
	}
}
