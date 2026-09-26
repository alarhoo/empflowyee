import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	HostListener,
	type OnDestroy,
	computed,
	inject,
	signal,
} from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { email, form, FormField, maxLength, pattern, required } from '@angular/forms/signals'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { ComboBox } from '@fundamental-ngx/ui5-webcomponents/combo-box'
import { ComboBoxItem } from '@fundamental-ngx/ui5-webcomponents/combo-box-item'
import { DatePicker } from '@fundamental-ngx/ui5-webcomponents/date-picker'
import { StepInput } from '@fundamental-ngx/ui5-webcomponents/step-input'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmDatePipe, HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	OrganisationStructureApi,
	structureDenied,
	structureErrorMessage,
	structureMissing,
	type StructureDetail,
	type StructureValue,
} from '@empflowyee/hcm-web-workforce-foundation-data-access'
import {
	ENTITY_TYPES,
	LOCATION_TYPES,
	type LegalEntityDto,
	type LocationDto,
	type StructureArea,
	type UnitDetailDto,
} from '@empflowyee/hcm-workforce-foundation-contract'
import { StructureOptionBox, type OptionRef } from './option-box.component'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import {
	MANAGE_PERMISSION,
	MONTHS,
	enumLabel,
	sectionInfo,
	timeZones,
	type StructureAreaInfo,
} from './structure-areas'
import { maxDay } from './profile-dialog.component'

type RoutedArea = Extract<StructureArea, 'legal-entities' | 'locations' | 'units'>
type RefField =
	| 'country'
	| 'registeredLocation'
	| 'reportingCurrency'
	| 'owningUnit'
	| 'unitType'
	| 'parent'
	| 'legalEntity'
	| 'primaryLocation'
	| 'head'

const EMPTY_TEXT = {
	code: '',
	name: '',
	registeredName: '',
	entityType: 'PrivateLimited',
	registrationNumber: '',
	taxIdentificationNumber: '',
	taxDeductionAccountNumber: '',
	socialSecurityEmployerCode: '',
	stateInsuranceEmployerCode: '',
	fyMonth: '',
	incorporatedOn: '',
	operationsStartedOn: '',
	operationsClosedOn: '',
	locationType: 'BranchOffice',
	addressLine1: '',
	addressLine2: '',
	locality: '',
	city: '',
	stateOrProvince: '',
	postalCode: '',
	timeZone: '',
	latitude: '',
	longitude: '',
	contactPhone: '',
	contactEmail: '',
	effectiveFrom: '',
	description: '',
	costCenterCode: '',
	reason: '',
}
const CODE: Record<RoutedArea, RegExp> = {
	'legal-entities': /^[A-Z][A-Z0-9_]{1,39}$/,
	locations: /^[A-Z0-9][A-Z0-9_-]{1,39}$/,
	units: /^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/,
}
const COORDINATE = /^-?\d{1,3}(\.\d{1,6})?$/

/** Dedicated route for the many-field structure forms: legal entities, locations and units. */
@Component({
	selector: 'ef-hcm-structure-edit-page',
	imports: [
		FormField,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		Input,
		TextArea,
		Select,
		Option,
		ComboBox,
		ComboBoxItem,
		DatePicker,
		StepInput,
		CheckBox,
		Text,
		MessageStrip,
		HcmDynamicPage,
		HcmDatePipe,
		StructureOptionBox,
		HcmDiscardDialog,
	],
	templateUrl: './structure-edit-page.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StructureEditPageComponent implements OnDestroy {
	private readonly route = inject(ActivatedRoute)
	private readonly router = inject(Router)
	private readonly api = inject(OrganisationStructureApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	readonly entityTypes = ENTITY_TYPES
	readonly locationTypes = LOCATION_TYPES
	readonly months = MONTHS
	readonly zones = timeZones()
	readonly info: StructureAreaInfo | null = sectionInfo(this.route.snapshot.paramMap.get('area'))
	readonly id = this.route.snapshot.paramMap.get('id')
	readonly area = (this.info?.id ?? 'units') as RoutedArea
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly loaded = signal<StructureDetail | null>(null)
	readonly text = signal({ ...EMPTY_TEXT })
	readonly refs = signal<Partial<Record<RefField, OptionRef | null>>>({})
	readonly fyDay = signal(1)
	readonly geofence = signal<number | null>(null)
	readonly virtual = signal(false)
	readonly refErrors = signal<ReadonlySet<RefField>>(new Set())
	readonly creating = this.id === null
	readonly fields = form(
		this.text,
		/** Synchronous constraints per area mirroring the contract; the server stays authoritative. */ (
			path,
		) => {
			/** Build a condition that applies a rule to one area only. */
			const is = (area: RoutedArea) => /** Match the edited area. */ () => this.area === area
			required(path.code, { when: /** Codes are set only on create. */ () => this.creating })
			pattern(path.code, CODE[this.area])
			required(path.name)
			pattern(path.name, /\S/)
			maxLength(path.name, 150)
			required(path.registeredName, { when: is('legal-entities') })
			maxLength(path.registeredName, 200)
			for (const statutory of [
				path.registrationNumber,
				path.taxIdentificationNumber,
				path.taxDeductionAccountNumber,
				path.socialSecurityEmployerCode,
				path.stateInsuranceEmployerCode,
			])
				maxLength(statutory, 50)
			required(path.city, { when: is('locations') })
			maxLength(path.city, 100)
			maxLength(path.addressLine1, 200)
			maxLength(path.addressLine2, 200)
			maxLength(path.postalCode, 20)
			required(path.timeZone, { when: is('locations') })
			pattern(path.latitude, COORDINATE)
			pattern(path.longitude, COORDINATE)
			email(path.contactEmail)
			maxLength(path.contactPhone, 40)
			required(path.effectiveFrom, { when: is('units') })
			maxLength(path.description, 500)
			maxLength(path.costCenterCode, 40)
			required(path.reason)
			pattern(path.reason, /\S/)
			maxLength(path.reason, 500)
		},
	)
	readonly draft = new HcmDraft(
		/** Track every editable value. */ () => ({
			text: this.text(),
			refs: Object.fromEntries(
				Object.entries(this.refs()).map(
					/** Compare identities only. */ ([k, v]) => [k, v?.id ?? null],
				),
			),
			fyDay: this.fyDay(),
			geofence: this.geofence(),
			virtual: this.virtual(),
		}),
	)
	readonly fyDayMax = computed(
		/** Bound the financial-year day by its month. */ () =>
			this.text().fyMonth ? maxDay(Number(this.text().fyMonth)) : 31,
	)
	readonly title = computed(
		/** Name the explicit operation. */ () => {
			const singular = this.info?.singular.toLowerCase() ?? 'item'
			if (this.creating) return `Create ${singular}`
			if (this.area === 'units') return `Add version to ${this.loaded()?.name ?? 'unit'}`
			return `Edit ${this.loaded()?.name ?? singular}`
		},
	)
	readonly currentUnit = computed(
		/** The loaded unit when adding a version. */ () =>
			this.area === 'units' ? (this.loaded() as UnitDetailDto | null) : null,
	)

	/** Load route inputs before exposing the form. */
	constructor() {
		this.load()
	}

	/** Resolve a fresh revision and seed the draft; creating starts empty. */
	load(): void {
		const routed = ['legal-entities', 'locations', 'units']
		if (!this.info || !routed.includes(this.info.id)) {
			this.state.set('empty')
			return
		}
		if (!this.runtime.context()?.access.permissions.includes(MANAGE_PERMISSION)) {
			this.state.set('denied')
			return
		}
		if (this.creating) {
			this.draft.markClean()
			this.state.set('content')
			return
		}
		this.state.set('loading')
		this.api
			.detail(this.area, this.id ?? '')
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Seed one disposable draft from the loaded revision. */ (item) => {
					this.loaded.set(item)
					this.seed(item)
					this.draft.markClean()
					this.state.set('content')
				},
				error: /** Keep failed loads recoverable. */ (error) => {
					this.message.set(structureErrorMessage(error))
					let state: HcmPageState = 'error'
					if (structureDenied(error)) state = 'denied'
					else if (structureMissing(error)) state = 'empty'
					this.state.set(state)
				},
			})
	}

	/** Copy the loaded DTO into the draft. */
	private seed(item: StructureDetail): void {
		if (this.area === 'legal-entities') {
			const e = item as LegalEntityDto
			this.text.update(
				/** Seed legal-entity text. */ (t) => ({
					...t,
					name: e.name,
					registeredName: e.registeredName,
					entityType: e.entityType,
					registrationNumber: e.registrationNumber,
					taxIdentificationNumber: e.taxIdentificationNumber,
					taxDeductionAccountNumber: e.taxDeductionAccountNumber,
					socialSecurityEmployerCode: e.socialSecurityEmployerCode,
					stateInsuranceEmployerCode: e.stateInsuranceEmployerCode,
					fyMonth: e.financialYearStartMonth === null ? '' : String(e.financialYearStartMonth),
					incorporatedOn: e.incorporatedOn ?? '',
					operationsStartedOn: e.operationsStartedOn ?? '',
					operationsClosedOn: e.operationsClosedOn ?? '',
				}),
			)
			this.fyDay.set(e.financialYearStartDay ?? 1)
			this.refs.set({
				country: { id: e.country.code, name: e.country.name },
				reportingCurrency: { id: e.reportingCurrency.code, name: e.reportingCurrency.name },
				registeredLocation: e.registeredLocation,
			})
		} else if (this.area === 'locations') {
			const l = item as LocationDto
			this.text.update(
				/** Seed location text. */ (t) => ({
					...t,
					name: l.name,
					locationType: l.locationType ?? 'BranchOffice',
					addressLine1: l.addressLine1,
					addressLine2: l.addressLine2,
					locality: l.locality,
					city: l.city,
					stateOrProvince: l.stateOrProvince,
					postalCode: l.postalCode,
					timeZone: l.timeZone,
					latitude: l.latitude === null ? '' : String(l.latitude),
					longitude: l.longitude === null ? '' : String(l.longitude),
					contactPhone: l.contactPhone,
					contactEmail: l.contactEmail,
				}),
			)
			this.geofence.set(l.geofenceRadiusMeters)
			this.virtual.set(l.virtual)
			this.refs.set({
				owningUnit: l.owningUnit,
				country: { id: l.country.code, name: l.country.name },
			})
		} else {
			const u = item as UnitDetailDto
			const current =
				u.versions.find(/** The open version. */ (v) => v.effectiveTo === null) ?? u.versions.at(-1)
			this.text.update(
				/** Seed the next version from the current one. */ (t) => ({
					...t,
					name: current?.name ?? u.name,
					description: current?.description ?? '',
					costCenterCode: current?.costCenterCode ?? '',
				}),
			)
			this.refs.set({
				unitType: current?.unitType ?? u.unitType,
				parent: current?.parent ?? null,
				legalEntity: current?.legalEntity ?? null,
				primaryLocation: current?.primaryLocation ?? null,
				head: current?.headWorker
					? { id: current.headWorker.id, name: current.headWorker.displayName }
					: null,
			})
		}
	}

	/** Read one reference selection. */
	ref(field: RefField): OptionRef | null {
		return this.refs()[field] ?? null
	}

	/** Replace one reference selection. */
	setRef(field: RefField, value: OptionRef | null): void {
		this.refs.update(/** Replace one entry. */ (all) => ({ ...all, [field]: value }))
		if (value)
			this.refErrors.update(
				/** Clear a resolved required error. */ (all) => {
					const next = new Set(all)
					next.delete(field)
					return next
				},
			)
	}

	/** Report whether a required reference is missing after an attempted save. */
	refInvalid(field: RefField): boolean {
		return this.refErrors().has(field)
	}

	/** Build the area-specific mutable value exactly as the contract expects. */
	private value(): StructureValue {
		const t = this.text()
		/** Trim one text field. */
		const s = (value: string) => value.trim()
		/** Read an optional date. */
		const d = (value: string) => value || null
		if (this.area === 'legal-entities')
			return {
				name: s(t.name),
				registeredName: s(t.registeredName),
				entityType: t.entityType as LegalEntityDto['entityType'],
				countryCode: this.ref('country')?.id ?? '',
				registrationNumber: s(t.registrationNumber),
				taxIdentificationNumber: s(t.taxIdentificationNumber),
				taxDeductionAccountNumber: s(t.taxDeductionAccountNumber),
				socialSecurityEmployerCode: s(t.socialSecurityEmployerCode),
				stateInsuranceEmployerCode: s(t.stateInsuranceEmployerCode),
				registeredLocationId: this.ref('registeredLocation')?.id ?? null,
				reportingCurrencyCode: this.ref('reportingCurrency')?.id ?? '',
				financialYearStartMonth: t.fyMonth ? Number(t.fyMonth) : null,
				financialYearStartDay: t.fyMonth ? Math.min(this.fyDay(), this.fyDayMax()) : null,
				incorporatedOn: d(t.incorporatedOn),
				operationsStartedOn: d(t.operationsStartedOn),
				operationsClosedOn: d(t.operationsClosedOn),
			}
		if (this.area === 'locations')
			return {
				name: s(t.name),
				locationType: t.locationType as LocationDto['locationType'] & string,
				owningUnitId: this.ref('owningUnit')?.id ?? '',
				addressLine1: s(t.addressLine1),
				addressLine2: s(t.addressLine2),
				locality: s(t.locality),
				city: s(t.city),
				stateOrProvince: s(t.stateOrProvince),
				postalCode: s(t.postalCode),
				countryCode: this.ref('country')?.id ?? '',
				timeZone: t.timeZone,
				latitude: t.latitude ? Number(t.latitude) : null,
				longitude: t.longitude ? Number(t.longitude) : null,
				geofenceRadiusMeters: this.geofence(),
				contactPhone: s(t.contactPhone),
				contactEmail: s(t.contactEmail),
				virtual: this.virtual(),
			}
		return {
			unitTypeId: this.ref('unitType')?.id ?? '',
			parentId: this.ref('parent')?.id ?? null,
			name: s(t.name),
			description: s(t.description),
			legalEntityId: this.ref('legalEntity')?.id ?? null,
			primaryLocationId: this.ref('primaryLocation')?.id ?? null,
			costCenterCode: s(t.costCenterCode),
			headWorkerId: this.ref('head')?.id ?? null,
			effectiveFrom: t.effectiveFrom,
		}
	}

	/** Required references per area. */
	private requiredRefs(): RefField[] {
		if (this.area === 'legal-entities') return ['country', 'reportingCurrency']
		if (this.area === 'locations') return ['owningUnit', 'country']
		return ['unitType']
	}

	/** Validate, then persist one command with a stable retry key. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		const f = this.fields
		for (const field of [
			f.code,
			f.name,
			f.registeredName,
			f.city,
			f.timeZone,
			f.latitude,
			f.longitude,
			f.contactEmail,
			f.effectiveFrom,
		])
			if (field().invalid()) {
				field().focusBoundControl()
				return
			}
		const missing = this.requiredRefs().filter(
			/** Missing selection. */ (field) => !this.ref(field),
		)
		this.refErrors.set(new Set(missing))
		if (missing.length) {
			this.draft.error.set('Complete the highlighted selections.')
			return
		}
		if (f.reason().invalid()) {
			f.reason().focusBoundControl()
			return
		}
		const value = this.value()
		const reason = this.text().reason.trim()
		const loaded = this.loaded() as { revision: number } | null
		let call
		if (this.creating)
			call = this.api.create(
				this.area,
				{ ...value, code: this.text().code, reason },
				this.draft.key({ create: this.area, code: this.text().code, value, reason }),
			)
		else if (this.area === 'units')
			call = this.api.addUnitVersion(
				this.id ?? '',
				{
					...(value as Parameters<OrganisationStructureApi['addUnitVersion']>[1]),
					expectedRevision: loaded?.revision ?? 0,
					reason,
				},
				this.draft.key({ version: this.id, value, reason }),
			)
		else
			call = this.api.update(
				this.area,
				this.id ?? '',
				{ ...value, expectedRevision: loaded?.revision ?? 0, reason },
				this.draft.key({ update: this.id, value, reason }),
			)
		this.draft.saving.set(true)
		this.draft.error.set('')
		call.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Leave only after the server confirms the transaction. */ (detail) => {
				this.draft.saving.set(false)
				this.draft.markClean()
				this.back(detail.id)
			},
			error: /** Preserve the draft and retry key. */ (error) => {
				this.draft.saving.set(false)
				this.draft.error.set(structureErrorMessage(error))
			},
		})
	}

	/** Split a camel-case enum value into readable words. */
	label(value: string): string {
		return enumLabel(value)
	}

	/** Read an integer StepInput value. */
	integer(value: unknown, fallback: number): number {
		const number = Math.trunc(Number(value))
		return Number.isFinite(number) ? number : fallback
	}

	/** Return to the area, selecting the saved or edited item. */
	back(id?: string): void {
		const item = id ?? this.id
		void this.router.navigate(['/workforce-foundation/organization-structure'], {
			queryParams: { area: this.area, ...(item ? { item } : {}) },
		})
	}

	/** Guard browser back, shell navigation and persona changes. */
	canLeave(): Promise<boolean> {
		return this.draft.canLeave()
	}

	/** Ask the browser before unload would discard a draft. */
	@HostListener('window:beforeunload', ['$event'])
	beforeUnload(event: BeforeUnloadEvent): void {
		if (this.draft.saving() || this.draft.dirty()) event.preventDefault()
	}

	/** Release a pending navigation decision. */
	ngOnDestroy(): void {
		this.draft.release()
	}
}
