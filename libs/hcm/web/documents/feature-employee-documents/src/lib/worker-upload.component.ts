import { NgTemplateOutlet } from '@angular/common'
import { Router } from '@angular/router'
import { HcmDynamicPage } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	untracked,
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
	EmployeeDocumentsApi,
	documentErrorMessage,
} from '@empflowyee/hcm-web-documents-data-access'
import {
	parseWorkerDocumentCreate,
	parseWorkerDocumentAppend,
	type WorkerDocument,
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
	selector: 'ef-hcm-worker-upload',
	imports: [
		FileUploader,
		NgTemplateOutlet,
		HcmDynamicPage,
		CheckBox,
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
	templateUrl: './worker-upload.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkerUploadComponent implements OnInit, OnDestroy {
	readonly item = input<WorkerDocument | null>(null)
	readonly closed = output<string | null>()
	private readonly api = inject(EmployeeDocumentsApi)
	private readonly destroy = inject(DestroyRef)
	private readonly router = inject(Router)
	private readonly runtime = inject(HcmRuntimeStore)
	readonly canManage = computed(
		/** Reflect current HR upload capability. */ () =>
			this.runtime.context()?.access.permissions.includes('hcm.documents.worker.manage') === true,
	)
	readonly pageActions = computed(
		/** Expose current create actions. */ () => {
			if (!this.canManage()) return [{ id: 'cancel', label: 'Back to documents' }]
			return [
				{ id: 'save', label: this.saving() ? 'Saving…' : 'Save', mutates: true },
				{ id: 'cancel', label: 'Cancel' },
			]
		},
	)

	readonly draft = signal({
		workerId: '',
		employeeVisible: false,
		typeId: '',
		label: '',
		reason: '',
	})
	readonly file = signal<File | null>(null)
	readonly workerSearch = signal({ q: '' })
	readonly workerSearchFields = form(this.workerSearch)
	readonly workers = signal<{ id: string; displayName: string; workerCode: string }[]>([])
	readonly nextWorkers = signal<string | null>(null)
	readonly loadingWorkers = signal(false)
	private workerRequest?: Subscription
	readonly typeSearch = signal({ q: '' })
	readonly searchFields = form(this.typeSearch)
	readonly options = signal<{ id: string; code: string; label: string }[]>([])
	readonly nextTypes = signal<string | null>(null)
	readonly loadingTypes = signal(false)
	private typeRequest?: Subscription
	readonly fields = form(
		this.draft,
		/** Validate a focused worker document form without adding policy fields. */ (schema) => {
			required(schema.workerId)
			required(schema.typeId)
			required(schema.label)
			pattern(schema.label, /\S/)
			maxLength(schema.label, 150)
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
	/** Clear private drafts and requests when session context is replaced. */
	constructor() {
		effect(
			/** Track only the verified runtime context. */ () => {
				this.runtime.context()
				untracked(
					/** Cancel old-context picker requests and in-memory bytes. */ () => {
						this.typeRequest?.unsubscribe()
						this.workerRequest?.unsubscribe()
						this.file.set(null)
						this.options.set([])
						this.workers.set([])
						this.attempt = undefined
						this.error.set('')
						this.ngOnInit()
					},
				)
			},
		)
	}
	/** Route native header actions through guarded save/cancel paths. */
	action(id: string): void {
		if (id === 'save') this.save()
		else void this.cancel()
	}
	/** Query bounded real workers; accounts are never synthesized for picker choices. */
	loadWorkers(append = false): void {
		this.workerRequest?.unsubscribe()
		this.loadingWorkers.set(true)
		if (!append) {
			this.workers.set([])
			this.nextWorkers.set(null)
		}
		this.workerRequest = this.api
			.workers(this.workerSearch().q, append ? (this.nextWorkers() ?? undefined) : undefined)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish only current worker choices. */ (result) => {
					this.workers.update(
						/** Preserve pages only during growing. */ (rows) =>
							append ? [...rows, ...result.items] : result.items,
					)
					this.nextWorkers.set(result.nextCursor)
					this.loadingWorkers.set(false)
				},
				error: /** Keep drafts while reporting failed choices. */ (error) => {
					this.error.set(documentErrorMessage(error))
					this.loadingWorkers.set(false)
				},
			})
	}
	/** Initialize fields from the selected persisted revision or an empty create form. */
	ngOnInit(): void {
		const item = this.item()
		this.fields().reset({
			workerId: item?.workerId ?? '',
			employeeVisible: false,
			typeId: item?.typeId ?? '',
			label: item?.label ?? '',
			reason: '',
		})
		this.baseline = JSON.stringify(this.draft())
		if (!item && this.canManage()) {
			this.loadTypes()
			this.loadWorkers()
		}
	}
	/** Name the exact focused worker document operation. */
	title(): string {
		return this.item() ? 'Upload new version' : 'Upload employee document'
	}
	/** Prevent abandoning pending writes and confirm loss of a dirty draft. */
	canLeave(): Promise<boolean> {
		if (this.allowClose) return Promise.resolve(true)
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
			if (!this.item()) void this.router.navigate(['/documents/employee-documents'])
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
	/** Save the exact reviewed worker document draft, preserving its retry identity on failure. */
	save(): void {
		if (this.saving() || !this.canManage()) return
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
			let value
			if (item)
				value = parseWorkerDocumentAppend({
					expectedRevision: item.revision,
					reason: draft.reason,
					employeeVisible: draft.employeeVisible,
				})
			else value = parseWorkerDocumentCreate(draft)
			const file = this.file()
			if (!file) return
			request = this.api.upload(item?.id ?? null, value, file, this.attempt.key)
		} catch {
			this.error.set('Check the required fields and selected file.')
			return
		}

		this.saving.set(true)
		this.error.set('')
		request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Close only after worker document and audit commit. */ (result) => {
				this.baseline = JSON.stringify(this.draft())
				this.committed = result.document.id
				this.allowClose = true
				this.open.set(false)
				if (!this.item()) {
					this.file.set(null)
					this.saving.set(false)
					void this.router.navigate(['/documents/employee-documents'], {
						queryParams: { document: result.document.id },
					})
				}
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
		this.workerRequest?.unsubscribe()
		this.resolveDiscard?.(false)
	}
}
