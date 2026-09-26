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
import { forkJoin, map, of, switchMap, type Observable } from 'rxjs'
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
import { MultiComboBox } from '@fundamental-ngx/ui5-webcomponents/multi-combo-box'
import { MultiComboBoxItem } from '@fundamental-ngx/ui5-webcomponents/multi-combo-box-item'
import { StepInput } from '@fundamental-ngx/ui5-webcomponents/step-input'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Toolbar } from '@fundamental-ngx/ui5-webcomponents/toolbar'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableRowAction } from '@fundamental-ngx/ui5-webcomponents/table-row-action'
import { ToolbarButton } from '@fundamental-ngx/ui5-webcomponents/toolbar-button'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	JobCatalogueApi,
	jobArchitectureDenied,
	jobArchitectureErrorMessage,
} from '@empflowyee/hcm-web-job-architecture-data-access'
import {
	QUANTITY_UNITS,
	REQUIREMENT_TYPES,
	type CatalogueVersionDto,
	type JobFamilyNodeDto,
	type JobProfileVersionDraft,
	type JobProfileVersionDto,
	type QuantityUnit,
	type RequirementType,
} from '@empflowyee/hcm-job-architecture-contract'
import { BASE_ROUTE, MANAGE_PERMISSION, TRACK_KIND_LABELS } from './labels'
import { familyTree, flatFamilies } from './families'

interface ResponsibilityRow {
	key: number
	code: string
	statement: string
	essential: boolean
}
interface RequirementRow {
	key: number
	code: string
	type: RequirementType
	name: string
	proficiency: string
	quantity: number | null
	unit: QuantityUnit | 'none'
	mandatory: boolean
}

const CODE = /^[A-Z][A-Z0-9_]{1,39}$/

/** Dedicated route to create a job profile or edit its draft version. */
@Component({
	selector: 'ef-hcm-job-profile-editor',
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
		MultiComboBox,
		MultiComboBoxItem,
		StepInput,
		CheckBox,
		TextArea,
		Text,
		Toolbar,
		ToolbarButton,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableRowAction,
		MessageStrip,
		HcmDynamicPage,
		HcmDiscardDialog,
	],
	templateUrl: './profile-editor.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileEditorComponent implements OnInit, OnDestroy {
	private readonly api = inject(JobCatalogueApi)
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	readonly types = REQUIREMENT_TYPES
	readonly units = QUANTITY_UNITS
	readonly trackKinds = TRACK_KIND_LABELS
	readonly versionId = this.route.snapshot.paramMap.get('versionId')
	readonly existing = signal<JobProfileVersionDto | null>(null)
	readonly catalogue = signal<CatalogueVersionDto | null>(null)
	readonly families = signal<JobFamilyNodeDto[]>([])
	readonly loadState = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly model = signal({
		code: '',
		name: '',
		familyId: '',
		trackId: '',
		levelId: '',
		summary: '',
		purpose: '',
		scopeOfImpact: '',
		autonomyLevel: '',
		defaultGradeId: '',
		reason: '',
	})
	readonly gradeIds = signal<string[]>([])
	readonly responsibilities = signal<ResponsibilityRow[]>([])
	readonly requirements = signal<RequirementRow[]>([])
	readonly rowError = signal('')
	private nextKey = 0
	readonly state = computed<HcmPageState>(
		/** Only managers reach the form; others see a denial without protected requests. */ () =>
			this.runtime.context()?.access.permissions.includes(MANAGE_PERMISSION)
				? this.loadState()
				: 'denied',
	)
	readonly title = computed(
		/** Name the operation and target. */ () => {
			const existing = this.existing()
			return existing
				? `Edit ${existing.profileName} version ${existing.versionNumber}`
				: 'New job profile'
		},
	)
	readonly levels = computed(
		/** Active levels of the chosen track. */ () =>
			(
				this.catalogue()?.tracks.find(/** Track. */ (t) => t.id === this.model().trackId)?.levels ??
				[]
			).filter(/** Active. */ (l) => l.active),
	)
	readonly grades = computed(
		/** Active grades of the catalogue version, by band. */ () =>
			(this.catalogue()?.bands ?? []).flatMap(
				/** Band grades. */ (band) =>
					band.grades
						.filter(/** Active. */ (g) => g.active)
						.map(/** Grade with band. */ (g) => ({ ...g, band: band.name })),
			),
	)
	readonly chosenGrades = computed(
		/** The allowed grades offered as default. */ () =>
			this.grades().filter(/** Chosen. */ (g) => this.gradeIds().includes(g.id)),
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract; references stay server-side. */ (path) => {
			required(path.code, { when: /** Only on create. */ () => !this.existing() })
			pattern(path.code, /^(|[A-Z][A-Z0-9_]{1,39})$/)
			required(path.name, { when: /** Only on create. */ () => !this.existing() })
			maxLength(path.name, 100)
			required(path.familyId)
			required(path.trackId)
			required(path.levelId)
			maxLength(path.summary, 500)
			maxLength(path.purpose, 2000)
			maxLength(path.scopeOfImpact, 2000)
			maxLength(path.autonomyLevel, 500)
			required(path.defaultGradeId)
			required(path.reason)
			pattern(path.reason, /\S/)
			maxLength(path.reason, 500)
		},
	)
	readonly draft = new HcmDraft(
		/** Track the whole draft. */ () => ({
			...this.model(),
			grades: this.gradeIds(),
			responsibilities: this.responsibilities().map(/** Content. */ ({ key: _k, ...r }) => r),
			requirements: this.requirements().map(/** Content. */ ({ key: _k, ...r }) => r),
		}),
	)

	/** Load the current catalogue version and, when editing, the draft. */
	ngOnInit(): void {
		this.draft.markClean()
		if (!this.runtime.context()?.access.permissions.includes(MANAGE_PERMISSION)) return
		const existing: Observable<JobProfileVersionDto | null> =
			this.versionId && this.versionId !== 'new'
				? this.api.readProfileVersion(this.versionId)
				: of(null)
		forkJoin([this.api.catalogues(), existing])
			.pipe(
				switchMap(
					/** Load the current version with every family. */ ([catalogues, profile]) => {
						const current = catalogues.items[0]?.currentVersionId
						if (!current) throw new Error('No published catalogue')
						return forkJoin([
							of(profile),
							this.api.readVersion(current),
							familyTree(this.api, current).pipe(
								map(/** Flat list. */ (tree) => flatFamilies(tree)),
							),
						])
					},
				),
				takeUntilDestroyed(this.destroy),
			)
			.subscribe({
				next: /** Start from the draft, mapped onto the current catalogue version by code. */ ([
					profile,
					catalogue,
					families,
				]) => {
					this.catalogue.set(catalogue)
					this.families.set(families.filter(/** Active. */ (f) => f.active))
					if (profile) this.startFrom(profile, catalogue, families)
					this.draft.markClean()
					this.loadState.set(profile && profile.status !== 'Draft' ? 'unavailable' : 'content')
				},
				error: /** Truthful failure without stale data. */ (error) => {
					this.message.set(jobArchitectureErrorMessage(error))
					this.loadState.set(jobArchitectureDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Fill the form from a draft, mapping references to the current catalogue version by code. */
	private startFrom(
		profile: JobProfileVersionDto,
		catalogue: CatalogueVersionDto,
		families: JobFamilyNodeDto[],
	): void {
		this.existing.set(profile)
		const track = catalogue.tracks.find(/** Same code. */ (t) => t.code === profile.track.code)
		const level = track?.levels.find(/** Same code. */ (l) => l.code === profile.level.code)
		const grades = catalogue.bands.flatMap(/** Grades. */ (b) => b.grades)
		/** The current grade with a code. */
		const grade = (code: string) => grades.find(/** Same code. */ (g) => g.code === code)?.id
		this.model.set({
			code: profile.profileCode,
			name: profile.profileName,
			familyId: families.find(/** Same code. */ (f) => f.code === profile.family.code)?.id ?? '',
			trackId: track?.id ?? '',
			levelId: level?.id ?? '',
			summary: profile.summary,
			purpose: profile.purpose,
			scopeOfImpact: profile.scopeOfImpact,
			autonomyLevel: profile.autonomyLevel,
			defaultGradeId:
				grade(profile.allowedGrades.find(/** Default. */ (g) => g.isDefault)?.code ?? '') ?? '',
			reason: '',
		})
		this.gradeIds.set(
			profile.allowedGrades
				.map(/** Current id. */ (g) => grade(g.code))
				.filter(/** Found. */ (id): id is string => Boolean(id)),
		)
		this.responsibilities.set(
			profile.responsibilities.map(
				/** Row. */ (r) => ({
					key: this.nextKey++,
					code: r.code,
					statement: r.statement,
					essential: r.essential,
				}),
			),
		)
		this.requirements.set(
			profile.requirements.map(
				/** Row. */ (r) => ({
					key: this.nextKey++,
					code: r.code,
					type: r.type,
					name: r.name,
					proficiency: r.proficiency,
					quantity: r.minimumQuantity,
					unit: r.unit ?? 'none',
					mandatory: r.mandatory,
				}),
			),
		)
	}

	/** Keep the level within the chosen track. */
	chooseTrack(): void {
		if (!this.levels().some(/** Still valid. */ (l) => l.id === this.model().levelId))
			this.model.update(/** Reset level. */ (v) => ({ ...v, levelId: this.levels()[0]?.id ?? '' }))
	}

	/** Read the allowed grades; the default stays within them. */
	setGrades(target: EventTarget | null): void {
		const ids = [...((target as { selectedValues?: string[] } | null)?.selectedValues ?? [])]
		this.gradeIds.set(ids)
		if (!ids.includes(this.model().defaultGradeId))
			this.model.update(/** Reset default. */ (v) => ({ ...v, defaultGradeId: ids[0] ?? '' }))
	}

	/** Append an empty responsibility. */
	addResponsibility(): void {
		this.responsibilities.update(
			/** Append. */ (rows) => [
				...rows,
				{ key: this.nextKey++, code: '', statement: '', essential: true },
			],
		)
	}

	/** Append an empty requirement. */
	addRequirement(): void {
		this.requirements.update(
			/** Append. */ (rows) => [
				...rows,
				{
					key: this.nextKey++,
					code: '',
					type: 'Experience',
					name: '',
					proficiency: '',
					quantity: null,
					unit: 'none',
					mandatory: true,
				},
			],
		)
	}

	/** Remove one row. */
	remove(list: 'responsibilities' | 'requirements', key: number): void {
		if (list === 'responsibilities')
			this.responsibilities.update(
				/** Keep others. */ (rows) => rows.filter(/** Other. */ (r) => r.key !== key),
			)
		else
			this.requirements.update(
				/** Keep others. */ (rows) => rows.filter(/** Other. */ (r) => r.key !== key),
			)
	}

	/** Update one responsibility attribute from its control. */
	setResponsibility(
		key: number,
		attribute: 'code' | 'statement' | 'essential',
		target: EventTarget | null,
	): void {
		const control = target as HTMLInputElement | null
		const value = attribute === 'essential' ? control?.checked === true : (control?.value ?? '')
		this.responsibilities.update(
			/** Replace one row. */ (rows) =>
				rows.map(/** Matching row. */ (r) => (r.key === key ? { ...r, [attribute]: value } : r)),
		)
	}

	/** Update one requirement attribute from its control. */
	setRequirement(
		key: number,
		attribute: 'code' | 'type' | 'name' | 'proficiency' | 'quantity' | 'unit' | 'mandatory',
		target: EventTarget | null,
	): void {
		const control = target as HTMLInputElement | null
		let value: unknown = control?.value ?? ''
		if (attribute === 'mandatory') value = control?.checked === true
		if (attribute === 'quantity')
			value = control?.value === '' ? null : Math.max(0, Number(control?.value) || 0)
		this.requirements.update(
			/** Replace one row. */ (rows) =>
				rows.map(/** Matching row. */ (r) => (r.key === key ? { ...r, [attribute]: value } : r)),
		)
	}

	/** Choose a unit; no unit clears the quantity, a unit starts it at zero. */
	setUnit(key: number, target: EventTarget | null): void {
		const unit = ((target as HTMLSelectElement | null)?.value ?? 'none') as QuantityUnit | 'none'
		this.requirements.update(
			/** Replace one row. */ (rows) =>
				rows.map(
					/** Matching row. */ (r) =>
						r.key === key
							? { ...r, unit, quantity: unit === 'none' ? null : (r.quantity ?? 0) }
							: r,
				),
		)
	}

	/** Validate rows the way the contract does; the server stays authoritative. */
	private validRows(): boolean {
		const responsibilities = this.responsibilities()
		const requirements = this.requirements()
		let problem = ''
		if (!this.gradeIds().length) problem = 'Choose at least one allowed grade.'
		else if (
			responsibilities.some(/** Malformed. */ (r) => !CODE.test(r.code) || !r.statement.trim())
		)
			problem = 'Each responsibility needs a code of capital letters and a statement.'
		else if (requirements.some(/** Malformed. */ (r) => !CODE.test(r.code) || !r.name.trim()))
			problem = 'Each requirement needs a code of capital letters and a name.'
		else if (
			requirements.some(/** Unpaired. */ (r) => (r.quantity === null) !== (r.unit === 'none'))
		)
			problem = 'A minimum quantity needs a unit, and a unit needs a quantity.'
		else if (
			new Set(responsibilities.map(/** Code. */ (r) => r.code)).size !== responsibilities.length ||
			new Set(requirements.map(/** Code. */ (r) => r.code)).size !== requirements.length
		)
			problem = 'Codes must be unique within responsibilities and within requirements.'
		this.rowError.set(problem)
		return !problem
	}

	/** Build the draft content from the form. */
	private content(): JobProfileVersionDraft {
		const v = this.model()
		return {
			catalogueVersionId: this.catalogue()?.id ?? '',
			familyId: v.familyId,
			trackId: v.trackId,
			levelId: v.levelId,
			summary: v.summary.trim(),
			purpose: v.purpose.trim(),
			scopeOfImpact: v.scopeOfImpact.trim(),
			autonomyLevel: v.autonomyLevel.trim(),
			responsibilities: this.responsibilities().map(
				/** Responsibility. */ (r, index) => ({
					code: r.code,
					statement: r.statement.trim(),
					essential: r.essential,
					sortOrder: (index + 1) * 10,
				}),
			),
			requirements: this.requirements().map(
				/** Requirement. */ (r, index) => ({
					code: r.code,
					type: r.type,
					name: r.name.trim(),
					description: '',
					proficiency: r.proficiency.trim(),
					minimumQuantity: r.quantity,
					unit: r.unit === 'none' ? null : r.unit,
					mandatory: r.mandatory,
					sortOrder: (index + 1) * 10,
				}),
			),
			allowedGrades: this.gradeIds().map(
				/** Grade. */ (gradeId) => ({ gradeId, isDefault: gradeId === v.defaultGradeId }),
			),
		}
	}

	/** Validate and persist the profile or draft. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		for (const field of [
			this.fields.code,
			this.fields.name,
			this.fields.familyId,
			this.fields.levelId,
			this.fields.defaultGradeId,
			this.fields.reason,
		])
			if (field().invalid()) {
				field().focusBoundControl()
				return
			}
		if (!this.validRows()) return
		const v = this.model()
		const draft = this.content()
		const reason = v.reason.trim()
		const existing = this.existing()
		let call: Observable<JobProfileVersionDto>
		if (existing) {
			const body = { draft, expectedRevision: existing.revision, reason }
			call = this.api.updateProfileVersion(
				existing.id,
				body,
				this.draft.key({ id: existing.id, body }),
			)
		} else {
			const body = { code: v.code, name: v.name.trim(), draft, reason }
			call = this.api.createProfile(body, this.draft.key({ create: body }))
		}
		this.draft.saving.set(true)
		this.draft.error.set('')
		call.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Leave only after the server confirms the transaction. */ (saved) => {
				this.draft.saving.set(false)
				this.draft.markClean()
				void this.router.navigateByUrl(`${BASE_ROUTE}/profiles/${encodeURIComponent(saved.id)}`)
			},
			error: /** Preserve the draft and retry key. */ (error) => {
				this.draft.saving.set(false)
				this.draft.error.set(jobArchitectureErrorMessage(error))
			},
		})
	}

	/** Return to the catalogue; the guard consults the draft. */
	back(): void {
		const existing = this.existing()
		void this.router.navigateByUrl(
			existing ? `${BASE_ROUTE}/profiles/${encodeURIComponent(existing.id)}` : BASE_ROUTE,
		)
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
