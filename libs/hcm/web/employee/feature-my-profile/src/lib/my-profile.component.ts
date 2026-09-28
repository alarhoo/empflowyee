import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	effect,
	inject,
	signal,
	untracked,
	viewChild,
} from '@angular/core'
import { Router } from '@angular/router'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import type { Subscription } from 'rxjs'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Panel } from '@fundamental-ngx/ui5-webcomponents/panel'
import { Tag } from '@fundamental-ngx/ui5-webcomponents/tag'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormGroup } from '@fundamental-ngx/ui5-webcomponents/form-group'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Link } from '@fundamental-ngx/ui5-webcomponents/link'
import { Toolbar } from '@fundamental-ngx/ui5-webcomponents/toolbar'
import { ToolbarButton } from '@fundamental-ngx/ui5-webcomponents/toolbar-button'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableRowAction } from '@fundamental-ngx/ui5-webcomponents/table-row-action'
import {
	HcmObjectPage,
	HcmObjectSection,
	type HcmObjectAction,
} from '@empflowyee/hcm-web-ux-floorplan-object-page'
import { HcmDatePipe, HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { canAccessHcmFeature, findHcmFeature } from '@empflowyee/hcm-web-navigation-catalog'
import {
	MyProfileApi,
	employeeDenied,
	employeeErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import {
	CORRECTION_TYPE_CODE,
	MAX_RELATIONSHIPS,
	SELF_CONTACT_TYPES,
	type MyContactPointDto,
	type MyProfileDto,
	type MyProfileFieldDto,
	type MyRelationshipDto,
	type SelfContactPointType,
} from '@empflowyee/hcm-employee-contract'
import {
	ADDRESS_TYPES,
	CONTACT_LABELS,
	EDIT_MODE_LABELS,
	EMPLOYMENT_TYPES,
	VISIBILITY_LABELS,
	WORK_MODES,
	employmentStatus,
	initials,
	probationStatus,
} from './labels'
import { PersonalDialog } from './personal-dialog.component'
import { ContactDialog, type ContactDialogRequest } from './contact-dialog.component'
import { RelationshipDialog, type RelationshipDialogRequest } from './relationship-dialog.component'
import { CustomValueDialog } from './custom-value-dialog.component'
import { VisibilityDialog } from './visibility-dialog.component'
import { RemoveDialog, type RemoveRequest } from './remove-dialog.component'

type OpenDialog =
	| { kind: 'personal' }
	| { kind: 'contact'; request: ContactDialogRequest }
	| { kind: 'relationship'; request: RelationshipDialogRequest }
	| { kind: 'custom'; field: MyProfileFieldDto }
	| { kind: 'visibility'; field: MyProfileFieldDto }
	| { kind: 'remove'; request: RemoveRequest }

/** Personal-section fields in display order. */
const PERSONAL_FIELDS = [
	'legal-given-name',
	'legal-middle-name',
	'legal-family-name',
	'preferred-name',
	'former-name',
	'birth-date',
	'gender',
	'marital-status',
	'nationality',
	'blood-group',
]

/** My Profile: the worker's own record on a composed Object Page with focused edit Dialogs. */
@Component({
	selector: 'ef-hcm-my-profile',
	imports: [
		ObjectStatusComponent,
		Panel,
		Tag,
		Form,
		FormGroup,
		FormItem,
		Label,
		Text,
		Link,
		Toolbar,
		ToolbarButton,
		MessageStrip,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableRowAction,
		HcmObjectPage,
		HcmObjectSection,
		HcmDatePipe,
		PersonalDialog,
		ContactDialog,
		RelationshipDialog,
		CustomValueDialog,
		VisibilityDialog,
		RemoveDialog,
	],
	templateUrl: './my-profile.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyProfileComponent {
	private readonly api = inject(MyProfileApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly router = inject(Router)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly visibilityLabels = VISIBILITY_LABELS
	readonly editModeLabels = EDIT_MODE_LABELS
	/** Corrections through HR are offered only once My HR Requests is released and discoverable. */
	readonly canRequestCorrection = computed(
		/** Presentation only; My HR Requests re-authorizes every request. */ () => {
			const context = this.runtime.context()
			return !!context && canAccessHcmFeature(findHcmFeature('MY_HR_REQUESTS'), context.access)
		},
	)
	readonly contactLabels = CONTACT_LABELS
	readonly selfContactTypes = SELF_CONTACT_TYPES
	readonly addressTypes = ADDRESS_TYPES
	readonly employmentTypes = EMPLOYMENT_TYPES
	readonly workModes = WORK_MODES
	readonly employment = employmentStatus
	readonly probation = probationStatus
	readonly maxRelationships = MAX_RELATIONSHIPS
	readonly profile = signal<MyProfileDto | null>(null)
	readonly state = signal<'content' | 'loading' | 'error' | 'denied'>('loading')
	readonly message = signal('')
	readonly dialog = signal<OpenDialog | null>(null)
	readonly editing = signal(false)
	readonly activeTab = computed(
		/** Use the floorplan's actual selection, including its fallback after a context refresh. */ () =>
			this.objectPage()?.activeSection() ?? 'personal',
	)
	readonly notice = signal('')
	readonly avatar = computed(/** Initials. */ () => initials(this.profile()?.displayName ?? ''))
	readonly primaryEmployment = computed(
		/** Select the declared primary employment even when the API collection is reordered. */ () =>
			this.profile()?.employments.find(
				/** Select the primary current employment. */ (job) => job.primary,
			),
	)
	readonly primary = computed(
		/** Select the primary assignment of the primary employment for the identity header. */ () =>
			this.primaryEmployment()?.assignments.find(
				/** Select the primary placement. */ (placement) => placement.primary,
			),
	)
	readonly summary = computed(
		/** Present only the role and department returned by the Self allowlist. */ () =>
			[this.primary()?.designation, this.primary()?.department].filter(Boolean).join(' · '),
	)
	readonly employmentTagDesign = computed(
		/** Translate employment semantics into native UI5 Tag designs without theme styling. */ () => {
			const status = employmentStatus(this.primaryEmployment()?.employmentStatus ?? '').status
			switch (status) {
				case 'positive':
					return 'Positive'
				case 'negative':
					return 'Negative'
				case 'critical':
					return 'Critical'
				case 'informative':
					return 'Information'
				default:
					return 'Neutral'
			}
		},
	)
	readonly actions = computed<readonly HcmObjectAction[]>(
		/** Offer personal editing only when at least one supported command is permitted. */ () => {
			const canEdit =
				this.personalEditable() ||
				this.contactTypes().length > 0 ||
				this.emergencyEditable() ||
				this.familyEditable() ||
				this.customFields().some(
					/** Include writable custom values. */ (field) =>
						field.editMode === 'Direct' && field.custom?.storable,
				)
			if (!this.profile()?.linked || this.activeTab() !== 'personal' || !canEdit) return []
			return [
				{
					id: 'edit-profile',
					label: this.editing() ? 'Done editing' : 'Edit profile',
					emphasized: true,
					mutates: true,
				},
			]
		},
	)
	readonly personal = computed(
		/** Visible personal fields in display order. */ () =>
			PERSONAL_FIELDS.map(/** Field. */ (code) => this.field(code)).filter(
				/** Visible. */ (field): field is MyProfileFieldDto => field !== undefined,
			),
	)
	readonly personalEditable = computed(
		/** Preferred name or blood group are Direct. */ () =>
			['preferred-name', 'blood-group'].some(/** Direct. */ (code) => this.direct(code)),
	)
	readonly contactTypes = computed(
		/** Contact types the worker may add. */ () =>
			SELF_CONTACT_TYPES.filter(
				/** Direct. */ (type) =>
					this.direct(type === 'PersonalEmail' ? 'personal-email' : 'mobile-phone'),
			),
	)
	readonly emergencyEditable = computed(/** Direct. */ () => this.direct('emergency-contacts'))
	readonly familyEditable = computed(/** Direct. */ () => this.direct('family-members'))
	readonly customFields = computed(
		/** Additional information. */ () =>
			(this.profile()?.fields ?? []).filter(/** Custom. */ (field) => field.custom !== null),
	)
	readonly preferences = computed(
		/** Fields that allow a worker preference. */ () =>
			(this.profile()?.fields ?? []).filter(/** Allowed. */ (field) => field.preference !== null),
	)
	readonly emergencyContacts = computed(
		/** Display emergency contacts in their recorded priority order. */ () =>
			(this.profile()?.relationships ?? [])
				.filter(
					/** Include relationships flagged as emergency contacts. */ (person) =>
						person.emergencyContact,
				)
				.sort(
					/** Sort missing priorities last without changing the API response. */ (a, b) =>
						(a.emergencyPriority ?? Number.MAX_SAFE_INTEGER) -
						(b.emergencyPriority ?? Number.MAX_SAFE_INTEGER),
				),
	)
	readonly familyMembers = computed(
		/** Avoid duplicating emergency-only contacts in the family table. */ () =>
			(this.profile()?.relationships ?? []).filter(
				/** Keep family relationships and dependants even when they are also emergency contacts. */ (
					person,
				) => !person.emergencyContact || person.dependent,
			),
	)
	private readonly personalEditor = viewChild(PersonalDialog)
	private readonly objectPage = viewChild(HcmObjectPage)
	private readonly contactEditor = viewChild(ContactDialog)
	private readonly relationshipEditor = viewChild(RelationshipDialog)
	private readonly customEditor = viewChild(CustomValueDialog)
	private readonly visibilityEditor = viewChild(VisibilityDialog)

	/** Reload whenever the verified context changes; a persona switch never shows stale data. */
	constructor() {
		effect(
			/** Track the verified context. */ () => {
				const context = this.runtime.context()
				untracked(
					/** Clear prior-context state before loading. */ () => {
						this.request?.unsubscribe()
						this.profile.set(null)
						this.dialog.set(null)
						this.editing.set(false)
						this.notice.set('')
						if (context) this.load()
					},
				)
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.request?.unsubscribe())
	}

	/** Reveal or hide the supported focused editors without creating a page-wide draft. */
	toggleEditing(): void {
		this.editing.update(/** Toggle editing controls for the Personal tab. */ (editing) => !editing)
		this.notice.set('')
	}

	/** Return to read mode when the employee switches to another tab. */
	selectTab(): void {
		this.editing.set(false)
		this.notice.set('')
	}

	/** Load the own profile. */
	load(): void {
		this.state.set('loading')
		this.message.set('')
		this.request = this.api
			.read()
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the profile. */ (profile) => {
					this.profile.set(profile)
					this.state.set('content')
				},
				error: /** Truthful failure without stale data. */ (error) => {
					this.message.set(employeeErrorMessage(error))
					this.state.set(employeeDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** A visible field by code. */
	field(code: string): MyProfileFieldDto | undefined {
		return this.profile()?.fields.find(/** By code. */ (field) => field.code === code)
	}

	/** Whether a field is visible and editable directly. */
	direct(code: string): boolean {
		return this.field(code)?.editMode === 'Direct'
	}

	/** Contact points of one type. */
	contacts(type: SelfContactPointType): MyContactPointDto[] {
		return (this.profile()?.contactPoints ?? []).filter(/** Type. */ (c) => c.type === type)
	}

	/** Whether a contact type is visible. */
	contactVisible(type: SelfContactPointType): boolean {
		return this.field(type === 'PersonalEmail' ? 'personal-email' : 'mobile-phone') !== undefined
	}

	/** Whether a contact is directly editable. */
	contactEditable(contact: MyContactPointDto): boolean {
		return this.contactTypes().includes(contact.type)
	}

	/** Whether a relationship is directly editable in every category it touches. */
	relationshipEditable(r: MyRelationshipDto): boolean {
		if (r.emergencyContact && !this.emergencyEditable()) return false
		if ((!r.emergencyContact || r.dependent) && !this.familyEditable()) return false
		return true
	}

	/** Display text of a custom value. */
	customText(field: MyProfileFieldDto): string {
		const custom = field.custom
		const value = custom?.value
		if (value === null || value === undefined) return 'Not recorded'
		if (!custom) return ''
		/** Option name by id. */
		const name = (id: string) =>
			custom.options.find(/** Option. */ (option) => option.id === id)?.name ?? id
		if (Array.isArray(value)) return value.map(name).join(', ')
		if (typeof value === 'boolean') return value ? 'Yes' : 'No'
		if (custom.dataType === 'SingleSelect') return name(String(value))
		return String(value)
	}

	/** Open the personal Dialog. */
	editPersonal(): void {
		this.dialog.set({ kind: 'personal' })
	}

	/** Open the contact Dialog. */
	editContact(contact: MyContactPointDto | null): void {
		this.dialog.set({ kind: 'contact', request: { types: this.contactTypes(), contact } })
	}

	/** Open the relationship Dialog. */
	editRelationship(relationship: MyRelationshipDto | null): void {
		const taken = (this.profile()?.relationships ?? [])
			.filter(
				/** Other emergency contacts. */ (r) =>
					r.emergencyContact && r.id !== relationship?.id && r.emergencyPriority !== null,
			)
			.map(/** Priority. */ (r) => r.emergencyPriority as number)
		this.dialog.set({
			kind: 'relationship',
			request: {
				relationship,
				emergency: this.emergencyEditable(),
				family: this.familyEditable(),
				takenPriorities: taken,
			},
		})
	}

	/** Open the removal confirmation. */
	remove(kind: 'contact' | 'relationship', id: string, label: string, revision: number): void {
		this.dialog.set({ kind: 'remove', request: { kind, id, label, revision } })
	}

	/** Open the custom value Dialog. */
	editCustom(field: MyProfileFieldDto): void {
		this.dialog.set({ kind: 'custom', field })
	}

	/** Open the visibility Dialog. */
	editVisibility(field: MyProfileFieldDto): void {
		this.dialog.set({ kind: 'visibility', field })
	}

	/** Publish the committed profile the server returned and close the Dialog. */
	saved(profile: MyProfileDto): void {
		this.profile.set(profile)
		this.dialog.set(null)
		this.notice.set('Your changes have been saved.')
	}

	/** Close the Dialog without changes. */
	closed(): void {
		this.dialog.set(null)
	}

	/** Consult the open Dialog's draft before leaving the page. */
	canLeave(): Promise<boolean> {
		const editor =
			this.personalEditor() ??
			this.contactEditor() ??
			this.relationshipEditor() ??
			this.customEditor() ??
			this.visibilityEditor()
		return editor?.canLeave() ?? Promise.resolve(true)
	}

	/** Open My HR Requests with a correction request prefilled for the field; nothing is submitted. */
	requestCorrection(code: string): void {
		void this.router.navigate(['/employee/my-hr-requests'], {
			queryParams: { new: CORRECTION_TYPE_CODE, field: code },
		})
	}
}
