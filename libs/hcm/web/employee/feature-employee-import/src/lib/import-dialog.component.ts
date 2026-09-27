import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	type OnDestroy,
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
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { EmployeeImportApi, importErrorMessage } from '@empflowyee/hcm-web-employee-data-access'
import type { ImportRunDetailDto, ImportTemplateDetailDto } from '@empflowyee/hcm-employee-contract'

/** One command on a run or a template, opened from its Object Page. */
export type ImportDialogInput =
	| { mode: 'validate' | 'commit' | 'cancel'; run: ImportRunDetailDto }
	| { mode: 'publish' | 'newVersion'; template: ImportTemplateDetailDto }

/** What a committed command reports back. */
export interface ImportDialogResult {
	message: string
	run?: ImportRunDetailDto
	template?: ImportTemplateDetailDto
}

/** Focused Dialog to validate, commit or cancel a run, or to publish or version a template. */
@Component({
	selector: 'ef-hcm-import-dialog',
	imports: [
		FormField,
		Dialog,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		TextArea,
		Text,
		MessageStrip,
		HcmDiscardDialog,
	],
	templateUrl: './import-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportDialog implements OnDestroy {
	readonly input = input.required<ImportDialogInput>()
	readonly saved = output<ImportDialogResult>()
	readonly closed = output<void>()
	private readonly api = inject(EmployeeImportApi)
	private readonly destroy = inject(DestroyRef)
	private allowClose = false
	readonly model = signal({ reason: '' })
	readonly needsReason = computed(
		/** Cancelling, publishing and versioning state a reason. */ () =>
			['cancel', 'publish', 'newVersion'].includes(this.input().mode),
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.reason, { when: /** Reason modes. */ () => this.needsReason() })
			pattern(path.reason, /\S/)
			maxLength(path.reason, 500)
		},
	)
	readonly draft = new HcmDraft(/** Track the draft. */ () => this.model())
	readonly copy = computed(
		/** Title, confirmation and explanation of the mode. */ () => {
			const value = this.input()
			const subject =
				'run' in value
					? value.run.fileName
					: `${value.template.name}, version ${value.template.versionNumber}`
			const copies = {
				validate: {
					title: `Validate ${subject}`,
					confirm: 'Validate',
					busy: 'Validating…',
					text: 'Every row is checked against the template and current records. No workforce fact changes.',
				},
				commit: {
					title: `Commit ${subject}`,
					confirm: 'Commit',
					busy: 'Committing…',
					text: 'Valid, resolved rows are applied one by one; a refused row is recorded and the others still commit.',
				},
				cancel: {
					title: `Cancel ${subject}`,
					confirm: 'Cancel run',
					busy: 'Cancelling…',
					text: 'A cancelled run changes no workforce fact and cannot be committed.',
				},
				publish: {
					title: `Publish ${subject}`,
					confirm: 'Publish',
					busy: 'Publishing…',
					text: 'The version becomes read-only and available for runs; the previously published version retires.',
				},
				newVersion: {
					title: `New version of ${subject}`,
					confirm: 'Create version',
					busy: 'Creating…',
					text: 'A new draft copies this version’s settings and columns. Runs keep the version they used.',
				},
			}
			return copies[value.mode]
		},
	)

	/** Send the command, closing only after the server confirms it. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		if (this.fields.reason().invalid()) {
			this.fields.reason().focusBoundControl()
			return
		}
		const value = this.input()
		const reason = this.model().reason.trim()
		let request: Observable<ImportRunDetailDto | ImportTemplateDetailDto>
		if ('run' in value) {
			const body: Record<string, unknown> = { expectedRevision: value.run.revision }
			if (value.mode === 'cancel') body['reason'] = reason
			request = this.api.command(
				value.run.id,
				value.mode,
				body,
				this.draft.key({ id: value.run.id, ...body, mode: value.mode }),
			)
		} else {
			const operation = value.mode === 'publish' ? 'publish' : 'versions'
			const body: Record<string, unknown> =
				value.mode === 'publish'
					? { expectedRevision: value.template.revision, reason }
					: { reason }
			request = this.api.templateCommand(
				value.template.id,
				operation,
				body,
				this.draft.key({ id: value.template.id, operation, body }),
			)
		}
		this.draft.saving.set(true)
		this.draft.error.set('')
		request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Close after commit. */ (result) => {
				this.draft.saving.set(false)
				this.draft.markClean()
				this.allowClose = true
				this.saved.emit(this.outcome(value, result))
			},
			error: /** Preserve the draft and retry key. */ (error) => {
				this.draft.saving.set(false)
				this.draft.error.set(importErrorMessage(error))
			},
		})
	}

	/** The confirmation of a committed command. */
	private outcome(
		value: ImportDialogInput,
		result: ImportRunDetailDto | ImportTemplateDetailDto,
	): ImportDialogResult {
		if (!('run' in value)) {
			const template = result as ImportTemplateDetailDto
			return {
				template,
				message:
					value.mode === 'publish'
						? 'The template version was published.'
						: `Version ${template.versionNumber} was created as a draft.`,
			}
		}
		const run = result as ImportRunDetailDto
		return { run, message: this.runMessage(value.mode, run) }
	}

	/** The confirmation of a run command. */
	private runMessage(mode: 'validate' | 'commit' | 'cancel', run: ImportRunDetailDto): string {
		if (mode === 'cancel') return 'The run was cancelled.'
		if (run.status === 'Failed')
			return mode === 'validate'
				? 'The file could not be validated; see the issues.'
				: 'No row could be committed; see the rows.'
		if (mode === 'validate')
			return `${run.validRowCount} of ${run.totalRowCount} rows are valid; ${run.unresolvedRowCount} need a resolution.`
		return `${run.committedRowCount} rows were committed, ${run.failedRowCount} failed and ${run.skippedRowCount} were skipped.`
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
