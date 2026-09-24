import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
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
import {
	NotificationApi,
	notificationErrorMessage,
} from '@empflowyee/hcm-web-notifications-data-access'
import {
	notificationText,
	renderNotificationText,
	parseTemplateSave,
	type NotificationTemplate,
} from '@empflowyee/hcm-notifications-contract'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
@Component({
	selector: 'ef-hcm-templates-dialog',
	imports: [
		Title,
		Text,
		Dialog,
		Form,
		FormItem,
		Label,
		Input,
		TextArea,
		Button,
		Bar,
		MessageStrip,
		FormField,
	],
	templateUrl: './templates-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplateDialogComponent implements OnInit, OnDestroy {
	readonly action = input.required<NotificationTemplate>()
	readonly samples = input({ requestId: '', dueDate: '' })
	readonly closed = output<string | null>()
	private readonly api = inject(NotificationApi)
	private readonly destroy = inject(DestroyRef)
	readonly draft = signal({ title: '', body: '', reason: '' })
	readonly fields = form(
		this.draft,
		/** Validate the bounded configuration draft. */ (schema) => {
			required(schema.title)
			maxLength(schema.title, 120)
			required(schema.body)
			maxLength(schema.body, 1000)
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
	/** Bind this edit to the exact displayed revision. */
	ngOnInit(): void {
		this.fields().reset({ title: this.action().title, body: this.action().body, reason: '' })
		this.baseline = JSON.stringify(this.draft())
	}
	/** Name the focused configuration operation. */
	title(): string {
		return 'Edit template'
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
	/** Preview the unsaved bounded text using explicit sample values without sending a message. */
	preview(field: 'title' | 'body'): string {
		try {
			return renderNotificationText(
				notificationText(this.draft()[field], field === 'title' ? 120 : 1000),
				this.samples().requestId,
				this.samples().dueDate || null,
			)
		} catch {
			return 'Enter valid plain text and supported placeholders to preview.'
		}
	}

	/** Save an explicit validated revision, retaining the draft and retry identity on failure. */
	save(): void {
		if (this.saving()) return
		this.fields().markAsTouched()
		if (this.fields().invalid()) {
			this.fields().focusBoundControl()
			return
		}
		let body
		try {
			body = parseTemplateSave({ ...this.draft(), expectedRevision: this.action().revision })
		} catch {
			this.error.set('Check plain text, supported placeholders, field lengths and reason.')
			return
		}
		const signature = JSON.stringify([this.action().eventType, body])
		if (this.attempt?.signature !== signature)
			this.attempt = { signature, key: crypto.randomUUID() }
		this.saving.set(true)
		this.error.set('')
		this.api
			.saveTemplate(this.action().eventType, body, this.attempt.key)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Close only after persisted configuration, audit and receipt commit. */ (
					result,
				) => {
					this.baseline = JSON.stringify(this.draft())
					this.committed = result.eventType
					this.allowClose = true
					this.open.set(false)
				},
				error: /** Retain the exact failed change for safe retry. */ (error) => {
					this.saving.set(false)
					this.error.set(notificationErrorMessage(error))
				},
			})
	}
	/** Protect unsaved configuration actions from full document reload as well as Angular navigation. */
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
