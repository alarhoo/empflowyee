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
import { map, of, switchMap, type Observable } from 'rxjs'
import { form, FormField, maxLength, pattern, required } from '@angular/forms/signals'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormGroup } from '@fundamental-ngx/ui5-webcomponents/form-group'
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
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	PositionsApi,
	jobArchitectureDenied,
	jobArchitectureErrorMessage,
} from '@empflowyee/hcm-web-job-architecture-data-access'
import {
	POSITION_TYPES,
	type PositionChangeRequestDto,
	type PositionDetailDto,
	type PositionProposal,
	type PositionType,
	type ReferenceDto,
} from '@empflowyee/hcm-job-architecture-contract'
import { PositionOptionBox, type OptionRef } from './option-box.component'
import { BASE_ROUTE, POSITION_TYPE_LABELS, REQUEST_PERMISSION, isoToday } from './labels'

type RefField =
	'profile' | 'designation' | 'legalEntity' | 'unit' | 'department' | 'location' | 'reportsTo'

/** A reference as an option; absent references stay empty. */
function ref(value: ReferenceDto | null | undefined): OptionRef | null {
	return value ? { id: value.id, name: value.name } : null
}

/** Dedicated route to request a new position, change one, or edit a draft request. */
@Component({
	selector: 'ef-hcm-position-editor',
	imports: [
		FormField,
		Bar,
		Button,
		Form,
		FormGroup,
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
		MessageStrip,
		HcmDynamicPage,
		HcmDiscardDialog,
		PositionOptionBox,
	],
	templateUrl: './position-editor.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PositionEditorComponent implements OnInit, OnDestroy {
	private readonly api = inject(PositionsApi)
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	readonly types = POSITION_TYPES
	readonly typeLabels = POSITION_TYPE_LABELS
	readonly positionId = this.route.snapshot.paramMap.get('positionId')
	readonly requestId = this.route.snapshot.paramMap.get('requestId')
	readonly position = signal<PositionDetailDto | null>(null)
	readonly existing = signal<PositionChangeRequestDto | null>(null)
	readonly loadState = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly model = signal({
		code: '',
		name: '',
		gradeId: '',
		positionType: 'Regular' as PositionType,
		costCenterCode: '',
		reason: '',
	})
	readonly refs = signal<Record<RefField, OptionRef | null>>({
		profile: null,
		designation: null,
		legalEntity: null,
		unit: null,
		department: null,
		location: null,
		reportsTo: null,
	})
	readonly headcount = signal(1)
	readonly fte = signal(1)
	readonly keyPosition = signal(false)
	readonly effectiveFrom = signal(isoToday())
	readonly checked = signal(false)
	readonly creating = computed(
		/** A Create request, new or being edited. */ () =>
			!this.positionId && (this.existing()?.requestType ?? 'Create') === 'Create',
	)
	readonly grades = computed(
		/** Grades the chosen profile allows. */ () => this.refs().profile?.grades ?? [],
	)
	readonly state = computed<HcmPageState>(
		/** Only requesters reach the form; others see a denial without protected requests. */ () =>
			this.runtime.context()?.access.permissions.includes(REQUEST_PERMISSION)
				? this.loadState()
				: 'denied',
	)
	readonly title = computed(
		/** Name the operation and target. */ () => {
			const existing = this.existing()
			if (existing) return `Edit request for ${existing.positionName}`
			const position = this.position()
			return position ? `Request a change to ${position.name}` : 'New position'
		},
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract; references stay server-side. */ (path) => {
			required(path.code, {
				when: /** Only on create. */ () => this.creating() && !this.existing(),
			})
			pattern(path.code, /^(|[A-Z][A-Z0-9_-]{1,39})$/)
			required(path.name)
			pattern(path.name, /^(|[\s\S]*\S[\s\S]*)$/)
			maxLength(path.name, 150)
			required(path.gradeId)
			maxLength(path.costCenterCode, 40)
			required(path.reason)
			pattern(path.reason, /\S/)
			maxLength(path.reason, 500)
		},
	)
	readonly draft = new HcmDraft(
		/** Track the whole draft. */ () => ({
			...this.model(),
			refs: this.refs(),
			headcount: this.headcount(),
			fte: this.fte(),
			keyPosition: this.keyPosition(),
			effectiveFrom: this.effectiveFrom(),
		}),
	)
	readonly missing = computed<RefField[]>(
		/** Required references still empty after a save attempt. */ () => {
			if (!this.checked()) return []
			const refs = this.refs()
			const required: RefField[] = ['profile', 'designation', 'legalEntity', 'unit', 'location']
			return required.filter(/** Empty. */ (field) => !refs[field])
		},
	)
	readonly capacityInvalid = computed(
		/** Each seat carries at most one full-time equivalent. */ () =>
			this.checked() && (this.headcount() < 1 || this.fte() <= 0 || this.fte() > this.headcount()),
	)

	/** Load the position or draft request to start from. */
	ngOnInit(): void {
		this.draft.markClean()
		if (!this.runtime.context()?.access.permissions.includes(REQUEST_PERMISSION)) return
		let source: Observable<unknown> = of(null)
		if (this.requestId)
			source = this.api
				.readRequest(this.requestId)
				.pipe(map(/** Start from the draft request. */ (request) => this.startFromRequest(request)))
		else if (this.positionId)
			source = this.api
				.readPosition(this.positionId)
				.pipe(
					map(
						/** Start from the current version. */ (position) => this.startFromPosition(position),
					),
				)
		source
			.pipe(
				switchMap(/** Resolve the profile's allowed grades. */ () => this.resolveGrades()),
				takeUntilDestroyed(this.destroy),
			)
			.subscribe({
				next: /** Ready to edit. */ () => {
					this.draft.markClean()
					this.loadState.set('content')
				},
				error: /** Truthful failure without stale data; an ineligible source stays unavailable. */ (
					error,
				) => {
					if (this.loadState() === 'unavailable') return
					this.message.set(jobArchitectureErrorMessage(error))
					this.loadState.set(jobArchitectureDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Fill the form from a draft request. */
	private startFromRequest(request: PositionChangeRequestDto): void {
		this.existing.set(request)
		const proposed = request.proposed
		if (!request.requestedByMe || !proposed || !['Draft', 'Previewed'].includes(request.status)) {
			this.loadState.set('unavailable')
			throw new Error('Not editable')
		}
		this.model.set({
			code: request.positionCode,
			name: proposed.name,
			gradeId: proposed.gradeId,
			positionType: proposed.positionType,
			costCenterCode: proposed.costCenterCode,
			reason: request.reason ?? '',
		})
		this.refs.set({
			profile: proposed.profile
				? { id: proposed.profileVersionId, name: proposed.profile.name }
				: null,
			designation: ref(proposed.placement.designation),
			legalEntity: ref(proposed.placement.legalEntity),
			unit: ref(proposed.placement.unit),
			department: ref(proposed.placement.department),
			location: ref(proposed.placement.location),
			reportsTo: ref(proposed.reportsTo),
		})
		this.headcount.set(proposed.headcountCapacity)
		this.fte.set(proposed.fteCapacity)
		this.keyPosition.set(proposed.keyPosition)
		this.effectiveFrom.set(proposed.effectiveFrom)
	}

	/** Fill the form from a position's current version. */
	private startFromPosition(position: PositionDetailDto): void {
		this.position.set(position)
		const version = position.currentVersion
		if (!version || position.openRequest) {
			this.loadState.set('unavailable')
			throw new Error('Not changeable')
		}
		const line = position.relationships.find(
			/** The solid line this position reports on. */ (r) =>
				r.direction === 'Outgoing' && r.type === 'SolidLine',
		)
		this.model.set({
			code: position.code,
			name: position.name,
			gradeId: version.grade.id,
			positionType: version.positionType,
			costCenterCode: version.costCenterCode,
			reason: '',
		})
		this.refs.set({
			profile: { id: version.profileVersionId, name: version.profile.name },
			designation: ref(version.placement.designation),
			legalEntity: ref(version.placement.legalEntity),
			unit: ref(version.placement.unit),
			department: ref(version.placement.department),
			location: ref(version.placement.location),
			reportsTo: ref(line?.position),
		})
		this.headcount.set(version.headcountCapacity)
		this.fte.set(version.fteCapacity)
		this.keyPosition.set(version.keyPosition)
	}

	/** Look up the allowed grades of a prefilled profile version. */
	private resolveGrades(): Observable<unknown> {
		const profile = this.refs().profile
		if (!profile || profile.grades) return of(null)
		return this.api.options('profiles', profile.name).pipe(
			map(
				/** Keep the grades of the exact version. */ (page) => {
					const found = page.items.find(/** Same version. */ (item) => item.id === profile.id)
					this.setRef('profile', { ...profile, grades: found?.grades ?? [] })
				},
			),
		)
	}

	/** Set one reference; choosing another profile resets a grade it does not allow. */
	setRef(field: RefField, value: OptionRef | null): void {
		this.refs.update(/** Replace one. */ (refs) => ({ ...refs, [field]: value }))
		if (field !== 'profile') return
		const grades = value?.grades ?? []
		if (!grades.some(/** Still allowed. */ (grade) => grade.id === this.model().gradeId))
			this.model.update(
				/** Default grade of the new profile. */ (model) => ({
					...model,
					gradeId: grades.find(/** Default. */ (grade) => grade.isDefault)?.id ?? '',
				}),
			)
	}

	/** The proposal from the form. */
	private proposal(): PositionProposal {
		const v = this.model()
		const refs = this.refs()
		return {
			name: v.name.trim(),
			profileVersionId: refs.profile?.id ?? '',
			gradeId: v.gradeId,
			designationId: refs.designation?.id ?? '',
			legalEntityId: refs.legalEntity?.id ?? '',
			unitId: refs.unit?.id ?? '',
			departmentId: refs.department?.id ?? null,
			locationId: refs.location?.id ?? '',
			positionType: v.positionType,
			headcountCapacity: this.headcount(),
			fteCapacity: Math.round(this.fte() * 100) / 100,
			keyPosition: this.keyPosition(),
			costCenterCode: v.costCenterCode.trim(),
			effectiveFrom: this.effectiveFrom(),
			reportsToPositionId: refs.reportsTo?.id ?? null,
		}
	}

	/** Validate and persist the request as a draft. */
	save(): void {
		if (this.draft.saving()) return
		this.checked.set(true)
		this.fields().markAsTouched()
		for (const field of [
			this.fields.code,
			this.fields.name,
			this.fields.gradeId,
			this.fields.reason,
		])
			if (field().invalid()) {
				field().focusBoundControl()
				return
			}
		if (this.missing().length || this.capacityInvalid() || !this.effectiveFrom()) return
		const proposed = this.proposal()
		const reason = this.model().reason.trim()
		const existing = this.existing()
		let call: Observable<PositionChangeRequestDto>
		if (existing) {
			const body = { proposed, reason, expectedRevision: existing.revision }
			call = this.api.updateRequest(existing.id, body, this.draft.key({ id: existing.id, body }))
		} else if (this.positionId) {
			const body = { requestType: 'Change' as const, positionId: this.positionId, proposed, reason }
			call = this.api.createRequest(body, this.draft.key(body))
		} else {
			const body = { requestType: 'Create' as const, code: this.model().code, proposed, reason }
			call = this.api.createRequest(body, this.draft.key(body))
		}
		this.draft.saving.set(true)
		this.draft.error.set('')
		call.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Leave only after the server confirms the transaction. */ (saved) => {
				this.draft.saving.set(false)
				this.draft.markClean()
				void this.router.navigateByUrl(
					`${BASE_ROUTE}/${encodeURIComponent(saved.positionId)}/requests/${encodeURIComponent(saved.id)}`,
				)
			},
			error: /** Preserve the draft and retry key. */ (error) => {
				this.draft.saving.set(false)
				this.draft.error.set(jobArchitectureErrorMessage(error))
			},
		})
	}

	/** Return to where the edit started; the guard consults the draft. */
	back(): void {
		const existing = this.existing()
		if (existing)
			void this.router.navigateByUrl(
				`${BASE_ROUTE}/${encodeURIComponent(existing.positionId)}/requests/${encodeURIComponent(existing.id)}`,
			)
		else if (this.positionId)
			void this.router.navigateByUrl(`${BASE_ROUTE}/${encodeURIComponent(this.positionId)}`)
		else void this.router.navigateByUrl(BASE_ROUTE)
	}

	/** Allow the route guard to consult this draft. */
	canLeave(): Promise<boolean> {
		return this.draft.canLeave()
	}

	/** Release a pending navigation decision. */
	ngOnDestroy(): void {
		this.draft.release()
	}
}
