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
import { FileUploader } from '@fundamental-ngx/ui5-webcomponents/file-uploader'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { MyHrRequestsApi, hrServiceErrorMessage } from '@empflowyee/hcm-web-employee-data-access'
import type {
	HrServiceRequestSelfDto,
	RequestTypeOptionDto,
} from '@empflowyee/hcm-employee-contract'
import { fieldWords } from './labels'

/** Largest attachment the server accepts. */
const MAX_FILE = 10 * 1024 * 1024

/** A new request, optionally prefilled from My Profile, or a cancel or reopen. */
export interface RequestDialogInput {
	mode: 'create' | 'cancel' | 'reopen'
	request?: HrServiceRequestSelfDto
	/** Request type code to preselect; the requester still reviews and submits. */
	typeCode?: string
	/** Profile field code named in the subject; its current value is never included. */
	field?: string
}

/** Focused Dialog to raise, cancel or reopen an own HR request. */
@Component({
	selector: 'ef-hcm-my-hr-request-dialog',
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
		FileUploader,
		MessageStrip,
		HcmDiscardDialog,
	],
	templateUrl: './request-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestDialog implements OnInit, OnDestroy {
	readonly input = input.required<RequestDialogInput>()
	readonly saved = output<{ message: string; request: HrServiceRequestSelfDto }>()
	readonly closed = output<void>()
	private readonly api = inject(MyHrRequestsApi)
	private readonly destroy = inject(DestroyRef)
	private allowClose = false
	readonly types = signal<RequestTypeOptionDto[]>([])
	readonly typesState = signal<'loading' | 'content' | 'error'>('loading')
	readonly file = signal<File | null>(null)
	readonly model = signal({ typeId: '', subject: '', description: '', reason: '' })
	readonly mode = computed(/** The command. */ () => this.input().mode)
	readonly request = computed(
		/** The request acted on, if any. */ () => this.input().request ?? null,
	)
	readonly selectedType = computed(
		/** The chosen type, for its description. */ () =>
			this.types().find(/** Chosen. */ (type) => type.id === this.model().typeId) ?? null,
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			const creating = /** Create only. */ () => this.mode() === 'create'
			required(path.typeId, { when: creating })
			required(path.subject, { when: creating })
			pattern(path.subject, /^$|\S/)
			maxLength(path.subject, 200)
			required(path.description, { when: creating })
			pattern(path.description, /^$|\S/)
			maxLength(path.description, 5000)
			required(path.reason, { when: /** Cancel or reopen. */ () => !creating() })
			pattern(path.reason, /^$|\S/)
			maxLength(path.reason, 500)
		},
	)
	readonly draft = new HcmDraft(
		/** Track the draft. */ () => ({ model: this.model(), file: this.file()?.name ?? null }),
	)
	readonly copy = computed(
		/** Title, confirmation and explanation. */ () => {
			const number = this.request()?.requestNumber ?? ''
			const copies = {
				create: {
					title: 'New HR request',
					confirm: 'Submit',
					text: 'HR sees your description and any attachment. You can follow and reply to the request here.',
				},
				cancel: {
					title: `Cancel ${number}`,
					confirm: 'Cancel request',
					text: 'HR stops working on a cancelled request. You cannot reply to it afterwards.',
				},
				reopen: {
					title: `Reopen ${number}`,
					confirm: 'Reopen',
					text: 'Reopening sends the request back to HR with your reason.',
				},
			}
			return copies[this.mode()]
		},
	)

	/** Load the request types and apply any prefill. */
	ngOnInit(): void {
		const value = this.input()
		if (value.field)
			this.model.update(
				/** Name the field, never its value. */ (v) => ({
					...v,
					subject: `Correct my ${fieldWords(value.field ?? '')}`,
				}),
			)
		this.draft.markClean()
		if (value.mode !== 'create') return
		this.api
			.types()
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the types and preselect a prefilled one. */ (result) => {
					this.types.set(result.items)
					this.typesState.set('content')
					const prefilled = result.items.find(
						/** By code. */ (type) => type.code === value.typeCode,
					)
					if (prefilled) {
						this.model.update(/** Preselect. */ (v) => ({ ...v, typeId: prefilled.id }))
						this.draft.markClean()
					}
				},
				error: /** Explain why no type can be chosen. */ (error) => {
					this.typesState.set('error')
					this.draft.error.set(hrServiceErrorMessage(error))
				},
			})
	}

	/** Keep one selected attachment within the server's limits. */
	chooseFile(event: Event): void {
		const file = (event.target as HTMLElement & { files: FileList | null }).files?.item(0) ?? null
		if (file && (file.size < 1 || file.size > MAX_FILE)) {
			this.rejectFile()
			return
		}
		this.file.set(file)
		this.draft.error.set('')
	}

	/** Clear a selection the native uploader refused. */
	rejectFile(): void {
		this.file.set(null)
		this.draft.error.set('Choose a nonempty PDF, PNG or JPEG up to 10 MiB.')
	}

	/** Send the command, closing only after the server confirms it. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		const f = this.fields
		for (const field of [f.typeId, f.subject, f.description, f.reason])
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

	/** The call of the mode. */
	private call(): Observable<HrServiceRequestSelfDto> | null {
		const v = this.model()
		if (this.mode() === 'create') {
			const metadata = {
				typeId: v.typeId,
				subject: v.subject.trim(),
				description: v.description.trim(),
			}
			const file = this.file()
			const key = this.draft.key({
				metadata,
				file: file ? [file.name, file.size, file.lastModified] : null,
			})
			return this.api.create(metadata, file, key)
		}
		const request = this.request()
		if (!request) return null
		const operation = this.mode() === 'cancel' ? 'cancel' : 'reopen'
		const body = { reason: v.reason.trim(), expectedRevision: request.revision }
		return this.api.transition(
			request.id,
			operation,
			body,
			this.draft.key({ id: request.id, operation, body }),
		)
	}

	/** The confirmation of a committed command. */
	private outcome(request: HrServiceRequestSelfDto): string {
		if (this.mode() === 'create') return `Request ${request.requestNumber} was submitted.`
		if (this.mode() === 'cancel') return `${request.requestNumber} was cancelled.`
		return `${request.requestNumber} was reopened.`
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
