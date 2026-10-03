import { HcmDateField } from '@empflowyee/hcm-web-ux-forms'
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	inject,
	input,
	signal,
	viewChild,
	type SimpleChanges,
} from '@angular/core'
import {
	form,
	FormField,
	disabled,
	maxLength,
	required,
	validate,
	submit,
} from '@angular/forms/signals'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { firstValueFrom } from 'rxjs'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { DatePicker } from '@fundamental-ngx/ui5-webcomponents/date-picker'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { HcmDatePipe, HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	WorkSchedulesApi,
	attendanceErrorMessage,
} from '@empflowyee/hcm-web-attendance-data-access'
import { HcmDomainError, type HcmFieldError } from '@empflowyee/hcm-runtime-contract'
import {
	parseWorkAssignment,
	parseWorkAssignmentQuery,
	type WorkAssignmentCommand,
	type HolidayAssignmentOptions,
	type WorkAssignmentView,
	type HolidayReferenceKind,
	type HolidayReferenceOption,
	type ScheduleVersionView,
	type AttendancePolicyVersionView,
	type WorkAssignmentReview,
} from '@empflowyee/hcm-attendance-contract'

/** Focused assignment form inside the configuration's native ObjectPage section; all business data remains server-owned. */
@Component({
	selector: 'ef-hcm-work-assignments',
	imports: [
		HcmDateField,
		FormField,
		Button,
		CheckBox,
		DatePicker,
		Form,
		FormItem,
		Input,
		Label,
		MessageStrip,
		Option,
		Select,
		Text,
		TextArea,
		HcmDiscardDialog,
		HcmDatePipe,
	],
	templateUrl: './assignment-section.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkAssignmentSection {
	readonly source = input.required<ScheduleVersionView | AttendancePolicyVersionView>()
	readonly editable = input(false)
	readonly previewable = input(false)
	readonly family = computed(
		/** Keep assignment families tied to the exact source projection. */ () =>
			'days' in this.source() ? ('Schedule' as const) : ('Policy' as const),
	)
	readonly review = signal<WorkAssignmentReview | null>(null)
	private readonly reviewedInput = signal('')
	readonly reviewCurrent = computed(
		/** Editing any command field invalidates the prior review immediately. */ () =>
			this.reviewedInput() === JSON.stringify(this.model()),
	)
	readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(WorkSchedulesApi)
	private readonly destroy = inject(DestroyRef)
	private readonly targetControl = viewChild<Select>('targetControl')
	private generation = 0
	private currentKey = ''
	private readonly failedModel = signal('')
	readonly model = signal({
		kind: 'Employment',
		targetId: '',
		employmentId: '',
		effectiveFrom: '',
		effectiveTo: '',
		resolutionFrom: '',
		resolutionTo: '',
		reason: '',
		replace: false,
	})
	readonly search = signal('')
	readonly selectedOption = signal('')
	readonly options = signal<HolidayReferenceOption[]>([])
	readonly context = signal<HolidayAssignmentOptions | null>(null)
	readonly current = signal<WorkAssignmentView | null>(null)
	readonly checked = signal(false)
	readonly pending = signal(false)
	readonly submitted = signal(false)
	readonly notice = signal('')
	readonly lookupError = signal('')
	readonly hasMore = signal(false)
	readonly kinds = [
		{ id: 'Tenant', name: 'Whole tenant' },
		{ id: 'LegalEntity', name: 'Legal entity' },
		{ id: 'OrgUnit', name: 'Organizational unit' },
		{ id: 'Department', name: 'Department' },
		{ id: 'Location', name: 'Location' },
		{ id: 'Assignment', name: 'Workforce assignment' },
		{ id: 'Employment', name: 'Employment' },
	]
	readonly dates = [
		{ id: 'effectiveFrom', label: 'Assignment from' },
		{ id: 'effectiveTo', label: 'Assignment through (optional)' },
		{ id: 'resolutionFrom', label: 'Resolve workdays from' },
		{ id: 'resolutionTo', label: 'Resolve workdays through' },
	] as const
	readonly draft = new HcmDraft(
		/** Preserve an uncertain assignment command and dirty input. */ () => this.model(),
	)
	readonly commandError = computed(
		/** Clear stale command errors as the user corrects its input. */ () =>
			this.failedModel() === JSON.stringify(this.model()) ? this.draft.error() : '',
	)
	readonly errors = computed(
		/** Mirror the complete closed server contract while fields are corrected. */ () => {
			try {
				parseWorkAssignment(this.command())
				return [] as HcmFieldError[]
			} catch (error) {
				return error instanceof HcmDomainError ? error.fieldErrors : []
			}
		},
	)
	readonly fields = form(
		this.model,
		/** Signal Forms owns reactive validation and disabled submission state. */ (path) => {
			disabled(path, {
				when: /** Freeze the command body until its result is known. */ () => this.draft.saving(),
			})
			required(path.kind)
			maxLength(path.kind, 20)
			maxLength(path.targetId, 200)
			maxLength(path.employmentId, 200)
			required(path.reason)
			maxLength(path.reason, 2000)
			validate(
				path,
				/** Root validation reuses the same date, scope and reason restrictions as the API. */ () =>
					this.errors().length
						? { kind: 'assignment', message: 'Correct the assignment fields.' }
						: null,
			)
		},
	)
	/** Resolve pending discard prompts when the page changes or is destroyed. */
	constructor() {
		this.destroy.onDestroy(
			/** Release only this form's pending navigation decision. */ () => this.draft.release(),
		)
	}
	/** Offer source coverage as an editable starting point without choosing an employment or scope identity. */
	ngOnInit(): void {
		this.model.update(
			/** A one-date execution window is explicit and independently editable. */ (m) => ({
				...m,
				effectiveFrom: this.source().effectiveFrom,
				effectiveTo: this.source().effectiveTo ?? '',
				resolutionFrom: this.source().effectiveFrom,
				resolutionTo: this.source().effectiveFrom,
			}),
		)
		this.draft.markClean()
	}
	/** Reinitialize a newly selected source only after the owning page's dirty-navigation guard permits it. */
	ngOnChanges(changes: SimpleChanges): void {
		if (!changes['source'] || changes['source'].firstChange) return
		this.resetContext('Employment')
		this.review.set(null)
		this.reviewedInput.set('')
		this.model.update(
			/** Do not carry private reasons or coverage from another configuration. */ (model) => ({
				...model,
				effectiveFrom: this.source().effectiveFrom,
				effectiveTo: this.source().effectiveTo ?? '',
				resolutionFrom: this.source().effectiveFrom,
				resolutionTo: this.source().effectiveFrom,
				reason: '',
			}),
		)
		this.submitted.set(false)
		this.draft.error.set('')
		this.draft.markClean()
	}
	/** Clear dependent selections and responses when the target kind or date changes. */
	resetContext(kind?: string): void {
		this.selectedOption.set('')
		this.generation++
		this.options.set([])
		this.context.set(null)
		this.current.set(null)
		this.checked.set(false)
		this.notice.set('')
		this.lookupError.set('')
		this.pending.set(false)
		this.model.update(
			/** Never carry an ID from one scope dimension into another. */ (m) => ({
				...m,
				kind: kind ?? m.kind,
				targetId: '',
				employmentId: '',
				replace: false,
			}),
		)
	}
	/** Search real owner references only after the explicit effective date is valid. */
	async findOptions(): Promise<void> {
		if (this.draft.saving()) return
		const m = this.model(),
			kind = m.kind
		if (kind === 'Tenant') return
		const mapping: Record<string, HolidayReferenceKind> = {
			LegalEntity: 'legal-entities',
			OrgUnit: 'units',
			Department: 'departments',
			Location: 'locations',
			Employment: 'workers',
			Assignment: 'workers',
		}
		const generation = ++this.generation
		this.lookupError.set('')
		this.pending.set(true)
		try {
			const page = await firstValueFrom(
				this.api
					.assignmentReferences(mapping[kind], this.search(), m.effectiveFrom)
					.pipe(takeUntilDestroyed(this.destroy)),
			)
			if (generation !== this.generation) return
			this.options.set(page.items)
			this.hasMore.set(page.hasMore)
		} catch (error) {
			if (generation === this.generation) this.lookupError.set(attendanceErrorMessage(error))
		} finally {
			if (generation === this.generation) this.pending.set(false)
		}
	}
	/** Resolve explicit worker selection to separate employment and dated assignment choices. */
	async selectOption(id: string): Promise<void> {
		if (this.draft.saving()) return
		this.selectedOption.set(id)
		this.current.set(null)
		this.checked.set(false)
		const kind = this.model().kind
		if (!['Employment', 'Assignment'].includes(kind)) {
			this.model.update(
				/** Keep selection bound to the chosen structure kind. */ (m) => ({
					...m,
					targetId: id,
					replace: false,
				}),
			)
			return
		}
		const generation = ++this.generation
		this.context.set(null)
		this.pending.set(true)
		this.model.update(
			/** A changed worker invalidates every dependent employment or assignment. */ (m) => ({
				...m,
				targetId: '',
				employmentId: '',
				replace: false,
			}),
		)
		try {
			const context = await firstValueFrom(
				this.api
					.assignmentContext(id, this.model().effectiveFrom)
					.pipe(takeUntilDestroyed(this.destroy)),
			)
			if (generation === this.generation) this.context.set(context)
		} catch (error) {
			if (generation === this.generation) this.lookupError.set(attendanceErrorMessage(error))
		} finally {
			if (generation === this.generation) this.pending.set(false)
		}
	}
	/** Discard a previously selected workforce assignment when employment changes. */
	employmentChanged(): void {
		this.model.update(
			/** Concurrent employments cannot share an implicit assignment. */ (m) => ({
				...m,
				targetId: '',
				replace: false,
			}),
		)
		this.checked.set(false)
		this.current.set(null)
	}
	/** Derive a closed exact-target query; caller identity is never part of browser input. */
	private query() {
		const m = this.model(),
			params = new URLSearchParams({ kind: m.kind, asOf: m.effectiveFrom })
		if (m.kind !== 'Tenant') params.set('id', m.kind === 'Employment' ? m.employmentId : m.targetId)
		return parseWorkAssignmentQuery(params)
	}
	/** Read persisted current or historical coverage after reload, without creating work. */
	async checkCurrent(): Promise<void> {
		if (this.pending() || this.draft.saving()) return
		const generation = ++this.generation
		this.lookupError.set('')
		this.checked.set(false)
		this.current.set(null)
		try {
			const query = this.query(),
				key = JSON.stringify(query)
			this.pending.set(true)
			const result = await firstValueFrom(
				this.api
					.currentAssignment(query.target, query.asOf, this.family())
					.pipe(takeUntilDestroyed(this.destroy)),
			)
			if (generation !== this.generation || JSON.stringify(this.query()) !== key) return
			this.currentKey = key
			this.current.set(result)
			this.checked.set(true)
		} catch (error) {
			if (generation === this.generation) this.lookupError.set(attendanceErrorMessage(error))
		} finally {
			if (generation === this.generation) this.pending.set(false)
		}
	}
	/** Compose only approved command fields and an explicitly selected predecessor revision. */
	private command(): WorkAssignmentCommand {
		const m = this.model(),
			query = this.query(),
			target = query.target
		const keys = {
			LegalEntity: 'legalEntityId',
			OrgUnit: 'orgUnitId',
			Department: 'departmentId',
			Location: 'locationId',
			Assignment: 'assignmentId',
			Employment: 'employmentId',
		} as const
		const selector =
			target.kind === 'Tenant' ? { tenantScope: true } : { [keys[target.kind]]: target.id }
		const previous = this.current()
		return {
			...selector,
			versionId: this.source().versionId,
			expectedRevision: this.source().revision,
			effectiveFrom: m.effectiveFrom,
			...(m.effectiveTo ? { effectiveTo: m.effectiveTo } : {}),
			resolutionFrom: m.resolutionFrom,
			resolutionTo: m.resolutionTo,
			reason: m.reason,
			...(m.replace && previous && JSON.stringify(query) === this.currentKey
				? { supersedes: { id: previous.id, expectedRevision: previous.revision } }
				: {}),
		} as WorkAssignmentCommand
	}
	/** Show contract field feedback after an attempt or the corresponding control blur. */
	fieldError(field: keyof ReturnType<typeof this.model>): string {
		if (!this.submitted() && !this.fields[field]().touched()) return ''
		const mapping: Record<string, string> = {
			id: this.model().kind === 'Employment' ? 'employmentId' : 'targetId',
			asOf: 'effectiveFrom',
		}
		return this.errors().some(
			/** Match source field names to their rendered controls. */ (e) =>
				(mapping[e.field] ?? e.field) === field,
		)
			? 'Enter a valid ' + field.replace(/([A-Z])/g, ' $1').toLowerCase() + '.'
			: ''
	}
	/** Use Signal Forms submission state and focus the first invalid rendered field. */
	async assign(): Promise<void> {
		this.submitted.set(true)
		this.failedModel.set(JSON.stringify(this.model()))
		await submit(this.fields, {
			onInvalid: /** Preserve the draft and make its first contract error actionable. */ () => {
				this.draft.error.set('Correct the assignment fields.')
				this.focusError()
			},
			action: /** Preserve command identity until the actual server result is known. */ () =>
				this.saveAssignment(),
		})
	}
	/** Map only declared contract fields to controls; never traverse a server-provided property path. */
	private focusError(): void {
		const first = this.errors()[0]?.field
		if (first === 'id' || first === 'targetId' || (first === 'employmentId' && !this.context())) {
			void this.targetControl()?.elementRef.nativeElement.focus()
			return
		}
		const field = first === 'asOf' ? 'effectiveFrom' : first
		if (
			field &&
			[
				'effectiveFrom',
				'effectiveTo',
				'resolutionFrom',
				'resolutionTo',
				'reason',
				'employmentId',
			].includes(field)
		)
			this.fields[field as 'reason']().focusBoundControl()
		else this.fields.reason().focusBoundControl()
	}
	/** Review real dated impact before allowing the independently authorized assignment command. */
	async preview(): Promise<void> {
		if (!this.previewable() || this.pending() || this.draft.saving()) return
		this.submitted.set(true)
		this.failedModel.set(JSON.stringify(this.model()))
		if (this.errors().length) {
			this.draft.error.set('Correct the assignment fields.')
			this.focusError()
			return
		}
		const generation = ++this.generation,
			input = JSON.stringify(this.model())
		this.review.set(null)
		this.pending.set(true)
		this.draft.error.set('')
		try {
			const review = await firstValueFrom(
				this.api
					.previewAssignment(this.command(), crypto.randomUUID(), this.family())
					.pipe(takeUntilDestroyed(this.destroy)),
			)
			if (generation !== this.generation || input !== JSON.stringify(this.model())) return
			this.review.set(review)
			this.reviewedInput.set(input)
		} catch (error) {
			if (generation === this.generation) this.draft.error.set(attendanceErrorMessage(error))
		} finally {
			if (generation === this.generation) this.pending.set(false)
		}
	}
	/** Commit a validated command once; preserve its key on timeout or uncertain delivery. */
	private async saveAssignment(): Promise<void> {
		if (
			!this.editable() ||
			this.source().state !== 'Published' ||
			this.pending() ||
			this.draft.saving()
		)
			return
		this.submitted.set(true)
		this.failedModel.set(JSON.stringify(this.model()))
		this.notice.set('')
		if (this.errors().length) {
			this.draft.error.set('Correct the assignment fields.')
			this.focusError()
			return
		}
		if (
			this.model().replace &&
			(!this.current() || JSON.stringify(this.query()) !== this.currentKey)
		) {
			this.draft.error.set('Check the current assignment before superseding it.')
			return
		}
		const review = this.review()
		if (!review || !this.reviewCurrent()) {
			this.draft.error.set('Review the current assignment impact before saving.')
			return
		}
		const body = { ...this.command(), previewId: review.previewId, digest: review.digest }
		this.draft.saving.set(true)
		this.draft.error.set('')
		try {
			const result = await firstValueFrom(
				this.api
					.assign(body, this.draft.key(body), this.family())
					.pipe(takeUntilDestroyed(this.destroy)),
			)
			this.current.set(result)
			this.currentKey = JSON.stringify(this.query())
			this.checked.set(true)
			this.model.update(
				/** A confirmed successor becomes the current record, not another pending replacement. */ (
					m,
				) => ({ ...m, replace: false, reason: '' }),
			)
			this.draft.markClean()
			this.submitted.set(false)
			this.notice.set(
				`Assignment saved. ${result.queuedWorkdays} workdays queued; ${result.unavailableWorkdays} unavailable because required inputs could not be resolved.`,
			)
		} catch (error) {
			if (!this.destroy.destroyed) this.draft.error.set(attendanceErrorMessage(error))
		} finally {
			this.draft.saving.set(false)
		}
	}
	/** Use the page's shared dirty-navigation contract for selection changes and route exits. */
	canLeave(): Promise<boolean> {
		return this.draft.canLeave()
	}
}
