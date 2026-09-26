import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
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
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import {
	ProfileConfigurationApi,
	employeeErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import {
	PROFILE_VISIBILITIES,
	REQUIREDNESS,
	SELF_EDIT_MODES,
	type ProfileFieldDetailDto,
	type ProfileVisibility,
	type Requiredness,
	type SelfEditMode,
} from '@empflowyee/hcm-employee-contract'
import { EDIT_MODE_LABELS, REQUIREDNESS_LABELS, VISIBILITY_LABELS, currentPolicy } from './labels'

export interface PolicyDialogRequest {
	field: ProfileFieldDetailDto
	mode: 'policy' | 'reset'
}

/** Focused Dialog to narrow a field's tenant policy, or reset it to the product default. */
@Component({
	selector: 'ef-hcm-profile-policy-dialog',
	imports: [
		FormField,
		Dialog,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		Select,
		Option,
		CheckBox,
		TextArea,
		Text,
		MessageStrip,
		HcmDiscardDialog,
	],
	templateUrl: './policy-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PolicyDialog implements OnInit, OnDestroy {
	readonly request = input.required<PolicyDialogRequest>()
	readonly saved = output<ProfileFieldDetailDto>()
	readonly closed = output<void>()
	private readonly api = inject(ProfileConfigurationApi)
	private readonly destroy = inject(DestroyRef)
	readonly visibilityLabels = VISIBILITY_LABELS
	readonly editModeLabels = EDIT_MODE_LABELS
	readonly requirednessLabels = REQUIREDNESS_LABELS
	readonly model = signal({
		requiredness: 'Optional',
		visibility: 'Hr',
		selfEditMode: 'NotEditable',
		reason: '',
	})
	readonly allowPreference = signal(false)
	readonly field = computed(/** The field. */ () => this.request().field)
	readonly resetting = computed(/** Reset mode. */ () => this.request().mode === 'reset')
	readonly visibilities = computed(
		/** Only audiences within the ceiling are offered. */ () =>
			PROFILE_VISIBILITIES.slice(0, PROFILE_VISIBILITIES.indexOf(this.field().ceiling) + 1),
	)
	readonly editModes = computed(
		/** Only edit modes up to the product default are offered. */ () => {
			const product = this.field().productDefault?.selfEditMode ?? 'Direct'
			return SELF_EDIT_MODES.slice(0, SELF_EDIT_MODES.indexOf(product) + 1)
		},
	)
	readonly requirednessOptions = computed(
		/** A product-required field stays required. */ () =>
			this.field().productDefault?.requiredness === 'Required'
				? (['Required'] as Requiredness[])
				: [...REQUIREDNESS],
	)
	readonly preferenceAllowed = computed(
		/** A worker preference is only possible where the product allows one. */ () =>
			this.field().productDefault?.allowWorkerPreference ?? true,
	)
	readonly title = computed(
		/** Name the operation and target. */ () =>
			this.resetting() ? `Reset ${this.field().name}` : `Narrow policy for ${this.field().name}`,
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.reason)
			pattern(path.reason, /\S/)
			maxLength(path.reason, 500)
		},
	)
	readonly draft = new HcmDraft(
		/** Track the whole command draft. */ () => ({
			...this.model(),
			allow: this.allowPreference(),
		}),
	)
	private allowClose = false

	/** Start from the policy in force and record the clean baseline. */
	ngOnInit(): void {
		const policy = currentPolicy(this.field())
		this.model.set({
			requiredness: policy?.requiredness ?? 'Optional',
			visibility: policy?.visibility ?? this.field().ceiling,
			selfEditMode: policy?.selfEditMode ?? 'NotEditable',
			reason: '',
		})
		this.allowPreference.set(policy?.allowWorkerPreference ?? false)
		this.draft.markClean()
	}

	/** Toggle the worker preference allowance. */
	setPreference(target: EventTarget | null): void {
		this.allowPreference.set((target as HTMLInputElement | null)?.checked === true)
	}

	/** Validate, then persist exactly one command with a stable retry key. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		if (this.fields.reason().invalid()) {
			this.fields.reason().focusBoundControl()
			return
		}
		const field = this.field()
		const v = this.model()
		const reason = v.reason.trim()
		let call
		if (this.resetting()) {
			const body = { expectedRevision: field.policyRevision, reason }
			call = this.api.resetPolicy(field.ref, body, this.draft.key({ reset: field.ref, body }))
		} else {
			const body = {
				requiredness: v.requiredness as Requiredness,
				visibility: v.visibility as ProfileVisibility,
				selfEditMode: v.selfEditMode as SelfEditMode,
				allowWorkerPreference: this.allowPreference(),
				expectedRevision: field.policyRevision,
				reason,
			}
			call = this.api.setPolicy(field.ref, body, this.draft.key({ policy: field.ref, body }))
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
				this.draft.error.set(employeeErrorMessage(error))
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

	/** Release a pending navigation decision. */
	ngOnDestroy(): void {
		this.draft.release()
	}
}
