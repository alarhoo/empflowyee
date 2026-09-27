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
import type { Observable } from 'rxjs'
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
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import {
	PositionsApi,
	jobArchitectureErrorMessage,
} from '@empflowyee/hcm-web-job-architecture-data-access'
import {
	MAX_JUSTIFICATION,
	QUANTITY_UNITS,
	REQUIREMENT_TYPES,
	type PositionChangeRequestDto,
	type QuantityUnit,
	type RequirementDto,
	type RequirementType,
	type VarianceDraft,
	type VarianceType,
} from '@empflowyee/hcm-job-architecture-contract'
import { TYPE_LABELS } from './labels'

export interface VarianceDialogInput {
	type: VarianceType
	positionId: string
	/** Requirements of the position's job profile version. */
	profile: RequirementDto[]
	/** The variances already proposed. */
	variances: VarianceDraft[]
	/** The requester's draft request, or null to start one. */
	request: PositionChangeRequestDto | null
}

/** What each variance does, stated before it is proposed. */
const NOTES: Record<VarianceType, string> = {
	Add: 'Adds a requirement the job profile does not have.',
	Replace: 'Replaces a profile requirement for this position.',
	Strengthen: 'Raises a profile requirement; it cannot become weaker.',
	Waive:
		'Keeps the profile requirement visible but not applied. Approval needs an approver who may also approve waived requirements.',
}

const CODE = /^[A-Z][A-Z0-9_]{1,39}$/

/** Focused Dialog to add one requirement variance to the requester's proposal. */
@Component({
	selector: 'ef-hcm-position-variance-dialog',
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
		CheckBox,
		TextArea,
		Text,
		MessageStrip,
		HcmDiscardDialog,
	],
	templateUrl: './variance-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VarianceDialog implements OnInit, OnDestroy {
	readonly input = input.required<VarianceDialogInput>()
	readonly saved = output<string>()
	readonly closed = output<void>()
	private readonly api = inject(PositionsApi)
	private readonly destroy = inject(DestroyRef)
	private allowClose = false
	readonly types = REQUIREMENT_TYPES
	readonly units = QUANTITY_UNITS
	readonly model = signal({
		code: '',
		sourceCode: '',
		type: 'Skill' as RequirementType,
		name: '',
		proficiency: '',
		unit: 'none' as QuantityUnit | 'none',
		justification: '',
		reason: '',
	})
	readonly quantity = signal<number | null>(null)
	readonly mandatory = signal(true)
	readonly checked = signal(false)
	readonly type = computed(/** Variance type. */ () => this.input().type)
	readonly title = computed(/** Name the operation. */ () => TYPE_LABELS[this.type()])
	readonly note = computed(/** Explain the consequence. */ () => NOTES[this.type()])
	readonly starting = computed(
		/** The first variance also starts the request. */ () => !this.input().request,
	)
	readonly sources = computed(
		/** Profile requirements without a proposed variance yet. */ () => {
			const used = new Set(this.input().variances.map(/** Code. */ (item) => item.code))
			return this.input().profile.filter(/** Not yet varied. */ (item) => !used.has(item.code))
		},
	)
	readonly quantityInvalid = computed(
		/** A quantity always carries its unit (business rule 8). */ () =>
			this.checked() && (this.quantity() === null) !== (this.model().unit === 'none'),
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract; the server re-validates. */ (path) => {
			required(path.code, { when: /** Add names its code. */ () => this.type() === 'Add' })
			pattern(path.code, /^(|[A-Z][A-Z0-9_]{1,39})$/)
			required(path.sourceCode, {
				when: /** Others act on a source. */ () => this.type() !== 'Add',
			})
			required(path.name)
			pattern(path.name, /^(|[\s\S]*\S[\s\S]*)$/)
			maxLength(path.name, 150)
			maxLength(path.proficiency, 100)
			required(path.justification, {
				when: /** Waive explains itself. */ () => this.type() === 'Waive',
			})
			pattern(path.justification, /^(|[\s\S]*\S[\s\S]*)$/)
			maxLength(path.justification, MAX_JUSTIFICATION)
			required(path.reason, { when: /** A new request needs a reason. */ () => this.starting() })
			pattern(path.reason, /^(|[\s\S]*\S[\s\S]*)$/)
			maxLength(path.reason, 500)
		},
	)
	readonly draft = new HcmDraft(
		/** Track the draft. */ () => ({
			...this.model(),
			quantity: this.quantity(),
			mandatory: this.mandatory(),
		}),
	)

	/** Start from the first available source requirement. */
	ngOnInit(): void {
		const first = this.sources()[0]
		if (this.type() !== 'Add' && first) this.chooseSource(first.code)
		this.draft.markClean()
	}

	/** Prefill from the chosen profile requirement. */
	chooseSource(code: string): void {
		const source = this.input().profile.find(/** Same code. */ (item) => item.code === code)
		if (!source) return
		this.model.update(
			/** Copy the source. */ (model) => ({
				...model,
				sourceCode: source.code,
				type: source.type,
				name: source.name,
				proficiency: source.proficiency,
				unit: source.unit ?? 'none',
			}),
		)
		this.quantity.set(source.minimumQuantity)
		this.mandatory.set(source.mandatory)
	}

	/** The variance from the form. */
	private variance(): VarianceDraft {
		const v = this.model()
		const add = this.type() === 'Add'
		return {
			code: add ? v.code : v.sourceCode,
			varianceType: this.type(),
			sourceCode: add ? null : v.sourceCode,
			type: v.type,
			name: v.name.trim(),
			description: '',
			proficiency: v.proficiency.trim(),
			minimumQuantity: v.unit === 'none' ? null : this.quantity(),
			unit: v.unit === 'none' ? null : v.unit,
			mandatory: this.mandatory(),
			justification: this.type() === 'Waive' ? v.justification.trim() : null,
		}
	}

	/** Validate and store the proposal with this variance. */
	save(): void {
		if (this.draft.saving()) return
		this.checked.set(true)
		this.fields().markAsTouched()
		for (const field of [
			this.fields.code,
			this.fields.sourceCode,
			this.fields.name,
			this.fields.justification,
			this.fields.reason,
		])
			if (field().invalid()) {
				field().focusBoundControl()
				return
			}
		if (this.quantityInvalid() || (this.type() === 'Add' && !CODE.test(this.model().code))) return
		const value = this.input()
		const variance = this.variance()
		const variances = [
			...value.variances.filter(
				/** Replace the same code. */ (item) => item.code !== variance.code,
			),
			variance,
		]
		let call: Observable<PositionChangeRequestDto>
		if (value.request) {
			const body = { variances, expectedRevision: value.request.revision }
			call = this.api.updateRequirementChange(
				value.request.id,
				body,
				this.draft.key({ id: value.request.id, body }),
			)
		} else {
			const body = { variances, reason: this.model().reason.trim() }
			call = this.api.createRequirementChange(
				value.positionId,
				body,
				this.draft.key({ position: value.positionId, body }),
			)
		}
		this.draft.saving.set(true)
		this.draft.error.set('')
		call.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Close after commit. */ () => {
				this.draft.saving.set(false)
				this.draft.markClean()
				this.allowClose = true
				this.saved.emit(`Variance ${variance.code} added to the proposal.`)
			},
			error: /** Preserve the draft and retry key. */ (error) => {
				this.draft.saving.set(false)
				this.draft.error.set(jobArchitectureErrorMessage(error))
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
