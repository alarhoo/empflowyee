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
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import { HcmDatePipe } from '@empflowyee/hcm-web-runtime-context'
import {
	EmployeeImportApi,
	employeeDenied,
	employeeMissing,
	importErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import type { ImportTemplateDetailDto } from '@empflowyee/hcm-employee-contract'
import { DATE_FORMAT_LABELS, TRANSFORMATION_LABELS, templateStatus } from './labels'
import type { ImportDialogInput } from './import-dialog.component'

/** Mid column: one template version with its settings and column mapping. */
@Component({
	selector: 'ef-hcm-import-template',
	imports: [
		ObjectStatusComponent,
		Form,
		FormItem,
		Label,
		Text,
		CheckBox,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		HcmObjectPage,
		HcmObjectSection,
		HcmDatePipe,
	],
	templateUrl: './import-template.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportTemplateComponent {
	readonly templateId = input.required<string>()
	readonly refresh = input(0)
	readonly edited = output<string>()
	readonly dialogRequested = output<ImportDialogInput>()
	readonly closed = output<void>()
	private readonly api = inject(EmployeeImportApi)
	private readonly destroy = inject(DestroyRef)
	private load$?: Subscription
	readonly status = templateStatus
	readonly dateFormats = DATE_FORMAT_LABELS
	readonly transformations = TRANSFORMATION_LABELS
	readonly template = signal<ImportTemplateDetailDto | null>(null)
	readonly pageState = signal<'content' | 'loading' | 'error' | 'denied'>('loading')
	readonly message = signal('')
	readonly actions = computed(
		/** Commands the server says the viewer may use. */ () => {
			const t = this.template()
			const actions: { id: string; label: string; mutates?: boolean; emphasized?: boolean }[] = []
			if (t?.actions.publish)
				actions.push({ id: 'publish', label: 'Publish', mutates: true, emphasized: true })
			if (t?.actions.edit) actions.push({ id: 'edit', label: 'Edit draft', mutates: true })
			if (t?.actions.newVersion)
				actions.push({ id: 'newVersion', label: 'New version', mutates: true })
			actions.push({ id: 'close', label: 'Close' })
			return actions
		},
	)

	/** Reload when the template or a refresh changes. */
	constructor() {
		effect(
			/** Track the inputs that define the visible data. */ () => {
				this.templateId()
				this.refresh()
				untracked(/** Load outside the reactive context. */ () => this.load())
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.load$?.unsubscribe())
	}

	/** Load the template. */
	load(): void {
		this.load$?.unsubscribe()
		if (this.template()?.id !== this.templateId()) this.pageState.set('loading')
		this.message.set('')
		this.load$ = this.api
			.readTemplate(this.templateId())
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the template. */ (template) => {
					this.template.set(template)
					this.pageState.set('content')
				},
				error: /** Truthful failure without stale data. */ (error) => {
					this.template.set(null)
					this.message.set(
						employeeMissing(error)
							? 'This template is no longer available.'
							: importErrorMessage(error),
					)
					this.pageState.set(employeeDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Route Object Page actions. */
	action(id: string): void {
		const template = this.template()
		if (id === 'close') this.closed.emit()
		else if (!template) return
		else if (id === 'edit') this.edited.emit(template.id)
		else if (id === 'publish' || id === 'newVersion')
			this.dialogRequested.emit({ mode: id, template })
	}
}
