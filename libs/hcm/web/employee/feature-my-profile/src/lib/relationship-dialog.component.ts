import {
	ChangeDetectionStrategy,
	Component,
	type OnInit,
	computed,
	inject,
	input,
	signal,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { forkJoin } from 'rxjs'
import { form, FormField, maxLength, pattern, required } from '@angular/forms/signals'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { DatePicker } from '@fundamental-ngx/ui5-webcomponents/date-picker'
import { StepInput } from '@fundamental-ngx/ui5-webcomponents/step-input'
import { BusyIndicator } from '@fundamental-ngx/ui5-webcomponents/busy-indicator'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import {
	MyProfileApi,
	employeeErrorMessage,
	type RelationshipBody,
} from '@empflowyee/hcm-web-employee-data-access'
import type { MyReferenceItemDto, MyRelationshipDto } from '@empflowyee/hcm-employee-contract'
import { ProfileDialog } from './profile-dialog'

export interface RelationshipDialogRequest {
	relationship: MyRelationshipDto | null
	/** Whether emergency contacts are directly editable. */
	emergency: boolean
	/** Whether family members and dependants are directly editable. */
	family: boolean
	/** Emergency priorities already taken by other entries. */
	takenPriorities: number[]
}

/** Focused Dialog to add or change an emergency contact or family member. */
@Component({
	selector: 'ef-hcm-my-profile-relationship-dialog',
	imports: [
		FormField,
		Dialog,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		Input,
		Select,
		Option,
		CheckBox,
		DatePicker,
		StepInput,
		BusyIndicator,
		Text,
		MessageStrip,
		HcmDiscardDialog,
	],
	templateUrl: './relationship-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RelationshipDialog extends ProfileDialog implements OnInit {
	readonly request = input.required<RelationshipDialogRequest>()
	private readonly api = inject(MyProfileApi)
	readonly types = signal<MyReferenceItemDto[]>([])
	readonly genders = signal<MyReferenceItemDto[]>([])
	readonly optionsState = signal<'loading' | 'ready' | 'error'>('loading')
	readonly optionsError = signal('')
	readonly model = signal({
		relationshipType: '',
		fullName: '',
		birthDate: '',
		gender: 'none',
		contactNumber: '',
	})
	readonly dependent = signal(false)
	readonly emergencyContact = signal(false)
	readonly priority = signal(1)
	readonly editing = computed(/** Edit mode. */ () => this.request().relationship !== null)
	readonly title = computed(
		/** Name the operation. */ () =>
			this.editing() ? `Edit ${this.request().relationship?.fullName}` : 'Add person',
	)
	readonly dependentAllowed = computed(
		/** Only eligible relationship types may be dependants. */ () =>
			this.types().find(/** Type. */ (type) => type.code === this.model().relationshipType)
				?.dependentEligible === true,
	)
	readonly priorityTaken = computed(
		/** Priorities are unique per person. */ () =>
			this.emergencyContact() && this.request().takenPriorities.includes(this.priority()),
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.relationshipType)
			required(path.fullName)
			pattern(path.fullName, /\S/)
			maxLength(path.fullName, 150)
			pattern(path.contactNumber, /^(\+?[0-9][0-9 ()-]{4,28}[0-9])?$/)
			required(path.contactNumber, {
				when: /** Emergency contacts need a number. */ () => this.emergencyContact(),
			})
		},
	)
	readonly draft = new HcmDraft(
		/** Track the draft. */ () => ({
			...this.model(),
			dependent: this.dependent(),
			emergency: this.emergencyContact(),
			priority: this.priority(),
		}),
	)

	/** Start from the stored entry and load the reference options. */
	ngOnInit(): void {
		const current = this.request().relationship
		const { emergency, family } = this.request()
		this.model.set({
			relationshipType: current?.relationshipType ?? '',
			fullName: current?.fullName ?? '',
			birthDate: current?.birthDate ?? '',
			gender: current?.genderCode ?? 'none',
			contactNumber: current?.contactNumber ?? '',
		})
		this.dependent.set(current?.dependent ?? false)
		this.emergencyContact.set(current?.emergencyContact ?? (emergency && !family))
		this.priority.set(current?.emergencyPriority ?? this.freePriority())
		this.draft.markClean()
		this.loadOptions()
	}

	/** Load relationship types and genders from the server. */
	loadOptions(): void {
		this.optionsState.set('loading')
		forkJoin([this.api.options('relationship-types'), this.api.options('genders')])
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish options. */ ([types, genders]) => {
					this.types.set(types.items)
					this.genders.set(genders.items)
					if (!this.model().relationshipType && types.items[0])
						this.model.update(
							/** Default type. */ (v) => ({ ...v, relationshipType: types.items[0]?.code ?? '' }),
						)
					this.draft.markClean()
					this.optionsState.set('ready')
				},
				error: /** Options unavailable. */ (error) => {
					this.optionsError.set(employeeErrorMessage(error))
					this.optionsState.set('error')
				},
			})
	}

	/** The lowest free emergency priority. */
	private freePriority(): number {
		let priority = 1
		while (this.request().takenPriorities.includes(priority)) priority++
		return priority
	}

	/** Toggle a CheckBox-backed flag. */
	setFlag(flag: 'dependent' | 'emergency', target: EventTarget | null): void {
		const checked = (target as HTMLInputElement | null)?.checked === true
		if (flag === 'dependent') this.dependent.set(checked)
		else this.emergencyContact.set(checked)
	}

	/** Read the StepInput priority as a bounded integer. */
	setPriority(target: EventTarget | null): void {
		const raw = Math.trunc(Number((target as HTMLInputElement | null)?.value) || 1)
		this.priority.set(Math.min(99, Math.max(1, raw)))
	}

	/** Read the DatePicker's timezone-free value. */
	setBirthDate(value: string): void {
		this.model.update(/** Birth date. */ (v) => ({ ...v, birthDate: value }))
	}

	/** Validate and submit. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		for (const field of [
			this.fields.relationshipType,
			this.fields.fullName,
			this.fields.contactNumber,
		])
			if (field().invalid()) {
				field().focusBoundControl()
				return
			}
		if (this.priorityTaken()) return
		const v = this.model()
		const emergency = this.emergencyContact()
		const body: RelationshipBody = {
			relationshipType: v.relationshipType,
			fullName: v.fullName.trim(),
			birthDate: v.birthDate || null,
			gender: v.gender === 'none' ? null : v.gender,
			contactNumber: v.contactNumber.trim(),
			dependent: this.dependent() && this.dependentAllowed(),
			emergencyContact: emergency,
			emergencyPriority: emergency ? this.priority() : null,
		}
		const current = this.request().relationship
		if (current) {
			const update = { ...body, expectedRevision: current.revision }
			this.submit(
				this.api.updateRelationship(
					current.id,
					update,
					this.draft.key({ relationship: current.id, update }),
				),
			)
			return
		}
		this.submit(this.api.addRelationship(body, this.draft.key({ add: body })))
	}
}
