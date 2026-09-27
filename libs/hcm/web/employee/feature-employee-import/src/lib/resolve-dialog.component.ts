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
import { form, FormField, maxLength, pattern, required } from '@angular/forms/signals'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { EmployeeImportApi, importErrorMessage } from '@empflowyee/hcm-web-employee-data-access'
import type { ImportRowDto, Resolution } from '@empflowyee/hcm-employee-contract'
import { PROPOSED_LABELS, RESOLUTION_LABELS, resolutionsFor } from './labels'

/** A matched row of a run to resolve. */
export interface ResolveInput {
	runId: string
	row: ImportRowDto
}

/**
 * DEC-HCM2-001: HR decides every matched row before commit. The dialog offers only the
 * resolutions that fit the row's proposed action and lists the candidates the server found.
 */
@Component({
	selector: 'ef-hcm-import-resolve-dialog',
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
		TextArea,
		Text,
		MessageStrip,
		HcmDiscardDialog,
	],
	templateUrl: './resolve-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResolveDialog implements OnInit, OnDestroy {
	readonly input = input.required<ResolveInput>()
	readonly saved = output<{ message: string; row: ImportRowDto }>()
	readonly closed = output<void>()
	private readonly api = inject(EmployeeImportApi)
	private readonly destroy = inject(DestroyRef)
	private allowClose = false
	readonly resolutionLabels = RESOLUTION_LABELS
	readonly proposedLabels = PROPOSED_LABELS
	readonly options = computed(
		/** Resolutions that fit the row. */ () => resolutionsFor(this.input().row.proposedAction),
	)
	readonly model = signal({ resolution: '', candidateWorkerId: '', reason: '' })
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.resolution)
			required(path.candidateWorkerId, {
				when: /** Existing worker. */ () => this.model().resolution === 'UseExisting',
			})
			required(path.reason, {
				when: /** New worker. */ () => this.model().resolution === 'CreateNew',
			})
			pattern(path.reason, /^$|\S/)
			maxLength(path.reason, 500)
		},
	)
	readonly draft = new HcmDraft(/** Track the draft. */ () => this.model())
	readonly title = computed(/** Dialog title. */ () => `Resolve row ${this.input().row.rowNumber}`)

	/** Start from the row's single candidate, when it has one. */
	ngOnInit(): void {
		const [only, ...rest] = this.input().row.candidates
		if (only && !rest.length)
			this.model.update(/** Prefill. */ (v) => ({ ...v, candidateWorkerId: only.workerId }))
		this.draft.markClean()
	}

	/** Record the resolution, closing only after the server confirms it. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		for (const field of [this.fields.resolution, this.fields.candidateWorkerId, this.fields.reason])
			if (field().invalid()) {
				field().focusBoundControl()
				return
			}
		const v = this.model()
		const resolution = v.resolution as Resolution
		const { runId, row } = this.input()
		const body: Record<string, unknown> = { resolution, expectedRevision: row.revision }
		if (resolution === 'UseExisting') body['candidateWorkerId'] = v.candidateWorkerId
		if (v.reason.trim()) body['reason'] = v.reason.trim()
		this.draft.saving.set(true)
		this.draft.error.set('')
		this.api
			.resolve(runId, row.id, body, this.draft.key({ rowId: row.id, body }))
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Close after commit. */ (result) => {
					this.draft.saving.set(false)
					this.draft.markClean()
					this.allowClose = true
					this.saved.emit({
						message: `Row ${result.rowNumber}: ${RESOLUTION_LABELS[resolution].toLowerCase()}.`,
						row: result,
					})
				},
				error: /** Preserve the draft and retry key. */ (error) => {
					this.draft.saving.set(false)
					this.draft.error.set(importErrorMessage(error))
				},
			})
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
