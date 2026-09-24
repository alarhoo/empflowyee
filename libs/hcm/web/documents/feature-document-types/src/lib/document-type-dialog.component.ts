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
import { DocumentTypesApi, documentErrorMessage } from '@empflowyee/hcm-web-documents-data-access'
import {
	parseDocumentTypeCreate,
	parseDocumentTypeUpdate,
	type DocumentType,
} from '@empflowyee/hcm-documents-contract'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
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
	selector: 'ef-hcm-document-type-dialog',
	imports: [
		CheckBox,
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
	templateUrl: './document-type-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentTypeDialogComponent implements OnInit, OnDestroy {
	readonly item = input<DocumentType | null>(null)
	readonly closed = output<string | null>()
	private readonly api = inject(DocumentTypesApi)
	private readonly destroy = inject(DestroyRef)
	readonly draft = signal({ code: '', label: '', description: '', enabled: true, reason: '' })
	readonly fields = form(
		this.draft,
		/** Validate a focused classification form without adding policy fields. */ (schema) => {
			required(schema.code)
			pattern(schema.code, /^[A-Z0-9_]{1,50}$/)
			required(schema.label)
			pattern(schema.label, /\S/)
			maxLength(schema.label, 100)
			maxLength(schema.description, 500)
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
	/** Initialize fields from the selected persisted revision or an empty create form. */
	ngOnInit(): void {
		const item = this.item()
		this.fields().reset({
			code: item?.code ?? '',
			label: item?.label ?? '',
			description: item?.description ?? '',
			enabled: item?.enabled ?? true,
			reason: '',
		})
		this.baseline = JSON.stringify(this.draft())
	}
	/** Name the exact focused classification operation. */
	title(): string {
		return this.item() ? 'Edit document type' : 'Create document type'
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
	/** Save the exact reviewed classification draft, preserving its retry identity on failure. */
	save(): void {
		if (this.saving()) return
		this.fields().markAsTouched()
		if (this.fields().invalid()) {
			this.fields().focusBoundControl()
			return
		}
		const item = this.item(),
			draft = this.draft()
		const signature = JSON.stringify([item?.id, item?.revision, draft])
		if (this.attempt?.signature !== signature)
			this.attempt = { signature, key: crypto.randomUUID() }
		let request
		try {
			if (item)
				request = this.api.update(
					item.id,
					parseDocumentTypeUpdate({
						label: draft.label,
						description: draft.description,
						enabled: draft.enabled,
						expectedRevision: item.revision,
						reason: draft.reason,
					}),
					this.attempt.key,
				)
			else
				request = this.api.create(
					parseDocumentTypeCreate({
						code: draft.code,
						label: draft.label,
						description: draft.description,
						reason: draft.reason,
					}),
					this.attempt.key,
				)
		} catch {
			this.error.set('Check the required fields, code and field lengths.')
			return
		}
		this.saving.set(true)
		this.error.set('')
		request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Close only after classification and audit commit. */ (result) => {
				this.baseline = JSON.stringify(this.draft())
				this.committed = result.id
				this.allowClose = true
				this.open.set(false)
			},
			error: /** Keep the failed draft and stable retry key. */ (error) => {
				this.saving.set(false)
				this.error.set(documentErrorMessage(error))
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
