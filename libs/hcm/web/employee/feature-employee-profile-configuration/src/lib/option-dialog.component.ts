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
import { StepInput } from '@fundamental-ngx/ui5-webcomponents/step-input'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { ProfileConfigurationApi } from '@empflowyee/hcm-web-employee-data-access'
import type { CustomFieldOptionDto, ProfileFieldDetailDto } from '@empflowyee/hcm-employee-contract'
import { ConfigurationDialog } from './dialog-base'

export interface OptionDialogRequest {
	field: ProfileFieldDetailDto
	option: CustomFieldOptionDto | null
	mode: 'add' | 'edit' | 'retire' | 'reactivate'
}

/** Focused Dialog to add, edit, retire or reactivate one option of a select field. */
@Component({
	selector: 'ef-hcm-custom-field-option-dialog',
	imports: [
		FormField,
		Dialog,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		Input,
		StepInput,
		TextArea,
		Text,
		MessageStrip,
		HcmDiscardDialog,
	],
	templateUrl: './option-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OptionDialog extends ConfigurationDialog implements OnInit {
	readonly request = input.required<OptionDialogRequest>()
	readonly saved = output<ProfileFieldDetailDto>()
	readonly closed = output<void>()
	private readonly api = inject(ProfileConfigurationApi)
	readonly model = signal({ code: '', name: '', reason: '' })
	readonly sortOrder = signal(0)
	readonly mode = computed(/** Mode. */ () => this.request().mode)
	readonly detailsShown = computed(
		/** Add and edit show details. */ () => ['add', 'edit'].includes(this.mode()),
	)
	readonly title = computed(
		/** Name the operation and target. */ () => {
			const option = this.request().option?.name ?? ''
			const titles = {
				add: `Add option to ${this.request().field.name}`,
				edit: `Edit option ${option}`,
				retire: `Retire option ${option}`,
				reactivate: `Reactivate option ${option}`,
			}
			return titles[this.mode()]
		},
	)
	readonly confirmLabel = computed(
		/** Name the command. */ () =>
			({ add: 'Add option', edit: 'Save', retire: 'Retire', reactivate: 'Reactivate' })[
				this.mode()
			],
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.code, { when: /** Only on add. */ () => this.mode() === 'add' })
			pattern(path.code, /^[A-Z][A-Z0-9_]{0,39}$/)
			required(path.name)
			pattern(path.name, /\S/)
			maxLength(path.name, 100)
			required(path.reason)
			pattern(path.reason, /\S/)
			maxLength(path.reason, 500)
		},
	)
	readonly draft = new HcmDraft(
		/** Track the draft. */ () => ({ ...this.model(), order: this.sortOrder() }),
	)

	/** Start from the stored option, or defaults for a new one. */
	ngOnInit(): void {
		const option = this.request().option
		const count = this.request().field.customField?.options.length ?? 0
		this.model.set({ code: option?.code ?? '', name: option?.name ?? '', reason: '' })
		this.sortOrder.set(option?.sortOrder ?? count)
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
		for (const field of [this.fields.code, this.fields.name, this.fields.reason])
			if (field().invalid()) {
				field().focusBoundControl()
				return
			}
		const { field, option } = this.request()
		const custom = field.customField
		if (!custom) return
		const v = this.model()
		const reason = v.reason.trim()
		if (this.mode() === 'add') {
			const body = {
				code: v.code,
				name: v.name.trim(),
				sortOrder: this.sortOrder(),
				expectedRevision: custom.revision,
				reason,
			}
			this.submit(this.api.addOption(custom.id, body, this.draft.key({ add: custom.id, body })))
			return
		}
		if (!option) return
		const body = {
			name: v.name.trim(),
			sortOrder: this.sortOrder(),
			active: this.mode() === 'edit' ? option.active : this.mode() === 'reactivate',
			expectedRevision: custom.revision,
			reason,
		}
		this.submit(
			this.api.updateOption(
				custom.id,
				option.id,
				body,
				this.draft.key({ option: option.id, body }),
			),
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
