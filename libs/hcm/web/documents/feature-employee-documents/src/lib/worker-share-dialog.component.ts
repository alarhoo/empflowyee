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
	EmployeeDocumentsApi,
	documentErrorMessage,
} from '@empflowyee/hcm-web-documents-data-access'
import type { WorkerDocumentVersion } from '@empflowyee/hcm-documents-contract'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
@Component({
	selector: 'ef-hcm-worker-share-dialog',
	imports: [Text, Dialog, CheckBox, TextArea, Label, Button, Bar, MessageStrip, FormField],
	templateUrl: 'worker-share-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkerShareDialogComponent implements OnInit, OnDestroy {
	readonly documentId = input.required<string>()
	readonly version = input.required<WorkerDocumentVersion>()
	readonly closed = output<void>()
	private readonly api = inject(EmployeeDocumentsApi)
	private readonly destroy = inject(DestroyRef)
	readonly draft = signal({ employeeVisible: false, reason: '' })
	readonly fields = form(
		this.draft,
		/** Require a bounded attributed sharing decision. */ (s) => {
			required(s.reason)
			pattern(s.reason, /\S/)
			maxLength(s.reason, 500)
		},
	)
	readonly saving = signal(false)
	readonly error = signal('')
	readonly open = signal(true)
	readonly confirm = signal(false)
	private baseline = ''
	private allowed = false
	private resolveDiscard?: (value: boolean) => void
	private attempt?: { signature: string; key: string }
	/** Initialize from this exact persisted version's sharing revision. */ ngOnInit() {
		this.fields().reset({ employeeVisible: this.version().employeeVisible, reason: '' })
		this.baseline = JSON.stringify(this.draft())
	}
	/** Block pending writes and explicitly confirm dirty sharing changes. */ canLeave(): Promise<boolean> {
		if (this.allowed) return Promise.resolve(true)
		if (this.saving()) return Promise.resolve(false)
		if (JSON.stringify(this.draft()) === this.baseline) return Promise.resolve(true)
		if (this.resolveDiscard) return Promise.resolve(false)
		this.confirm.set(true)
		return new Promise(
			/** Wait for the native discard choice. */ (resolve) => {
				this.resolveDiscard = resolve
			},
		)
	}
	/** Resolve the pending discard choice once. */ decide(value: boolean) {
		this.confirm.set(false)
		this.resolveDiscard?.(value)
		this.resolveDiscard = undefined
	}
	/** Cancel only after preserving the shared dirty-leave protocol. */ async cancel() {
		if (await this.canLeave()) {
			this.allowed = true
			this.open.set(false)
		}
	}
	/** Guard Escape and outside dismissal as well as Cancel. */ beforeClose(event: Event) {
		if (event.target !== event.currentTarget) return
		if (!this.allowed) {
			event.preventDefault()
			void this.cancel()
		}
	}
	/** Wait for native focus restoration before removing the dialog. */ finish(event: Event) {
		if (event.target === event.currentTarget) this.closed.emit()
	}
	/** Submit the exact selected version revision with a stable retry key. */ save() {
		if (this.saving()) return
		this.fields().markAsTouched()
		if (this.fields().invalid()) {
			this.fields().focusBoundControl()
			return
		}
		const payload = { ...this.draft(), expectedRevision: this.version().revision },
			signature = JSON.stringify(payload)
		if (this.attempt?.signature !== signature)
			this.attempt = { signature, key: crypto.randomUUID() }
		this.saving.set(true)
		this.error.set('')
		this.api
			.share(this.documentId(), this.version().id, payload, this.attempt.key)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Close only after sharing and audit commit. */ () => {
					this.allowed = true
					this.open.set(false)
				},
				error: /** Keep the failed decision for safe retry. */ (error) => {
					this.saving.set(false)
					this.error.set(documentErrorMessage(error))
				},
			})
	}
	/** Protect a pending or dirty decision during full browser navigation. */ @HostListener(
		'window:beforeunload',
		['$event'],
	)
	beforeUnload(event: BeforeUnloadEvent) {
		if (this.saving() || JSON.stringify(this.draft()) !== this.baseline) {
			event.preventDefault()
			event.returnValue = ''
		}
	}
	/** Resolve any pending navigation when the session tears down this action. */ ngOnDestroy() {
		this.resolveDiscard?.(false)
	}
}
