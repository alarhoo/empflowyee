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
import { Router } from '@angular/router'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { forkJoin } from 'rxjs'
import { HttpErrorResponse } from '@angular/common/http'
import { form, FormField, maxLength, pattern, required } from '@angular/forms/signals'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { StepInput } from '@fundamental-ngx/ui5-webcomponents/step-input'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { DatePicker } from '@fundamental-ngx/ui5-webcomponents/date-picker'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Link } from '@fundamental-ngx/ui5-webcomponents/link'
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
	EmployeeRecordsApi,
	employeeDenied,
	recordsErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import {
	EMPLOYMENT_TYPES,
	WORK_MODES,
	type DuplicateCandidateDto,
	type RecordOptionDto,
} from '@empflowyee/hcm-employee-contract'
import {
	BASE_ROUTE,
	EMPLOYMENT_TYPE_LABELS,
	MANAGE_PERMISSION,
	WORK_MODE_LABELS,
	decimal,
	isoToday,
} from './labels'
import { RecordOptionBox, type OptionRef } from './option-box.component'

const STEPS = ['person', 'employment', 'assignment', 'duplicates', 'review'] as const
type Step = (typeof STEPS)[number]
type RefField =
	'nationality' | 'legalEntity' | 'unit' | 'department' | 'designation' | 'location' | 'manager'

const WORKER_NUMBER = /^[A-Z0-9][A-Z0-9_-]{1,39}$/

/**
 * Dedicated wizard route to create a worker with a person, a primary employment, a primary
 * assignment and a manager line. Duplicates are checked before review and block creation until
 * resolved with a reason; Review submits once with one retained idempotency key.
 */
@Component({
	selector: 'ef-hcm-new-worker',
	imports: [
		FormField,
		Form,
		FormItem,
		Label,
		Input,
		Select,
		Option,
		StepInput,
		CheckBox,
		DatePicker,
		TextArea,
		Text,
		Link,
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
		RecordOptionBox,
	],
	templateUrl: './new-worker.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewWorkerComponent implements OnInit, OnDestroy {
	private readonly router = inject(Router)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(EmployeeRecordsApi)
	private readonly destroy = inject(DestroyRef)
	readonly employmentTypes = EMPLOYMENT_TYPES
	readonly employmentLabels = EMPLOYMENT_TYPE_LABELS
	readonly workModes = WORK_MODES
	readonly workModeLabels = WORK_MODE_LABELS
	readonly decimal = decimal
	readonly state = signal<HcmWizardState>('loading')
	readonly message = signal('')
	readonly current = signal<Step>('person')
	readonly reachable = signal<Step>('person')
	readonly workerTypes = signal<RecordOptionDto[]>([])
	readonly genders = signal<RecordOptionDto[]>([])
	readonly maritalStatuses = signal<RecordOptionDto[]>([])
	readonly model = signal({
		givenName: '',
		middleName: '',
		familyName: '',
		preferredName: '',
		birthDate: '',
		gender: 'none',
		maritalStatus: 'none',
		workerNumber: '',
		workerType: '',
		employmentType: 'Permanent',
		hireDate: isoToday(),
		workEmail: '',
		probationEndDate: '',
		jobTitle: '',
		workMode: 'OnSite',
		costCenterCode: '',
		duplicateReason: '',
		reason: '',
	})
	readonly refs = signal<Record<RefField, OptionRef | null>>({
		nationality: null,
		legalEntity: null,
		unit: null,
		department: null,
		designation: null,
		location: null,
		manager: null,
	})
	readonly noticeDays = signal<number | null>(null)
	readonly fte = signal(1)
	readonly hours = signal<number | null>(40)
	readonly touched = signal<Record<Step, boolean>>({
		person: false,
		employment: false,
		assignment: false,
		duplicates: false,
		review: false,
	})
	readonly candidates = signal<DuplicateCandidateDto[]>([])
	/** The facts the candidates were found for; changed facts need a new check. */
	private checkedFor = ''
	readonly checking = signal(false)
	readonly createNew = signal(false)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.givenName)
			pattern(path.givenName, /\S/)
			maxLength(path.givenName, 100)
			required(path.familyName)
			pattern(path.familyName, /\S/)
			maxLength(path.familyName, 100)
			maxLength(path.middleName, 100)
			maxLength(path.preferredName, 100)
			required(path.workerNumber)
			pattern(path.workerNumber, WORKER_NUMBER)
			required(path.workerType)
			required(path.hireDate)
			pattern(path.workEmail, /^([^\s@]+@[^\s@]+\.[^\s@]+)?$/)
			required(path.jobTitle)
			pattern(path.jobTitle, /\S/)
			maxLength(path.jobTitle, 150)
			maxLength(path.costCenterCode, 40)
			required(path.duplicateReason, {
				when: /** Only a confirmed new person needs a reason. */ () => this.createNew(),
			})
			maxLength(path.duplicateReason, 500)
			required(path.reason)
			pattern(path.reason, /\S/)
			maxLength(path.reason, 500)
		},
	)
	readonly fteInvalid = computed(
		/** FTE between 0.01 and 1. */ () => !(this.fte() >= 0.01 && this.fte() <= 1),
	)
	readonly hoursInvalid = computed(
		/** Weekly hours between 0.25 and 168 when stated. */ () => {
			const hours = this.hours()
			return hours !== null && !(hours >= 0.25 && hours <= 168)
		},
	)
	readonly body = computed(
		/** The single create command of the draft. */ () => {
			const v = this.model()
			const r = this.refs()
			const candidates = this.candidates()
			return {
				person: {
					givenName: v.givenName.trim(),
					middleName: v.middleName.trim(),
					familyName: v.familyName.trim(),
					preferredName: v.preferredName.trim(),
					birthDate: v.birthDate || null,
					genderCode: v.gender === 'none' ? null : v.gender,
					maritalStatusCode: v.maritalStatus === 'none' ? null : v.maritalStatus,
					nationalityCountryCode: r.nationality?.id ?? null,
				},
				worker: { workerNumber: v.workerNumber.trim(), workerTypeId: v.workerType },
				employment: {
					legalEntityId: r.legalEntity?.id ?? '',
					employmentType: v.employmentType,
					hireDate: v.hireDate,
					workEmail: v.workEmail.trim() || null,
					probationEndDate: v.probationEndDate || null,
					noticePeriodDays: this.noticeDays(),
				},
				assignment: {
					unitId: r.unit?.id ?? '',
					departmentId: r.department?.id ?? null,
					designationId: r.designation?.id ?? null,
					locationId: r.location?.id ?? '',
					jobTitle: v.jobTitle.trim(),
					workMode: v.workMode,
					fullTimeEquivalent: this.fte(),
					standardHoursPerWeek: this.hours(),
					costCenterCode: v.costCenterCode.trim(),
				},
				managerWorkerId: r.manager?.id ?? null,
				duplicateResolution: this.resolution(candidates, v.duplicateReason),
				reason: v.reason.trim(),
			}
		},
	)
	readonly draft = new HcmDraft(
		/** Track the draft. */ () => ({ body: this.body(), createNew: this.createNew() }),
	)
	readonly workerTypeName = computed(
		/** The chosen worker type. */ () =>
			this.workerTypes().find(/** Chosen. */ (item) => item.id === this.model().workerType)?.name ??
			'—',
	)
	readonly genderName = computed(
		/** The chosen gender. */ () =>
			this.genders().find(/** Chosen. */ (item) => item.id === this.model().gender)?.name ??
			'Not recorded',
	)
	readonly maritalName = computed(
		/** The chosen marital status. */ () =>
			this.maritalStatuses().find(/** Chosen. */ (item) => item.id === this.model().maritalStatus)
				?.name ?? 'Not recorded',
	)
	readonly fullName = computed(
		/** The legal name as entered. */ () => {
			const v = this.model()
			return [v.givenName, v.middleName, v.familyName]
				.map(/** Trimmed. */ (part) => part.trim())
				.filter(Boolean)
				.join(' ')
		},
	)
	readonly employmentLabel = computed(
		/** The chosen employment type. */ () =>
			this.employmentLabels[this.model().employmentType as keyof typeof EMPLOYMENT_TYPE_LABELS] ??
			this.model().employmentType,
	)
	readonly workModeLabel = computed(
		/** The chosen work mode. */ () =>
			this.workModeLabels[this.model().workMode] ?? this.model().workMode,
	)
	private allowLeave = false

	/** Load the small reference lists once; creation needs the manage permission. */
	ngOnInit(): void {
		if (this.runtime.context()?.access.permissions.includes(MANAGE_PERMISSION) !== true) {
			this.state.set('denied')
			return
		}
		this.load()
	}

	/** Load worker types, genders and marital statuses. */
	load(): void {
		this.state.set('loading')
		forkJoin([
			this.api.options('worker-types', ''),
			this.api.options('genders', ''),
			this.api.options('marital-statuses', ''),
		])
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish options and start a clean draft. */ ([types, genders, marital]) => {
					this.workerTypes.set(types.items)
					this.genders.set(genders.items)
					this.maritalStatuses.set(marital.items)
					if (!this.model().workerType) {
						const employee =
							types.items.find(/** Default to employee. */ (item) => /employee/i.test(item.name)) ??
							types.items[0]
						this.model.update(
							/** Default type. */ (v) => ({ ...v, workerType: employee?.id ?? '' }),
						)
					}
					this.draft.markClean()
					this.state.set('content')
				},
				error: /** Truthful failure. */ (error) => {
					this.message.set(recordsErrorMessage(error))
					this.state.set(employeeDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** How the found candidates are resolved; none found needs no resolution. */
	private resolution(candidates: DuplicateCandidateDto[], reason: string): object {
		if (!candidates.length || !this.createNew()) return { kind: 'none' }
		return {
			kind: 'create-new',
			candidatePersonIds: candidates.map(/** Candidate. */ (item) => item.personId),
			reason: reason.trim(),
		}
	}

	/** Set one reference. */
	setRef(field: RefField, value: OptionRef | null): void {
		this.refs.update(/** Reference. */ (refs) => ({ ...refs, [field]: value }))
	}

	/** Read a DatePicker's timezone-free value. */
	setDate(field: 'birthDate' | 'hireDate' | 'probationEndDate', value: string): void {
		this.model.update(/** Date. */ (v) => ({ ...v, [field]: value }))
	}

	/** Read a StepInput value; an empty value clears optional numbers. */
	setNumber(field: 'notice' | 'fte' | 'hours', target: EventTarget | null): void {
		const raw = (target as HTMLInputElement | null)?.value
		const value = raw === undefined || raw === null || raw === '' ? null : Number(raw)
		if (field === 'notice')
			this.noticeDays.set(value === null ? null : Math.min(365, Math.max(0, Math.trunc(value))))
		else if (field === 'fte') this.fte.set(value ?? 0)
		else this.hours.set(value)
	}

	/** Confirm creating a new person although candidates were found. */
	setCreateNew(target: EventTarget | null): void {
		this.createNew.set((target as HTMLInputElement | null)?.checked === true)
	}

	/** Whether a step's own fields are valid; marks them touched so errors show. */
	private stepValid(step: Step): boolean {
		this.touched.update(/** Show errors. */ (t) => ({ ...t, [step]: true }))
		const f = this.fields
		const r = this.refs()
		const checks: Record<Step, () => boolean> = {
			person: /** Person facts. */ () =>
				this.focusFirst([
					f.givenName,
					f.familyName,
					f.middleName,
					f.preferredName,
					f.workerNumber,
					f.workerType,
				]),
			employment: /** Employment facts. */ () =>
				this.focusFirst([f.hireDate, f.workEmail]) && r.legalEntity !== null,
			assignment: /** Assignment facts. */ () =>
				this.focusFirst([f.jobTitle, f.costCenterCode]) &&
				r.unit !== null &&
				r.location !== null &&
				!this.fteInvalid() &&
				!this.hoursInvalid(),
			duplicates: /** Every candidate resolved. */ () =>
				!this.checking() &&
				this.checkedFor === this.duplicateFacts() &&
				(!this.candidates().length || (this.createNew() && this.focusFirst([f.duplicateReason]))),
			review: /** Overall reason. */ () => this.focusFirst([f.reason]),
		}
		return checks[step]()
	}

	/** Mark fields touched and focus the first invalid one. */
	private focusFirst(fields: (typeof this.fields.givenName)[]): boolean {
		for (const field of fields) {
			field().markAsTouched()
			if (field().invalid()) {
				field().focusBoundControl()
				return false
			}
		}
		return true
	}

	/** Validate the current step, then move forward. */
	next(move: HcmWizardMove): void {
		const from = move.from as Step
		const to = move.to as Step
		if (!this.stepValid(from)) return
		if (to === 'duplicates') this.check()
		this.go(to)
	}

	/** Show a step and extend the reachable range. */
	private go(step: Step): void {
		this.current.set(step)
		if (STEPS.indexOf(step) > STEPS.indexOf(this.reachable())) this.reachable.set(step)
	}

	/** Move to an earlier or reachable step; a changed person or email needs a new check. */
	stepChange(step: string): void {
		this.current.set(step as Step)
		if (step === 'duplicates' && this.checkedFor !== this.duplicateFacts()) this.check()
	}

	/** The facts compared for duplicates. */
	private duplicateFacts(): string {
		const body = this.body()
		return JSON.stringify({
			givenName: body.person.givenName,
			familyName: body.person.familyName,
			birthDate: body.person.birthDate,
			workEmail: body.employment.workEmail,
		})
	}

	/** Compare the candidate facts with existing people. */
	check(): void {
		const facts = this.duplicateFacts()
		this.checking.set(true)
		this.message.set('')
		this.api
			.duplicateCheck(JSON.parse(facts) as Record<string, unknown>, crypto.randomUUID())
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish candidates. */ (result) => {
					const changed =
						JSON.stringify(result.candidates.map(/** Id. */ (item) => item.personId)) !==
						JSON.stringify(this.candidates().map(/** Id. */ (item) => item.personId))
					this.candidates.set(result.candidates)
					if (changed) this.createNew.set(false)
					this.checkedFor = facts
					this.checking.set(false)
					if (this.reachable() === 'review' && result.candidates.length && !this.createNew())
						this.reachable.set('duplicates')
				},
				error: /** Explain and keep the step blocked. */ (error) => {
					this.checking.set(false)
					this.message.set(recordsErrorMessage(error))
				},
			})
	}

	/** Candidate reason wording. */
	matchReason(candidate: DuplicateCandidateDto): string {
		return candidate.reason === 'work-email' ? 'Same work email' : 'Same name and birth date'
	}

	/** Submit the whole draft once; a retry reuses the same key. */
	finish(): void {
		if (this.draft.saving()) return
		for (const step of STEPS)
			if (!this.stepValid(step)) {
				this.go(step)
				return
			}
		const body = this.body()
		this.draft.saving.set(true)
		this.draft.error.set('')
		this.api
			.create(body, this.draft.key(body))
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Open the created record. */ (record) => {
					this.draft.saving.set(false)
					this.draft.markClean()
					this.allowLeave = true
					void this.router.navigateByUrl(`${BASE_ROUTE}/${encodeURIComponent(record.workerId)}`)
				},
				error: /** Keep the draft and show where to fix it. */ (error) => {
					this.draft.saving.set(false)
					this.draft.error.set(recordsErrorMessage(error))
					const step = this.stepOf(error)
					if (step === 'duplicates') this.check()
					if (step) this.current.set(step)
				},
			})
	}

	/** The step owning a server field error, so the user lands where the fix is. */
	private stepOf(error: unknown): Step | null {
		const body = error instanceof HttpErrorResponse ? error.error : undefined
		if (body?.code === 'duplicate-candidate') return 'duplicates'
		if (body?.code === 'duplicate-code') return 'person'
		const field: string = body?.fieldErrors?.[0]?.field ?? ''
		if (field.startsWith('person.') || field.startsWith('worker.')) return 'person'
		if (field.startsWith('employment.')) return 'employment'
		if (field.startsWith('assignment.') || field === 'managerWorkerId') return 'assignment'
		if (field.startsWith('duplicateResolution.')) return 'duplicates'
		return null
	}

	/** Leave the wizard; the route guard consults the draft. */
	cancel(): void {
		void this.router.navigateByUrl(BASE_ROUTE)
	}

	/** Open a candidate's record; the route guard consults the draft. */
	openCandidate(workerId: string | null): void {
		if (workerId) void this.router.navigateByUrl(`${BASE_ROUTE}/${encodeURIComponent(workerId)}`)
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
