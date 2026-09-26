import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	effect,
	inject,
	input,
	output,
	signal,
	untracked,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import type { Subscription } from 'rxjs'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import {
	HcmObjectPage,
	HcmObjectSection,
	type HcmObjectAction,
} from '@empflowyee/hcm-web-ux-floorplan-object-page'
import { HcmDatePipe, HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	ProfileConfigurationApi,
	employeeDenied,
	employeeErrorMessage,
	employeeMissing,
} from '@empflowyee/hcm-web-employee-data-access'
import type {
	CustomFieldOptionDto,
	ProfileFieldDetailDto,
	ProfileFieldRef,
} from '@empflowyee/hcm-employee-contract'
import {
	DATA_TYPE_LABELS,
	EDIT_MODE_LABELS,
	OWNER_SCOPE_LABELS,
	RELATION_LABELS,
	REQUIREDNESS_LABELS,
	SENSITIVITY_LABELS,
	VISIBILITY_LABELS,
	sensitivityStatus,
} from './labels'

export type DetailCommandKind =
	| 'policy'
	| 'reset'
	| 'edit'
	| 'retire'
	| 'reactivate'
	| 'add-option'
	| 'edit-option'
	| 'retire-option'
	| 'reactivate-option'
export interface DetailCommand {
	kind: DetailCommandKind
	field: ProfileFieldDetailDto
	option?: CustomFieldOptionDto
}

/** Mid column: one field's ceiling, product default, tenant policy, options and preview. */
@Component({
	selector: 'ef-hcm-profile-field-detail',
	imports: [
		ObjectStatusComponent,
		Form,
		FormItem,
		Label,
		Text,
		Button,
		CheckBox,
		MessageStrip,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		HcmObjectPage,
		HcmObjectSection,
		HcmDatePipe,
	],
	templateUrl: './field-detail.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldDetailComponent {
	readonly fieldRef = input.required<ProfileFieldRef>()
	readonly refresh = input(0)
	readonly canManage = input(false)
	readonly commanded = output<DetailCommand>()
	readonly closed = output<void>()
	private readonly api = inject(ProfileConfigurationApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly visibility = VISIBILITY_LABELS
	readonly editModes = EDIT_MODE_LABELS
	readonly requiredness = REQUIREDNESS_LABELS
	readonly sensitivities = SENSITIVITY_LABELS
	readonly ownerScopes = OWNER_SCOPE_LABELS
	readonly dataTypes = DATA_TYPE_LABELS
	readonly relations = RELATION_LABELS
	readonly field = signal<ProfileFieldDetailDto | null>(null)
	readonly state = signal<'content' | 'loading' | 'error' | 'denied' | 'unavailable'>('loading')
	readonly message = signal('')
	readonly status = computed(
		/** Semantic sensitivity status. */ () =>
			sensitivityStatus(this.field()?.sensitivity ?? 'Personal'),
	)
	readonly selectField = computed(
		/** Select types carry options. */ () =>
			['SingleSelect', 'MultiSelect'].includes(this.field()?.customField?.dataType ?? ''),
	)
	readonly actions = computed(
		/** Commands the field supports; mutating ones are hidden from read-only viewers. */ () => {
			const field = this.field()
			const actions: HcmObjectAction[] = []
			if (!field) return [{ id: 'close', label: 'Close' }]
			actions.push({ id: 'policy', label: 'Narrow policy', mutates: true, emphasized: true })
			if (field.tenantPolicy)
				actions.push({ id: 'reset', label: 'Reset to product default', mutates: true })
			if (field.custom) {
				actions.push({ id: 'edit', label: 'Edit field', mutates: true })
				if (field.active && this.selectField())
					actions.push({ id: 'add-option', label: 'Add option', mutates: true })
				actions.push(
					field.active
						? { id: 'retire', label: 'Retire field', mutates: true }
						: { id: 'reactivate', label: 'Reactivate field', mutates: true },
				)
			}
			actions.push({ id: 'close', label: 'Close' })
			return actions
		},
	)

	/** Reload when the field, a committed change or the verified context changes. */
	constructor() {
		effect(
			/** Track the inputs that define the visible data. */ () => {
				this.fieldRef()
				this.refresh()
				const context = this.runtime.context()
				untracked(
					/** Clear prior-context state before loading. */ () => {
						this.request?.unsubscribe()
						if (context) this.load()
					},
				)
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.request?.unsubscribe())
	}

	/** Load the selected field. */
	load(): void {
		const quiet = this.field()?.ref === this.fieldRef()
		if (!quiet) {
			this.field.set(null)
			this.state.set('loading')
		}
		this.message.set('')
		this.request = this.api
			.detail(this.fieldRef())
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the field. */ (field) => {
					this.field.set(field)
					this.state.set('content')
				},
				error: /** Truthful failure state without stale data. */ (error) => {
					this.field.set(null)
					this.message.set(
						employeeMissing(error)
							? 'This field does not exist or is no longer available.'
							: employeeErrorMessage(error),
					)
					this.state.set(employeeDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Route object actions. */
	action(id: string): void {
		const field = this.field()
		if (id === 'close') this.closed.emit()
		else if (field) this.commanded.emit({ kind: id as DetailCommandKind, field })
	}

	/** Route an option row action. */
	optionAction(kind: DetailCommandKind, option: CustomFieldOptionDto): void {
		const field = this.field()
		if (field) this.commanded.emit({ kind, field, option })
	}
}
