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
import { forkJoin, switchMap, type Observable } from 'rxjs'
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
import { DatePicker } from '@fundamental-ngx/ui5-webcomponents/date-picker'
import { StepInput } from '@fundamental-ngx/ui5-webcomponents/step-input'
import { BusyIndicator } from '@fundamental-ngx/ui5-webcomponents/busy-indicator'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Link } from '@fundamental-ngx/ui5-webcomponents/link'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { EmployeeRecordsApi, recordsErrorMessage } from '@empflowyee/hcm-web-employee-data-access'
import {
	ADDRESS_TYPES,
	type EmergencyInfoDto,
	type MyContactPointDto,
	type RecordAddressDto,
	type RecordOptionDto,
	type RecordRelationshipDto,
	type WorkerRecordDto,
} from '@empflowyee/hcm-employee-contract'
import { ADDRESS_TYPE_LABELS, CONTACT_TYPE_LABELS, isoToday } from './labels'
import { RecordOptionBox, type OptionRef } from './option-box.component'

/** One record dialog mode with the item it acts on. */
export type RecordDialogRequest =
	| { mode: 'person' | 'reveal' | 'merge' }
	| { mode: 'address'; address: RecordAddressDto | null }
	| { mode: 'end-address'; address: RecordAddressDto }
	| { mode: 'contact'; contact: MyContactPointDto | null }
	| { mode: 'relationship'; relationship: RecordRelationshipDto | null }
	| { mode: 'deactivate'; collection: 'contact-points' | 'relationships'; item: DeactivatedItem }

/** A record dialog request with the record it acts on. */
export type RecordDialogInput = { record: WorkerRecordDto } & RecordDialogRequest

/** A contact point or relationship to deactivate. */
export interface DeactivatedItem {
	id: string
	revision: number
	label: string
}

/** The confirmed outcome of a record dialog. */
export interface RecordDialogResult {
	message: string
	record: WorkerRecordDto | null
}

const PHONE = /^(\+?[0-9][0-9 ()-]{4,28}[0-9])$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Focused Dialog for one Employee Records command: person corrections, collection items,
 * address ends, deactivations, the purpose-bound emergency reveal and an explicit merge.
 * Every command states a reason; the draft survives failures and keeps its retry key.
 */
@Component({
	selector: 'ef-hcm-record-dialog',
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
		DatePicker,
		StepInput,
		BusyIndicator,
		Text,
		Link,
		MessageStrip,
		HcmDiscardDialog,
		RecordOptionBox,
	],
	templateUrl: './record-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordDialog implements OnInit, OnDestroy {
	readonly input = input.required<RecordDialogInput>()
	readonly saved = output<RecordDialogResult>()
	readonly closed = output<void>()
	private readonly api = inject(EmployeeRecordsApi)
	private readonly destroy = inject(DestroyRef)
	private allowClose = false
	readonly addressTypes = ADDRESS_TYPES
	readonly addressLabels = ADDRESS_TYPE_LABELS
	readonly contactLabels = CONTACT_TYPE_LABELS
	readonly mode = computed(/** The dialog mode. */ () => this.input().mode)
	readonly genders = signal<RecordOptionDto[]>([])
	readonly maritalStatuses = signal<RecordOptionDto[]>([])
	readonly relationshipTypes = signal<RecordOptionDto[]>([])
	readonly optionsState = signal<'loading' | 'ready' | 'error'>('ready')
	readonly optionsError = signal('')
	readonly model = signal({
		reason: '',
		purpose: '',
		givenName: '',
		middleName: '',
		familyName: '',
		preferredName: '',
		formerName: '',
		birthDate: '',
		gender: 'none',
		maritalStatus: 'none',
		addressType: 'Current',
		line1: '',
		line2: '',
		locality: '',
		city: '',
		stateOrProvince: '',
		postalCode: '',
		effectiveFrom: '',
		effectiveTo: '',
		contactType: 'PersonalEmail',
		value: '',
		relationshipType: '',
		fullName: '',
		contactNumber: '',
	})
	readonly primary = signal(false)
	readonly dependent = signal(false)
	readonly emergency = signal(false)
	readonly priority = signal(1)
	readonly nationality = signal<OptionRef | null>(null)
	readonly country = signal<OptionRef | null>(null)
	readonly survivor = signal<OptionRef | null>(null)
	readonly revealed = signal<EmergencyInfoDto | null>(null)
	readonly touched = signal(false)
	readonly title = computed(
		/** Name the operation. */ () => {
			const request = this.input()
			switch (request.mode) {
				case 'person':
					return `Correct personal details of ${request.record.displayName}`
				case 'address':
					return request.address ? 'Correct address' : 'Add address'
				case 'end-address':
					return `End ${ADDRESS_TYPE_LABELS[request.address.type].toLowerCase()} address`
				case 'contact':
					return request.contact ? 'Correct contact point' : 'Add contact point'
				case 'relationship':
					return request.relationship ? `Correct ${request.relationship.fullName}` : 'Add person'
				case 'deactivate':
					return `Deactivate ${request.item.label}`
				case 'reveal':
					return 'Reveal emergency information'
				default:
					return `Merge ${request.record.displayName} into another record`
			}
		},
	)
	readonly correcting = computed(
		/** Whether a contact point is corrected rather than added. */ () => {
			const request = this.input()
			return request.mode === 'contact' && request.contact !== null
		},
	)
	readonly confirmLabel = computed(
		/** The emphasized footer action. */ () => {
			const labels: Record<RecordDialogInput['mode'], string> = {
				person: 'Save',
				address: 'Save',
				'end-address': 'End address',
				contact: 'Save',
				relationship: 'Save',
				deactivate: 'Deactivate',
				reveal: 'Reveal',
				merge: 'Merge',
			}
			return labels[this.mode()]
		},
	)
	readonly usesReason = computed(
		/** Every command but the reveal states a reason. */ () => this.mode() !== 'reveal',
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract for the active mode. */ (path) => {
			/** A condition that holds in one of the modes. */
			const inMode = (...modes: RecordDialogInput['mode'][]) => this.inModes(modes)
			required(path.reason, { when: /** Reason modes. */ () => this.usesReason() })
			pattern(path.reason, /\S/)
			maxLength(path.reason, 500)
			required(path.purpose, { when: inMode('reveal') })
			pattern(path.purpose, /\S/)
			maxLength(path.purpose, 500)
			required(path.givenName, { when: inMode('person') })
			required(path.familyName, { when: inMode('person') })
			for (const name of [
				path.givenName,
				path.familyName,
				path.middleName,
				path.preferredName,
				path.formerName,
			])
				maxLength(name, 100)
			required(path.city, { when: inMode('address') })
			maxLength(path.city, 100)
			required(path.effectiveFrom, { when: inMode('address') })
			required(path.effectiveTo, { when: inMode('end-address') })
			required(path.value, { when: inMode('contact') })
			required(path.relationshipType, { when: inMode('relationship') })
			required(path.fullName, { when: inMode('relationship') })
			maxLength(path.fullName, 150)
			pattern(path.contactNumber, /^(\+?[0-9][0-9 ()-]{4,28}[0-9])?$/)
			required(path.contactNumber, {
				when: /** Emergency contacts need a number. */ () =>
					this.mode() === 'relationship' && this.emergency(),
			})
		},
	)
	/** A condition that holds while the dialog is in one of the modes. */
	private inModes(modes: RecordDialogInput['mode'][]): () => boolean {
		return /** Mode check. */ () => modes.includes(this.mode())
	}

	readonly valueInvalid = computed(
		/** A contact value must match its type. */ () => {
			const v = this.model()
			if (!v.value.trim()) return false
			return !(v.contactType === 'PersonalEmail' ? EMAIL : PHONE).test(v.value.trim())
		},
	)
	readonly draft = new HcmDraft(
		/** Track the draft. */ () => ({
			...this.model(),
			primary: this.primary(),
			dependent: this.dependent(),
			emergency: this.emergency(),
			priority: this.priority(),
			nationality: this.nationality()?.id ?? null,
			country: this.country()?.id ?? null,
			survivor: this.survivor()?.id ?? null,
		}),
	)

	/** Start from the stored facts of the item the dialog acts on. */
	ngOnInit(): void {
		const request = this.input()
		const record = request.record
		const today = isoToday()
		if (request.mode === 'person') {
			this.model.update(
				/** Person facts. */ (v) => ({
					...v,
					givenName: record.givenName ?? '',
					middleName: record.middleName ?? '',
					familyName: record.familyName ?? '',
					preferredName: record.preferredName ?? '',
					formerName: record.formerName ?? '',
					birthDate: record.birthDate ?? '',
					gender: record.genderCode ?? 'none',
					maritalStatus: record.maritalStatusCode ?? 'none',
				}),
			)
			if (record.nationalityCode)
				this.nationality.set({ id: record.nationalityCode, name: record.nationality ?? '' })
			this.loadOptions(['genders', 'marital-statuses'])
		} else if (request.mode === 'address') {
			const address = request.address
			this.model.update(
				/** Address facts; a correction takes effect from today unless it starts later. */ (v) => ({
					...v,
					addressType: address?.type ?? 'Current',
					line1: address?.line1 ?? '',
					line2: address?.line2 ?? '',
					locality: address?.locality ?? '',
					city: address?.city ?? '',
					stateOrProvince: address?.stateOrProvince ?? '',
					postalCode: address?.postalCode ?? '',
					effectiveFrom: address && address.effectiveFrom > today ? address.effectiveFrom : today,
				}),
			)
			this.primary.set(address?.primary ?? false)
			if (address) this.country.set({ id: address.countryCode, name: address.countryName })
		} else if (request.mode === 'end-address') {
			this.model.update(/** Default end. */ (v) => ({ ...v, effectiveTo: today }))
		} else if (request.mode === 'contact') {
			this.model.update(
				/** Contact facts. */ (v) => ({
					...v,
					contactType: request.contact?.type ?? 'PersonalEmail',
					value: request.contact?.value ?? '',
				}),
			)
			this.primary.set(request.contact?.primary ?? false)
		} else if (request.mode === 'relationship') {
			const person = request.relationship
			this.model.update(
				/** Relationship facts. */ (v) => ({
					...v,
					relationshipType: person?.relationshipType ?? '',
					fullName: person?.fullName ?? '',
					birthDate: person?.birthDate ?? '',
					gender: person?.genderCode ?? 'none',
					contactNumber: person?.contactNumber ?? '',
				}),
			)
			this.dependent.set(person?.dependent ?? false)
			this.emergency.set(person?.emergencyContact ?? false)
			this.priority.set(person?.emergencyPriority ?? 1)
			this.loadOptions(['relationship-types', 'genders'])
		}
		this.draft.markClean()
	}

	/** Load the small fixed reference lists this mode shows as Selects. */
	loadOptions(kinds: ('genders' | 'marital-statuses' | 'relationship-types')[] = []): void {
		const wanted = kinds.length ? kinds : this.optionKinds
		this.optionKinds = wanted
		this.optionsState.set('loading')
		forkJoin(wanted.map(/** One list. */ (kind) => this.api.options(kind, '')))
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish options. */ (pages) => {
					wanted.forEach(
						/** Route each list. */ (kind, index) => {
							const items = pages[index]?.items ?? []
							if (kind === 'genders') this.genders.set(items)
							else if (kind === 'marital-statuses') this.maritalStatuses.set(items)
							else this.relationshipTypes.set(items)
						},
					)
					if (!this.model().relationshipType && this.relationshipTypes()[0]) {
						const first = this.relationshipTypes()[0]?.id ?? ''
						this.model.update(/** Default type. */ (v) => ({ ...v, relationshipType: first }))
						this.draft.markClean()
					}
					this.optionsState.set('ready')
				},
				error: /** Options unavailable. */ (error) => {
					this.optionsError.set(recordsErrorMessage(error))
					this.optionsState.set('error')
				},
			})
	}

	private optionKinds: ('genders' | 'marital-statuses' | 'relationship-types')[] = []

	/** Read a DatePicker's timezone-free value into the model. */
	setDate(field: 'birthDate' | 'effectiveFrom' | 'effectiveTo', value: string): void {
		this.model.update(/** Date. */ (v) => ({ ...v, [field]: value }))
	}

	/** Toggle a CheckBox-backed flag. */
	setFlag(flag: 'primary' | 'dependent' | 'emergency', target: EventTarget | null): void {
		const checked = (target as HTMLInputElement | null)?.checked === true
		if (flag === 'primary') this.primary.set(checked)
		else if (flag === 'dependent') this.dependent.set(checked)
		else this.emergency.set(checked)
	}

	/** Read the StepInput priority as a bounded integer. */
	setPriority(target: EventTarget | null): void {
		const raw = Math.trunc(Number((target as HTMLInputElement | null)?.value) || 1)
		this.priority.set(Math.min(99, Math.max(1, raw)))
	}

	/** Validate the visible fields and focus the first invalid one. */
	private valid(): boolean {
		this.fields().markAsTouched()
		this.touched.set(true)
		for (const field of [
			this.fields.givenName,
			this.fields.familyName,
			this.fields.city,
			this.fields.effectiveFrom,
			this.fields.effectiveTo,
			this.fields.value,
			this.fields.relationshipType,
			this.fields.fullName,
			this.fields.contactNumber,
			this.fields.purpose,
			this.fields.reason,
		])
			if (field().invalid()) {
				field().focusBoundControl()
				return false
			}
		const mode = this.mode()
		if (mode === 'address' && !this.country()) return false
		if (mode === 'contact' && this.valueInvalid()) return false
		if (mode === 'merge' && !this.survivor()) return false
		return true
	}

	/** Validate and send the command of the active mode. */
	save(): void {
		if (this.draft.saving() || !this.valid()) return
		const request = this.input()
		const record = request.record
		const v = this.model()
		const reason = v.reason.trim()
		const id = record.workerId
		switch (request.mode) {
			case 'person': {
				const body = {
					givenName: v.givenName.trim(),
					middleName: v.middleName.trim(),
					familyName: v.familyName.trim(),
					preferredName: v.preferredName.trim(),
					formerName: v.formerName.trim(),
					birthDate: v.birthDate || null,
					genderCode: v.gender === 'none' ? null : v.gender,
					maritalStatusCode: v.maritalStatus === 'none' ? null : v.maritalStatus,
					nationalityCountryCode: this.nationality()?.id ?? null,
					expectedRevision: record.personRevision,
					reason,
				}
				this.submit(
					this.api.correctPerson(id, body, this.draft.key(body)),
					'Personal details corrected.',
				)
				return
			}
			case 'address': {
				const address = {
					type: v.addressType,
					line1: v.line1.trim(),
					line2: v.line2.trim(),
					locality: v.locality.trim(),
					city: v.city.trim(),
					stateOrProvince: v.stateOrProvince.trim(),
					postalCode: v.postalCode.trim(),
					countryCode: this.country()?.id ?? '',
					primary: this.primary(),
					effectiveFrom: v.effectiveFrom,
				}
				if (request.address) {
					const body = { ...address, expectedRevision: request.address.revision, reason }
					this.submit(
						this.api.updateItem(id, 'addresses', request.address.id, body, this.draft.key(body)),
						'Address corrected.',
					)
				} else {
					const body = { ...address, reason }
					this.submit(
						this.api.addItem(id, 'addresses', body, this.draft.key(body)),
						'Address added.',
					)
				}
				return
			}
			case 'end-address': {
				const body = {
					effectiveTo: v.effectiveTo,
					expectedRevision: request.address.revision,
					reason,
				}
				this.submit(
					this.api.updateItem(id, 'addresses', request.address.id, body, this.draft.key(body)),
					'Address ended.',
				)
				return
			}
			case 'contact': {
				if (request.contact) {
					const body = {
						value: v.value.trim(),
						primary: this.primary(),
						expectedRevision: request.contact.revision,
						reason,
					}
					this.submit(
						this.api.updateItem(
							id,
							'contact-points',
							request.contact.id,
							body,
							this.draft.key(body),
						),
						'Contact point corrected.',
					)
				} else {
					const body = { type: v.contactType, value: v.value.trim(), reason }
					this.submit(
						this.api.addItem(id, 'contact-points', body, this.draft.key(body)),
						'Contact point added.',
					)
				}
				return
			}
			case 'relationship': {
				const fields = {
					relationshipType: v.relationshipType,
					fullName: v.fullName.trim(),
					birthDate: v.birthDate || null,
					gender: v.gender === 'none' ? null : v.gender,
					contactNumber: v.contactNumber.trim(),
					dependent: this.dependent(),
					emergencyContact: this.emergency(),
					emergencyPriority: this.emergency() ? this.priority() : null,
					reason,
				}
				if (request.relationship) {
					const body = { ...fields, expectedRevision: request.relationship.revision }
					this.submit(
						this.api.updateItem(
							id,
							'relationships',
							request.relationship.id,
							body,
							this.draft.key(body),
						),
						'Person corrected.',
					)
				} else
					this.submit(
						this.api.addItem(id, 'relationships', fields, this.draft.key(fields)),
						'Person added.',
					)
				return
			}
			case 'deactivate': {
				const body = { deactivate: true, expectedRevision: request.item.revision, reason }
				this.submit(
					this.api.updateItem(id, request.collection, request.item.id, body, this.draft.key(body)),
					`${request.item.label} deactivated.`,
				)
				return
			}
			case 'reveal':
				this.reveal(v.purpose.trim())
				return
			default:
				this.merge(reason)
		}
	}

	/** Merge into the chosen survivor, quoting both current revisions. */
	private merge(reason: string): void {
		const record = this.input().record
		const survivor = this.survivor()
		if (!survivor) return
		const call = this.api.read(survivor.id).pipe(
			switchMap(
				/** Quote the survivor's revision as read now. */ (target) => {
					const body = {
						survivorWorkerId: target.workerId,
						expectedRevision: record.personRevision,
						survivorExpectedRevision: target.personRevision,
						reason,
					}
					return this.api.merge(record.workerId, body, this.draft.key(body))
				},
			),
		)
		this.submit(call, `${record.displayName} merged into ${survivor.name}.`)
	}

	/** Reveal emergency information; the values stay in this Dialog only. */
	private reveal(purpose: string): void {
		const record = this.input().record
		this.draft.saving.set(true)
		this.draft.error.set('')
		this.api
			.revealEmergency(record.workerId, purpose, this.draft.key({ purpose }))
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Show the revealed values. */ (info) => {
					this.draft.saving.set(false)
					this.draft.markClean()
					this.revealed.set(info)
				},
				error: /** Keep the purpose and explain. */ (error) => {
					this.draft.saving.set(false)
					this.draft.error.set(recordsErrorMessage(error))
				},
			})
	}

	/** Persist one command, closing only after the server confirms it. */
	private submit(call: Observable<WorkerRecordDto>, message: string): void {
		this.draft.saving.set(true)
		this.draft.error.set('')
		call.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Close after commit. */ (record) => {
				this.draft.saving.set(false)
				this.draft.markClean()
				this.allowClose = true
				this.saved.emit({ message, record })
			},
			error: /** Preserve the draft and retry key. */ (error) => {
				this.draft.saving.set(false)
				this.draft.error.set(recordsErrorMessage(error))
			},
		})
	}

	/** Route Cancel and Escape through the same discard rule. */
	async cancel(): Promise<void> {
		if (this.revealed() || (await this.draft.canLeave())) {
			this.allowClose = true
			this.revealed.set(null)
			this.closed.emit()
		}
	}

	/** Keep dirty drafts when native Escape requests dismissal. */
	beforeClose(event: Event): void {
		if (event.target !== event.currentTarget || this.allowClose) return
		event.preventDefault()
		void this.cancel()
	}

	/** Allow the page's navigation guard to consult this draft. */
	canLeave(): Promise<boolean> {
		return this.draft.canLeave()
	}

	/** Release a pending navigation decision and drop revealed values. */
	ngOnDestroy(): void {
		this.revealed.set(null)
		this.draft.release()
	}
}
