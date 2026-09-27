import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	type OnDestroy,
	type OnInit,
	computed,
	inject,
	signal,
} from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { HttpErrorResponse } from '@angular/common/http'
import { switchMap, of, type Observable } from 'rxjs'
import { form, FormField, maxLength, pattern, required } from '@angular/forms/signals'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { StepInput } from '@fundamental-ngx/ui5-webcomponents/step-input'
import { DatePicker } from '@fundamental-ngx/ui5-webcomponents/date-picker'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { BusyIndicator } from '@fundamental-ngx/ui5-webcomponents/busy-indicator'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import {
	HcmWizardPage,
	HcmWizardStep,
	type HcmWizardMove,
	type HcmWizardState,
} from '@empflowyee/hcm-web-ux-floorplan-wizard'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { HcmDatePipe, HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	CHANGE_FIELD_LABELS,
	EmploymentChangesApi,
	changesErrorMessage,
	employeeDenied,
} from '@empflowyee/hcm-web-employee-data-access'
import {
	CHANGE_TYPES,
	CHANGE_TYPE_RULES,
	CLEARABLE_TARGETS,
	EMPLOYMENT_TYPES,
	WORK_MODES,
	backdatingLimit,
	type ChangeContextAssignmentDto,
	type ChangeContextEmploymentDto,
	type ChangeOptionKind,
	type ChangeType,
	type EmploymentChangeRequestDto,
	type TargetField,
	type WorkerChangeContextDto,
} from '@empflowyee/hcm-employee-contract'
import {
	BASE_ROUTE,
	CHANGE_TYPE_LABELS,
	EMPLOYMENT_STATUS_LABELS,
	EMPLOYMENT_TYPE_LABELS,
	REASON_LABELS,
	REQUEST_PERMISSION,
	WORK_MODE_LABELS,
	addDays,
	comparisonText,
	isoToday,
} from './labels'
import { ChangeOptionBox, type OptionRef } from './option-box.component'

const STEPS = ['worker', 'type', 'details', 'review'] as const
type Step = (typeof STEPS)[number]
type RefField =
	| 'legalEntityId'
	| 'workerTypeId'
	| 'unitId'
	| 'departmentId'
	| 'designationId'
	| 'locationId'
	| 'positionId'
	| 'managerWorkerId'

/** Reference fields and the option kind that supplies them. */
const REF_KINDS: Record<RefField, ChangeOptionKind> = {
	legalEntityId: 'legal-entities',
	workerTypeId: 'worker-types',
	unitId: 'units',
	departmentId: 'departments',
	designationId: 'designations',
	locationId: 'locations',
	positionId: 'positions',
	managerWorkerId: 'managers',
}
const ENGAGED = ['Pending', 'Active', 'OnNotice', 'Suspended']

/** One comparison row shown on review. */
interface ReviewRow {
	field: string
	current: string
	proposed: string
}

/**
 * Dedicated wizard route to raise or edit an employment change request. The Details step renders
 * only the target facts of the chosen type, prefilled with current facts; only changed facts are
 * proposed. Review creates or updates the draft and submits it, each with one retained key.
 */
@Component({
	selector: 'ef-hcm-change-wizard',
	imports: [
		FormField,
		ObjectStatusComponent,
		Form,
		FormItem,
		Label,
		Input,
		Select,
		Option,
		StepInput,
		DatePicker,
		TextArea,
		Text,
		BusyIndicator,
		MessageStrip,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		HcmWizardPage,
		HcmWizardStep,
		HcmDiscardDialog,
		HcmDatePipe,
		ChangeOptionBox,
	],
	templateUrl: './change-wizard.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangeWizardComponent implements OnInit, OnDestroy {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(EmploymentChangesApi)
	private readonly destroy = inject(DestroyRef)
	readonly typeLabels = CHANGE_TYPE_LABELS
	readonly reasonLabels = REASON_LABELS
	readonly fieldLabels = CHANGE_FIELD_LABELS
	readonly employmentTypes = EMPLOYMENT_TYPES
	readonly employmentLabels = EMPLOYMENT_TYPE_LABELS
	readonly statusLabels = EMPLOYMENT_STATUS_LABELS
	readonly workModes = WORK_MODES
	readonly workModeLabels = WORK_MODE_LABELS
	readonly refKinds = REF_KINDS
	readonly state = signal<HcmWizardState>('loading')
	readonly message = signal('')
	readonly current = signal<Step>('worker')
	readonly reachable = signal<Step>('worker')
	readonly touched = signal<Record<Step, boolean>>({
		worker: false,
		type: false,
		details: false,
		review: false,
	})
	/** The draft being edited, when the route names one. */
	readonly editing = signal<EmploymentChangeRequestDto | null>(null)
	/** The draft saved by an earlier finish whose submission failed, with the body it holds. */
	private saved: { request: EmploymentChangeRequestDto; body: string } | null = null
	readonly worker = signal<OptionRef | null>(null)
	readonly context = signal<WorkerChangeContextDto | null>(null)
	readonly contextState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle')
	readonly model = signal({
		employmentId: '',
		changeType: '',
		effectiveDate: isoToday(),
		reasonCode: '',
		reasonDetail: '',
		evidenceReference: '',
		employmentType: '',
		workMode: '',
		jobTitle: '',
		costCenterCode: '',
		continuousServiceStartDate: '',
		probationEndDate: '',
	})
	readonly refs = signal<Record<RefField, OptionRef | null>>(this.emptyRefs())
	readonly numbers = signal<{
		noticePeriodDays: number | null
		fullTimeEquivalent: number | null
		standardHoursPerWeek: number | null
	}>({
		noticePeriodDays: null,
		fullTimeEquivalent: null,
		standardHoursPerWeek: null,
	})
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.changeType)
			required(path.effectiveDate)
			required(path.reasonCode)
			required(path.reasonDetail)
			pattern(path.reasonDetail, /\S/)
			maxLength(path.reasonDetail, 1000)
			maxLength(path.evidenceReference, 200)
			maxLength(path.jobTitle, 150)
			maxLength(path.costCenterCode, 40)
		},
	)
	readonly type = computed(
		/** The chosen change type. */ () => (this.model().changeType || null) as ChangeType | null,
	)
	readonly rule = computed(
		/** The chosen type's rule. */ () => {
			const type = this.type()
			return type ? CHANGE_TYPE_RULES[type] : null
		},
	)
	readonly allowed = computed(
		/** Target facts of the chosen type. */ () => new Set<TargetField>(this.rule()?.allowed ?? []),
	)
	readonly employment = computed(
		/** The chosen employment. */ (): ChangeContextEmploymentDto | null =>
			this.context()?.employments.find(
				/** Chosen. */ (item) => item.employmentId === this.model().employmentId,
			) ?? null,
	)
	readonly assignment = computed(
		/** The chosen employment's primary open assignment. */ (): ChangeContextAssignmentDto | null => {
			const all = this.context()?.assignments.filter(
				/** Of the employment. */ (item) => item.employmentId === this.model().employmentId,
			)
			return all?.find(/** Primary. */ (item) => item.primary) ?? all?.[0] ?? null
		},
	)
	readonly types = computed(
		/** Types that fit the worker: Rehire only without an engaged employment. */ () => {
			const context = this.context()
			if (!context) return []
			return CHANGE_TYPES.filter(
				/** Available. */ (type) =>
					type === 'Rehire' ? context.rehireAllowed : context.employments.length > 0,
			)
		},
	)
	readonly minDate = computed(
		/** DEC-HCM2-002: the earliest effective date for the type. */ () =>
			addDays(isoToday(), -backdatingLimit(this.type() ?? 'Transfer')),
	)
	readonly reasons = computed(/** Reason codes of the type. */ () => this.rule()?.reasons ?? [])
	readonly targets = computed(
		/** Only changed facts; a cleared optional fact is proposed as none. */ () => {
			const type = this.type()
			const rule = this.rule()
			if (!type || !rule) return {}
			const result: Record<string, unknown> = {}
			for (const field of rule.allowed) {
				const value = this.valueOf(field)
				const current = type === 'Rehire' ? null : this.currentOf(field)
				if (value === current) continue
				if (value === null) {
					if (current !== null && CLEARABLE_TARGETS.includes(field)) result[field] = null
					continue
				}
				result[field] = value
			}
			return result
		},
	)
	readonly missing = computed(
		/** Required facts of the type that are empty. */ () =>
			(this.rule()?.required ?? []).filter(/** Empty. */ (field) => this.valueOf(field) === null),
	)
	readonly unchanged = computed(
		/** A type that needs a target has none. */ () =>
			this.rule()?.needsTarget === true && Object.keys(this.targets()).length === 0,
	)
	readonly review = computed(
		/** Current against proposed text for review. */ (): ReviewRow[] => {
			const rows: ReviewRow[] = []
			const type = this.type()
			for (const [field, value] of Object.entries(this.targets()))
				rows.push({
					field,
					current:
						type === 'Rehire'
							? '—'
							: this.display(field as TargetField, this.currentOf(field as TargetField)),
					proposed: this.display(field as TargetField, value as string | number | null),
				})
			const status = this.rule()?.status
			if (status)
				rows.push({
					field: 'employmentStatus',
					current: comparisonText('employmentStatus', this.employment()?.employmentStatus ?? null),
					proposed: comparisonText('employmentStatus', status),
				})
			return rows
		},
	)
	readonly body = computed(
		/** The request of the draft. */ () => {
			const v = this.model()
			return {
				workerId: this.worker()?.id ?? '',
				...(this.type() === 'Rehire' ? {} : { employmentId: v.employmentId }),
				changeType: v.changeType,
				effectiveDate: v.effectiveDate,
				targets: this.targets(),
				reasonCode: v.reasonCode,
				reasonDetail: v.reasonDetail.trim(),
				...(v.evidenceReference.trim() ? { evidenceReference: v.evidenceReference.trim() } : {}),
			}
		},
	)
	readonly draft = new HcmDraft(/** Track the draft. */ () => ({ body: this.body() }))
	readonly title = computed(
		/** Page title. */ () => (this.editing() ? 'Edit change request' : 'New change request'),
	)
	private allowLeave = false

	/** Start a new request, or load the draft the route names. */
	ngOnInit(): void {
		if (this.runtime.context()?.access.permissions.includes(REQUEST_PERMISSION) !== true) {
			this.state.set('denied')
			return
		}
		const id = this.route.snapshot.paramMap.get('requestId')
		if (!id) {
			this.state.set('content')
			this.draft.markClean()
			return
		}
		this.api
			.read(id)
			.pipe(
				switchMap(
					/** Load the worker's facts with the draft. */ (request) => {
						this.editing.set(request)
						return this.api.context(request.workerId)
					},
				),
				takeUntilDestroyed(this.destroy),
			)
			.subscribe({
				next: /** Prefill the draft. */ (context) =>
					this.prefill(this.editing() as EmploymentChangeRequestDto, context),
				error: /** Truthful failure. */ (error) => {
					this.message.set(changesErrorMessage(error))
					this.state.set(employeeDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Prefill the wizard from a draft and its worker's facts. */
	private prefill(request: EmploymentChangeRequestDto, context: WorkerChangeContextDto): void {
		if (request.status !== 'Draft' || !request.actions.edit) {
			this.message.set('Only your own drafts can be edited.')
			this.state.set('error')
			return
		}
		this.worker.set({ id: request.workerId, name: request.workerName })
		this.context.set(context)
		this.contextState.set('ready')
		this.model.update(
			/** Request facts. */ (v) => ({
				...v,
				employmentId: request.employmentId ?? '',
				changeType: request.changeType,
				effectiveDate: request.effectiveDate,
				reasonCode: request.reasonCode,
				reasonDetail: request.reasonDetail,
				evidenceReference: request.evidenceReference,
			}),
		)
		this.resetDetails()
		const t = request.targets as Record<string, unknown>
		for (const row of request.comparison) {
			const field = row.field as TargetField
			if (!(field in t)) continue
			const value = t[field]
			if (field in REF_KINDS)
				this.setRef(
					field as RefField,
					value ? { id: String(value), name: row.proposed ?? String(value) } : null,
				)
			else this.setValue(field, value as string | number | null)
		}
		this.reachable.set('review')
		this.current.set('details')
		this.state.set('content')
		this.draft.markClean()
	}

	/** Empty references. */
	private emptyRefs(): Record<RefField, OptionRef | null> {
		return {
			legalEntityId: null,
			workerTypeId: null,
			unitId: null,
			departmentId: null,
			designationId: null,
			locationId: null,
			positionId: null,
			managerWorkerId: null,
		}
	}

	/** Choose the worker and load their current facts. */
	chooseWorker(worker: OptionRef | null): void {
		this.worker.set(worker)
		this.context.set(null)
		this.model.update(
			/** New subject. */ (v) => ({ ...v, employmentId: '', changeType: '', reasonCode: '' }),
		)
		if (!worker) {
			this.contextState.set('idle')
			return
		}
		this.contextState.set('loading')
		this.api
			.context(worker.id)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the facts. */ (context) => {
					this.context.set(context)
					const primary =
						context.employments.find(
							/** Engaged primary. */ (item) =>
								item.primary && ENGAGED.includes(item.employmentStatus ?? ''),
						) ?? context.employments.at(-1)
					this.model.update(
						/** Default employment. */ (v) => ({ ...v, employmentId: primary?.employmentId ?? '' }),
					)
					this.contextState.set('ready')
				},
				error: /** Explain and keep the step blocked. */ (error) => {
					this.message.set(changesErrorMessage(error))
					this.contextState.set('error')
				},
			})
	}

	/** Choose the change type; its reason list and details start over. */
	chooseType(value: string): void {
		this.model.update(/** New type. */ (v) => ({ ...v, changeType: value, reasonCode: '' }))
		this.resetDetails()
	}

	/** Prefill the details with the current facts of the chosen employment. */
	private resetDetails(): void {
		const rehire = this.type() === 'Rehire'
		const a = rehire ? null : this.assignment()
		const e = rehire ? null : this.employment()
		/** A reference, or none. */
		const ref = (value: { id: string; name: string } | null | undefined) =>
			value ? { id: value.id, name: value.name } : null
		this.refs.set({
			legalEntityId: ref(e?.legalEntity),
			workerTypeId: rehire ? null : ref(this.context()?.workerType),
			unitId: ref(a?.unit),
			departmentId: ref(a?.department),
			designationId: ref(a?.designation),
			locationId: ref(a?.location),
			positionId: ref(a?.position),
			managerWorkerId: ref(a?.manager),
		})
		this.model.update(
			/** Current text facts. */ (v) => ({
				...v,
				employmentType: e?.employmentType ?? '',
				workMode: a?.workMode ?? '',
				jobTitle: a?.jobTitle ?? '',
				costCenterCode: a?.costCenterCode ?? '',
				continuousServiceStartDate: e?.continuousServiceStartDate ?? '',
				probationEndDate: e?.probationEndDate ?? '',
			}),
		)
		this.numbers.set({
			noticePeriodDays: e?.noticePeriodDays ?? null,
			fullTimeEquivalent: a?.fullTimeEquivalent ?? (rehire ? 1 : null),
			standardHoursPerWeek: a?.standardHoursPerWeek ?? null,
		})
	}

	/** The value of a target fact in the draft; empty means none. */
	private valueOf(field: TargetField): string | number | null {
		if (field in REF_KINDS) return this.refs()[field as RefField]?.id ?? null
		if (
			field === 'noticePeriodDays' ||
			field === 'fullTimeEquivalent' ||
			field === 'standardHoursPerWeek'
		)
			return this.numbers()[field]
		const value = (this.model() as Record<string, string>)[field] ?? ''
		return field === 'jobTitle' || field === 'costCenterCode' ? value.trim() || null : value || null
	}

	/** The current value of a target fact for the chosen employment. */
	private currentOf(field: TargetField): string | number | null {
		const a = this.assignment()
		const e = this.employment()
		const values: Record<TargetField, string | number | null | undefined> = {
			legalEntityId: e?.legalEntity?.id,
			workerTypeId: this.context()?.workerType?.id,
			employmentType: e?.employmentType,
			continuousServiceStartDate: e?.continuousServiceStartDate,
			probationEndDate: e?.probationEndDate,
			noticePeriodDays: e?.noticePeriodDays,
			unitId: a?.unit?.id,
			departmentId: a?.department?.id,
			designationId: a?.designation?.id,
			locationId: a?.location?.id,
			positionId: a?.position?.id,
			jobTitle: a?.jobTitle || null,
			workMode: a?.workMode,
			fullTimeEquivalent: a?.fullTimeEquivalent,
			standardHoursPerWeek: a?.standardHoursPerWeek,
			costCenterCode: a?.costCenterCode || null,
			managerWorkerId: a?.manager?.id,
		}
		return values[field] ?? null
	}

	/** Display text of a fact value. */
	private display(field: TargetField, value: string | number | null): string {
		if (value === null) return '—'
		if (field in REF_KINDS) {
			const chosen = this.refs()[field as RefField]
			if (chosen?.id === value) return chosen.name
			const a = this.assignment()
			const e = this.employment()
			const known = [
				a?.unit,
				a?.department,
				a?.designation,
				a?.location,
				a?.position,
				a?.manager,
				e?.legalEntity,
				this.context()?.workerType,
			]
			return known.find(/** Same identity. */ (item) => item?.id === value)?.name ?? String(value)
		}
		return comparisonText(field, String(value))
	}

	/** Set one reference. */
	setRef(field: RefField, value: OptionRef | null): void {
		this.refs.update(/** Reference. */ (refs) => ({ ...refs, [field]: value }))
	}

	/** Set one plain fact. */
	private setValue(field: TargetField, value: string | number | null): void {
		if (
			field === 'noticePeriodDays' ||
			field === 'fullTimeEquivalent' ||
			field === 'standardHoursPerWeek'
		)
			this.numbers.update(
				/** Number. */ (n) => ({ ...n, [field]: value === null ? null : Number(value) }),
			)
		else
			this.model.update(
				/** Text. */ (v) => ({ ...v, [field]: value === null ? '' : String(value) }),
			)
	}

	/** Read a DatePicker's timezone-free value. */
	setDate(
		field: 'effectiveDate' | 'continuousServiceStartDate' | 'probationEndDate',
		value: string,
	): void {
		this.model.update(/** Date. */ (v) => ({ ...v, [field]: value }))
	}

	/** Read a StepInput value; an empty value clears optional numbers. */
	setNumber(
		field: 'noticePeriodDays' | 'fullTimeEquivalent' | 'standardHoursPerWeek',
		target: EventTarget | null,
	): void {
		const raw = (target as HTMLInputElement | null)?.value
		const value = raw === undefined || raw === null || raw === '' ? null : Number(raw)
		this.numbers.update(/** Number. */ (n) => ({ ...n, [field]: value }))
	}

	/** Whether a step's own facts are valid; marks them touched so errors show. */
	private stepValid(step: Step): boolean {
		this.touched.update(/** Show errors. */ (t) => ({ ...t, [step]: true }))
		const f = this.fields
		if (step === 'worker') return this.contextState() === 'ready' && this.types().length > 0
		if (step === 'type') {
			for (const field of [
				f.changeType,
				f.effectiveDate,
				f.reasonCode,
				f.reasonDetail,
				f.evidenceReference,
			]) {
				field().markAsTouched()
				if (field().invalid()) {
					field().focusBoundControl()
					return false
				}
			}
			if (this.model().effectiveDate < this.minDate()) return false
			return this.type() === 'Rehire' || this.model().employmentId !== ''
		}
		if (step === 'details') return this.missing().length === 0 && !this.unchanged()
		return true
	}

	/** Validate the current step, then move forward. */
	next(move: HcmWizardMove): void {
		if (!this.stepValid(move.from as Step)) return
		this.go(move.to as Step)
	}

	/** Show a step and extend the reachable range. */
	private go(step: Step): void {
		this.current.set(step)
		if (STEPS.indexOf(step) > STEPS.indexOf(this.reachable())) this.reachable.set(step)
	}

	/** Move to an earlier or reachable step. */
	stepChange(step: string): void {
		this.current.set(step as Step)
	}

	/** Create or update the draft, then submit it; a retry reuses the same keys. */
	finish(): void {
		if (this.draft.saving()) return
		for (const step of STEPS)
			if (!this.stepValid(step)) {
				this.go(step)
				return
			}
		const body = this.body()
		const signature = JSON.stringify(body)
		const existing = this.saved?.request ?? this.editing()
		let save: Observable<EmploymentChangeRequestDto>
		if (!existing) save = this.api.create(body, this.draft.key({ create: body }))
		else if (this.saved?.body === signature) save = of(existing)
		else
			save = this.api.update(
				existing.id,
				this.updateBody(existing),
				this.draft.key({ update: existing.id, body }),
			)
		this.draft.saving.set(true)
		this.draft.error.set('')
		save
			.pipe(
				switchMap(
					/** Submit the saved draft. */ (saved) => {
						this.saved = { request: saved, body: signature }
						return this.api.command(
							saved.id,
							'submit',
							{ expectedRevision: saved.revision },
							this.draft.key({ submit: saved.id, revision: saved.revision }),
						)
					},
				),
				takeUntilDestroyed(this.destroy),
			)
			.subscribe({
				next: /** Open the submitted request. */ (request) => {
					this.draft.saving.set(false)
					this.draft.markClean()
					this.allowLeave = true
					void this.router.navigateByUrl(`${BASE_ROUTE}/${encodeURIComponent(request.id)}`)
				},
				error: /** Keep the draft and show where to fix it. */ (error) => {
					this.draft.saving.set(false)
					this.draft.error.set(changesErrorMessage(error))
					const step = this.stepOf(error)
					if (step) this.current.set(step)
				},
			})
	}

	/** The update command of a draft. */
	private updateBody(saved: EmploymentChangeRequestDto): Record<string, unknown> {
		const body = this.body()
		return {
			targets: body.targets,
			effectiveDate: body.effectiveDate,
			reasonCode: body.reasonCode,
			reasonDetail: body.reasonDetail,
			expectedRevision: saved.revision,
		}
	}

	/** The step owning a server field error, so the user lands where the fix is. */
	private stepOf(error: unknown): Step | null {
		const body = error instanceof HttpErrorResponse ? error.error : undefined
		if (body?.code === 'effective-date-out-of-range' || body?.code === 'duplicate-code')
			return 'type'
		const field: string = body?.fieldErrors?.[0]?.field ?? ''
		if (field.startsWith('targets')) return 'details'
		if (
			[
				'changeType',
				'effectiveDate',
				'reasonCode',
				'reasonDetail',
				'evidenceReference',
				'employmentId',
			].includes(field)
		)
			return 'type'
		if (field === 'workerId') return 'worker'
		return null
	}

	/** Leave the wizard; the route guard consults the draft. */
	cancel(): void {
		const id = this.editing()?.id
		void this.router.navigateByUrl(id ? `${BASE_ROUTE}/${encodeURIComponent(id)}` : BASE_ROUTE)
	}

	/** Allow the route guard to consult this draft. */
	canLeave(): Promise<boolean> {
		return this.allowLeave ? Promise.resolve(true) : this.draft.canLeave()
	}

	/** Release a pending navigation decision. */
	ngOnDestroy(): void {
		this.draft.release()
	}
}
