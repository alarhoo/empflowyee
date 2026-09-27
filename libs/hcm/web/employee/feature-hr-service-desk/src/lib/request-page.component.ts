import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	type OnDestroy,
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
import { form, FormField, maxLength, pattern, required } from '@angular/forms/signals'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { FileUploader } from '@fundamental-ngx/ui5-webcomponents/file-uploader'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { Timeline } from '@fundamental-ngx/ui5-webcomponents-fiori/timeline'
import { TimelineItem } from '@fundamental-ngx/ui5-webcomponents-fiori/timeline-item'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import { HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { HcmDatePipe } from '@empflowyee/hcm-web-runtime-context'
import {
	HrServiceDeskApi,
	employeeDenied,
	employeeMissing,
	hrServiceErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import type {
	HrServiceAttachmentDto,
	HrServiceMessageDto,
	HrServiceRequestDto,
} from '@empflowyee/hcm-employee-contract'
import {
	RESOLUTION_LABELS,
	TARGET_LABELS,
	duration,
	fileSize,
	priorityStatus,
	requestStatus,
	saveFile,
	slaStatus,
} from './labels'
import type { RequestDialogInput } from './request-dialog.component'

/** Largest attachment the server accepts. */
const MAX_FILE = 10 * 1024 * 1024

/** Mid column: one request with Conversation, Details, Service levels, Assignments and Attachments. */
@Component({
	selector: 'ef-hcm-hr-request-page',
	imports: [
		FormField,
		ObjectStatusComponent,
		Form,
		FormItem,
		Label,
		Text,
		Select,
		Option,
		TextArea,
		FileUploader,
		Button,
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
	templateUrl: './request-page.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestPageComponent implements OnDestroy {
	readonly requestId = input.required<string>()
	readonly refresh = input(0)
	readonly dialogRequested = output<RequestDialogInput>()
	readonly changed = output<string>()
	readonly closed = output<void>()
	private readonly api = inject(HrServiceDeskApi)
	private readonly destroy = inject(DestroyRef)
	private load$?: Subscription
	private messages$?: Subscription
	readonly status = requestStatus
	readonly priority = priorityStatus
	readonly sla = slaStatus
	readonly targetLabels = TARGET_LABELS
	readonly resolutions = RESOLUTION_LABELS
	readonly duration = duration
	readonly size = fileSize
	readonly request = signal<HrServiceRequestDto | null>(null)
	readonly messages = signal<HrServiceMessageDto[]>([])
	readonly messageCursor = signal<string | null>(null)
	readonly pageState = signal<'content' | 'loading' | 'error' | 'denied'>('loading')
	readonly message = signal('')
	readonly notice = signal('')
	readonly file = signal<File | null>(null)
	/** Recreates the native file uploader after a send, clearing its selection. */
	readonly round = signal(0)
	readonly composer = signal({ visibility: 'EmployeeVisible', body: '' })
	readonly composerForm = form(
		this.composer,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.body)
			pattern(path.body, /\S/)
			maxLength(path.body, 5000)
		},
	)
	readonly draft = new HcmDraft(
		/** Track the composer. */ () => ({
			composer: this.composer(),
			file: this.file()?.name ?? null,
		}),
	)
	readonly canWrite = computed(
		/** Replies and notes are allowed while the request is being worked. */ () =>
			!!this.request()?.actions.reply,
	)
	readonly actions = computed(
		/** Commands the server says the viewer may use. */ () => {
			const r = this.request()
			const actions: { id: string; label: string; mutates?: boolean; emphasized?: boolean }[] = []
			if (r?.actions.transitions.length)
				actions.push({ id: 'status', label: 'Change status', mutates: true, emphasized: true })
			if (r?.actions.assign) actions.push({ id: 'assign', label: 'Assign', mutates: true })
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
		this.destroy.onDestroy(
			/** Cancel in-flight reads. */ () => {
				this.load$?.unsubscribe()
				this.messages$?.unsubscribe()
			},
		)
	}

	/** Load the request and the first page of its conversation. */
	load(): void {
		this.load$?.unsubscribe()
		if (this.request()?.id !== this.requestId()) {
			this.pageState.set('loading')
			this.messages.set([])
		}
		this.message.set('')
		this.load$ = this.api
			.read(this.requestId())
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the request. */ (request) => {
					this.request.set(request)
					this.pageState.set('content')
					this.loadMessages(false)
				},
				error: /** Truthful failure without stale data. */ (error) => {
					this.request.set(null)
					this.messages.set([])
					this.message.set(
						employeeMissing(error)
							? 'This request is no longer available.'
							: hrServiceErrorMessage(error),
					)
					this.pageState.set(employeeDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Load a page of the conversation; growing appends. */
	loadMessages(append: boolean): void {
		this.messages$?.unsubscribe()
		const cursor = append ? (this.messageCursor() ?? undefined) : undefined
		this.messages$ = this.api
			.messages(this.requestId(), cursor)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the page. */ (page) => {
					this.messages.update(
						/** Append on growing. */ (rows) => (append ? [...rows, ...page.items] : page.items),
					)
					this.messageCursor.set(page.nextCursor)
				},
				error: /** Keep the request visible and explain the conversation failure. */ (error) =>
					this.message.set(hrServiceErrorMessage(error)),
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

	/** Send the reply or note, clearing the composer only after the server confirms it. */
	send(): void {
		const request = this.request()
		if (!request || this.draft.saving()) return
		this.composerForm().markAsTouched()
		if (this.composerForm.body().invalid()) {
			this.composerForm.body().focusBoundControl()
			return
		}
		const v = this.composer()
		const metadata = {
			visibility: v.visibility,
			body: v.body.trim(),
			expectedRevision: request.revision,
		}
		const file = this.file()
		const key = this.draft.key({
			id: request.id,
			metadata,
			file: file ? [file.name, file.size, file.lastModified] : null,
		})
		this.draft.saving.set(true)
		this.draft.error.set('')
		this.api
			.message(request.id, metadata, file, key)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Clear the composer and show the new state. */ (updated) => {
					this.draft.saving.set(false)
					this.composer.set({ visibility: v.visibility, body: '' })
					this.composerForm().reset()
					this.file.set(null)
					this.round.update(/** Recreate the uploader. */ (n) => n + 1)
					this.draft.markClean()
					this.notice.set(
						v.visibility === 'Internal' ? 'The internal note was added.' : 'The reply was sent.',
					)
					this.request.set(updated)
					this.loadMessages(false)
					this.changed.emit(updated.id)
				},
				error: /** Preserve the draft and retry key. */ (error) => {
					this.draft.saving.set(false)
					this.draft.error.set(hrServiceErrorMessage(error))
				},
			})
	}

	/** Download an attachment through authenticated HTTP. */
	download(attachment: HrServiceAttachmentDto): void {
		const request = this.request()
		if (!request) return
		this.api
			.attachment(request.id, attachment.id)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Save the file. */ (blob) => saveFile(blob, attachment.fileName),
				error: /** Explain the failure. */ (error) =>
					this.message.set(hrServiceErrorMessage(error)),
			})
	}

	/** The attachments of one message. */
	attachmentsOf(message: HrServiceMessageDto): HrServiceAttachmentDto[] {
		return message.attachments
	}

	/** Route Object Page actions. */
	action(id: string): void {
		const request = this.request()
		if (id === 'close') this.closed.emit()
		else if (request && (id === 'assign' || id === 'status'))
			this.dialogRequested.emit({ mode: id, request })
	}

	/** Consult an unsent composer before leaving. */
	canLeave(): Promise<boolean> {
		return this.draft.canLeave()
	}

	/** Release a pending navigation decision. */
	ngOnDestroy(): void {
		this.draft.release()
	}
}
