import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	Injector,
	afterNextRender,
	HostListener,
	computed,
	effect,
	inject,
	signal,
	untracked,
	viewChild,
} from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { HttpErrorResponse } from '@angular/common/http'
import { form, FormField, disabled, validate, submit } from '@angular/forms/signals'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { firstValueFrom, Subject, takeUntil } from 'rxjs'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { ComboBox } from '@fundamental-ngx/ui5-webcomponents/combo-box'
import { ComboBoxItem } from '@fundamental-ngx/ui5-webcomponents/combo-box-item'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import type { HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmDraft, HcmDiscardDialog } from '@empflowyee/hcm-web-ux-forms'
import { HcmRuntimeStore, HcmDatePipe } from '@empflowyee/hcm-web-runtime-context'
import {
	AttendanceSegmentFields,
	segmentForm,
	type SegmentForm,
} from '@empflowyee/hcm-web-attendance-ui-schedule-pattern'
import {
	WorkSchedulesApi,
	attendanceErrorMessage,
	attendanceReadState,
} from '@empflowyee/hcm-web-attendance-data-access'
import {
	parseConfigurationReason,
	parseWorkdayQuery,
	type AttendanceOverrideView,
	type AttendanceOverrideReview,
	type WorkdayView,
} from '@empflowyee/hcm-attendance-contract'
import { HcmDomainError, type HcmFieldError } from '@empflowyee/hcm-runtime-contract'
import { emptyOverrideForm, overrideFromForm } from './override-form'
import { SCHEDULE_ROUTE, SCHEDULE_PERMISSION } from './schedule-form'

/** Translate editable overlap controls to their exact universal DTO error locations. */
function segmentPath(key: keyof SegmentForm): string {
	if (key === 'startOverlap') return 'overlapOffset.start'
	if (key === 'endOverlap') return 'overlapOffset.end'
	return key
}

/** Edit one exact dated replacement and review real source approval progress in a native page-backed workspace. */
@Component({
	selector: 'ef-hcm-override-editor',
	imports: [
		FormField,
		Button,
		Form,
		FormItem,
		Label,
		Select,
		Option,
		ComboBox,
		ComboBoxItem,
		TextArea,
		Text,
		MessageStrip,
		ObjectStatusComponent,
		HcmObjectPage,
		HcmObjectSection,
		HcmDiscardDialog,
		HcmDatePipe,
		AttendanceSegmentFields,
	],
	templateUrl: './override-editor.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttendanceOverrideEditor {
	readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(WorkSchedulesApi)
	private readonly route = inject(ActivatedRoute)
	private readonly router = inject(Router)
	private readonly destroy = inject(DestroyRef)
	private readonly injector = inject(Injector)
	private readonly page = viewChild(HcmObjectPage)
	private readonly addInterval = viewChild<Button>('addInterval')
	private readonly changed = new Subject<void>()
	private generation = 0
	readonly source = signal<AttendanceOverrideView | null>(null)
	readonly basis = signal<Extract<WorkdayView, { state: 'Published' }> | null>(null)
	readonly review = signal<AttendanceOverrideReview | null>(null)
	readonly model = signal(emptyOverrideForm())
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly submitted = signal(false)
	readonly serverErrors = signal<HcmFieldError[]>([])
	readonly uncertain = signal(false)
	readonly retryOperation = signal<'create' | 'preview' | 'submit' | null>(null)
	readonly draft = new HcmDraft(
		/** Track unsaved narrative and intervals with the maintained retry/discard implementation. */ () =>
			this.model(),
	)
	readonly zones = ['UTC', ...Intl.supportedValuesOf('timeZone')]
	readonly timeFormat = computed(
		/** Follow account preferences without losing milliseconds. */ () =>
			this.runtime.preferences().timeFormat === '12h' ? 'hh:mm:ss.SSS a' : 'HH:mm:ss.SSS',
	)
	readonly errors = computed(
		/** Mirror the authoritative command parser before issuing HTTP. */ () => {
			try {
				const source = this.source(),
					basis = this.basis()
				if (source)
					parseConfigurationReason({
						expectedRevision: source.revision,
						reason: this.model().reason,
					})
				else if (basis)
					overrideFromForm(this.model(), {
						employmentId: basis.employmentId,
						workDate: basis.workDate,
						workdayRevision: basis.revision,
					})
				return []
			} catch (error) {
				return error instanceof HcmDomainError
					? error.fieldErrors
					: [{ field: 'segments', code: 'invalid' }]
			}
		},
	)
	readonly fields = form(
		this.model,
		/** Keep source evidence immutable and disable edits while a write is unconfirmed. */ (
			path,
		) => {
			disabled(path, {
				when: /** A transport timeout must be recovered using identical input. */ () =>
					this.draft.saving() || this.uncertain(),
			})
			for (const field of [path.kind, path.zone])
				disabled(field, {
					when: /** Saved source intervals are immutable through these delivered commands. */ () =>
						!!this.source(),
				})
			disabled(path.segments, {
				when: /** Saved interval evidence is read-only in this workspace. */ () => !!this.source(),
			})
			validate(
				path,
				/** Bind closed parsing to Signal Forms submit and correction state. */ () =>
					this.errors().length
						? { kind: 'override', message: 'Complete the highlighted fields.' }
						: null,
			)
		},
	)
	/** Cancel old requests and private state whenever the verified tenant/persona context changes. */
	constructor() {
		effect(
			/** Observe only verified runtime identity as a reload trigger. */ () => {
				const context = this.runtime.context()
				untracked(
					/** Dispose the old context before reading any new source. */ () => {
						this.generation++
						this.changed.next()
						this.source.set(null)
						this.basis.set(null)
						this.review.set(null)
						this.model.set(emptyOverrideForm())
						this.uncertain.set(false)
						this.draft.saving.set(false)
						this.draft.markClean()
						if (context) void this.load()
					},
				)
			},
		)
		this.destroy.onDestroy(
			/** Prevent late callbacks and unresolved navigation after route destruction. */ () => {
				this.generation++
				this.changed.next()
				this.changed.complete()
				this.draft.release()
			},
		)
	}
	/** Read the exact saved override or current published workday selected by the inspection route. */
	async load(): Promise<void> {
		const generation = ++this.generation
		this.changed.next()
		this.state.set('loading')
		this.source.set(null)
		this.basis.set(null)
		this.message.set('')
		this.review.set(null)
		const id = this.route.snapshot.paramMap.get('overrideId')
		if (!this.allowed(id ? 'read' : 'manage')) {
			this.state.set('denied')
			return
		}
		try {
			if (id) {
				const source = await firstValueFrom(
					this.api.override(id).pipe(takeUntil(this.changed), takeUntilDestroyed(this.destroy)),
				)
				if (generation !== this.generation) return
				this.source.set(source)
				this.model.set({
					kind: source.segments.length ? 'Work' : 'Rest',
					zone: source.zone,
					segments: source.segments.map(segmentForm),
					reason: '',
				})
			} else {
				const employmentId = this.route.snapshot.queryParamMap.get('employmentId') ?? '',
					workDate = this.route.snapshot.queryParamMap.get('workDate') ?? ''
				const query = parseWorkdayQuery(
					new URLSearchParams({ employmentId, from: workDate, to: workDate }),
				)
				const page = await firstValueFrom(
					this.api.workdays(query).pipe(takeUntil(this.changed), takeUntilDestroyed(this.destroy)),
				)
				if (generation !== this.generation) return
				const basis = page.items.find(
					/** Preserve exact selected employment and date. */ (day) =>
						day.employmentId === employmentId && day.workDate === workDate,
				)
				if (!basis || basis.state !== 'Published') throw new HcmDomainError('record-incomplete')
				this.basis.set(basis)
				this.model.set(emptyOverrideForm(basis.zone))
			}
			this.serverErrors.set([])
			this.submitted.set(false)
			this.draft.markClean()
			this.state.set('content')
		} catch (error) {
			if (generation === this.generation && !this.destroy.destroyed) {
				this.state.set(attendanceReadState(error))
				this.message.set(attendanceErrorMessage(error))
			}
		}
	}
	/** Runtime permissions shape actions only; every operation reauthorizes independently on the server. */
	allowed(operation: string): boolean {
		return (
			this.runtime.context()?.access.permissions.includes(SCHEDULE_PERMISSION + operation) ?? false
		)
	}
	/** Enumerate only rendered controls when mapping local and server validation. */
	private controls() {
		const result = new Map<string, () => { touched(): boolean; focusBoundControl(): void }>()
		result.set('kind', this.fields.kind)
		result.set('zone', this.fields.zone)
		result.set('reason', this.fields.reason)
		for (const [index] of this.model().segments.entries())
			for (const key of [
				'kind',
				'startTime',
				'endTime',
				'endDayOffset',
				'startOverlap',
				'endOverlap',
			] as const)
				result.set(`segments.${index}.${segmentPath(key)}`, this.fields.segments[index][key])
		return result
	}
	/** Reveal the correction section before focusing its rendered native field. */
	private focusError(field: string): void {
		this.page()?.selectSection('replacement')
		afterNextRender(
			/** Wait for Angular to reveal the selected native tab content. */ () => {
				if (this.destroy.destroyed) return
				if (field === 'segments' && !this.model().segments.length)
					void this.addInterval()?.elementRef.nativeElement.focus()
				else
					this.controls()
						.get(field === 'segments' ? 'segments.0.startTime' : field)?.()
						.focusBoundControl()
			},
			{ injector: this.injector },
		)
	}
	/** Preserve source lifecycle meaning through maintained semantic status controls. */
	status(): 'positive' | 'negative' | 'informative' | 'neutral' {
		const state = this.source()?.approval?.state ?? this.source()?.state
		if (state === 'Approved') return 'positive'
		if (state === 'Rejected' || state === 'Invalidated') return 'negative'
		if (state === 'Cancelled' || state === 'Superseded') return 'neutral'
		return 'informative'
	}
	/** Keep accessible field feedback reactive after blur or attempted submission. */
	error(field: string): string {
		if (!this.submitted() && !this.controls().get(field)?.().touched()) return ''
		const invalid = [...this.errors(), ...this.serverErrors()].some(
			/** Match an exact declared field. */ (issue) => issue.field === field,
		)
		if (!invalid) return ''
		return field === 'reason'
			? 'Enter a reason of 1–2,000 characters; whitespace alone is not valid.'
			: 'Check this value and its related interval fields.'
	}
	/** Pass field-specific feedback to the shared maintained interval controls. */
	segmentErrors(index: number): Partial<Record<keyof SegmentForm, string>> {
		const result: Partial<Record<keyof SegmentForm, string>> = {}
		for (const key of [
			'kind',
			'startTime',
			'endTime',
			'endDayOffset',
			'startOverlap',
			'endOverlap',
		] as const)
			result[key] = this.error(`segments.${index}.${segmentPath(key)}`)
		return result
	}
	/** Add incomplete native interval controls for explicit user entry. */
	addSegment(): void {
		this.model.update(
			/** Retain existing local interval input. */ (value) => ({
				...value,
				segments: [...value.segments, segmentForm()],
			}),
		)
	}
	/** Remove only the selected interval; the server still requires ordered contiguous work. */
	removeSegment(index: number): void {
		this.model.update(
			/** Keep all other intervals intact. */ (value) => ({
				...value,
				segments: value.segments.filter(/** Select every other interval. */ (_, i) => i !== index),
			}),
		)
	}
	/** Save, review or submit through real commands, retaining the same key after an uncertain transport outcome. */
	async act(operation: 'create' | 'preview' | 'submit'): Promise<void> {
		if (this.draft.saving() || this.state() !== 'content') return
		if (this.uncertain() && this.retryOperation() !== operation) return
		this.retryOperation.set(operation)
		this.submitted.set(true)
		this.serverErrors.set([])
		this.message.set('')
		const generation = this.generation
		await submit(this.fields, {
			onInvalid: /** Preserve input and focus an actual invalid native field. */ () => {
				this.message.set('Complete the highlighted fields.')
				this.focusError(this.errors()[0]?.field ?? 'kind')
			},
			action:
			/** Every success is a persisted API result, never an optimistic approval. */ async () => {
				const source = this.source(),
					basis = this.basis(),
					review = this.review()
				if (!source && !basis)
					return { kind: 'source', message: 'Reload current workday evidence.' }
				if (operation === 'submit' && (!source || !review?.approvalRequired || source.approval))
					return { kind: 'source', message: 'Review a draft that requires independent approval.' }
				const body = source
					? {
						expectedRevision: source.revision,
						reason: this.model().reason,
						...(operation === 'submit' && review
							? { previewId: review.previewId, digest: review.digest }
							: {}),
					}
					: this.createBody()
				const key = this.draft.key({ operation, id: source?.id, body })
				this.draft.saving.set(true)
				try {
					if (operation === 'create' && !source) {
						const result = await firstValueFrom(
							this.api
								.createOverride(body as ReturnType<typeof overrideFromForm>, key)
								.pipe(takeUntil(this.changed), takeUntilDestroyed(this.destroy)),
						)
						if (generation !== this.generation) return undefined
						this.uncertain.set(false)
						this.draft.markClean()
						this.draft.saving.set(false)
						await this.router.navigate([SCHEDULE_ROUTE, 'override', result.id])
					} else if (source && operation === 'preview') {
						const result = await firstValueFrom(
							this.api
								.previewOverride(source.id, parseConfigurationReason(body), key)
								.pipe(takeUntil(this.changed), takeUntilDestroyed(this.destroy)),
						)
						if (generation !== this.generation) return undefined
						this.review.set(result)
						this.page()?.selectSection('review')
						this.uncertain.set(false)
						this.draft.markClean()
					} else if (source && operation === 'submit' && review) {
						await firstValueFrom(
							this.api
								.submitOverride(
									source.id,
									{
										...parseConfigurationReason(body),
										previewId: review.previewId,
										digest: review.digest,
									},
									key,
								)
								.pipe(takeUntil(this.changed), takeUntilDestroyed(this.destroy)),
						)
						if (generation !== this.generation) return undefined
						this.uncertain.set(false)
						this.draft.markClean()
						this.draft.saving.set(false)
						await this.load()
					}
					return undefined
				} catch (error) {
					if (generation !== this.generation || this.destroy.destroyed) return undefined
					this.message.set(attendanceErrorMessage(error))
					this.uncertain.set(
						!(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500,
					)
					if (error instanceof HttpErrorResponse && Array.isArray(error.error?.fieldErrors))
						this.serverErrors.set(error.error.fieldErrors)
					this.focusError(this.serverErrors()[0]?.field ?? 'reason')
					return { kind: 'server', message: attendanceErrorMessage(error) }
				} finally {
					if (generation === this.generation) this.draft.saving.set(false)
				}
			},
		})
	}
	/** Return to the containing app through its dirty-navigation guard. */
	back(): void {
		void this.router.navigate([SCHEDULE_ROUTE])
	}
	/** Require the successfully loaded workday before constructing a source command. */
	private createBody() {
		const basis = this.basis()
		if (!basis) throw new HcmDomainError('record-incomplete')
		return overrideFromForm(this.model(), {
			employmentId: basis.employmentId,
			workDate: basis.workDate,
			workdayRevision: basis.revision,
		})
	}
	/** Display exact duration with an explicit unit and preserve fractional seconds. */
	duration(value: string): string {
		const milliseconds = BigInt(value),
			minutes = milliseconds / 60000n,
			remainder = milliseconds % 60000n
		return (
			minutes.toString() +
			' min' +
			(remainder ? ' ' + (Number(remainder) / 1000).toString() + ' sec' : '')
		)
	}
	/** Keep unresolved writes recoverable and use the maintained native discard dialog for unsaved input. */
	canLeave(): Promise<boolean> {
		return this.uncertain() ? Promise.resolve(false) : this.draft.canLeave()
	}
	/** Warn before browser unload loses unsaved or unconfirmed work. */
	@HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent): void {
		if (this.draft.dirty() || this.draft.saving() || this.uncertain()) event.preventDefault()
	}
}
