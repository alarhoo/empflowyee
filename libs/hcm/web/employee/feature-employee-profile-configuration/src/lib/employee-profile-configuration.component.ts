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
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { filter, map, type Subscription } from 'rxjs'
import { form, FormField } from '@angular/forms/signals'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { FlexibleColumnLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { SegmentedButton } from '@fundamental-ngx/ui5-webcomponents/segmented-button'
import { SegmentedButtonItem } from '@fundamental-ngx/ui5-webcomponents/segmented-button-item'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableRowActionNavigation } from '@fundamental-ngx/ui5-webcomponents/table-row-action-navigation'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	ProfileConfigurationApi,
	employeeDenied,
	employeeErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import {
	PROFILE_SECTIONS,
	PROFILE_SENSITIVITIES,
	type ProfileFieldDetailDto,
	type ProfileFieldDto,
	type ProfileFieldRef,
} from '@empflowyee/hcm-employee-contract'
import {
	EDIT_MODE_LABELS,
	MANAGE_PERMISSION,
	SENSITIVITY_LABELS,
	VISIBILITY_LABELS,
	currentPolicy,
	sensitivityStatus,
} from './labels'
import { FieldDetailComponent, type DetailCommand } from './field-detail.component'
import { PolicyDialog, type PolicyDialogRequest } from './policy-dialog.component'
import { CustomFieldDialog, type CustomFieldDialogRequest } from './custom-field-dialog.component'
import { OptionDialog, type OptionDialogRequest } from './option-dialog.component'

/** Employee Profile Configuration: native FCL of the field catalogue and one field's policy. */
@Component({
	selector: 'ef-hcm-employee-profile-configuration',
	imports: [
		FormField,
		ObjectStatusComponent,
		FlexibleColumnLayout,
		Form,
		FormItem,
		Label,
		Input,
		Select,
		Option,
		SegmentedButton,
		SegmentedButtonItem,
		MessageStrip,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableRowActionNavigation,
		HcmDynamicPage,
		FieldDetailComponent,
		PolicyDialog,
		CustomFieldDialog,
		OptionDialog,
	],
	templateUrl: './employee-profile-configuration.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeeProfileConfigurationComponent {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(ProfileConfigurationApi)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly sections = PROFILE_SECTIONS
	readonly sensitivities = PROFILE_SENSITIVITIES
	readonly sensitivityLabels = SENSITIVITY_LABELS
	readonly selectedRef = toSignal(
		this.router.events.pipe(
			filter(/** Completed navigations only. */ (event) => event instanceof NavigationEnd),
			map(/** Read the child segment. */ () => this.childRef()),
		),
		{ initialValue: this.childRef() },
	)
	readonly scope = signal<'standard' | 'custom'>('standard')
	readonly filters = signal({ q: '', section: '', sensitivity: '' })
	readonly filterForm = form(this.filters)
	readonly fields = signal<ProfileFieldDto[]>([])
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly notice = signal('')
	readonly refresh = signal(0)
	readonly rows = computed(
		/** Client-mode filtering of the bounded catalogue, sorted by section then order. */ () => {
			const { q, section, sensitivity } = this.filters()
			const query = q.trim().toLowerCase()
			return this.fields()
				.filter(
					/** Scope, section, sensitivity and code or name. */ (field) =>
						field.custom === (this.scope() === 'custom') &&
						(!section || field.section === section) &&
						(!sensitivity || field.sensitivity === sensitivity) &&
						(!query ||
							field.name.toLowerCase().includes(query) ||
							field.code.toLowerCase().includes(query)),
				)
				.sort(
					/** Section order, then display order. */ (a, b) =>
						PROFILE_SECTIONS.indexOf(a.section) - PROFILE_SECTIONS.indexOf(b.section) ||
						a.sortOrder - b.sortOrder,
				)
				.map(
					/** Row projection. */ (field) => {
						const policy = currentPolicy(field)
						return {
							field,
							visibility: policy ? VISIBILITY_LABELS[policy.visibility] : '—',
							editMode: policy ? EDIT_MODE_LABELS[policy.selfEditMode] : '—',
							sensitivity: SENSITIVITY_LABELS[field.sensitivity],
							status: sensitivityStatus(field.sensitivity),
							narrowed: field.tenantPolicy !== null,
						}
					},
				)
		},
	)
	readonly canManage = computed(
		/** Presentation only; every endpoint re-authorizes on the server. */ () =>
			this.runtime.context()?.access.permissions.includes(MANAGE_PERMISSION) === true,
	)
	readonly actions = computed(
		/** Create a custom field on its dedicated route. */ () => [
			{ id: 'create', label: 'New custom field', mutates: true, emphasized: true },
		],
	)
	readonly layout = computed(
		/** Show the detail column only for a selected field. */ () =>
			this.selectedRef() ? 'TwoColumnsMidExpanded' : 'OneColumn',
	)
	readonly policyDialog = signal<PolicyDialogRequest | null>(null)
	readonly fieldDialog = signal<CustomFieldDialogRequest | null>(null)
	readonly optionDialog = signal<OptionDialogRequest | null>(null)
	private readonly policyEditor = viewChild(PolicyDialog)
	private readonly fieldEditor = viewChild(CustomFieldDialog)
	private readonly optionEditor = viewChild(OptionDialog)

	/** Reload the catalogue when the verified context changes. */
	constructor() {
		effect(
			/** Track the context that defines the catalogue. */ () => {
				const context = this.runtime.context()
				untracked(
					/** Clear prior-context state before loading. */ () => {
						this.request?.unsubscribe()
						this.fields.set([])
						if (context) this.load()
					},
				)
			},
		)
		const initial = this.childRef()
		if (initial?.startsWith('custom:')) this.scope.set('custom')
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.request?.unsubscribe())
	}

	/** Read the selected field reference from the child route segment. */
	private childRef(): ProfileFieldRef | null {
		const value = this.route.snapshot.firstChild?.paramMap.get('fieldRef') ?? null
		return value && /^(standard|custom):/.test(value) ? (value as ProfileFieldRef) : null
	}

	/** Load the catalogue; a quiet reload keeps the columns in place. */
	load(quiet = false): void {
		if (!quiet) this.state.set('loading')
		this.message.set('')
		this.request?.unsubscribe()
		this.request = this.api
			.list()
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the bounded catalogue. */ (result) => {
					this.fields.set(result.items)
					this.state.set('content')
				},
				error: /** Distinguish denial from temporary failure. */ (error) => {
					this.message.set(employeeErrorMessage(error))
					this.state.set(employeeDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Switch between standard and custom fields. */
	chooseScope(item: HTMLElement | undefined): void {
		const scope = item?.dataset['scope']
		if (scope === 'standard' || scope === 'custom') this.scope.set(scope)
	}

	/** Open a field in the mid column. */
	open(ref: string | undefined): void {
		if (ref) void this.router.navigate([ref], { relativeTo: this.route })
	}

	/** Close the mid column. */
	close(): void {
		void this.router.navigate(['.'], { relativeTo: this.route })
	}

	/** Route list actions. */
	action(id: string): void {
		if (id === 'create' && this.canManage())
			void this.router.navigate(['custom-fields', 'new'], { relativeTo: this.route })
	}

	/** Route a detail command to its Dialog. */
	command(command: DetailCommand): void {
		if (!this.canManage()) return
		this.notice.set('')
		const field = command.field
		const option = command.option ?? null
		switch (command.kind) {
			case 'policy':
			case 'reset':
				this.policyDialog.set({ field, mode: command.kind })
				break
			case 'edit':
			case 'retire':
			case 'reactivate':
				this.fieldDialog.set({ field, mode: command.kind })
				break
			case 'add-option':
				this.optionDialog.set({ field, option: null, mode: 'add' })
				break
			case 'edit-option':
				this.optionDialog.set({ field, option, mode: 'edit' })
				break
			case 'retire-option':
				this.optionDialog.set({ field, option, mode: 'retire' })
				break
			default:
				this.optionDialog.set({ field, option, mode: 'reactivate' })
		}
	}

	/** Refresh both columns after a confirmed command. */
	saved(field: ProfileFieldDetailDto): void {
		this.policyDialog.set(null)
		this.fieldDialog.set(null)
		this.optionDialog.set(null)
		this.notice.set(`${field.name} saved.`)
		this.refresh.update(/** Invalidate the detail. */ (count) => count + 1)
		this.load(true)
	}

	/** Consult any open draft before leaving the feature. */
	canLeave(): Promise<boolean> {
		const editor = this.policyEditor() ?? this.fieldEditor() ?? this.optionEditor()
		return editor?.canLeave() ?? Promise.resolve(true)
	}
}
