import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	HostListener,
	type OnDestroy,
	type OnInit,
	computed,
	inject,
	signal,
} from '@angular/core'
import { Router } from '@angular/router'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { form, FormField, maxLength, pattern, required } from '@angular/forms/signals'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	ProfileConfigurationApi,
	employeeErrorMessage,
	type CustomFieldCreateBody,
} from '@empflowyee/hcm-web-employee-data-access'
import {
	CUSTOM_FIELD_DATA_TYPES,
	CUSTOM_FIELD_OWNER_SCOPES,
	PROFILE_SECTIONS,
	PROFILE_SENSITIVITIES,
	type CustomFieldDataType,
	type CustomFieldOwnerScope,
	type ProfileSection,
	type ProfileSensitivity,
} from '@empflowyee/hcm-employee-contract'
import {
	DATA_TYPE_LABELS,
	MANAGE_PERMISSION,
	OWNER_SCOPE_LABELS,
	SENSITIVITY_LABELS,
	VISIBILITY_LABELS,
} from './labels'

interface OptionDraft {
	key: number
	code: string
	name: string
}

const BASE = '/employee/employee-profile-configuration'
const OPTION_CODE = /^[A-Z][A-Z0-9_]{0,39}$/

/** Dedicated route to define a custom field and, for select types, its first options. */
@Component({
	selector: 'ef-hcm-custom-field-page',
	imports: [
		FormField,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		Input,
		Select,
		Option,
		CheckBox,
		TextArea,
		Text,
		MessageStrip,
		HcmDynamicPage,
		HcmDiscardDialog,
	],
	templateUrl: './custom-field-page.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomFieldPageComponent implements OnInit, OnDestroy {
	private readonly api = inject(ProfileConfigurationApi)
	private readonly router = inject(Router)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	readonly ownerScopes = CUSTOM_FIELD_OWNER_SCOPES
	readonly dataTypes = CUSTOM_FIELD_DATA_TYPES
	readonly sensitivities = PROFILE_SENSITIVITIES
	readonly sections = PROFILE_SECTIONS
	readonly ownerScopeLabels = OWNER_SCOPE_LABELS
	readonly dataTypeLabels = DATA_TYPE_LABELS
	readonly sensitivityLabels = SENSITIVITY_LABELS
	readonly model = signal({
		code: '',
		name: '',
		description: '',
		ownerScope: 'Worker',
		dataType: 'Text',
		sensitivity: 'Personal',
		section: 'Other',
		reason: '',
	})
	readonly searchable = signal(false)
	readonly options = signal<OptionDraft[]>([])
	readonly optionError = signal('')
	private nextKey = 0
	readonly select = computed(
		/** Select types need options. */ () =>
			['SingleSelect', 'MultiSelect'].includes(this.model().dataType),
	)
	readonly directorySafe = computed(
		/** Only DirectorySafe fields may be searchable. */ () =>
			this.model().sensitivity === 'DirectorySafe',
	)
	readonly ceiling = computed(
		/** The widest audience the sensitivity allows. */ () => {
			const sensitivity = this.model().sensitivity
			if (sensitivity === 'DirectorySafe') return VISIBILITY_LABELS.Organization
			if (sensitivity === 'Personal') return VISIBILITY_LABELS.Manager
			return VISIBILITY_LABELS.Hr
		},
	)
	readonly state = computed<HcmPageState>(
		/** Only managers reach the form; others see a denial without protected requests. */ () =>
			this.runtime.context()?.access.permissions.includes(MANAGE_PERMISSION) ? 'content' : 'denied',
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract; uniqueness stays server-side. */ (path) => {
			required(path.code)
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
			searchable: this.searchable(),
			options: this.options().map(/** Option. */ (option) => [option.code, option.name]),
		}),
	)

	/** Record the clean baseline. */
	ngOnInit(): void {
		this.draft.markClean()
	}

	/** Toggle searchability. */
	setSearchable(target: EventTarget | null): void {
		this.searchable.set((target as HTMLInputElement | null)?.checked === true)
	}

	/** Append an empty option row. */
	addOption(): void {
		this.options.update(
			/** Append. */ (options) => [...options, { key: this.nextKey++, code: '', name: '' }],
		)
	}

	/** Remove one option row. */
	removeOption(key: number): void {
		this.options.update(
			/** Remove. */ (options) =>
				options.filter(/** Keep other rows. */ (option) => option.key !== key),
		)
	}

	/** Update one option attribute from its Input. */
	setOption(key: number, attribute: 'code' | 'name', target: EventTarget | null): void {
		const value = (target as HTMLInputElement | null)?.value ?? ''
		this.options.update(
			/** Replace one row. */ (options) =>
				options.map(
					/** Replace the matching row. */ (option) =>
						option.key === key ? { ...option, [attribute]: value } : option,
				),
		)
	}

	/** Validate options of select types: at least one, well-formed and unique codes. */
	private validOptions(): boolean {
		if (!this.select()) return true
		const options = this.options()
		let problem = ''
		if (!options.length) problem = 'Add at least one option.'
		else if (
			options.some(
				/** Malformed. */ (option) => !OPTION_CODE.test(option.code) || !option.name.trim(),
			)
		)
			problem = 'Every option needs a code of capital letters, digits or underscores and a name.'
		else if (new Set(options.map(/** Code. */ (option) => option.code)).size !== options.length)
			problem = 'Option codes must be unique.'
		this.optionError.set(problem)
		return !problem
	}

	/** Validate, then create exactly one field with a stable retry key. */
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
		if (!this.validOptions()) return
		const v = this.model()
		const body: CustomFieldCreateBody = {
			code: v.code,
			name: v.name.trim(),
			description: v.description.trim(),
			ownerScope: v.ownerScope as CustomFieldOwnerScope,
			dataType: v.dataType as CustomFieldDataType,
			sensitivity: v.sensitivity as ProfileSensitivity,
			section: v.section as ProfileSection,
			searchable: this.directorySafe() && this.searchable(),
			reason: v.reason.trim(),
		}
		const options = this.options().map(
			/** Option body in display order. */ (option, index) => ({
				code: option.code,
				name: option.name.trim(),
				sortOrder: index,
			}),
		)
		if (this.select()) body.options = options
		this.draft.saving.set(true)
		this.draft.error.set('')
		this.api
			.createCustomField(body, this.draft.key(body))
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Open the new field after commit. */ (field) => {
					this.draft.saving.set(false)
					this.draft.markClean()
					void this.router.navigate([BASE, field.ref])
				},
				error: /** Preserve the draft and retry key. */ (error) => {
					this.draft.saving.set(false)
					this.draft.error.set(employeeErrorMessage(error))
				},
			})
	}

	/** Return to the catalogue; the guard asks before discarding a dirty draft. */
	back(): void {
		void this.router.navigate([BASE])
	}

	/** Allow the route guard to consult this draft. */
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
