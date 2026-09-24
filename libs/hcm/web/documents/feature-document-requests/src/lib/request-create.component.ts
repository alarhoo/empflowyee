import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	HostListener,
	inject,
	signal,
	computed,
	effect,
	untracked,
	type OnDestroy,
} from '@angular/core'
import { Router } from '@angular/router'
import { form, FormField, required, maxLength, pattern } from '@angular/forms/signals'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import type { Subscription } from 'rxjs'
import {
	DocumentRequestsApi,
	documentErrorMessage,
} from '@empflowyee/hcm-web-documents-data-access'
import { parseDocumentRequestCreate } from '@empflowyee/hcm-documents-contract'
import { HcmDynamicPage } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
@Component({
	selector: 'ef-hcm-request-create',
	imports: [
		HcmDynamicPage,
		Dialog,
		Form,
		FormItem,
		Input,
		TextArea,
		Select,
		Option,
		Label,
		Button,
		Bar,
		MessageStrip,
		FormField,
	],
	templateUrl: 'request-create.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestCreateComponent implements OnDestroy {
	private readonly api = inject(DocumentRequestsApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly router = inject(Router)
	private readonly destroy = inject(DestroyRef)
	private workerRequest?: Subscription
	private typeRequest?: Subscription
	private saveRequest?: Subscription
	readonly canManage = computed(
		/** Show creation only for current management authority. */ () =>
			this.runtime.context()?.access.permissions.includes('hcm.documents.requests.manage') === true,
	)
	readonly draft = signal({ workerId: '', typeId: '', instructions: '', dueDate: '', reason: '' })
	readonly fields = form(
		this.draft,
		/** Validate each approved create field. */ (s) => {
			required(s.workerId)
			required(s.typeId)
			maxLength(s.instructions, 1000)
			required(s.reason)
			pattern(s.reason, /\S/)
			maxLength(s.reason, 500)
		},
	)
	readonly workerSearch = signal({ q: '' })
	readonly workerSearchFields = form(this.workerSearch)
	readonly workers = signal<{ id: string; displayName: string; workerCode: string }[]>([])
	readonly nextWorkers = signal<string | null>(null)
	readonly loadingWorkers = signal(false)
	readonly typeSearch = signal({ q: '' })
	readonly searchFields = form(this.typeSearch)
	readonly options = signal<{ id: string; code: string; label: string }[]>([])
	readonly nextTypes = signal<string | null>(null)
	readonly loadingTypes = signal(false)
	readonly saving = signal(false)
	readonly error = signal('')
	readonly confirm = signal(false)
	readonly pageActions = computed(
		/** Expose native create actions. */ () => {
			if (!this.canManage()) return [{ id: 'cancel', label: 'Back to requests' }]
			return [
				{ id: 'save', label: this.saving() ? 'Saving…' : 'Create request', mutates: true },
				{ id: 'cancel', label: 'Cancel' },
			]
		},
	)

	private baseline = JSON.stringify(this.draft())
	private allowed = false
	private resolveDiscard?: (value: boolean) => void
	private attempt?: { signature: string; key: string }
	/** Clear old-persona data and queries when the verified session changes. */ constructor() {
		effect(
			/** Track only the persisted runtime context. */ () => {
				this.runtime.context()
				untracked(
					/** Reset actor-owned drafts. */ () => {
						this.workerRequest?.unsubscribe()
						this.typeRequest?.unsubscribe()
						this.saveRequest?.unsubscribe()
						this.fields().reset({
							workerId: '',
							typeId: '',
							instructions: '',
							dueDate: '',
							reason: '',
						})
						this.baseline = JSON.stringify(this.draft())
						this.allowed = false
						this.attempt = undefined
						this.workers.set([])
						this.options.set([])
						this.error.set('')
						this.saving.set(false)
						if (this.canManage()) {
							this.loadWorkers()
							this.loadTypes()
						}
					},
				)
			},
		)
	}
	/** Route page actions through the same guarded save/cancel paths. */ action(id: string) {
		if (id === 'save') this.save()
		else void this.cancel()
	}
	/** Preserve complex create drafts until the user explicitly discards them. */ canLeave(): Promise<boolean> {
		if (this.allowed) return Promise.resolve(true)
		if (this.saving()) return Promise.resolve(false)
		if (JSON.stringify(this.draft()) === this.baseline) return Promise.resolve(true)
		if (this.resolveDiscard) return Promise.resolve(false)
		this.confirm.set(true)
		return new Promise(
			/** Wait for the native confirmation result. */ (resolve) => {
				this.resolveDiscard = resolve
			},
		)
	}
	/** Resolve only the pending discard choice. */ decide(value: boolean) {
		this.confirm.set(false)
		this.resolveDiscard?.(value)
		this.resolveDiscard = undefined
	}
	/** Return to the HR request list only after the draft guard succeeds. */ async cancel() {
		if (await this.canLeave()) {
			this.allowed = true
			void this.router.navigate(['/documents/document-requests'], { queryParams: { scope: 'hr' } })
		}
	}
	/** Validate real metadata and submit once using a stable retry identity. */ save() {
		if (this.saving() || !this.canManage()) return
		this.fields().markAsTouched()
		if (this.fields().invalid()) {
			this.fields().focusBoundControl()
			return
		}
		let value
		try {
			value = parseDocumentRequestCreate({ ...this.draft(), dueDate: this.draft().dueDate || null })
		} catch {
			this.error.set('Check required fields and enter a valid due date as YYYY-MM-DD.')
			return
		}
		const signature = JSON.stringify(value)
		if (this.attempt?.signature !== signature)
			this.attempt = { signature, key: crypto.randomUUID() }
		this.saving.set(true)
		this.error.set('')
		this.saveRequest = this.api
			.create(value, this.attempt.key)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Open only the committed request's routed detail. */ (item) => {
					this.allowed = true
					this.saving.set(false)
					void this.router.navigate(['/documents/document-requests'], {
						queryParams: { scope: 'hr', request: item.id },
					})
				},
				error: /** Preserve the draft for retry. */ (error) => {
					this.saving.set(false)
					this.error.set(documentErrorMessage(error))
				},
			})
	}
	/** Guard full browser navigation as well as Angular route changes. */ @HostListener(
		'window:beforeunload',
		['$event'],
	)
	beforeUnload(event: BeforeUnloadEvent) {
		if (this.saving() || JSON.stringify(this.draft()) !== this.baseline) {
			event.preventDefault()
			event.returnValue = ''
		}
	}
	/** Drain private choices and outstanding navigation on destruction. */ ngOnDestroy() {
		this.workerRequest?.unsubscribe()
		this.typeRequest?.unsubscribe()
		this.saveRequest?.unsubscribe()
		this.resolveDiscard?.(false)
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
}
