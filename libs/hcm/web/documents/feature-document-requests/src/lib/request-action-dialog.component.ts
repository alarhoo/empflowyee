import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import type { Observable } from 'rxjs'
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
	DocumentRequestsApi,
	documentErrorMessage,
} from '@empflowyee/hcm-web-documents-data-access'
import type { RequestView, DocumentVersion } from '@empflowyee/hcm-documents-contract'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { FileUploader } from '@fundamental-ngx/ui5-webcomponents/file-uploader'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
@Component({
	selector: 'ef-hcm-request-action-dialog',
	imports: [Text, Dialog, FileUploader, TextArea, Label, Button, Bar, MessageStrip, FormField],
	templateUrl: 'request-action-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestActionDialogComponent implements OnInit, OnDestroy {
	readonly item = input.required<RequestView>()
	readonly action = input.required<'submit' | 'accept' | 'replacement' | 'cancel'>()
	readonly submission = input<DocumentVersion | null>(null)
	readonly file = signal<File | null>(null)
	readonly closed = output<void>()
	private readonly api = inject(DocumentRequestsApi)
	private readonly destroy = inject(DestroyRef)
	readonly draft = signal({ reason: '' })
	readonly fields = form(
		this.draft,
		/** Require a bounded attributed request action decision. */ (s) => {
			required(s.reason, {
				when: /** Employee submission has no invented reason field. */ () =>
					this.action() !== 'submit',
			})
			pattern(s.reason, /\S/, {
				when: /** Require a meaningful HR decision. */ () => this.action() !== 'submit',
			})
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
	/** Initialize from this exact persisted version's request action revision. */ ngOnInit() {
		this.fields().reset({ reason: '' })
		this.baseline = JSON.stringify(this.draft())
	}
	/** Block pending writes and explicitly confirm dirty request action changes. */ canLeave(): Promise<boolean> {
		if (this.allowed) return Promise.resolve(true)
		if (this.saving()) return Promise.resolve(false)
		if (!this.file() && JSON.stringify(this.draft()) === this.baseline) return Promise.resolve(true)
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
		const action = this.action(),
			file = this.file(),
			item = this.item()
		if (action === 'submit' && !file) {
			this.error.set('Choose a PDF, PNG or JPEG up to 10 MiB.')
			return
		}
		if (action === 'accept' && !this.submission()) {
			this.error.set('Reload submissions before accepting.')
			return
		}
		const payload = {
				reason: this.draft().reason,
				expectedRevision: item.revision,
				...(action === 'accept' ? { submissionId: this.submission()?.id } : {}),
			},
			signature = JSON.stringify([
				action,
				item.id,
				payload,
				file?.name,
				file?.size,
				file?.lastModified,
			])
		if (this.attempt?.signature !== signature)
			this.attempt = { signature, key: crypto.randomUUID() }
		let request: Observable<RequestView>
		if (action === 'submit') {
			if (!file) return
			request = this.api.submit(item.id, item.revision, file, this.attempt.key)
		} else request = this.api.transition(item.id, action, payload, this.attempt.key)

		this.saving.set(true)
		this.error.set('')
		request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Close only after request action and audit commit. */ () => {
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
		if (this.saving() || this.file() || JSON.stringify(this.draft()) !== this.baseline) {
			event.preventDefault()
			event.returnValue = ''
		}
	}
	/** Keep selected bytes in memory and discard any previous retry identity. */ chooseFile(
		event: Event,
	) {
		const file = (event.target as HTMLElement & { files: FileList | null }).files?.item(0) ?? null
		this.attempt = undefined
		if (file && (file.size < 1 || file.size > 10485760)) {
			this.rejectFile()
			return
		}
		this.file.set(file)
		this.error.set('')
	}
	/** Clear stale selections when the native uploader rejects a file. */ rejectFile() {
		this.file.set(null)
		this.attempt = undefined
		this.error.set('Choose a nonempty PDF, PNG or JPEG up to 10 MiB.')
	}
	/** Name the focused decision without hiding its target. */ title() {
		return {
			submit: 'Submit document',
			accept: 'Accept submission',
			replacement: 'Request replacement',
			cancel: 'Cancel request',
		}[this.action()]
	}
	/** Resolve any pending navigation when the session tears down this action. */ ngOnDestroy() {
		this.resolveDiscard?.(false)
	}
}
