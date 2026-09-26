import {
	ChangeDetectionStrategy,
	Component,
	type OnInit,
	computed,
	inject,
	input,
	signal,
} from '@angular/core'
import { form, FormField, maxLength } from '@angular/forms/signals'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { MyProfileApi, type PersonalBody } from '@empflowyee/hcm-web-employee-data-access'
import {
	BLOOD_GROUP_VALUES,
	type BloodGroupValue,
	type MyProfileDto,
} from '@empflowyee/hcm-employee-contract'
import { ProfileDialog } from './profile-dialog'

/** Focused Dialog for the personal facts the worker maintains directly. */
@Component({
	selector: 'ef-hcm-my-profile-personal-dialog',
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
		Text,
		MessageStrip,
		HcmDiscardDialog,
	],
	templateUrl: './personal-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PersonalDialog extends ProfileDialog implements OnInit {
	readonly profile = input.required<MyProfileDto>()
	private readonly api = inject(MyProfileApi)
	readonly bloodGroups = BLOOD_GROUP_VALUES
	readonly model = signal({ preferredName: '', bloodGroup: 'none' })
	readonly editsName = computed(
		/** Preferred name is Direct. */ () => this.direct('preferred-name'),
	)
	readonly editsBlood = computed(/** Blood group is Direct. */ () => this.direct('blood-group'))
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			maxLength(path.preferredName, 100)
		},
	)
	readonly draft = new HcmDraft(/** Track the draft. */ () => this.model())

	/** Whether a field is editable directly. */
	private direct(code: string): boolean {
		return this.profile().fields.some(
			/** Field. */ (field) => field.code === code && field.editMode === 'Direct',
		)
	}

	/** The stored value of a field. */
	private value(code: string): string {
		return this.profile().fields.find(/** Field. */ (field) => field.code === code)?.value ?? ''
	}

	/** Start from the stored values. */
	ngOnInit(): void {
		this.model.set({
			preferredName: this.value('preferred-name'),
			bloodGroup: this.value('blood-group') || 'none',
		})
		this.draft.markClean()
	}

	/** Validate and submit only the directly editable facts. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		if (this.fields.preferredName().invalid()) {
			this.fields.preferredName().focusBoundControl()
			return
		}
		const v = this.model()
		const body: PersonalBody = { expectedRevision: this.profile().personRevision ?? 0 }
		if (this.editsName()) body.preferredName = v.preferredName.trim()
		if (this.editsBlood())
			body.bloodGroup = v.bloodGroup === 'none' ? null : (v.bloodGroup as BloodGroupValue)
		this.submit(this.api.updatePersonal(body, this.draft.key({ personal: body })))
	}
}
