import { HcmDateField } from '@empflowyee/hcm-web-ux-forms'
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
import type { HolidayReferenceOption } from '@empflowyee/hcm-attendance-contract'
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
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { StepInput } from '@fundamental-ngx/ui5-webcomponents/step-input'
import { DatePicker } from '@fundamental-ngx/ui5-webcomponents/date-picker'
import { TimePicker } from '@fundamental-ngx/ui5-webcomponents/time-picker'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	HolidayCalendarsApi,
	attendanceErrorMessage,
	attendanceReadState,
} from '@empflowyee/hcm-web-attendance-data-access'
import { HcmDomainError, type HcmFieldError } from '@empflowyee/hcm-runtime-contract'
import type { HolidayVersionView } from '@empflowyee/hcm-attendance-contract'
import {
	holidayForm,
	holidayFromForm,
	holidayEntryForm,
	HOLIDAY_ROUTE,
	HOLIDAY_PERMISSION,
} from './holiday-form'

/** Routed calendar editor preserving explicit dates, applicability and partial-day intervals. */
@Component({
	selector: 'ef-hcm-holiday-calendar-editor',
	imports: [
		HcmDateField,
		FormField,
		Button,
		Form,
		FormItem,
		Label,
		Input,
		Select,
		Option,
		StepInput,
		DatePicker,
		TimePicker,
		Title,
		Text,
		MessageStrip,
		HcmDynamicPage,
		HcmDiscardDialog,
	],
	templateUrl: './editor.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HolidayCalendarEditor {
	private readonly api = inject(HolidayCalendarsApi)
	readonly locations = signal<HolidayReferenceOption[]>([])
	readonly locationQuery = signal('')
	readonly locationError = signal('')
	private locationGeneration = 0
	private readonly route = inject(ActivatedRoute)
	private readonly router = inject(Router)
	private readonly destroy = inject(DestroyRef)
	readonly runtime = inject(HcmRuntimeStore)
	private read?: Subscription
	private readonly contextChanged = new Subject<void>()
	private contextGeneration = 0
	private readonly numericControls = viewChildren(StepInput)
	readonly source = signal<HolidayVersionView | null>(null)
	readonly model = signal(holidayForm())
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly submitted = signal(false)
	readonly serverErrors = signal<HcmFieldError[]>([])
	private failureModel = ''
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
			required(path.effectiveFrom)
			validate(
				path,
				/** Reuse the universal parser as Signal Forms cross-field validation. */ ({ value }) => {
					try {
						holidayFromForm(value())
						return null
					} catch {
						return { kind: 'calendar', message: 'Complete the highlighted calendar fields.' }
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
				holidayFromForm(this.model())
				return []
			} catch (error) {
				return error instanceof HcmDomainError
					? error.fieldErrors
					: [{ field: 'entries', code: 'invalid' }]
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
						this.model.set(holidayForm())
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
		if (!this.runtime.context()?.access.permissions.includes(`${HOLIDAY_PERMISSION}draft`)) {
			this.state.set('denied')
			return
		}
		if (this.id) {
			const version = this.route.snapshot.queryParamMap.get('version')
			if (!version) {
				this.state.set('unavailable')
				this.message.set('Select an exact draft version from the calendar detail.')
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
						this.model.set(holidayForm(source))
						this.findLocations()
						this.draft.markClean()
						this.state.set('content')
					},
					error: /** Keep the read failure explicit. */ (error) => this.failRead(error),
				})
		} else {
			this.model.set(holidayForm())
			this.draft.markClean()
			this.state.set('content')
		}
	}

	/** Query authorized location options without accepting a free-form reference ID. */
	findLocations(): void {
		const generation = ++this.locationGeneration
		this.locations.set([])
		this.locationError.set('')
		if (!this.model().effectiveFrom) {
			this.locationError.set('Enter an effective start date before searching locations.')
			return
		}
		this.api
			.referenceOptions('locations', this.locationQuery(), this.model().effectiveFrom)
			.pipe(takeUntil(this.contextChanged), takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Retain only the latest dated, authorized reference search. */ (items) => {
					if (generation !== this.locationGeneration) return
					this.locations.set(items.items)
					if (items.hasMore)
						this.locationError.set(
							'More than 100 locations match. Narrow the search by name or code.',
						)
				},
				error: /** An unavailable reference picker never fabricates locations. */ () => {
					if (generation !== this.locationGeneration) return
					this.locationError.set(
						'Location choices are unavailable. Retry search or leave location applicability unset.',
					)
				},
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
		const error = [
			...this.errors(),
			...(this.failureModel === JSON.stringify(this.model()) ? this.serverErrors() : []),
		].find(
			/** Match only this rendered path. */ (item) =>
				item.field
					.replace('.overlapOffset.start', '.startOverlap')
					.replace('.overlapOffset.end', '.endOverlap')
					.replace('.overlapOffset', '.startOverlap') === field,
		)
		if (!error) return ''
		if (error.code === 'ordered-interval-required')
			return 'End time must be later than start time on the same day.'
		if (error.code === 'outside-effective-period')
			return 'Observed date must fall within this calendar version’s effective dates.'
		if (error.code === 'not-applicable')
			return 'Repeated-time choices require a partial-day interval.'
		return 'Check this value and its related fields.'
	}

	/** Map only declared rendered paths to bound Signal Form controls for blur feedback and focus. */
	private controlFields(): Map<string, () => { touched(): boolean; focusBoundControl(): void }> {
		const result = new Map<string, () => { touched(): boolean; focusBoundControl(): void }>()
		for (const name of ['code', 'name', 'effectiveFrom', 'effectiveTo'] as const)
			result.set(name, this.fields[name])
		for (let i = 0; i < this.model().entries.length; i++) {
			const entry = this.fields.entries[i]
			for (const name of [
				'date',
				'observedDate',
				'category',
				'priority',
				'name',
				'regionCode',
				'locationId',
				'startTime',
				'endTime',
				'startOverlap',
				'endOverlap',
			] as const)
				result.set(`entries.${i}.${name}`, entry[name])
		}
		return result
	}

	/** Add an incomplete holiday row for explicit dates, category and priority entry. */
	addEntry(): void {
		this.model.update(
			/** Preserve all other draft fields. */ (model) => ({
				...model,
				entries: [...model.entries, holidayEntryForm()],
			}),
		)
	}
	/** Remove only the selected editable holiday; historical versions remain unchanged. */
	removeEntry(index: number): void {
		this.model.update(
			/** Retain the order of the remaining entries. */ (model) => ({
				...model,
				entries: model.entries.filter(/** Exclude the requested row. */ (_, i) => i !== index),
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
		const match = /^entries\.(\d+)\.priority$/.exec(field)
		const id = match ? `holiday-priority-${match[1]}` : ''
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
		let saved: HolidayVersionView | undefined
		const generation = this.contextGeneration
		await submit(this.fields, {
			onInvalid: /** Focus the first contract field and keep a persistent explanation. */ () => {
				this.draft.error.set('Complete the highlighted calendar fields before saving.')
				this.focusInvalid()
			},
			action: /** Persist or report an unconfirmed command. */ async () => {
				const body = holidayFromForm(this.model()),
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
					if (error instanceof HttpErrorResponse && Array.isArray(error.error?.fieldErrors)) {
						this.failureModel = JSON.stringify(this.model())
						this.serverErrors.set(error.error.fieldErrors)
					}
					return { kind: 'server', message: attendanceErrorMessage(error) }
				} finally {
					if (generation === this.contextGeneration) this.draft.saving.set(false)
				}
			},
		})
		if (!saved || generation !== this.contextGeneration || this.destroy.destroyed) return
		this.draft.markClean()
		await this.router.navigate([HOLIDAY_ROUTE, saved.id], {
			queryParams: { version: saved.versionId },
		})
	}

	/** Leave through the route guard, which owns the single discard confirmation. */
	cancel(): void {
		void this.router.navigateByUrl(HOLIDAY_ROUTE)
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
