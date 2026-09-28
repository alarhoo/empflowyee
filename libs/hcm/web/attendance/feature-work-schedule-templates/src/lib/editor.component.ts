import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	HostListener,
	computed,
	effect,
	inject,
	signal,
	untracked,
	viewChildren,
} from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import {
	form,
	FormField,
	maxLength,
	pattern,
	required,
	disabled,
	validate,
	submit,
} from '@angular/forms/signals'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { HttpErrorResponse } from '@angular/common/http'
import { firstValueFrom, Subject, takeUntil, type Subscription } from 'rxjs'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { StepInput } from '@fundamental-ngx/ui5-webcomponents/step-input'
import { DatePicker } from '@fundamental-ngx/ui5-webcomponents/date-picker'
import { TimePicker } from '@fundamental-ngx/ui5-webcomponents/time-picker'
import { ComboBox } from '@fundamental-ngx/ui5-webcomponents/combo-box'
import { ComboBoxItem } from '@fundamental-ngx/ui5-webcomponents/combo-box-item'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	ScheduleTemplatesApi,
	attendanceErrorMessage,
	attendanceReadState,
} from '@empflowyee/hcm-web-attendance-data-access'
import { HcmDomainError, type HcmFieldError } from '@empflowyee/hcm-runtime-contract'
import type { ScheduleVersionView } from '@empflowyee/hcm-attendance-contract'
import {
	emptyScheduleForm,
	formFromDefaults,
	formFromVersion,
	scheduleFromForm,
	segmentForm,
	TEMPLATE_ROUTE,
	TEMPLATE_PERMISSION,
	WEEKDAYS,
} from './schedule-form'

/** Routed complete-pattern editor; no incomplete proposal can become a reusable template. */
@Component({
	selector: 'ef-hcm-schedule-template-editor',
	imports: [
		FormField,
		Button,
		Form,
		FormItem,
		Label,
		Input,
		TextArea,
		Select,
		Option,
		CheckBox,
		StepInput,
		DatePicker,
		TimePicker,
		ComboBox,
		ComboBoxItem,
		Title,
		Text,
		MessageStrip,
		HcmDynamicPage,
		HcmDiscardDialog,
	],
	templateUrl: './editor.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScheduleTemplateEditor {
	private readonly api = inject(ScheduleTemplatesApi)
	private readonly route = inject(ActivatedRoute)
	private readonly router = inject(Router)
	private readonly destroy = inject(DestroyRef)
	readonly runtime = inject(HcmRuntimeStore)
	private read?: Subscription
	private readonly contextChanged = new Subject<void>()
	private contextGeneration = 0
	private readonly numericControls = viewChildren(StepInput)
	readonly source = signal<ScheduleVersionView | null>(null)
	readonly model = signal(emptyScheduleForm())
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly submitted = signal(false)
	readonly serverErrors = signal<HcmFieldError[]>([])
	readonly weekdays = WEEKDAYS
	readonly zones = ['UTC', ...Intl.supportedValuesOf('timeZone')]
	readonly id = this.route.snapshot.paramMap.get('id')
	readonly fields = form(
		this.model,
		/** Mirror static contract limits; the universal parser supplies cross-field checks. */ (
			path,
		) => {
			disabled(path, {
				when: /** Prevent changing a command while its receipt is unresolved. */ () =>
					this.draft.saving(),
			})
			required(path.code)
			maxLength(path.code, 40)
			pattern(path.code, /^[A-Z][A-Z0-9_-]*$/)
			required(path.name)
			maxLength(path.name, 120)
			pattern(path.name, /\S/)
			maxLength(path.description, 2000)
			required(path.effectiveFrom)
			required(path.timezoneMode)
			required(path.weekStartsOn)
			validate(
				path,
				/** Reuse the universal parser as Signal Forms cross-field validation. */ ({ value }) => {
					try {
						scheduleFromForm(value())
						return null
					} catch {
						return { kind: 'schedule', message: 'Complete the highlighted schedule fields.' }
					}
				},
			)
		},
	)
	readonly draft = new HcmDraft(
		/** Track every form field for dirty navigation and stable retries. */ () => this.model(),
	)
	readonly errors = computed(
		/** Validate the complete draft reactively without mutating any input. */ () => {
			try {
				scheduleFromForm(this.model())
				return []
			} catch (error) {
				return error instanceof HcmDomainError
					? error.fieldErrors
					: [{ field: 'days', code: 'invalid' }]
			}
		},
	)
	readonly timeFormat = computed(
		/** Respect the current account's clock convention while retaining seconds. */ () =>
			this.runtime.preferences().timeFormat === '12h' ? 'hh:mm:ss.SSS a' : 'HH:mm:ss.SSS',
	)

	/** Clear private draft state and cancel pending callbacks whenever verified context changes. */
	constructor() {
		effect(
			/** Context changes invalidate loaded source and private form state. */ () => {
				const context = this.runtime.context()
				untracked(
					/** Dispose prior requests before starting the current context's read. */ () => {
						this.read?.unsubscribe()
						this.contextGeneration++
						this.contextChanged.next()
						this.source.set(null)
						this.model.set(emptyScheduleForm())
						this.serverErrors.set([])
						this.submitted.set(false)
						this.draft.saving.set(false)
						this.draft.error.set('')
						this.draft.markClean()
						this.state.set('loading')
						if (context) this.load()
					},
				)
			},
		)
		this.destroy.onDestroy(
			/** Release requests and any navigation confirmation. */ () => {
				this.read?.unsubscribe()
				this.contextGeneration++
				this.contextChanged.next()
				this.draft.release()
			},
		)
	}

	/** Load one exact draft or the persisted seed proposal; unavailable data never becomes fake defaults. */
	load(): void {
		this.read?.unsubscribe()
		this.state.set('loading')
		this.message.set('')
		if (!this.runtime.context()?.access.permissions.includes(`${TEMPLATE_PERMISSION}draft`)) {
			this.state.set('denied')
			return
		}
		if (this.id) {
			const version = this.route.snapshot.queryParamMap.get('version')
			if (!version) {
				this.state.set('unavailable')
				this.message.set('Select an exact draft version from the template detail.')
				return
			}
			this.read = this.api
				.detail(this.id, version)
				.pipe(takeUntilDestroyed(this.destroy))
				.subscribe({
					next: /** Only editable drafts enter this route's form. */ (source) => {
						if (source.state !== 'Draft') {
							this.state.set('unavailable')
							this.message.set(
								'Published and retired versions are read-only. Create a successor from the detail.',
							)
							return
						}
						this.source.set(source)
						this.model.set(formFromVersion(source))
						this.draft.markClean()
						this.state.set('content')
					},
					error: /** Keep the read failure explicit. */ (error) => this.failRead(error),
				})
		} else
			this.read = this.api
				.defaults()
				.pipe(takeUntilDestroyed(this.destroy))
				.subscribe({
					next: /** Keep unpaid targets unplaced until the user completes the pattern. */ (
						defaults,
					) => {
						this.model.set(formFromDefaults(defaults))
						this.draft.markClean()
						this.state.set('content')
					},
					error: /** Missing configuration blocks creation rather than inventing values. */ (
						error,
					) => this.failRead(error),
				})
	}

	/** Classify a failed initial read. */
	private failRead(error: unknown): void {
		this.message.set(attendanceErrorMessage(error))
		this.state.set(attendanceReadState(error))
	}

	/** Return safe local validation text for one explicit field or its segment group. */
	fieldError(field: string): string {
		if (!this.submitted() && !this.controlFields().get(field)?.().touched()) return ''
		const error = [...this.errors(), ...this.serverErrors()].find(
			/** Match only this rendered path. */ (item) => item.field === field,
		)
		if (!error) return ''
		if (error.code === 'place-or-change-unpaid-break')
			return 'Place the unpaid intervals to match these minutes, or explicitly change the minutes.'
		if (error.code === 'ordered-contiguous-shift-required')
			return 'Segments must be ordered, contiguous and positive. Use an unpaid interval for a break.'
		return 'Check this value and its related fields.'
	}

	/** Map only declared rendered paths to bound Signal Form controls for blur feedback and focus. */
	private controlFields(): Map<string, () => { touched(): boolean; focusBoundControl(): void }> {
		const result = new Map<string, () => { touched(): boolean; focusBoundControl(): void }>()
		for (const name of [
			'code',
			'name',
			'description',
			'effectiveFrom',
			'effectiveTo',
			'timezoneMode',
			'fixedZone',
			'weekStartsOn',
			'minimumRestMinutes',
			'minimumRestMode',
		] as const)
			result.set(name, this.fields[name])
		for (let d = 0; d < this.model().days.length; d++) {
			const day = this.fields.days[d]
			result.set(`days.${d}.kind`, day.kind)
			result.set(`days.${d}.unpaidMinutes`, day.unpaidMinutes)
			for (let i = 0; i < this.model().days[d].segments.length; i++) {
				const segment = day.segments[i]
				if (!i) result.set(`days.${d}.segments`, segment.startTime)
				for (const field of ['startTime', 'endTime', 'endDayOffset', 'kind'] as const)
					result.set(`days.${d}.segments.${i}.${field}`, segment[field])
			}
		}
		return result
	}

	/** Add an intentionally incomplete interval for explicit user entry. */
	addSegment(index: number): void {
		this.model.update(
			/** Replace only the selected day's interval list. */ (model) => ({
				...model,
				days: model.days.map(
					/** Keep all other days unchanged. */ (day, i) =>
						i === index ? { ...day, segments: [...day.segments, segmentForm()] } : day,
				),
			}),
		)
	}
	/** Remove exactly one interval; complete validation still requires a continuous shift. */
	removeSegment(dayIndex: number, segmentIndex: number): void {
		this.model.update(
			/** Preserve unrelated input while removing the requested interval. */ (model) => ({
				...model,
				days: model.days.map(
					/** Update only the selected day. */ (day, i) => {
						if (i !== dayIndex) return day
						return {
							...day,
							segments: day.segments.filter(
								/** Remove this interval only. */ (_, j) => j !== segmentIndex,
							),
						}
					},
				),
			}),
		)
	}

	/** Explicitly copy the first day's edited pattern to the other work days. */
	copyFirstDay(): void {
		this.model.update(
			/** Clone values so subsequent day edits remain independent. */ (model) => ({
				...model,
				days: model.days.map(
					/** Apply only to already configured working days. */ (day, index) =>
						index && day.kind === 'Work'
							? { ...structuredClone(model.days[0]), weekday: day.weekday }
							: day,
				),
			}),
		)
	}

	/** Preserve the native numeric value; incomplete input remains invalid rather than becoming zero. */
	numericValue(target: EventTarget | null): number {
		const value = (target as { value?: unknown } | null)?.value
		return typeof value === 'number' ? value : Number.NaN
	}

	/** Focus native numeric controls explicitly because their wrapper has no FormField accessor. */
	private focusInvalid(): void {
		const field = this.errors()[0]?.field ?? ''
		let id = ''
		if (field === 'minimumRestMinutes') id = 'schedule-minimum-rest'
		const day = /^days\.(\d+)\.unpaidMinutes$/.exec(field)
		if (day) id = `schedule-unpaid-${day[1]}`
		if (id) {
			const control = this.numericControls().find(
				/** Locate only a declared form control. */ (item) =>
					item.elementRef.nativeElement.id === id,
			)
			void control?.elementRef.nativeElement.focus()
		} else this.controlFields().get(field)?.().focusBoundControl()
	}

	/** Submit through Signal Forms while retaining the same command identity after transport uncertainty. */
	async save(): Promise<void> {
		if (this.draft.saving() || this.state() !== 'content') return
		this.submitted.set(true)
		this.serverErrors.set([])
		this.draft.error.set('')
		let saved: ScheduleVersionView | undefined
		const generation = this.contextGeneration
		await submit(this.fields, {
			onInvalid: /** Focus the first contract field and keep a persistent explanation. */ () => {
				this.draft.error.set('Complete the highlighted fields before saving.')
				this.focusInvalid()
			},
			action: /** Persist or report an unconfirmed command. */ async () => {
				const body = scheduleFromForm(this.model()),
					source = this.source()
				const key = this.draft.key({ source, body })
				const call = source ? this.api.update(source, body, key) : this.api.create(body, key)
				this.draft.saving.set(true)
				try {
					saved = await firstValueFrom(
						call.pipe(takeUntil(this.contextChanged), takeUntilDestroyed(this.destroy)),
					)
					return undefined
				} catch (error) {
					if (generation !== this.contextGeneration || this.destroy.destroyed) return undefined
					this.draft.error.set(attendanceErrorMessage(error))
					if (error instanceof HttpErrorResponse && Array.isArray(error.error?.fieldErrors))
						this.serverErrors.set(error.error.fieldErrors)
					return { kind: 'server', message: attendanceErrorMessage(error) }
				} finally {
					if (generation === this.contextGeneration) this.draft.saving.set(false)
				}
			},
		})
		if (!saved || generation !== this.contextGeneration || this.destroy.destroyed) return
		this.draft.markClean()
		await this.router.navigate([TEMPLATE_ROUTE, saved.id], {
			queryParams: { version: saved.versionId },
		})
	}

	/** Leave through the route guard, which owns the single discard confirmation. */
	cancel(): void {
		void this.router.navigateByUrl(TEMPLATE_ROUTE)
	}
	/** Preserve a dirty editor or an in-flight write during route navigation. */
	canLeave(): Promise<boolean> {
		return this.draft.canLeave()
	}
	/** Warn before browser unload loses an unconfirmed draft. */
	@HostListener('window:beforeunload', ['$event'])
	beforeUnload(event: BeforeUnloadEvent): void {
		if (this.draft.dirty() || this.draft.saving()) event.preventDefault()
	}
}
