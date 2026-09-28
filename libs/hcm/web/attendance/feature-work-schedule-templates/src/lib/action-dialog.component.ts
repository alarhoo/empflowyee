import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	inject,
	input,
	output,
	signal,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { form, FormField, maxLength, validate, disabled, submit } from '@angular/forms/signals'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { DatePicker } from '@fundamental-ngx/ui5-webcomponents/date-picker'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { HcmDatePipe, HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	ScheduleTemplatesApi,
	attendanceErrorMessage,
} from '@empflowyee/hcm-web-attendance-data-access'
import {
	parseAttendanceCopyCommand,
	parseAttendanceVersionCommand,
	parseConfigurationPreview,
	parseConfigurationReason,
	parseConfigurationPublish,
	type ConfigurationPreviewView,
	type ScheduleVersionView,
} from '@empflowyee/hcm-attendance-contract'
import { HcmDomainError, type HcmFieldError } from '@empflowyee/hcm-runtime-contract'
import { HttpErrorResponse } from '@angular/common/http'
import { firstValueFrom, type Observable } from 'rxjs'

type ActionModel = {
	code: string
	name: string
	reason: string
	effectiveFrom: string
	effectiveTo: string
}
type ActionField = keyof ActionModel

export type TemplateAction = 'publish' | 'retire' | 'copy' | 'version'

/** Focused native decision dialog bound to one loaded revision and its actor-owned preview. */
@Component({
	selector: 'ef-hcm-template-action-dialog',
	imports: [
		FormField,
		Dialog,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		Input,
		TextArea,
		DatePicker,
		Text,
		MessageStrip,
		HcmDiscardDialog,
		HcmDatePipe,
	],
	templateUrl: './action-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplateActionDialog {
	readonly source = input.required<ScheduleVersionView>()
	readonly operation = input.required<TemplateAction>()
	readonly closed = output<void>()
	readonly completed = output<{ action: TemplateAction; id: string; versionId: string }>()
	readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(ScheduleTemplatesApi)
	private readonly destroy = inject(DestroyRef)
	readonly model = signal<ActionModel>({
		code: '',
		name: '',
		reason: '',
		effectiveFrom: '',
		effectiveTo: '',
	})
	readonly fields = form(
		this.model,
		/** Keep narrative and identifiers within the shared contract limits. */ (path) => {
			disabled(path, { when: /** Keep commands stable while saving. */ () => this.draft.saving() })
			validate(
				path,
				/** Apply the same command parsers reactively. */ ({ value }) =>
					this.invalidFields(value()).length
						? { kind: 'command', message: 'Complete the highlighted fields.' }
						: null,
			)
			maxLength(path.code, 40)
			maxLength(path.name, 120)
			maxLength(path.reason, 2000)
		},
	)
	readonly preview = signal<ConfigurationPreviewView | null>(null)
	readonly fieldErrors = signal<Record<string, string>>({})
	readonly submitted = signal(false)
	readonly reviewSubmitted = signal(false)
	private failureModel = ''
	readonly localErrors = computed(
		/** Recompute errors as input is corrected. */ () => this.invalidFields(this.model()),
	)
	readonly draft = new HcmDraft(
		/** Track only user input; preview evidence is server-owned. */ () => this.model(),
	)
	private readonly previewRetry = new HcmDraft(
		/** Keep preview retries independent of the subsequent publication command. */ () =>
			this.model(),
	)
	private allowClose = false
	private previewGeneration = 0

	/** Release pending discard decisions when context or route removes the dialog. */
	constructor() {
		this.destroy.onDestroy(
			/** Release the native confirmation promise. */ () => this.draft.release(),
		)
	}
	/** Initialize the explicit preview range from source coverage, without changing publication dates. */
	ngOnInit(): void {
		this.model.update(
			/** Default the review to its first covered date. */ (model) => ({
				...model,
				effectiveFrom: this.source().effectiveFrom,
				effectiveTo: this.source().effectiveFrom,
			}),
		)
		this.draft.markClean()
	}
	/** Name the actual operation, including the separate schedule copy outcome. */
	title(): string {
		return {
			publish: 'Preview and publish template',
			retire: 'Retire template',
			copy: 'Copy to a schedule draft',
			version: 'Create successor draft',
		}[this.operation()]
	}

	/** Request a new actor-bound preview; changing review inputs clears previously shown evidence. */
	review(): void {
		if (this.draft.saving()) return
		this.reviewSubmitted.set(true)
		const source = this.source()
		let body
		try {
			body = parseConfigurationPreview({
				expectedRevision: source.revision,
				effectiveFrom: this.model().effectiveFrom,
				effectiveTo: this.model().effectiveTo,
			})
		} catch (error) {
			this.failure(error)
			return
		}
		this.preview.set(null)
		this.draft.saving.set(true)
		this.draft.error.set('')
		this.fieldErrors.set({})
		this.api
			.preview(
				source,
				body,
				this.previewRetry.key({ source, body, generation: this.previewGeneration }),
			)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Show only evidence returned for the exact request. */ (preview) => {
					this.preview.set(preview)
					this.previewGeneration++
					this.draft.saving.set(false)
				},
				error: /** Failed review cannot leave a publishable stale preview. */ (error) =>
					this.failure(error),
			})
	}
	/** Invalidate review evidence whenever a date is edited. */
	invalidatePreview(): void {
		this.preview.set(null)
	}

	/** Validate the chosen action and retain an unchanged command key across failed responses. */
	async submit(): Promise<void> {
		if (this.draft.saving()) return
		this.submitted.set(true)
		await submit(this.fields, {
			onInvalid: /** Focus the first rendered invalid field. */ () => {
				this.draft.error.set('Complete the highlighted fields.')
				const field = this.localErrors()[0]?.field
				if (field && ['code', 'name', 'reason', 'effectiveFrom', 'effectiveTo'].includes(field))
					this.fields[field as ActionField]().focusBoundControl()
			},
			action: /** Await the authoritative receipt through Signal Forms. */ async () => {
				await this.confirm()
			},
		})
	}
	/** Send a validated source command while retaining stable retry identity. */
	private async confirm(): Promise<void> {
		const source = this.source(),
			model = this.model(),
			action = this.operation()
		let call: Observable<{ id: string; versionId: string }>
		try {
			const reason = { expectedRevision: source.revision, reason: model.reason }
			if (action === 'publish') {
				const preview = this.preview()
				if (!preview) {
					this.preview.set(null)
					this.draft.error.set('Request a fresh preview before publishing.')
					return
				}
				const body = parseConfigurationPublish({
					...reason,
					previewId: preview.previewId,
					digest: preview.digest,
				})
				call = this.api.publish(source, body, this.draft.key({ action, source, body }))
			} else if (action === 'retire') {
				const body = parseConfigurationReason(reason)
				call = this.api.retire(source, body, this.draft.key({ action, source, body }))
			} else if (action === 'copy') {
				const body = parseAttendanceCopyCommand({
					...reason,
					sourceVersionId: source.versionId,
					code: model.code,
					name: model.name,
				})
				call = this.api.copy(source.id, body, this.draft.key({ action, source, body }))
			} else {
				const body = parseAttendanceVersionCommand({ ...reason, sourceVersionId: source.versionId })
				call = this.api.version(source.id, body, this.draft.key({ action, source, body }))
			}
		} catch (error) {
			this.failure(error)
			return
		}
		this.draft.saving.set(true)
		this.draft.error.set('')
		this.fieldErrors.set({})
		try {
			const result = await firstValueFrom(call.pipe(takeUntilDestroyed(this.destroy)))
			this.draft.saving.set(false)
			this.draft.markClean()
			this.allowClose = true
			this.completed.emit({ action, id: result.id, versionId: result.versionId })
		} catch (error) {
			if (!this.destroy.destroyed) this.failure(error)
		}
	}
	/** Keep safe field paths attached to rendered controls without exposing server diagnostics. */
	private failure(error: unknown): void {
		this.draft.saving.set(false)
		let fields
		if (error instanceof HcmDomainError) fields = error.fieldErrors
		else if (error instanceof HttpErrorResponse) fields = error.error?.fieldErrors
		const messages: Record<string, string> = {}
		if (Array.isArray(fields))
			for (const field of fields)
				if (['code', 'name', 'reason', 'effectiveFrom', 'effectiveTo'].includes(field.field))
					messages[field.field] = 'Check this value.'
		this.failureModel = JSON.stringify(this.model())
		this.fieldErrors.set(messages)
		const first = Object.keys(messages)[0] as ActionField | undefined
		if (first) this.fields[first]().focusBoundControl()
		this.draft.error.set(
			error instanceof HcmDomainError
				? 'Complete the highlighted fields.'
				: attendanceErrorMessage(error),
		)
		if (error instanceof HttpErrorResponse && error.error?.code === 'preview-stale')
			this.preview.set(null)
	}
	/** Validate only rendered fields using the authoritative command contracts. */
	private invalidFields(model: ActionModel): HcmFieldError[] {
		const errors: HcmFieldError[] = []
		try {
			const reason = { expectedRevision: this.source().revision, reason: model.reason }
			if (this.operation() === 'copy')
				parseAttendanceCopyCommand({
					...reason,
					sourceVersionId: this.source().versionId,
					code: model.code,
					name: model.name,
				})
			else parseConfigurationReason(reason)
		} catch (error) {
			if (error instanceof HcmDomainError) errors.push(...(error.fieldErrors ?? []))
		}
		if (this.operation() === 'publish') {
			try {
				parseConfigurationPreview({
					expectedRevision: this.source().revision,
					effectiveFrom: model.effectiveFrom,
					effectiveTo: model.effectiveTo,
				})
			} catch (error) {
				if (error instanceof HcmDomainError) errors.push(...(error.fieldErrors ?? []))
			}
		}
		return errors
	}
	/** Keep errors visible after blur or submit and clear stale server errors after correction. */
	fieldError(field: ActionField): string {
		const date = field === 'effectiveFrom' || field === 'effectiveTo'
		if (!this.fields[field]().touched() && !(date ? this.reviewSubmitted() : this.submitted()))
			return ''
		if (
			this.localErrors().some(
				/** Match the rendered field only. */ (error) => error.field === field,
			)
		)
			return 'Check this value and its related fields.'
		return this.failureModel === JSON.stringify(this.model())
			? (this.fieldErrors()[field] ?? '')
			: ''
	}
	/** Route Escape and Cancel through one dirty-state decision. */
	async cancel(): Promise<void> {
		if (await this.draft.canLeave()) {
			this.allowClose = true
			this.closed.emit()
		}
	}
	/** Intercept native dismissal until the dirty-state decision resolves. */
	beforeClose(event: Event): void {
		if (event.target !== event.currentTarget || this.allowClose) return
		event.preventDefault()
		void this.cancel()
	}
	/** Let route navigation preserve the focused action's reason and unconfirmed command. */
	canLeave(): Promise<boolean> {
		return this.draft.canLeave()
	}
}
