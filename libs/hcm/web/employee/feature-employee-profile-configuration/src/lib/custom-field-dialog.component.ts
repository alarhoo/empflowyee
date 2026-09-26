import {
	ChangeDetectionStrategy,
	Component,
	type OnInit,
	computed,
	inject,
	input,
	output,
	signal,
} from '@angular/core'
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
import { StepInput } from '@fundamental-ngx/ui5-webcomponents/step-input'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { ProfileConfigurationApi } from '@empflowyee/hcm-web-employee-data-access'
import {
	PROFILE_SECTIONS,
	type ProfileFieldDetailDto,
	type ProfileSection,
} from '@empflowyee/hcm-employee-contract'
import { ConfigurationDialog } from './dialog-base'

export interface CustomFieldDialogRequest {
	field: ProfileFieldDetailDto
	mode: 'edit' | 'retire' | 'reactivate'
}

/** Focused Dialog to edit a custom field's mutable attributes, or retire and reactivate it. */
@Component({
	selector: 'ef-hcm-custom-field-dialog',
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
		StepInput,
		TextArea,
		Text,
		MessageStrip,
		HcmDiscardDialog,
	],
	templateUrl: './custom-field-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomFieldDialog extends ConfigurationDialog implements OnInit {
	readonly request = input.required<CustomFieldDialogRequest>()
	readonly saved = output<ProfileFieldDetailDto>()
	readonly closed = output<void>()
	private readonly api = inject(ProfileConfigurationApi)
	readonly sections = PROFILE_SECTIONS
	readonly model = signal({ name: '', description: '', section: 'Other', reason: '' })
	readonly sortOrder = signal(0)
	readonly editing = computed(/** Edit mode. */ () => this.request().mode === 'edit')
	readonly retiring = computed(/** Retire mode. */ () => this.request().mode === 'retire')
	readonly title = computed(
		/** Name the operation and target. */ () => {
			const name = this.request().field.name
			if (this.editing()) return `Edit ${name}`
			return `${this.retiring() ? 'Retire' : 'Reactivate'} ${name}`
		},
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.name)
			pattern(path.name, /\S/)
			maxLength(path.name, 100)
			maxLength(path.description, 500)
			required(path.reason)
			pattern(path.reason, /\S/)
			maxLength(path.reason, 500)
		},
	)
	readonly draft = new HcmDraft(
		/** Track the draft. */ () => ({ ...this.model(), order: this.sortOrder() }),
	)

	/** Start from the stored definition. */
	ngOnInit(): void {
		const custom = this.request().field.customField
		this.model.set({
			name: custom?.name ?? '',
			description: custom?.description ?? '',
			section: custom?.section ?? 'Other',
			reason: '',
		})
		this.sortOrder.set(custom?.sortOrder ?? 0)
		this.draft.markClean()
	}

	/** Read a StepInput value as a bounded integer. */
	setOrder(target: EventTarget | null): void {
		const raw = Math.trunc(Number((target as HTMLInputElement | null)?.value) || 0)
		this.sortOrder.set(Math.min(9999, Math.max(0, raw)))
	}

	/** Validate and submit. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		for (const field of [this.fields.name, this.fields.description, this.fields.reason])
			if (field().invalid()) {
				field().focusBoundControl()
				return
			}
		const custom = this.request().field.customField
		if (!custom) return
		const v = this.model()
		const body = {
			name: v.name.trim(),
			description: v.description.trim(),
			section: v.section as ProfileSection,
			sortOrder: this.sortOrder(),
			active: this.editing() ? custom.active : !this.retiring(),
			expectedRevision: custom.revision,
			reason: v.reason.trim(),
		}
		this.submit(
			this.api.updateCustomField(custom.id, body, this.draft.key({ id: custom.id, body })),
		)
	}

	/** Publish the committed field. */
	protected emitSaved(field: ProfileFieldDetailDto): void {
		this.saved.emit(field)
	}

	/** Publish dismissal. */
	protected emitClosed(): void {
		this.closed.emit()
	}
}
