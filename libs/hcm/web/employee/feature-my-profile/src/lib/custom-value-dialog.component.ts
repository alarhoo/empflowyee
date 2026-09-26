import {
	ChangeDetectionStrategy,
	Component,
	type OnInit,
	computed,
	inject,
	input,
	signal,
} from '@angular/core'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { StepInput } from '@fundamental-ngx/ui5-webcomponents/step-input'
import { DatePicker } from '@fundamental-ngx/ui5-webcomponents/date-picker'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { MultiComboBox } from '@fundamental-ngx/ui5-webcomponents/multi-combo-box'
import { MultiComboBoxItem } from '@fundamental-ngx/ui5-webcomponents/multi-combo-box-item'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { MyProfileApi } from '@empflowyee/hcm-web-employee-data-access'
import type { CustomValue, MyProfileFieldDto } from '@empflowyee/hcm-employee-contract'
import { ProfileDialog } from './profile-dialog'

/** Focused Dialog for one Direct additional-information value, using the control of its data type. */
@Component({
	selector: 'ef-hcm-my-profile-custom-value-dialog',
	imports: [
		Dialog,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		Input,
		TextArea,
		StepInput,
		DatePicker,
		CheckBox,
		Select,
		Option,
		MultiComboBox,
		MultiComboBoxItem,
		Text,
		MessageStrip,
		HcmDiscardDialog,
	],
	templateUrl: './custom-value-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomValueDialog extends ProfileDialog implements OnInit {
	readonly field = input.required<MyProfileFieldDto>()
	private readonly api = inject(MyProfileApi)
	readonly text = signal('')
	readonly flag = signal(false)
	readonly chosen = signal<string[]>([])
	readonly invalid = signal(false)
	readonly type = computed(/** Data type. */ () => this.field().custom?.dataType ?? 'Text')
	readonly title = computed(/** Target. */ () => `Edit ${this.field().name}`)
	readonly draft = new HcmDraft(
		/** Track the draft. */ () => ({ text: this.text(), flag: this.flag(), chosen: this.chosen() }),
	)

	/** Start from the stored value. */
	ngOnInit(): void {
		const value = this.field().custom?.value ?? null
		if (Array.isArray(value)) this.chosen.set(value)
		else if (typeof value === 'boolean') this.flag.set(value)
		else if (value !== null) this.text.set(String(value))
		this.draft.markClean()
	}

	/** Read a text-like control. */
	setText(target: EventTarget | null): void {
		this.text.set(String((target as HTMLInputElement | null)?.value ?? ''))
	}

	/** Read the DatePicker's timezone-free value. */
	setDate(value: string): void {
		this.text.set(value)
	}

	/** Read the CheckBox. */
	setFlag(target: EventTarget | null): void {
		this.flag.set((target as HTMLInputElement | null)?.checked === true)
	}

	/** Read the MultiComboBox selection. */
	setChosen(target: EventTarget | null): void {
		this.chosen.set([...((target as { selectedValues?: string[] } | null)?.selectedValues ?? [])])
	}

	/** Convert the control state to the contract value; undefined is invalid. */
	private value(): CustomValue | undefined {
		const text = this.text().trim()
		switch (this.type()) {
			case 'Integer':
			case 'Decimal': {
				if (text === '') return null
				const number = Number(text)
				const valid =
					this.type() === 'Integer' ? Number.isSafeInteger(number) : Number.isFinite(number)
				return valid ? number : undefined
			}
			case 'Boolean':
				return this.flag()
			case 'MultiSelect':
				return this.chosen().length ? this.chosen() : null
			case 'SingleSelect':
				return text === 'none' || text === '' ? null : text
			case 'Text':
				return text.length > 200 ? undefined : text || null
			default:
				return text.length > 4000 ? undefined : text || null
		}
	}

	/** Validate and submit. */
	save(): void {
		if (this.draft.saving()) return
		const value = this.value()
		this.invalid.set(value === undefined)
		if (value === undefined) return
		const body = { value, expectedRevision: this.field().custom?.revision ?? null }
		const id = this.field().ref.slice('custom:'.length)
		this.submit(this.api.setCustomValue(id, body, this.draft.key({ custom: id, body })))
	}
}
