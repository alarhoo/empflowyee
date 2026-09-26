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
import { form, FormField, maxLength, pattern, required, validate } from '@angular/forms/signals'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { ComboBox } from '@fundamental-ngx/ui5-webcomponents/combo-box'
import { ComboBoxItem } from '@fundamental-ngx/ui5-webcomponents/combo-box-item'
import { StepInput } from '@fundamental-ngx/ui5-webcomponents/step-input'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import {
	OrganisationStructureApi,
	structureErrorMessage,
} from '@empflowyee/hcm-web-workforce-foundation-data-access'
import type { OrganisationProfileView } from '@empflowyee/hcm-workforce-foundation-contract'
import { StructureOptionBox, type OptionRef } from './option-box.component'
import { StructureDiscardDialog } from './discard-dialog.component'
import { StructureDraft } from './structure-draft'
import { MONTHS, languageOptions, timeZones } from './structure-areas'

/** Days valid for a recurring financial-year start in every year. */
export function maxDay(month: number): number {
	if (month === 2) return 28
	return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/** Focused Dialog for organisation HR defaults; the display name is not editable. */
@Component({
	selector: 'ef-hcm-organisation-profile-dialog',
	imports: [
		FormField,
		Dialog,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		TextArea,
		Select,
		Option,
		ComboBox,
		ComboBoxItem,
		StepInput,
		Text,
		MessageStrip,
		StructureOptionBox,
		StructureDiscardDialog,
	],
	templateUrl: './profile-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganisationProfileDialog implements OnInit, OnDestroy {
	readonly view = input.required<OrganisationProfileView>()
	readonly saved = output<void>()
	readonly closed = output<void>()
	private readonly api = inject(OrganisationStructureApi)
	private readonly destroy = inject(DestroyRef)
	readonly months = MONTHS
	readonly zones = timeZones()
	readonly model = signal({ defaultTimeZone: '', defaultLanguage: 'en-US', month: '1', reason: '' })
	readonly day = signal(1)
	readonly currency = signal<OptionRef | null>(null)
	readonly headquarters = signal<OptionRef | null>(null)
	readonly languages = computed(
		/** Offer the product languages plus any stored tag. */ () =>
			languageOptions(this.view().profile?.defaultLanguage ?? ''),
	)
	readonly dayMax = computed(
		/** Bound the day by the chosen month. */ () => maxDay(Number(this.model().month)),
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.defaultTimeZone)
			validate(
				path.defaultTimeZone,
				/** Accept only IANA zones the browser knows. */ ({ value }) =>
					value() && !this.zones.includes(value())
						? { kind: 'time-zone', message: 'Choose a listed IANA time zone.' }
						: null,
			)
			required(path.defaultLanguage)
			required(path.reason)
			pattern(path.reason, /\S/)
			maxLength(path.reason, 500)
		},
	)
	readonly draft = new StructureDraft(
		/** Track the whole command draft. */ () => ({
			...this.model(),
			day: this.day(),
			currency: this.currency()?.id,
			headquarters: this.headquarters()?.id,
		}),
	)
	readonly currencyMissing = signal(false)
	private allowClose = false

	/** Seed from the loaded profile; a first profile starts from sensible empty values. */
	ngOnInit(): void {
		const profile = this.view().profile
		if (profile) {
			this.model.set({
				defaultTimeZone: profile.defaultTimeZone,
				defaultLanguage: profile.defaultLanguage,
				month: String(profile.financialYearStartMonth),
				reason: '',
			})
			this.day.set(profile.financialYearStartDay)
			this.currency.set({ id: profile.defaultCurrency.code, name: profile.defaultCurrency.name })
			this.headquarters.set(profile.headquartersLocation)
		}
		this.draft.markClean()
	}

	/** Validate, then save at the loaded revision (0 creates the first profile). */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		for (const field of [this.fields.defaultTimeZone, this.fields.defaultLanguage])
			if (field().invalid()) {
				field().focusBoundControl()
				return
			}
		this.currencyMissing.set(!this.currency())
		if (!this.currency()) return
		if (this.fields.reason().invalid()) {
			this.fields.reason().focusBoundControl()
			return
		}
		const v = this.model()
		const body = {
			defaultTimeZone: v.defaultTimeZone,
			defaultLanguage: v.defaultLanguage,
			defaultCurrencyCode: this.currency()?.id ?? '',
			financialYearStartMonth: Number(v.month),
			financialYearStartDay: Math.min(this.day(), this.dayMax()),
			headquartersLocationId: this.headquarters()?.id ?? null,
			expectedRevision: this.view().profile?.revision ?? 0,
			reason: v.reason.trim(),
		}
		this.draft.saving.set(true)
		this.draft.error.set('')
		this.api
			.saveProfile(body, this.draft.key(body))
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Close after the server confirms. */ () => {
					this.draft.saving.set(false)
					this.draft.markClean()
					this.allowClose = true
					this.saved.emit()
				},
				error: /** Preserve the draft and retry key. */ (error) => {
					this.draft.saving.set(false)
					this.draft.error.set(structureErrorMessage(error))
				},
			})
	}

	/** Read a StepInput day as an integer. */
	setDay(value: unknown): void {
		this.day.set(Math.trunc(Number(value) || 1))
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
