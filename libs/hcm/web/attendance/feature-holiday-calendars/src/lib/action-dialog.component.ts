import { HcmDateField } from '@empflowyee/hcm-web-ux-forms'
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	inject,
	input,
	output,
	signal,
	computed,
} from '@angular/core'
import type {
	HolidayReferenceOption,
	HolidayEmploymentOptions,
} from '@empflowyee/hcm-attendance-contract'
import { DatePicker } from '@fundamental-ngx/ui5-webcomponents/date-picker'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { ComboBox } from '@fundamental-ngx/ui5-webcomponents/combo-box'
import { ComboBoxItem } from '@fundamental-ngx/ui5-webcomponents/combo-box-item'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import {
	form,
	FormField,
	maxLength,
	required,
	pattern,
	disabled,
	validate,
	submit,
} from '@angular/forms/signals'
import { HcmDomainError, type HcmFieldError } from '@empflowyee/hcm-runtime-contract'
import { firstValueFrom, type Observable } from 'rxjs'
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
import {
	HolidayCalendarsApi,
	attendanceErrorMessage,
} from '@empflowyee/hcm-web-attendance-data-access'
import {
	parseConfigurationReason,
	parseHolidayPreview,
	type HolidayPreviewView,
	type HolidayVersionView,
} from '@empflowyee/hcm-attendance-contract'

export type HolidayAction = 'retire' | 'version' | 'publish'

/** Preserve private reason and command identity in a focused native lifecycle dialog. */
@Component({
	selector: 'ef-hcm-calendar-action-dialog',
	imports: [
		HcmDateField,
		DatePicker,
		Input,
		Select,
		Option,
		ComboBox,
		ComboBoxItem,
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
	templateUrl: './action-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HolidayActionDialog {
	readonly source = input.required<HolidayVersionView>()
	readonly operation = input.required<HolidayAction>()
	readonly closed = output<void>()
	readonly completed = output<{ action: HolidayAction; id: string; versionId: string }>()
	private readonly api = inject(HolidayCalendarsApi)
	readonly runtime = inject(HcmRuntimeStore)
	readonly workers = signal<HolidayReferenceOption[]>([])
	readonly context = signal<HolidayEmploymentOptions | null>(null)
	readonly lookupError = signal('')
	readonly search = signal('')
	readonly moreWorkers = signal(false)
	readonly zones = ['UTC', ...Intl.supportedValuesOf('timeZone')]
	readonly preview = signal<HolidayPreviewView | null>(null)
	private readonly previewInput = signal('')
	private reviewGeneration = 0
	private workerGeneration = 0
	private searchGeneration = 0
	private readonly reviewRetry = new HcmDraft(
		/** Preserve the admitted validation command identity. */ () => this.model(),
	)
	readonly reviewed = computed(
		/** Edited context can never reuse prior review evidence. */ () =>
			this.previewInput() === this.fingerprint() ? this.preview() : null,
	)

	private readonly destroy = inject(DestroyRef)
	readonly model = signal({
		reason: '',
		effectiveFrom: '',
		effectiveTo: '',
		employmentId: '',
		timezone: '',
	})
	readonly submitted = signal(false)
	readonly reviewSubmitted = signal(false)
	readonly reviewErrors = computed(
		/** Revalidate explicit context as the user corrects its fields. */ () => {
			if (this.operation() !== 'publish') return []
			try {
				const { reason, ...input } = this.model()
				void reason
				parseHolidayPreview({ ...input, expectedRevision: this.source().revision })
				return []
			} catch (error) {
				return error instanceof HcmDomainError ? error.fieldErrors : []
			}
		},
	)
	readonly fields = form(
		this.model,
		/** Mirror the server's preserved nonblank reason contract. */ (path) => {
			disabled(path, {
				when: /** Preserve the in-flight command input. */ () => this.draft.saving(),
			})
			validate(
				path,
				/** Require the same dated context at confirmation as at preview. */ () =>
					this.reviewErrors().length
						? { kind: 'context', message: 'Correct the publication context.' }
						: null,
			)
			required(path.reason)
			maxLength(path.reason, 2000)
			pattern(path.reason, /\S/)
		},
	)
	/** Explain an invalid context field after blur or an attempted review. */
	fieldError(field: 'employmentId' | 'timezone' | 'effectiveFrom' | 'effectiveTo'): string {
		if (!this.reviewSubmitted() && !this.fields[field]().touched()) return ''
		const error = this.reviewErrors().find(
			/** Match only this rendered context field. */ (item: HcmFieldError) => item.field === field,
		)
		if (!error) return ''
		return {
			employmentId: 'Select the employment to validate.',
			timezone: 'Select a valid IANA timezone matching the dated employment location.',
			effectiveFrom: 'Enter a valid review start date.',
			effectiveTo: 'Enter a valid end date, on or after the start and within 366 days.',
		}[field]
	}
	readonly draft = new HcmDraft(
		/** Retain reason input until the server confirms a result. */ () => this.model(),
	)
	/** Release pending navigation decisions when context destroys the dialog. */
	constructor() {
		this.destroy.onDestroy(
			/** Resolve any outstanding discard confirmation. */ () => this.draft.release(),
		)
	}
	/** Name the exact source command without implying publication. */
	title(): string {
		if (this.operation() === 'publish') return 'Preview and publish calendar'
		return this.operation() === 'retire' ? 'Retire holiday calendar' : 'Create successor calendar'
	}
	/** Initialize the explicit review range from source dates without inferring timezone or employment. */
	ngOnInit(): void {
		this.model.update(
			/** The user reviews and may change these source dates. */ (model) => ({
				...model,
				effectiveFrom: this.source().effectiveFrom,
				effectiveTo: this.source().effectiveTo ?? this.source().effectiveFrom,
			}),
		)
		this.draft.markClean()
		if (this.operation() === 'publish') this.findWorkers()
	}
	/** Bind displayed review evidence to only its exact context fields. */
	private fingerprint(): string {
		const { reason, ...input } = this.model()
		void reason
		return JSON.stringify(input)
	}
	/** Search minimal Workforce references through the calendar-authorized contract. */
	findWorkers(): void {
		if (this.draft.saving()) return
		this.lookupError.set('')
		const generation = ++this.searchGeneration
		this.api
			.referenceOptions('workers', this.search(), this.model().effectiveFrom)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Preserve the server's authorized option order. */ (page) => {
					if (generation !== this.searchGeneration) return
					this.workers.set(page.items)
					this.moreWorkers.set(page.hasMore)
				},
				error: /** Ignore failures from a replaced search. */ () => {
					if (generation === this.searchGeneration)
						this.lookupError.set('Worker choices unavailable. Verify permission and retry.')
				},
			})
	}
	/** Load employment choices belonging to the explicitly selected worker. */
	selectWorker(id: string): void {
		if (this.draft.saving()) return
		const generation = ++this.workerGeneration
		this.context.set(null)
		this.model.update(
			/** Clear the prior employment before loading another person. */ (model) => ({
				...model,
				employmentId: '',
			}),
		)
		if (!id) return
		this.api
			.employmentOptions(id, this.model().effectiveFrom)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Keep only the latest selected worker's distinct employments. */ (context) => {
					if (generation === this.workerGeneration) this.context.set(context)
				},
				error: /** Do not report a replaced worker's lookup failure. */ () => {
					if (generation === this.workerGeneration)
						this.lookupError.set('Employment context unavailable.')
				},
			})
	}
	/** Enqueue real worker validation and retain its receipt for progress reads. */
	async review(): Promise<void> {
		if (this.draft.saving()) return
		this.reviewSubmitted.set(true)
		const invalid = this.reviewErrors()[0]?.field
		if (invalid && ['employmentId', 'timezone', 'effectiveFrom', 'effectiveTo'].includes(invalid)) {
			this.fields[
				invalid as 'employmentId' | 'timezone' | 'effectiveFrom' | 'effectiveTo'
			]().focusBoundControl()
			return
		}
		this.draft.error.set('')
		try {
			const fingerprint = this.fingerprint()
			const { reason, ...model } = this.model()
			void reason
			const body = parseHolidayPreview({ ...model, expectedRevision: this.source().revision })
			this.draft.saving.set(true)
			const preview = await firstValueFrom(
				this.api
					.preview(
						this.source(),
						body,
						this.reviewRetry.key({ body, generation: this.reviewGeneration }),
					)
					.pipe(takeUntilDestroyed(this.destroy)),
			)
			this.reviewGeneration++
			this.previewInput.set(fingerprint)
			this.preview.set(preview)
		} catch (error) {
			if (!this.destroy.destroyed)
				this.draft.error.set(
					'Select an employment, explicit timezone and valid review dates. ' +
						attendanceErrorMessage(error),
				)
		} finally {
			this.draft.saving.set(false)
		}
	}
	/** Refresh real durable status; a Running review never enables publication. */
	async refreshReview(): Promise<void> {
		const preview = this.reviewed()
		if (!preview || this.draft.saving()) return
		try {
			const refreshed = await firstValueFrom(
				this.api
					.previewStatus(this.source(), preview.previewId)
					.pipe(takeUntilDestroyed(this.destroy)),
			)
			if (this.reviewed()?.previewId === preview.previewId) this.preview.set(refreshed)
		} catch (error) {
			if (!this.destroy.destroyed) this.draft.error.set(attendanceErrorMessage(error))
		}
	}

	/** Validate before HTTP and retry an uncertain result using the original key. */
	async confirm(): Promise<void> {
		if (this.draft.saving()) return
		this.submitted.set(true)
		await submit(this.fields, {
			onInvalid: /** Keep the reason visible and focus its invalid control. */ () =>
				this.fields.reason().focusBoundControl(),
			action: /** Wait for the real atomic source result before closing. */ async () => {
				const source = this.source(),
					action = this.operation()
				const body = parseConfigurationReason({
					expectedRevision: source.revision,
					reason: this.model().reason,
				})
				const preview = this.reviewed()
				if (
					action === 'publish' &&
					(preview?.state !== 'Ready' ||
						!preview.digest ||
						preview.conflicts ||
						preview.lockedImpact)
				) {
					this.draft.error.set('Wait for a conflict-free Ready preview before publication.')
					return { kind: 'preview', message: 'A current Ready preview is required.' }
				}
				let call: Observable<HolidayVersionView>
				if (action === 'publish') {
					if (!preview?.digest) return { kind: 'preview', message: 'A Ready preview is required.' }
					const command = { ...body, previewId: preview.previewId, digest: preview.digest }
					call = this.api.publish(source, command, this.draft.key({ source, action, command }))
				} else if (action === 'version') {
					const command = { ...body, sourceVersionId: source.versionId }
					call = this.api.version(source.id, command, this.draft.key({ source, action, command }))
				} else call = this.api.retire(source, body, this.draft.key({ source, action, body }))
				this.draft.saving.set(true)
				this.draft.error.set('')
				try {
					const result = await firstValueFrom(call.pipe(takeUntilDestroyed(this.destroy)))
					if (this.destroy.destroyed) return undefined
					this.draft.markClean()
					this.completed.emit({ action, id: result.id, versionId: result.versionId })
					return undefined
				} catch (error) {
					if (!this.destroy.destroyed) this.draft.error.set(attendanceErrorMessage(error))
					return { kind: 'server', message: 'The command could not be confirmed.' }
				} finally {
					this.draft.saving.set(false)
				}
			},
		})
	}
	/** Preserve dirty reason input during native dismissal or navigation. */
	canLeave(): Promise<boolean> {
		return this.draft.canLeave()
	}
	/** Close only after the same dirty-state decision used by route navigation. */
	async cancel(): Promise<void> {
		if (await this.canLeave()) this.closed.emit()
	}
	/** Intercept Escape so native dismissal cannot lose an unresolved command. */
	beforeClose(event: Event): void {
		if (event.target === event.currentTarget) {
			event.preventDefault()
			void this.cancel()
		}
	}
}
