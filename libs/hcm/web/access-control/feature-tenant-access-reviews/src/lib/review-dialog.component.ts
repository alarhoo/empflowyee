import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	HostListener,
	inject,
	input,
	output,
	signal,
	type OnInit,
	type OnDestroy,
} from '@angular/core'
import { form, FormField, required, maxLength, pattern } from '@angular/forms/signals'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ReviewApi, reviewErrorMessage } from '@empflowyee/hcm-web-access-control-data-access'
import type { ReviewSummary, ReviewItem } from '@empflowyee/hcm-access-control-contract'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
export interface ReviewAction {
	operation: 'start' | 'decide' | 'refresh' | 'close'
	review?: ReviewSummary
	item?: ReviewItem
	decision?: 'Retain' | 'Revoke'
}
@Component({
	selector: 'ef-hcm-review-dialog',
	imports: [Dialog, Form, FormItem, Label, Input, TextArea, Button, Bar, MessageStrip, FormField],
	templateUrl: './review-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewDialogComponent implements OnInit, OnDestroy {
	readonly action = input.required<ReviewAction>()
	readonly closed = output<string | null>()
	private readonly api = inject(ReviewApi)
	private readonly destroy = inject(DestroyRef)
	readonly draft = signal({ label: '', reason: '' })
	readonly fields = form(
		this.draft,
		/** Validate a bounded focused action with required target and reason. */ (schema) => {
			required(schema.label)
			pattern(schema.label, /\S/)
			maxLength(schema.label, 100)
			required(schema.reason)
			pattern(schema.reason, /\S/)
			maxLength(schema.reason, 500)
		},
	)
	readonly saving = signal(false)
	readonly error = signal('')
	readonly open = signal(true)
	readonly confirm = signal(false)
	private baseline = ''
	private allowClose = false
	private committed: string | null = null
	private resolveDiscard?: (value: boolean) => void
	private attempt?: { signature: string; key: string }
	/** Bind this disposable action to the exact revision displayed by the Object Page. */
	ngOnInit(): void {
		this.fields().reset({
			label: this.action().operation === 'start' ? '' : 'Review action',
			reason: '',
		})
		this.baseline = JSON.stringify(this.draft())
	}
	/** Name the focused command consistently for its native dialog and submit action. */
	title(): string {
		const action = this.action()
		if (action.operation === 'start') return 'Start review'
		if (action.operation === 'close') return 'Close review'
		if (action.operation === 'refresh') return 'Refresh snapshot'
		return action.decision === 'Revoke' ? 'Revoke assignment' : 'Retain assignment'
	}
	/** Prevent abandoning pending writes and confirm loss of a dirty draft. */
	canLeave(): Promise<boolean> {
		if (this.saving()) return Promise.resolve(false)
		if (JSON.stringify(this.draft()) === this.baseline) return Promise.resolve(true)
		if (this.resolveDiscard) return Promise.resolve(false)
		this.confirm.set(true)
		return new Promise(
			/** Release navigation only after an explicit user decision. */ (resolve) => {
				this.resolveDiscard = resolve
			},
		)
	}
	/** Complete the one outstanding native discard decision. */
	decide(value: boolean): void {
		this.confirm.set(false)
		this.resolveDiscard?.(value)
		this.resolveDiscard = undefined
	}
	/** Route Cancel and Escape through the same dirty-draft rule. */
	async cancel(): Promise<void> {
		if (await this.canLeave()) {
			this.allowClose = true
			this.open.set(false)
		}
	}
	/** Keep nested confirmation events from dismissing the parent action accidentally. */
	beforeClose(event: Event): void {
		if (event.target !== event.currentTarget) return
		if (!this.allowClose) {
			event.preventDefault()
			void this.cancel()
		}
	}
	/** Wait for native dialog focus restoration before removing the component. */
	finish(event: Event): void {
		if (event.target === event.currentTarget) this.closed.emit(this.committed)
	}
	/** Persist one explicit command, preserving both draft and retry key on failure. */
	save(): void {
		if (this.saving()) return
		this.fields().markAsTouched()
		if (this.fields.label().invalid()) {
			this.fields.label().focusBoundControl()
			return
		}
		if (this.fields.reason().invalid()) {
			this.fields.reason().focusBoundControl()
			return
		}
		const action = this.action()
		const reason = this.draft().reason.trim()
		const createBody = { label: this.draft().label.trim(), reason }
		const commandBody = {
			expectedRevision: action.item?.revision ?? action.review?.revision ?? 0,
			reason,
			...(action.operation === 'decide' ? { decision: action.decision } : {}),
		}
		const body = action.operation === 'start' ? createBody : commandBody
		const signature = JSON.stringify([action.operation, action.review?.id, action.item?.id, body])
		if (this.attempt?.signature !== signature)
			this.attempt = { signature, key: crypto.randomUUID() }
		this.saving.set(true)
		this.error.set('')
		const request = this.request(action, createBody, commandBody, this.attempt.key)
		request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Close only after the review, revision, audit and receipt commit. */ (result) => {
				this.baseline = JSON.stringify(this.draft())
				this.committed = action.operation === 'start' ? result.id : (action.review?.id ?? null)
				this.allowClose = true
				this.open.set(false)
			},
			error: /** Preserve the reviewable draft and safe retry attempt. */ (error) => {
				this.saving.set(false)
				this.error.set(reviewErrorMessage(error))
			},
		})
	}
	/** Select the exact typed command endpoint without changing retry identity. */
	private request(
		action: ReviewAction,
		createBody: { label: string; reason: string },
		commandBody: { expectedRevision: number; reason: string; decision?: 'Retain' | 'Revoke' },
		key: string,
	) {
		if (action.operation === 'start') return this.api.start(createBody, key)
		return this.api.command(
			action.review?.id ?? '',
			action.operation,
			action.item?.id,
			commandBody,
			key,
		)
	}
	/** Protect unsaved review actions from full document reload as well as Angular navigation. */
	@HostListener('window:beforeunload', ['$event'])
	beforeUnload(event: BeforeUnloadEvent): void {
		if (this.saving() || JSON.stringify(this.draft()) !== this.baseline) {
			event.preventDefault()
			event.returnValue = ''
		}
	}
	/** Cancel a waiting navigation if the runtime context tears down the action. */
	ngOnDestroy(): void {
		this.resolveDiscard?.(false)
	}
}
