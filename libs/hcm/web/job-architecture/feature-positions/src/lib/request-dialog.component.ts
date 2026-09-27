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
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import {
	PositionsApi,
	jobArchitectureErrorMessage,
} from '@empflowyee/hcm-web-job-architecture-data-access'
import type {
	LifecycleRequestType,
	PositionChangeRequestDto,
	PositionDecision,
	PositionDetailDto,
} from '@empflowyee/hcm-job-architecture-contract'

export type RequestDialogInput =
	| { mode: 'lifecycle'; position: PositionDetailDto; type: LifecycleRequestType }
	| { mode: 'withdraw'; request: PositionChangeRequestDto }
	| { mode: 'decide'; request: PositionChangeRequestDto; decision: PositionDecision }

/** What each lifecycle request does, stated before it is raised. */
const LIFECYCLE_NOTES: Record<LifecycleRequestType, string> = {
	Freeze: 'A frozen position accepts no new assignments. Current assignments are not changed.',
	Reopen: 'The position accepts assignments again within its capacity.',
	Close: 'A closed position accepts no new assignments. Current assignments are not ended.',
	Cancel: 'Only a position nobody has been assigned to can be cancelled.',
}

/** Focused Dialog to raise a lifecycle request, withdraw a request, or approve or reject one. */
@Component({
	selector: 'ef-hcm-position-request-dialog',
	imports: [
		FormField,
		Dialog,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		TextArea,
		Text,
		MessageStrip,
		HcmDiscardDialog,
	],
	templateUrl: './request-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestDialog implements OnInit, OnDestroy {
	readonly input = input.required<RequestDialogInput>()
	readonly saved = output<PositionChangeRequestDto>()
	readonly closed = output<void>()
	private readonly api = inject(PositionsApi)
	private readonly destroy = inject(DestroyRef)
	private allowClose = false
	readonly model = signal({ text: '' })
	readonly mode = computed(/** Mode. */ () => this.input().mode)
	readonly rejecting = computed(
		/** A rejection always explains itself. */ () => {
			const value = this.input()
			return value.mode === 'decide' && value.decision === 'Rejected'
		},
	)
	readonly textRequired = computed(
		/** Comment is optional on approval. */ () => this.mode() !== 'decide' || this.rejecting(),
	)
	readonly textLabel = computed(
		/** Name the field. */ () =>
			this.mode() === 'decide' ? 'Decision comment' : 'Reason for change',
	)
	readonly title = computed(
		/** Name the operation and target. */ () => {
			const value = this.input()
			if (value.mode === 'lifecycle') return `${value.type} ${value.position.name}`
			const name = value.request.positionName
			if (value.mode === 'withdraw') return `Withdraw the request for ${name}`
			return `${value.decision === 'Approved' ? 'Approve' : 'Reject'} the request for ${name}`
		},
	)
	readonly note = computed(
		/** Explain the consequence before confirmation. */ () => {
			const value = this.input()
			if (value.mode === 'lifecycle')
				return `${LIFECYCLE_NOTES[value.type]} The request is saved as a draft to preview and submit.`
			if (value.mode === 'withdraw') return 'The request stops and its proposal is discarded.'
			return value.decision === 'Approved'
				? 'Approval applies the change immediately. Current assignments are not changed.'
				: 'The request stops; a new position that was never published is cancelled.'
		},
	)
	readonly confirmLabel = computed(
		/** Name the command. */ () => {
			const value = this.input()
			if (value.mode === 'lifecycle') return 'Raise request'
			if (value.mode === 'withdraw') return 'Withdraw'
			return value.decision === 'Approved' ? 'Approve' : 'Reject'
		},
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.text, { when: /** Required text. */ () => this.textRequired() })
			pattern(path.text, /^(|[\s\S]*\S[\s\S]*)$/)
			maxLength(path.text, 1000)
		},
	)
	readonly draft = new HcmDraft(/** Track the draft. */ () => this.model())

	/** Start empty. */
	ngOnInit(): void {
		this.draft.markClean()
	}

	/** Validate and submit exactly one command. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		const text = this.model().text.trim()
		if (this.fields.text().invalid() || (this.mode() !== 'decide' && text.length > 500)) {
			this.fields.text().focusBoundControl()
			return
		}
		const value = this.input()
		let call: Observable<PositionChangeRequestDto>
		if (value.mode === 'lifecycle') {
			const body = { requestType: value.type, positionId: value.position.id, reason: text }
			call = this.api.createRequest(body, this.draft.key(body))
		} else if (value.mode === 'withdraw') {
			const body = { expectedRevision: value.request.revision, reason: text }
			call = this.api.withdraw(
				value.request.id,
				body,
				this.draft.key({ id: value.request.id, body }),
			)
		} else {
			const body = {
				decision: value.decision,
				comment: text,
				expectedRevision: value.request.revision,
			}
			call = this.api.decide(value.request.id, body, this.draft.key({ id: value.request.id, body }))
		}
		this.draft.saving.set(true)
		this.draft.error.set('')
		call.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Close after commit. */ (result) => {
				this.draft.saving.set(false)
				this.draft.markClean()
				this.allowClose = true
				this.saved.emit(result)
			},
			error: /** Preserve the draft and retry key. */ (error) => {
				this.draft.saving.set(false)
				this.draft.error.set(jobArchitectureErrorMessage(error))
			},
		})
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

	/** Allow the shell's navigation guard to consult this draft. */
	canLeave(): Promise<boolean> {
		return this.draft.canLeave()
	}

	/** Release a pending navigation decision. */
	ngOnDestroy(): void {
		this.draft.release()
	}
}
