import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	HostListener,
	type OnDestroy,
	type OnInit,
	computed,
	inject,
	input,
	output,
	signal,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { form, FormField, maxLength, pattern, required } from '@angular/forms/signals'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { StepInput } from '@fundamental-ngx/ui5-webcomponents/step-input'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import {
	OrganisationStructureApi,
	structureErrorMessage,
	type StructureDetail,
	type StructureValue,
} from '@empflowyee/hcm-web-workforce-foundation-data-access'
import type {
	DepartmentDto,
	DesignationDto,
	StructureArea,
	UnitTypeDto,
} from '@empflowyee/hcm-workforce-foundation-contract'
import { StructureOptionBox, type OptionRef } from './option-box.component'
import { StructureDiscardDialog } from './discard-dialog.component'
import { StructureDraft } from './structure-draft'
import type { StructureAreaInfo } from './structure-areas'

export type DialogArea = Extract<StructureArea, 'unit-types' | 'departments' | 'designations'>
export interface ItemDialogRequest {
	area: StructureAreaInfo
	item: StructureDetail | null
}

const CODE = /^[A-Z][A-Z0-9_]{1,39}$/

/** Focused create/edit Dialog for unit types, departments and designations. */
@Component({
	selector: 'ef-hcm-structure-item-dialog',
	imports: [
		FormField,
		Dialog,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		Input,
		TextArea,
		StepInput,
		CheckBox,
		Text,
		MessageStrip,
		StructureOptionBox,
		StructureDiscardDialog,
	],
	templateUrl: './item-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StructureItemDialog implements OnInit, OnDestroy {
	readonly request = input.required<ItemDialogRequest>()
	readonly saved = output<StructureDetail>()
	readonly closed = output<void>()
	private readonly api = inject(OrganisationStructureApi)
	private readonly destroy = inject(DestroyRef)
	readonly model = signal({
		code: '',
		name: '',
		pluralName: '',
		description: '',
		costCenterCode: '',
		reason: '',
	})
	readonly parent = signal<OptionRef | null>(null)
	readonly head = signal<OptionRef | null>(null)
	readonly sortOrder = signal(0)
	readonly targetHeadcount = signal<number | null>(null)
	readonly legalEntityBearing = signal(false)
	readonly allowMultiplePerParent = signal(true)
	readonly creating = computed(/** Distinguish create from edit. */ () => !this.request().item)
	readonly area = computed(
		/** The dialog serves only the small-form areas. */ () => this.request().area.id as DialogArea,
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract; the server stays authoritative. */ (
			path,
		) => {
			required(path.code, { when: /** Codes are set only on create. */ () => this.creating() })
			pattern(path.code, CODE)
			required(path.name)
			pattern(path.name, /\S/)
			maxLength(path.name, 150)
			required(path.pluralName, {
				when: /** Only unit types have a plural name. */ () => this.area() === 'unit-types',
			})
			maxLength(path.pluralName, 100)
			maxLength(path.description, 500)
			maxLength(path.costCenterCode, 40)
			required(path.reason)
			pattern(path.reason, /\S/)
			maxLength(path.reason, 500)
		},
	)
	readonly draft = new StructureDraft(
		/** Every editable value participates in dirty tracking. */ () => ({
			model: this.model(),
			parent: this.parent()?.id ?? null,
			head: this.head()?.id ?? null,
			sortOrder: this.sortOrder(),
			targetHeadcount: this.targetHeadcount(),
			legalEntityBearing: this.legalEntityBearing(),
			allowMultiplePerParent: this.allowMultiplePerParent(),
		}),
	)
	readonly title = computed(
		/** Name the explicit operation. */ () =>
			`${this.creating() ? 'Create' : 'Edit'} ${this.request().area.singular.toLowerCase()}`,
	)
	readonly parentKind = computed(
		/** Parents are of the same area, except unit types which name a parent type. */ () =>
			this.area(),
	)
	private allowClose = false

	/** Seed the draft from the loaded revision once. */
	ngOnInit(): void {
		const item = this.request().item
		if (item && this.area() === 'unit-types') {
			const type = item as UnitTypeDto
			this.model.update(
				/** Seed unit-type fields. */ (v) => ({
					...v,
					name: type.name,
					pluralName: type.pluralName,
				}),
			)
			this.parent.set(type.parentType)
			this.sortOrder.set(type.sortOrder)
			this.legalEntityBearing.set(type.legalEntityBearing)
			this.allowMultiplePerParent.set(type.allowMultiplePerParent)
		} else if (item && this.area() === 'departments') {
			const dept = item as DepartmentDto
			this.model.update(
				/** Seed department fields. */ (v) => ({
					...v,
					name: dept.name,
					description: dept.description,
					costCenterCode: dept.costCenterCode,
				}),
			)
			this.parent.set(dept.parent)
			this.head.set(
				dept.headWorker ? { id: dept.headWorker.id, name: dept.headWorker.displayName } : null,
			)
			this.sortOrder.set(dept.sortOrder)
			this.targetHeadcount.set(dept.targetHeadcount)
		} else if (item) {
			const title = item as DesignationDto
			this.model.update(
				/** Seed designation fields. */ (v) => ({
					...v,
					name: title.name,
					description: title.description,
				}),
			)
			this.parent.set(title.parent)
			this.sortOrder.set(title.sortOrder)
		}
		this.draft.markClean()
	}

	/** Build the area-specific mutable value exactly as the contract expects. */
	private value(): StructureValue {
		const v = this.model()
		if (this.area() === 'unit-types') {
			const base = {
				name: v.name.trim(),
				pluralName: v.pluralName.trim(),
				allowMultiplePerParent: this.allowMultiplePerParent(),
				sortOrder: this.sortOrder(),
			}
			if (!this.creating()) return base
			const chain = {
				parentTypeId: this.parent()?.id ?? null,
				legalEntityBearing: this.legalEntityBearing(),
			}
			return { ...base, ...chain }
		}
		if (this.area() === 'departments')
			return {
				name: v.name.trim(),
				description: v.description.trim(),
				parentId: this.parent()?.id ?? null,
				headWorkerId: this.head()?.id ?? null,
				costCenterCode: v.costCenterCode.trim(),
				targetHeadcount: this.targetHeadcount(),
				sortOrder: this.sortOrder(),
			}
		return {
			name: v.name.trim(),
			description: v.description.trim(),
			parentId: this.parent()?.id ?? null,
			sortOrder: this.sortOrder(),
		}
	}

	/** Validate, then persist exactly one command with a stable retry key. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		for (const field of [
			this.fields.code,
			this.fields.name,
			this.fields.pluralName,
			this.fields.reason,
		])
			if (field().invalid()) {
				field().focusBoundControl()
				return
			}
		const request = this.request()
		const area = this.area()
		const reason = this.model().reason.trim()
		const item = request.item
		const value = this.value()
		let call
		if (item) {
			const body = { ...value, expectedRevision: (item as UnitTypeDto).revision, reason }
			call = this.api.update(area, item.id, body, this.draft.key({ area, id: item.id, body }))
		} else {
			const body = { ...value, code: this.model().code, reason }
			call = this.api.create(area, body, this.draft.key({ area, body }))
		}
		this.draft.saving.set(true)
		this.draft.error.set('')
		call.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Close only after the server confirms the transaction. */ (detail) => {
				this.draft.saving.set(false)
				this.draft.markClean()
				this.allowClose = true
				this.saved.emit(detail)
			},
			error: /** Preserve the draft and retry key. */ (error) => {
				this.draft.saving.set(false)
				this.draft.error.set(structureErrorMessage(error))
			},
		})
	}

	/** Route Cancel and Escape through the same discard rule. */
	async cancel(): Promise<void> {
		if (await this.draft.canLeave()) {
			this.allowClose = true
			this.closed.emit()
		}
	}

	/** Keep dirty drafts when native Escape requests dismissal. */
	beforeClose(event: Event): void {
		if (event.target !== event.currentTarget || this.allowClose) return
		event.preventDefault()
		void this.cancel()
	}

	/** Allow the shell's navigation guard to consult this draft. */
	canLeave(): Promise<boolean> {
		return this.draft.canLeave()
	}

	/** Read a StepInput value as an integer. */
	integer(value: unknown): number {
		return Math.trunc(Number(value) || 0)
	}

	/** Read an optional StepInput value; an empty control means no target. */
	optionalInteger(target: EventTarget | null): number | null {
		const raw = (target as HTMLInputElement | null)?.value
		return raw === undefined || raw === null || String(raw) === '' ? null : this.integer(raw)
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
