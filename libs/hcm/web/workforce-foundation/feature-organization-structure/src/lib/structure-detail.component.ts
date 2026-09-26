import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	effect,
	inject,
	input,
	output,
	signal,
	untracked,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Link } from '@fundamental-ngx/ui5-webcomponents/link'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Timeline } from '@fundamental-ngx/ui5-webcomponents-fiori/timeline'
import { TimelineItem } from '@fundamental-ngx/ui5-webcomponents-fiori/timeline-item'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import type { HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmDatePipe, HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	OrganisationStructureApi,
	structureDenied,
	structureErrorMessage,
	structureMissing,
	type StructureDetail,
} from '@empflowyee/hcm-web-workforce-foundation-data-access'
import type {
	DepartmentDto,
	DesignationDto,
	LegalEntityDto,
	LocationDto,
	StructureArea,
	UnitDetailDto,
	UnitTypeDto,
} from '@empflowyee/hcm-workforce-foundation-contract'
import '@ui5/webcomponents-icons/dist/history.js'
import { MONTHS, enumLabel, type StructureAreaInfo } from './structure-areas'

/** End column: one structure item as an Object Page with overview, versions and usage. */
@Component({
	selector: 'ef-hcm-structure-detail',
	imports: [
		ObjectStatusComponent,
		Form,
		FormItem,
		Label,
		Text,
		Link,
		CheckBox,
		MessageStrip,
		Timeline,
		TimelineItem,
		HcmObjectPage,
		HcmObjectSection,
		HcmDatePipe,
	],
	templateUrl: './structure-detail.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StructureDetailComponent {
	readonly area = input.required<StructureAreaInfo>()
	readonly itemId = input.required<string>()
	readonly asOf = input('')
	readonly refresh = input(0)
	readonly canManage = input(false)
	readonly closed = output<void>()
	readonly edit = output<StructureDetail>()
	readonly status = output<StructureDetail>()
	private readonly api = inject(OrganisationStructureApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	readonly months = MONTHS
	readonly item = signal<StructureDetail | null>(null)
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly legalEntity = computed(
		/** Narrow the DTO for the legal-entity overview. */ () =>
			this.is('legal-entities') ? (this.item() as LegalEntityDto) : null,
	)
	readonly unitType = computed(
		/** Narrow the DTO for the unit-type overview. */ () =>
			this.is('unit-types') ? (this.item() as UnitTypeDto) : null,
	)
	readonly unit = computed(
		/** Narrow the DTO for the unit overview, versions and usage. */ () =>
			this.is('units') ? (this.item() as UnitDetailDto) : null,
	)
	readonly department = computed(
		/** Narrow the DTO for the department overview. */ () =>
			this.is('departments') ? (this.item() as DepartmentDto) : null,
	)
	readonly designation = computed(
		/** Narrow the DTO for the designation overview. */ () =>
			this.is('designations') ? (this.item() as DesignationDto) : null,
	)
	readonly location = computed(
		/** Narrow the DTO for the location overview. */ () =>
			this.is('locations') ? (this.item() as LocationDto) : null,
	)
	readonly active = computed(
		/** Read the item's availability regardless of its area-specific field name. */ () => {
			const item = this.item()
			if (!item) return false
			return 'enabled' in item ? item.enabled : item.active
		},
	)
	readonly actions = computed(
		/** Offer area-appropriate commands; the server re-authorizes every one. */ () => {
			const item = this.item()
			const actions: { id: string; label: string; mutates?: boolean; emphasized?: boolean }[] = [
				{ id: 'close', label: `Back to ${this.area().label.toLowerCase()}` },
			]
			if (!item || !this.canManage()) return actions
			if (this.is('units')) {
				if (this.active()) {
					actions.push({ id: 'edit', label: 'Add version', mutates: true, emphasized: true })
					actions.push({ id: 'status', label: 'Retire unit', mutates: true })
				}
				return actions
			}
			actions.push({ id: 'edit', label: 'Edit', mutates: true, emphasized: true })
			const labels = this.is('unit-types') ? ['Disable', 'Enable'] : ['Retire', 'Reactivate']
			actions.push({ id: 'status', label: labels[this.active() ? 0 : 1], mutates: true })
			return actions
		},
	)

	/** Reload when the selection, as-of date, committed changes or context change. */
	constructor() {
		effect(
			/** Track the inputs that identify the displayed object. */ () => {
				this.area()
				this.itemId()
				this.asOf()
				this.refresh()
				this.runtime.context()
				untracked(/** Load outside signal tracking. */ () => this.load())
			},
		)
	}

	/** Report whether the displayed item belongs to an area. */
	is(area: StructureArea): boolean {
		return this.area().id === area
	}

	/** Read a fresh revision of the selected item. */
	load(): void {
		this.state.set('loading')
		this.item.set(null)
		this.message.set('')
		this.api
			.detail(
				this.area().id as StructureArea,
				this.itemId(),
				this.is('units') && this.asOf() ? this.asOf() : undefined,
			)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the server projection. */ (item) => {
					this.item.set(item)
					this.state.set('content')
				},
				error: /** Map failure to truthful state. */ (error) => {
					this.message.set(structureErrorMessage(error))
					let state: HcmPageState = 'error'
					if (structureDenied(error)) state = 'denied'
					else if (structureMissing(error)) state = 'empty'
					this.state.set(state)
				},
			})
	}

	/** Split a camel-case enum value into readable words. */
	label(value: string | null | undefined): string {
		return enumLabel(value)
	}

	/** Join the non-empty address parts of a location. */
	address(place: LocationDto): string {
		return [
			place.addressLine1,
			place.addressLine2,
			place.locality,
			place.city,
			place.stateOrProvince,
			place.postalCode,
		]
			.filter(/** Keep populated parts. */ (part) => part !== '')
			.join(', ')
	}

	/** Describe an optional recurring financial-year start. */
	yearStart(month: number | null, day: number | null): string {
		return month === null || day === null ? '—' : `${MONTHS[month - 1]} ${day}`
	}

	/** Route object actions to the owning shell. */
	action(id: string): void {
		const item = this.item()
		if (id === 'close') this.closed.emit()
		else if (id === 'edit' && item) this.edit.emit(item)
		else if (id === 'status' && item) this.status.emit(item)
	}
}
