import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	type OnDestroy,
	computed,
	inject,
	input,
	output,
	signal,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
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
import { HcmDatePipe } from '@empflowyee/hcm-web-runtime-context'
import { EmploymentChangesApi, changesErrorMessage } from '@empflowyee/hcm-web-employee-data-access'
import type { EmploymentChangeRequestDto } from '@empflowyee/hcm-employee-contract'
import { CHANGE_TYPE_LABELS } from './labels'

/** One command on a request, opened from its Object Page. */
export interface ChangeDialogInput {
	mode: 'submit' | 'approve' | 'reject' | 'apply' | 'cancel'
	request: EmploymentChangeRequestDto
}

/** Focused Dialog for submitting, deciding, applying or cancelling a change request. */
@Component({
	selector: 'ef-hcm-change-dialog',
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
		HcmDatePipe,
	],
	templateUrl: './change-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangeDialog implements OnDestroy {
	readonly input = input.required<ChangeDialogInput>()
	readonly saved = output<{ message: string; request: EmploymentChangeRequestDto }>()
	readonly closed = output<void>()
	private readonly api = inject(EmploymentChangesApi)
	private readonly destroy = inject(DestroyRef)
	private allowClose = false
	readonly types = CHANGE_TYPE_LABELS
	readonly model = signal({ reason: '' })
	readonly needsReason = computed(
		/** Decisions and cancellations state a reason. */ () =>
			['approve', 'reject', 'cancel'].includes(this.input().mode),
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.reason, { when: /** Reason modes. */ () => this.needsReason() })
			pattern(path.reason, /\S/)
			maxLength(path.reason, 500)
		},
	)
	readonly draft = new HcmDraft(/** Track the draft. */ () => this.model())
	readonly copy = computed(
		/** Title, confirmation label and explanation of the mode. */ () => {
			const { mode, request } = this.input()
			const subject = `${this.types[request.changeType]} for ${request.workerName}`
			const copies = {
				submit: {
					title: `Submit ${subject}`,
					confirm: 'Submit',
					text: 'An independent approver decides the request. The effective date may lie at most 30 days in the past, or 90 for a correction.',
					reasonLabel: '',
				},
				approve: {
					title: `Approve ${subject}`,
					confirm: 'Approve',
					text: 'Dated changes execute now; employment facts dated in the future wait until HR applies them on their date.',
					reasonLabel: 'Decision reason',
				},
				reject: {
					title: `Reject ${subject}`,
					confirm: 'Reject',
					text: 'A rejected request changes no workforce fact.',
					reasonLabel: 'Decision reason',
				},
				apply: {
					title: `Apply ${subject}`,
					confirm: request.status === 'Failed' ? 'Retry' : 'Apply',
					text: 'Every step runs together; if any step is refused, nothing changes and the request records why.',
					reasonLabel: '',
				},
				cancel: {
					title: `Cancel ${subject}`,
					confirm: 'Cancel request',
					text: 'A cancelled request changes no workforce fact.',
					reasonLabel: 'Reason for cancelling',
				},
			}
			return copies[mode]
		},
	)

	/** Send the command, closing only after the server confirms it. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		if (this.fields.reason().invalid()) {
			this.fields.reason().focusBoundControl()
			return
		}
		const { mode, request } = this.input()
		const reason = this.model().reason.trim()
		const revision = { expectedRevision: request.revision }
		const bodies = {
			submit: { operation: 'submit' as const, body: revision },
			approve: {
				operation: 'decide' as const,
				body: { ...revision, slotCode: 'hr-approver', decision: 'Approved', reason },
			},
			reject: {
				operation: 'decide' as const,
				body: { ...revision, slotCode: 'hr-approver', decision: 'Rejected', reason },
			},
			apply: { operation: 'apply' as const, body: revision },
			cancel: { operation: 'cancel' as const, body: { ...revision, reason } },
		}
		const { operation, body } = bodies[mode]
		this.draft.saving.set(true)
		this.draft.error.set('')
		this.api
			.command(request.id, operation, body, this.draft.key({ id: request.id, operation, body }))
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Close after commit. */ (result) => {
					this.draft.saving.set(false)
					this.draft.markClean()
					this.allowClose = true
					this.saved.emit({ message: this.outcome(mode, result), request: result })
				},
				error: /** Preserve the draft and retry key. */ (error) => {
					this.draft.saving.set(false)
					this.draft.error.set(changesErrorMessage(error))
				},
			})
	}

	/** The confirmation of a committed command. */
	private outcome(mode: ChangeDialogInput['mode'], result: EmploymentChangeRequestDto): string {
		if (result.status === 'Failed')
			return 'The change was approved but could not be executed; see Execution.'
		if (result.status === 'Completed') return 'The change was executed.'
		const messages = {
			submit: 'The request was submitted for approval.',
			approve: 'The request was approved; apply it on or after its effective date.',
			reject: 'The request was rejected.',
			apply: 'The change was executed.',
			cancel: 'The request was cancelled.',
		}
		return messages[mode]
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
