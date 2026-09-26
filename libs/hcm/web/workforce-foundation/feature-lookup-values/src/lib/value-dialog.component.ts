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
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { StepInput } from '@fundamental-ngx/ui5-webcomponents/step-input'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import {
	LookupValuesApi,
	lookupErrorMessage,
} from '@empflowyee/hcm-web-workforce-foundation-data-access'
import {
	STATUTORY_CLASSES,
	WORKER_EVENT_CATEGORIES,
	type LookupAttributes,
	type LookupSetDto,
	type LookupValueDto,
} from '@empflowyee/hcm-workforce-foundation-contract'
import { attributesOf, categoryLabel } from './lookup-columns'

export interface ValueDialogRequest {
	set: LookupSetDto
	/** Null creates a value. */
	value: LookupValueDto | null
}

/** Focused Dialog to create or edit one tenant lookup value; the code is set only on create. */
@Component({
	selector: 'ef-hcm-lookup-value-dialog',
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
		Select,
		Option,
		CheckBox,
		StepInput,
		Text,
		MessageStrip,
		HcmDiscardDialog,
	],
	templateUrl: './value-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LookupValueDialog implements OnInit, OnDestroy {
	readonly request = input.required<ValueDialogRequest>()
	readonly saved = output<LookupValueDto>()
	readonly closed = output<void>()
	private readonly api = inject(LookupValuesApi)
	private readonly destroy = inject(DestroyRef)
	readonly statutoryClasses = STATUTORY_CLASSES
	readonly categories = WORKER_EVENT_CATEGORIES.map(
		/** Value and display text. */ (value) => ({ value, label: categoryLabel(value) }),
	)
	readonly model = signal({
		code: '',
		name: '',
		description: '',
		statutoryClass: 'Employee',
		category: 'Other',
		reason: '',
	})
	readonly sortOrder = signal(0)
	readonly flags = signal<Record<string, boolean>>({})
	readonly creating = computed(/** No value means create. */ () => this.request().value === null)
	readonly setKey = computed(/** The owning set. */ () => this.request().set.key)
	readonly flagFields = computed(
		/** Boolean attributes of the set, in display order. */ () => {
			if (this.setKey() === 'worker-types')
				return [
					{ key: 'payrollEligible', label: 'Payroll eligible' },
					{ key: 'benefitEligible', label: 'Benefit eligible' },
				]
			if (this.setKey() === 'employment-end-reasons')
				return [
					{ key: 'voluntary', label: 'Voluntary' },
					{ key: 'regrettable', label: 'Regrettable by default' },
					{ key: 'rehireEligible', label: 'Eligible for rehire by default' },
				]
			return []
		},
	)
	readonly requiresApproval = computed(
		/** Display-only; the employment-change approval policy owns it. */ () =>
			this.request().value?.attributes &&
			attributesOf(this.request().value as LookupValueDto)['requiresApproval'] === true,
	)
	readonly title = computed(
		/** Name the operation and target. */ () => {
			const value = this.request().value
			return value ? `Edit ${value.name}` : `Add value to ${this.request().set.label}`
		},
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract; uniqueness stays server-side. */ (path) => {
			required(path.code, { when: /** Only on create. */ () => this.creating() })
			pattern(path.code, /^[A-Z][A-Z0-9_]{1,39}$/)
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
		/** Track the whole command draft. */ () => ({
			...this.model(),
			sortOrder: this.sortOrder(),
			flags: this.flags(),
		}),
	)
	private allowClose = false

	/** Load the edited value, or defaults for a new one, and record the clean baseline. */
	ngOnInit(): void {
		const value = this.request().value
		if (value) {
			const a = attributesOf(value)
			this.model.set({
				code: value.code,
				name: value.name,
				description: value.description,
				statutoryClass: String(a['statutoryClass'] ?? 'Employee'),
				category: String(a['category'] ?? 'Other'),
				reason: '',
			})
			this.sortOrder.set(value.sortOrder)
			this.flags.set(
				Object.fromEntries(
					this.flagFields().map(/** Current flag. */ (flag) => [flag.key, a[flag.key] === true]),
				),
			)
		} else
			this.flags.set(
				Object.fromEntries(this.flagFields().map(/** Unchecked. */ (flag) => [flag.key, false])),
			)
		this.draft.markClean()
	}

	/** Toggle one boolean attribute. */
	setFlag(key: string, target: EventTarget | null): void {
		const checked = (target as HTMLInputElement | null)?.checked === true
		this.flags.update(/** Replace one flag. */ (flags) => ({ ...flags, [key]: checked }))
	}

	/** Read a StepInput value as a bounded integer. */
	setOrder(target: EventTarget | null): void {
		const raw = Math.trunc(Number((target as HTMLInputElement | null)?.value) || 0)
		this.sortOrder.set(Math.min(9999, Math.max(0, raw)))
	}

	/** Build the closed attribute object of the set exactly as the contract expects. */
	private attributes(): LookupAttributes {
		const v = this.model()
		const f = this.flags()
		if (this.setKey() === 'worker-types')
			return {
				statutoryClass: v.statutoryClass as (typeof STATUTORY_CLASSES)[number],
				payrollEligible: f['payrollEligible'] === true,
				benefitEligible: f['benefitEligible'] === true,
			}
		if (this.setKey() === 'employment-end-reasons')
			return {
				voluntary: f['voluntary'] === true,
				regrettable: f['regrettable'] === true,
				rehireEligible: f['rehireEligible'] === true,
			}
		return { category: v.category } as LookupAttributes
	}

	/** Validate, then persist exactly one command with a stable retry key. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		for (const field of [
			this.fields.code,
			this.fields.name,
			this.fields.description,
			this.fields.reason,
		])
			if (field().invalid()) {
				field().focusBoundControl()
				return
			}
		const { set, value } = this.request()
		const v = this.model()
		const fields = {
			name: v.name.trim(),
			description: v.description.trim(),
			sortOrder: this.sortOrder(),
			attributes: this.attributes(),
			reason: v.reason.trim(),
		}
		let call
		if (value) {
			const body = { ...fields, expectedRevision: value.revision }
			call = this.api.update(set.key, value.id, body, this.draft.key({ id: value.id, body }))
		} else {
			const body = { ...fields, code: v.code }
			call = this.api.create(set.key, body, this.draft.key({ set: set.key, body }))
		}
		this.draft.saving.set(true)
		this.draft.error.set('')
		call.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Close only after the server confirms the transaction. */ (saved) => {
				this.draft.saving.set(false)
				this.draft.markClean()
				this.allowClose = true
				this.saved.emit(saved)
			},
			error: /** Preserve the draft and retry key. */ (error) => {
				this.draft.saving.set(false)
				this.draft.error.set(lookupErrorMessage(error))
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

	/** Ask the browser before unload would discard a draft. */
	@HostListener('window:beforeunload', ['$event'])
	beforeUnload(event: BeforeUnloadEvent): void {
		if (this.draft.dirty()) event.preventDefault()
	}

	/** Release a pending navigation decision. */
	ngOnDestroy(): void {
		this.draft.release()
	}
}
