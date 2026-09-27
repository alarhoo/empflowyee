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
import { filter, map, type Observable, type Subscription } from 'rxjs'
import { form, FormField } from '@angular/forms/signals'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { FlexibleColumnLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { SegmentedButton } from '@fundamental-ngx/ui5-webcomponents/segmented-button'
import { SegmentedButtonItem } from '@fundamental-ngx/ui5-webcomponents/segmented-button-item'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableGrowing } from '@fundamental-ngx/ui5-webcomponents/table-growing'
import { TableRowActionNavigation } from '@fundamental-ngx/ui5-webcomponents/table-row-action-navigation'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmDatePipe, HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	EmployeeImportApi,
	employeeDenied,
	importErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import {
	RUN_STATUSES,
	TEMPLATE_STATUSES,
	type ImportRunDto,
	type ImportTemplateDto,
} from '@empflowyee/hcm-employee-contract'
import { ACTION_LABELS, BASE_ROUTE, MANAGE_PERMISSION, runStatus, templateStatus } from './labels'
import { ImportRunComponent } from './import-run.component'
import { ImportTemplateComponent } from './import-template.component'
import {
	ImportDialog,
	type ImportDialogInput,
	type ImportDialogResult,
} from './import-dialog.component'
import { ResolveDialog, type ResolveInput } from './resolve-dialog.component'

type Scope = 'runs' | 'templates'

/** Employee Import: native two-column FCL of runs or templates and the selected item. */
@Component({
	selector: 'ef-hcm-employee-import',
	imports: [
		FormField,
		ObjectStatusComponent,
		FlexibleColumnLayout,
		Form,
		FormItem,
		Label,
		Select,
		Option,
		Button,
		SegmentedButton,
		SegmentedButtonItem,
		MessageStrip,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableGrowing,
		TableRowActionNavigation,
		HcmDynamicPage,
		HcmDatePipe,
		ImportRunComponent,
		ImportTemplateComponent,
		ImportDialog,
		ResolveDialog,
	],
	templateUrl: './employee-import.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeeImportComponent {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(EmployeeImportApi)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly runStatus = runStatus
	readonly templateStatus = templateStatus
	readonly actionLabels = ACTION_LABELS
	readonly runStatuses = RUN_STATUSES
	readonly templateStatuses = TEMPLATE_STATUSES
	readonly selected = toSignal(
		this.router.events.pipe(
			filter(/** Completed navigations only. */ (event) => event instanceof NavigationEnd),
			map(/** Read the child segment. */ () => this.childSelection()),
		),
		{ initialValue: this.childSelection() },
	)
	readonly scope = signal<Scope>(this.childSelection()?.kind ?? 'runs')
	readonly runs = signal<ImportRunDto[]>([])
	readonly templates = signal<ImportTemplateDto[]>([])
	readonly cursor = signal<string | null>(null)
	readonly filters = signal({ status: 'all' })
	readonly filterForm = form(this.filters)
	readonly state = signal<HcmPageState>('loading')
	readonly listState = signal<'loading' | 'content' | 'error'>('loading')
	readonly message = signal('')
	readonly notice = signal('')
	readonly refresh = signal(0)
	readonly dialog = signal<ImportDialogInput | null>(null)
	readonly resolving = signal<ResolveInput | null>(null)
	private readonly dialogEditor = viewChild(ImportDialog)
	private readonly resolveEditor = viewChild(ResolveDialog)
	readonly canManage = computed(
		/** Presentation only; every endpoint re-authorizes on the server. */ () =>
			this.runtime.context()?.access.permissions.includes(MANAGE_PERMISSION) === true,
	)
	readonly actions = computed(
		/** New runs and templates open on their dedicated routes. */ () => {
			if (!this.canManage()) return []
			return this.scope() === 'runs'
				? [{ id: 'run', label: 'New run', mutates: true, emphasized: true }]
				: [{ id: 'template', label: 'New template', mutates: true, emphasized: true }]
		},
	)
	readonly noData = computed(
		/** Explain an empty table truthfully. */ () => {
			if (this.listState() === 'error')
				return `${this.scope() === 'runs' ? 'Runs' : 'Templates'} could not be loaded`
			if (this.filters().status !== 'all') return 'Nothing matches this status'
			return this.scope() === 'runs' ? 'No file has been uploaded yet' : 'No template exists yet'
		},
	)
	readonly layout = computed(
		/** Show the mid column only for a selection. */ () =>
			this.selected() ? 'TwoColumnsMidExpanded' : 'OneColumn',
	)

	/** Reload when the verified context changes. */
	constructor() {
		effect(
			/** Track the context that defines the data. */ () => {
				const context = this.runtime.context()
				untracked(
					/** Clear prior-context state before loading. */ () => {
						this.request?.unsubscribe()
						this.runs.set([])
						this.templates.set([])
						this.dialog.set(null)
						this.resolving.set(null)
						if (context) this.load(false)
					},
				)
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.request?.unsubscribe())
	}

	/** The selected run or template from the child route. */
	private childSelection(): { kind: Scope; id: string } | null {
		const child = this.route.snapshot.firstChild
		const run = child?.paramMap.get('runId')
		if (run) return { kind: 'runs', id: run }
		const template = child?.paramMap.get('templateId')
		return template ? { kind: 'templates', id: template } : null
	}

	/** Load a page of the scope for the applied status; growing appends. */
	load(append: boolean): void {
		this.request?.unsubscribe()
		if (!append) this.listState.set('loading')
		this.message.set('')
		const status = this.filters().status
		const query = {
			...(status !== 'all' ? { status } : {}),
			...(append && this.cursor() ? { cursor: this.cursor() as string } : {}),
		}
		const scope = this.scope()
		const page$: Observable<{ items: unknown[]; nextCursor: string | null }> =
			scope === 'runs' ? this.api.runs(query) : this.api.templates(query)
		this.request = page$.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Publish the page. */ (page) => {
				if (scope === 'runs') {
					const items = page.items as ImportRunDto[]
					this.runs.update(
						/** Append on growing. */ (rows) => (append ? [...rows, ...items] : items),
					)
				} else {
					const items = page.items as ImportTemplateDto[]
					this.templates.update(
						/** Append on growing. */ (rows) => (append ? [...rows, ...items] : items),
					)
				}
				this.cursor.set(page.nextCursor)
				this.listState.set('content')
				this.state.set('content')
			},
			error: /** Publish a failure truthfully. */ (error) => {
				this.message.set(importErrorMessage(error))
				if (employeeDenied(error)) this.state.set('denied')
				else this.listState.set('error')
				if (this.state() === 'loading') this.state.set('error')
			},
		})
	}

	/** Switch between runs and templates. */
	chooseScope(item: HTMLElement | undefined): void {
		const scope = item?.dataset['scope'] as Scope | undefined
		if (!scope || scope === this.scope()) return
		this.scope.set(scope)
		this.filters.set({ status: 'all' })
		this.cursor.set(null)
		this.load(false)
	}

	/** Open a run or template in the mid column. */
	open(id: string | undefined): void {
		if (id)
			void this.router.navigateByUrl(`${BASE_ROUTE}/${this.scope()}/${encodeURIComponent(id)}`)
	}

	/** Close the mid column. */
	close(): void {
		void this.router.navigateByUrl(BASE_ROUTE)
	}

	/** Route list actions. */
	action(id: string): void {
		if (!this.canManage()) return
		if (id === 'run') void this.router.navigateByUrl(`${BASE_ROUTE}/runs/new`)
		if (id === 'template') void this.router.navigateByUrl(`${BASE_ROUTE}/templates/new`)
	}

	/** Open a draft template in its editor. */
	edit(templateId: string): void {
		void this.router.navigateByUrl(`${BASE_ROUTE}/templates/${encodeURIComponent(templateId)}/edit`)
	}

	/** A dialog committed a command: refresh, and open a newly created version in its editor. */
	dialogSaved(result: ImportDialogResult): void {
		const mode = this.dialog()?.mode
		this.dialog.set(null)
		this.notice.set(result.message)
		this.refresh.update(/** Invalidate the selection. */ (count) => count + 1)
		this.load(false)
		if (mode === 'newVersion' && result.template) this.edit(result.template.id)
	}

	/** A row was resolved: refresh the run. */
	resolved(result: { message: string }): void {
		this.resolving.set(null)
		this.notice.set(result.message)
		this.refresh.update(/** Invalidate the run. */ (count) => count + 1)
		this.load(false)
	}

	/** Consult any open dialog draft before leaving the feature. */
	async canLeave(): Promise<boolean> {
		const dialog = this.dialogEditor()
		if (dialog && !(await dialog.canLeave())) return false
		return this.resolveEditor()?.canLeave() ?? true
	}
}
