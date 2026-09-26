import {
	ChangeDetectionStrategy,
	Component,
	type OnInit,
	computed,
	inject,
	input,
	signal,
} from '@angular/core'
import { form, FormField, maxLength, required } from '@angular/forms/signals'
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
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { MyProfileApi } from '@empflowyee/hcm-web-employee-data-access'
import type { MyContactPointDto, SelfContactPointType } from '@empflowyee/hcm-employee-contract'
import { CONTACT_LABELS } from './labels'
import { ProfileDialog } from './profile-dialog'

export interface ContactDialogRequest {
	/** Types the worker may add; an edit keeps the stored type. */
	types: SelfContactPointType[]
	contact: MyContactPointDto | null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^\+?[0-9][0-9 ()-]{4,28}[0-9]$/

/** Focused Dialog to add or change a personal email or mobile number; values stay unverified. */
@Component({
	selector: 'ef-hcm-my-profile-contact-dialog',
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
		Text,
		MessageStrip,
		HcmDiscardDialog,
	],
	templateUrl: './contact-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactDialog extends ProfileDialog implements OnInit {
	readonly request = input.required<ContactDialogRequest>()
	private readonly api = inject(MyProfileApi)
	readonly labels = CONTACT_LABELS
	readonly model = signal({ type: 'PersonalEmail', value: '' })
	readonly primary = signal(false)
	readonly editing = computed(/** Edit mode. */ () => this.request().contact !== null)
	readonly email = computed(/** Email type. */ () => this.model().type === 'PersonalEmail')
	readonly title = computed(
		/** Name the operation. */ () =>
			this.editing()
				? `Edit ${CONTACT_LABELS[this.model().type as SelfContactPointType].toLowerCase()}`
				: 'Add contact',
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.value)
			maxLength(path.value, 254)
		},
	)
	readonly draft = new HcmDraft(
		/** Track the draft. */ () => ({ ...this.model(), primary: this.primary() }),
	)
	readonly shapeInvalid = signal(false)

	/** Start from the stored contact, or the first addable type. */
	ngOnInit(): void {
		const { contact, types } = this.request()
		this.model.set({
			type: contact?.type ?? types[0] ?? 'PersonalEmail',
			value: contact?.value ?? '',
		})
		this.primary.set(contact?.primary ?? false)
		this.draft.markClean()
	}

	/** Toggle primary. */
	setPrimary(target: EventTarget | null): void {
		this.primary.set((target as HTMLInputElement | null)?.checked === true)
	}

	/** Validate the value shape for its type and submit. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		const v = this.model()
		const value = v.value.trim()
		this.shapeInvalid.set(!(this.email() ? EMAIL : PHONE).test(value))
		if (this.fields.value().invalid() || this.shapeInvalid()) {
			this.fields.value().focusBoundControl()
			return
		}
		const contact = this.request().contact
		if (contact) {
			const body = { value, primary: this.primary(), expectedRevision: contact.revision }
			this.submit(
				this.api.updateContact(contact.id, body, this.draft.key({ contact: contact.id, body })),
			)
			return
		}
		const body = { type: v.type as SelfContactPointType, value }
		this.submit(this.api.addContact(body, this.draft.key({ add: body })))
	}
}
