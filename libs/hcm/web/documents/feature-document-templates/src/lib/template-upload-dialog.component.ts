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
	DocumentTemplatesApi,
	documentErrorMessage,
} from '@empflowyee/hcm-web-documents-data-access'
import {
	parseTemplateCreate,
	parseTemplateAppend,
	type DocumentTemplate,
} from '@empflowyee/hcm-documents-contract'
import { FileUploader } from '@fundamental-ngx/ui5-webcomponents/file-uploader'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import type { Subscription } from 'rxjs'
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
	selector: 'ef-hcm-template-upload-dialog',
	imports: [
		FileUploader,
		Select,
		Option,
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
	templateUrl: './template-upload-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplateUploadDialogComponent implements OnInit, OnDestroy {
	readonly item = input<DocumentTemplate | null>(null)
	readonly closed = output<string | null>()
	private readonly api = inject(DocumentTemplatesApi)
	private readonly destroy = inject(DestroyRef)
	readonly draft = signal({ typeId: '', label: '', reason: '' })
	readonly file = signal<File | null>(null)
	readonly typeSearch = signal({ q: '' })
	readonly searchFields = form(this.typeSearch)
	readonly options = signal<{ id: string; code: string; label: string }[]>([])
	readonly nextTypes = signal<string | null>(null)
	readonly loadingTypes = signal(false)
	private typeRequest?: Subscription
	readonly fields = form(
		this.draft,
		/** Validate a focused template form without adding policy fields. */ (schema) => {
			required(schema.typeId)
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
	/** Initialize fields from the selected persisted revision or an empty create form. */
	ngOnInit(): void {
		const item = this.item()
		this.fields().reset({
			typeId: item?.typeId ?? '',
			label: item?.label ?? '',
			reason: '',
		})
		this.baseline = JSON.stringify(this.draft())
		if (!item) this.loadTypes()
	}
	/** Name the exact focused template operation. */
	title(): string {
		return this.item() ? 'Upload new version' : 'Create document template'
	}
	/** Prevent abandoning pending writes and confirm loss of a dirty draft. */
	canLeave(): Promise<boolean> {
		if (this.saving()) return Promise.resolve(false)
		if (!this.file() && JSON.stringify(this.draft()) === this.baseline) return Promise.resolve(true)
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
	/** Save the exact reviewed template draft, preserving its retry identity on failure. */
	save(): void {
		if (this.saving()) return
		this.fields().markAsTouched()
		if (this.fields().invalid() || !this.file()) {
			this.error.set(
				'Choose a type, enter a label and reason, and select a PDF, PNG or JPEG up to 10 MiB.',
			)
			this.fields().focusBoundControl()
			return
		}
		const item = this.item(),
			draft = this.draft()
		const signature = JSON.stringify([
			item?.id,
			item?.revision,
			draft,
			this.file()?.name,
			this.file()?.size,
			this.file()?.lastModified,
		])
		if (this.attempt?.signature !== signature)
			this.attempt = { signature, key: crypto.randomUUID() }
		let request
		try {
			const value = item
				? parseTemplateAppend({ expectedRevision: item.revision, reason: draft.reason })
				: parseTemplateCreate(draft)
			request = this.api.upload(item?.id ?? null, value, this.file()!, this.attempt.key)
		} catch {
			this.error.set('Check the required fields and selected file.')
			return
		}

		this.saving.set(true)
		this.error.set('')
		request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Close only after template and audit commit. */ (result) => {
				this.baseline = JSON.stringify(this.draft())
				this.committed = result.template.id
				this.allowClose = true
				this.open.set(false)
			},
			error: /** Keep the failed draft and stable retry key. */ (error) => {
				this.saving.set(false)
				this.error.set(documentErrorMessage(error))
			},
		})
	}
	/** Keep file selection in memory and start a fresh retry identity when bytes change. */
	chooseFile(event: Event): void {
		const target = event.target as HTMLElement & { files: FileList | null }
		const file = target.files?.item(0) ?? null
		this.attempt = undefined
		if (file && (file.size < 1 || file.size > 10485760)) {
			this.error.set('Choose a nonempty file no larger than 10 MiB.')
			this.file.set(null)
			return
		}
		this.file.set(file)
		this.error.set('')
	}
	/** Clear a rejected file so a previous selection cannot be uploaded by mistake. */
	rejectFile(): void {
		this.file.set(null)
		this.attempt = undefined
		this.error.set('Choose a file no larger than 10 MiB.')
	}

	/** Query one bounded page of enabled type choices; do not invent a local classification list. */
	loadTypes(append = false): void {
		this.typeRequest?.unsubscribe()
		this.loadingTypes.set(true)
		if (!append) {
			this.options.set([])
			this.nextTypes.set(null)
		}
		this.typeRequest = this.api
			.types(this.typeSearch().q, append ? (this.nextTypes() ?? undefined) : undefined)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish current server options only. */ (result) => {
					this.options.update(
						/** Keep previous choices only for explicit growing. */ (rows) =>
							append ? [...rows, ...result.items] : result.items,
					)
					this.nextTypes.set(result.nextCursor)
					this.loadingTypes.set(false)
				},
				error: /** Keep selection drafts and offer a retry without fallback options. */ (error) => {
					this.error.set(documentErrorMessage(error))
					this.loadingTypes.set(false)
				},
			})
	}

	/** Protect unsaved configuration actions from full document reload as well as Angular navigation. */
	@HostListener('window:beforeunload', ['$event'])
	beforeUnload(event: BeforeUnloadEvent): void {
		if (this.saving() || this.file() || JSON.stringify(this.draft()) !== this.baseline) {
			event.preventDefault()
			event.returnValue = ''
		}
	}
	/** Cancel a waiting navigation if the runtime context tears down the action. */
	ngOnDestroy(): void {
		this.typeRequest?.unsubscribe()
		this.resolveDiscard?.(false)
	}
}
