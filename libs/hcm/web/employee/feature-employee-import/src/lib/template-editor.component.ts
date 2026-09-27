import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	type OnDestroy,
	type OnInit,
	computed,
	inject,
	signal,
} from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import type { Observable } from 'rxjs'
import { form, FormField, maxLength, pattern, required, validate } from '@angular/forms/signals'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormGroup } from '@fundamental-ngx/ui5-webcomponents/form-group'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { ComboBox } from '@fundamental-ngx/ui5-webcomponents/combo-box'
import { ComboBoxItem } from '@fundamental-ngx/ui5-webcomponents/combo-box-item'
import { StepInput } from '@fundamental-ngx/ui5-webcomponents/step-input'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Toolbar } from '@fundamental-ngx/ui5-webcomponents/toolbar'
import { ToolbarButton } from '@fundamental-ngx/ui5-webcomponents/toolbar-button'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableRowAction } from '@fundamental-ngx/ui5-webcomponents/table-row-action'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	EmployeeImportApi,
	employeeDenied,
	importErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import {
	IMPORT_DATE_FORMATS,
	IMPORT_FIELDS,
	IMPORT_TRANSFORMATIONS,
	type ImportTemplateDetailDto,
	type ImportTransformation,
} from '@empflowyee/hcm-employee-contract'
import { BASE_ROUTE, DATE_FORMAT_LABELS, MANAGE_PERMISSION, TRANSFORMATION_LABELS } from './labels'

/** One editable column row; `key` only tracks the row in the table. */
interface ColumnDraft {
	key: number
	sourceColumnName: string
	sourceColumnOrdinal: number
	fieldCode: string
	transformationCode: ImportTransformation
	isMatchKey: boolean
}

/** IANA time zones the browser knows, with UTC, which some browsers leave out of the list. */
function timeZones(): string[] {
	const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
	const zones = intl.supportedValuesOf?.('timeZone') ?? []
	return zones.includes('UTC') ? zones : ['UTC', ...zones]
}

/** The browser's own time zone, as a default. */
function localZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/**
 * Dedicated route to create a template or edit a draft version: settings, then the column
 * mapping. Published versions are immutable; changing one starts a new version instead.
 */
@Component({
	selector: 'ef-hcm-import-template-editor',
	imports: [
		FormField,
		Bar,
		Button,
		Form,
		FormGroup,
		FormItem,
		Label,
		Input,
		Select,
		Option,
		ComboBox,
		ComboBoxItem,
		StepInput,
		CheckBox,
		TextArea,
		Text,
		Toolbar,
		ToolbarButton,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableRowAction,
		MessageStrip,
		HcmDynamicPage,
		HcmDiscardDialog,
	],
	templateUrl: './template-editor.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplateEditorComponent implements OnInit, OnDestroy {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(EmployeeImportApi)
	private readonly destroy = inject(DestroyRef)
	private nextKey = 1
	private allowLeave = false
	readonly zones = timeZones()
	readonly dateFormats = IMPORT_DATE_FORMATS
	readonly dateLabels = DATE_FORMAT_LABELS
	readonly transformations = IMPORT_TRANSFORMATIONS
	readonly transformationLabels = TRANSFORMATION_LABELS
	readonly fieldOptions = Object.entries(IMPORT_FIELDS).map(
		/** One importable field. */ ([code, policy]) => ({
			code,
			name: policy.name,
			matchKey: policy.matchKey,
		}),
	)
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly existing = signal<ImportTemplateDetailDto | null>(null)
	readonly model = signal({
		code: '',
		name: '',
		description: '',
		fileFormat: 'Csv',
		dateFormat: 'yyyy-MM-dd',
		timeZone: localZone(),
		reason: '',
	})
	readonly hasHeaderRow = signal(true)
	readonly columns = signal<ColumnDraft[]>([])
	readonly columnsTouched = signal(false)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.code, { when: /** New templates only. */ () => !this.existing() })
			pattern(path.code, /^$|^[A-Z][A-Z0-9_]{1,39}$/)
			required(path.name)
			pattern(path.name, /\S/)
			maxLength(path.name, 100)
			maxLength(path.description, 500)
			required(path.timeZone)
			validate(
				path.timeZone,
				/** Accept only IANA zones the browser knows. */ ({ value }) =>
					value() && !this.zones.includes(value()) ? { kind: 'zone' } : null,
			)
			required(path.reason)
			pattern(path.reason, /\S/)
			maxLength(path.reason, 500)
		},
	)
	readonly columnProblem = computed(
		/** The first problem of the column mapping, in product words. */ () => {
			const rows = this.columns()
			if (!rows.length) return 'Map at least one column.'
			const fields = new Set<string>()
			const ordinals = new Set<number>()
			for (const row of rows) {
				if (!row.sourceColumnName.trim()) return 'Name every source column.'
				if (!IMPORT_FIELDS[row.fieldCode]) return 'Choose a listed field for every column.'
				if (fields.has(row.fieldCode)) return 'Map each field only once.'
				if (ordinals.has(row.sourceColumnOrdinal)) return 'Give each column its own position.'
				if (row.isMatchKey && !IMPORT_FIELDS[row.fieldCode]?.matchKey)
					return 'Only worker number and work email can be match keys.'
				fields.add(row.fieldCode)
				ordinals.add(row.sourceColumnOrdinal)
			}
			return ''
		},
	)
	readonly body = computed(
		/** The template facts and columns sent to the server. */ () => {
			const v = this.model()
			return {
				name: v.name.trim(),
				description: v.description.trim(),
				fileFormat: v.fileFormat,
				hasHeaderRow: this.hasHeaderRow(),
				dateFormat: v.dateFormat,
				timeZone: v.timeZone,
				columns: this.columns().map(
					/** One column. */ (row) => ({
						sourceColumnName: row.sourceColumnName.trim(),
						sourceColumnOrdinal: row.sourceColumnOrdinal,
						fieldCode: row.fieldCode,
						transformationCode: row.transformationCode,
						isMatchKey: row.isMatchKey,
					}),
				),
				reason: v.reason.trim(),
			}
		},
	)
	readonly draft = new HcmDraft(
		/** Track the draft. */ () => ({ model: this.model(), body: this.body() }),
	)
	readonly title = computed(
		/** Page title. */ () => {
			const t = this.existing()
			return t ? `Edit ${t.name}, version ${t.versionNumber}` : 'New import template'
		},
	)

	/** Start a new template, or load the draft the route names. */
	ngOnInit(): void {
		if (this.runtime.context()?.access.permissions.includes(MANAGE_PERMISSION) !== true) {
			this.state.set('denied')
			return
		}
		const id = this.route.snapshot.paramMap.get('templateId')
		if (!id) {
			this.addColumn()
			this.state.set('content')
			this.draft.markClean()
			return
		}
		this.api
			.readTemplate(id)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Prefill the draft. */ (template) => this.prefill(template),
				error: /** Truthful failure. */ (error) => {
					this.message.set(importErrorMessage(error))
					this.state.set(employeeDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Prefill the editor from a draft version. */
	private prefill(template: ImportTemplateDetailDto): void {
		if (template.status !== 'Draft' || !template.actions.edit) {
			this.message.set('Published versions cannot change. Start a new version instead.')
			this.state.set('error')
			return
		}
		this.existing.set(template)
		this.model.set({
			code: template.code,
			name: template.name,
			description: template.description,
			fileFormat: template.fileFormat,
			dateFormat: template.dateFormat,
			timeZone: template.timeZone,
			reason: '',
		})
		this.hasHeaderRow.set(template.hasHeaderRow)
		this.columns.set(
			template.columns.map(
				/** Editable column. */ (column) => ({
					key: this.nextKey++,
					sourceColumnName: column.sourceColumnName,
					sourceColumnOrdinal: column.sourceColumnOrdinal,
					fieldCode: column.fieldCode,
					transformationCode: column.transformationCode,
					isMatchKey: column.isMatchKey,
				}),
			),
		)
		this.state.set('content')
		this.draft.markClean()
	}

	/** Append an empty column at the next free position. */
	addColumn(): void {
		const next =
			Math.max(0, ...this.columns().map(/** Position. */ (row) => row.sourceColumnOrdinal)) + 1
		this.columns.update(
			/** Append. */ (rows) => [
				...rows,
				{
					key: this.nextKey++,
					sourceColumnName: '',
					sourceColumnOrdinal: Math.min(next, 100),
					fieldCode: '',
					transformationCode: 'trim',
					isMatchKey: false,
				},
			],
		)
	}

	/** Remove one column. */
	removeColumn(key: number): void {
		this.columns.update(
			/** Keep others. */ (rows) => rows.filter(/** Other. */ (row) => row.key !== key),
		)
	}

	/** Update one column attribute. */
	setColumn<K extends keyof Omit<ColumnDraft, 'key'>>(
		key: number,
		name: K,
		value: ColumnDraft[K],
	): void {
		this.columns.update(
			/** Replace the edited row. */ (rows) =>
				rows.map(/** Edited. */ (row) => (row.key === key ? { ...row, [name]: value } : row)),
		)
	}

	/** Map a column to the field whose name or code was typed or chosen. */
	chooseField(key: number, text: string): void {
		const typed = text.trim().toLowerCase()
		const field = this.fieldOptions.find(
			/** Same name or code. */ (option) =>
				option.name.toLowerCase() === typed || option.code === typed,
		)
		this.setColumn(key, 'fieldCode', field?.code ?? '')
		if (!field?.matchKey) this.setColumn(key, 'isMatchKey', false)
	}

	/** The display name of a mapped field. */
	fieldName(code: string): string {
		return IMPORT_FIELDS[code]?.name ?? ''
	}

	/** Whether a field can be a match key. */
	matchable(code: string): boolean {
		return IMPORT_FIELDS[code]?.matchKey === true
	}

	/** Create the template or save the draft, then open it. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		this.columnsTouched.set(true)
		const f = this.fields
		for (const field of [f.code, f.name, f.description, f.timeZone, f.reason])
			if (field().invalid()) {
				field().focusBoundControl()
				return
			}
		if (this.columnProblem()) return
		const body = this.body()
		const existing = this.existing()
		let request: Observable<ImportTemplateDetailDto>
		if (existing)
			request = this.api.updateTemplate(
				existing.id,
				{ ...body, expectedRevision: existing.revision },
				this.draft.key({ update: existing.id, body }),
			)
		else {
			const create = { ...body, code: this.model().code }
			request = this.api.createTemplate(create, this.draft.key({ create }))
		}
		this.draft.saving.set(true)
		this.draft.error.set('')
		request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Open the saved draft. */ (template) => {
				this.draft.saving.set(false)
				this.draft.markClean()
				this.allowLeave = true
				void this.router.navigateByUrl(`${BASE_ROUTE}/templates/${encodeURIComponent(template.id)}`)
			},
			error: /** Preserve the draft and retry key. */ (error) => {
				this.draft.saving.set(false)
				this.draft.error.set(importErrorMessage(error))
			},
		})
	}

	/** Leave without saving. */
	cancel(): void {
		const id = this.existing()?.id
		void this.router.navigateByUrl(
			id ? `${BASE_ROUTE}/templates/${encodeURIComponent(id)}` : BASE_ROUTE,
		)
	}

	/** Allow the route guard to consult this draft. */
	canLeave(): Promise<boolean> {
		return this.allowLeave ? Promise.resolve(true) : this.draft.canLeave()
	}

	/** Release a pending navigation decision. */
	ngOnDestroy(): void {
		this.draft.release()
	}
}
