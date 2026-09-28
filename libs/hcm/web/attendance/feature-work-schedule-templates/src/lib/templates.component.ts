import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	Injector,
	afterNextRender,
	computed,
	effect,
	inject,
	signal,
	untracked,
	viewChild,
	viewChildren,
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
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableGrowing } from '@fundamental-ngx/ui5-webcomponents/table-growing'
import { TableRowActionNavigation } from '@fundamental-ngx/ui5-webcomponents/table-row-action-navigation'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import {
	HcmObjectPage,
	HcmObjectSection,
	type HcmObjectAction,
} from '@empflowyee/hcm-web-ux-floorplan-object-page'
import { HcmViewSettings } from '@empflowyee/hcm-web-ux-tables'
import { HcmDatePipe, HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	ScheduleTemplatesApi,
	attendanceErrorMessage,
	attendanceReadState,
} from '@empflowyee/hcm-web-attendance-data-access'
import type { ScheduleVersionView, ScheduleListQuery } from '@empflowyee/hcm-attendance-contract'
import { TemplateActionDialog, type TemplateAction } from './action-dialog.component'
import { TEMPLATE_ROUTE, TEMPLATE_PERMISSION, WEEKDAYS } from './schedule-form'

/** Server-owned template list and native page-backed FCL detail, selected by deep route. */
@Component({
	selector: 'ef-hcm-work-schedule-templates',
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
		Button,
		Text,
		Title,
		MessageStrip,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableGrowing,
		TableRowActionNavigation,
		HcmDynamicPage,
		HcmObjectPage,
		HcmObjectSection,
		HcmViewSettings,
		HcmDatePipe,
		TemplateActionDialog,
	],
	templateUrl: './templates.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkScheduleTemplates {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly api = inject(ScheduleTemplatesApi)
	private readonly destroy = inject(DestroyRef)
	private readonly injector = inject(Injector)
	private readonly runtime = inject(HcmRuntimeStore)
	private listRequest?: Subscription
	private detailRequest?: Subscription
	private readonly dialog = viewChild(TemplateActionDialog)
	private readonly tableRows = viewChildren(TableRow)
	readonly selected = toSignal(
		this.router.events.pipe(
			filter(
				/** Reconcile selection only after completed navigation. */ (event) =>
					event instanceof NavigationEnd,
			),
			map(/** Read the selected root and exact version together. */ () => this.selection()),
		),
		{ initialValue: this.selection() },
	)
	readonly items = signal<ScheduleVersionView[]>([])
	readonly source = signal<ScheduleVersionView | null>(null)
	readonly cursor = signal<string | null>(null)
	readonly state = signal<HcmPageState>('loading')
	readonly detailState = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly detailMessage = signal('')
	readonly notice = signal('')
	readonly operation = signal<TemplateAction | null>(null)
	readonly filters = signal({ code: '', name: '', state: '' })
	readonly fields = form(this.filters)
	readonly sort = signal('code:asc')
	private applied: ScheduleListQuery = { limit: 25, sort: 'code', direction: 'asc' }
	readonly weekdays = WEEKDAYS
	readonly sortFields = [
		{ key: 'code', label: 'Code' },
		{ key: 'name', label: 'Name' },
		{ key: 'state', label: 'Status' },
		{ key: 'id', label: 'Identifier' },
	]
	readonly layout = computed(
		/** Native FCL handles narrow-screen active-column behavior. */ () =>
			this.selected().id ? 'TwoColumnsMidExpanded' : 'OneColumn',
	)
	readonly listActions = computed(
		/** Discovery does not imply mutation permission. */ () =>
			this.can('draft')
				? [{ id: 'create', label: 'Create template', mutates: true, emphasized: true }]
				: [],
	)
	readonly detailActions = computed(
		/** Offer only source-state and current-permission compatible actions. */ () => {
			const source = this.source()
			const actions: HcmObjectAction[] = [{ id: 'close', label: 'Close' }]
			if (!source) return actions
			if (source.state === 'Draft') {
				if (this.can('draft')) actions.push({ id: 'edit', label: 'Edit draft', mutates: true })
				if (this.can('preview') && this.can('publish'))
					actions.push({ id: 'publish', label: 'Preview and publish', mutates: true })
			} else {
				if (this.can('draft'))
					actions.push({ id: 'version', label: 'Create successor', mutates: true })
				if (source.state === 'Published') {
					if (this.can('draft'))
						actions.push({ id: 'copy', label: 'Copy to schedule', mutates: true })
					if (this.can('retire')) actions.push({ id: 'retire', label: 'Retire', mutates: true })
				}
			}
			return actions
		},
	)

	/** Clear tenant-sensitive rows and action drafts before loading a changed runtime context. */
	constructor() {
		effect(
			/** Observe context and route selection together, clearing detail on either change. */ () => {
				const context = this.runtime.context(),
					selected = this.selected()
				untracked(
					/** Cancel prior-context callbacks and fetch the selected current-context source. */ () => {
						this.detailRequest?.unsubscribe()
						this.source.set(null)
						this.operation.set(null)
						this.detailMessage.set('')
						this.detailState.set('loading')
						if (context && selected.id) this.loadDetail(selected.id, selected.version)
					},
				)
			},
		)
		effect(
			/** Reload the collection only when its verified context changes. */ () => {
				const context = this.runtime.context()
				untracked(
					/** Discard rows, cursors and messages before querying the new context. */ () => {
						this.listRequest?.unsubscribe()
						this.items.set([])
						this.cursor.set(null)
						this.notice.set('')
						this.message.set('')
						this.state.set('loading')
						this.filters.set({ code: '', name: '', state: '' })
						if (context) this.load(false)
					},
				)
			},
		)
		this.destroy.onDestroy(
			/** Cancel both reads on feature destruction. */ () => {
				this.listRequest?.unsubscribe()
				this.detailRequest?.unsubscribe()
			},
		)
	}
	/** Read canonical route selectors without assuming selection is present. */
	private selection(): { id: string | null; version?: string } {
		return {
			id: this.route.snapshot.firstChild?.paramMap.get('id') ?? null,
			version: this.route.snapshot.queryParamMap.get('version') ?? undefined,
		}
	}
	/** Check presentation affordances only; the API independently reauthorizes every action. */
	can(operation: string): boolean {
		return (
			this.runtime.context()?.access.permissions.includes(`${TEMPLATE_PERMISSION}${operation}`) ===
			true
		)
	}

	/** Apply filters on refresh; continuation reuses the last applied query exactly. */
	load(append: boolean): void {
		this.listRequest?.unsubscribe()
		this.message.set('')
		if (!append) {
			const [sort, direction] = this.sort().split(':') as [
				ScheduleListQuery['sort'],
				ScheduleListQuery['direction'],
			]
			const filter = this.filters()
			this.applied = {
				limit: 25,
				sort,
				direction,
				...(filter.code ? { code: filter.code } : {}),
				...(filter.name ? { name: filter.name } : {}),
				...(filter.state ? { state: filter.state as ScheduleListQuery['state'] } : {}),
			}
			this.items.set([])
			this.cursor.set(null)
		}
		this.state.set('loading')
		this.listRequest = this.api
			.list({
				...this.applied,
				...(append && this.cursor() ? { cursor: this.cursor() as string } : {}),
			})
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Preserve server ordering without client sorting a partial page. */ (page) => {
					this.items.update(
						/** Append only a matching cursor page. */ (items) =>
							append ? [...items, ...page.items] : page.items,
					)
					this.cursor.set(page.nextCursor)
					this.state.set('content')
				},
				error: /** Clear failed pages and restart from a fresh cursor. */ (error) => {
					this.items.set([])
					this.cursor.set(null)
					this.message.set(attendanceErrorMessage(error))
					this.state.set(attendanceReadState(error))
				},
			})
	}
	/** Refresh current exact-version detail after a confirmed command. */
	reloadDetail(): void {
		const selected = this.selected()
		if (selected.id) this.loadDetail(selected.id, selected.version)
	}
	/** Fetch a purpose-built detail projection, clearing previously visible source data first. */
	private loadDetail(id: string, version?: string): void {
		this.detailRequest?.unsubscribe()
		this.source.set(null)
		this.detailState.set('loading')
		this.detailMessage.set('')
		this.detailRequest = this.api
			.detail(id, version)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Show only the newly authorized source revision. */ (source) => {
					this.source.set(source)
					this.detailState.set('content')
				},
				error: /** Do not retain a stale detail after denial or removal. */ (error) => {
					this.detailMessage.set(attendanceErrorMessage(error))
					this.detailState.set(attendanceReadState(error))
				},
			})
	}
	/** Apply the native settings dialog's allowlisted sort and restart pagination. */
	sortChanged(sort: string): void {
		this.sort.set(sort)
		this.load(false)
	}
	/** Select the exact row version, respecting any focused dirty command. */
	async open(id: string | undefined): Promise<void> {
		if (!id || !(await this.canLeave())) return
		const row = this.items().find(
			/** Find only a loaded authorized row. */ (item) => item.id === id,
		)
		if (row)
			void this.router.navigate([TEMPLATE_ROUTE, id], { queryParams: { version: row.versionId } })
	}
	/** Navigate to the dedicated complex editor. */
	create(): void {
		void this.router.navigateByUrl(`${TEMPLATE_ROUTE}/new`)
	}
	/** Dispatch navigation separately from the focused lifecycle command. */
	async action(action: string): Promise<void> {
		if (action === 'close') {
			await this.close()
			return
		}
		const source = this.source()
		if (!source || !(await this.canLeave())) return
		if (action === 'edit') {
			void this.router.navigate([TEMPLATE_ROUTE, source.id, 'edit'], {
				queryParams: { version: source.versionId },
			})
			return
		}
		if (['publish', 'copy', 'retire', 'version'].includes(action))
			this.operation.set(action as TemplateAction)
	}
	/** Restore focus to the originating row after closing the native detail column. */
	async close(): Promise<void> {
		if (!(await this.canLeave())) return
		const id = this.selected().id
		await this.router.navigateByUrl(TEMPLATE_ROUTE)
		afterNextRender(
			/** Let the native FCL make the list column visible before restoring focus. */ () =>
				requestAnimationFrame(
					/** Avoid focusing a removed route or row. */ () => {
						if (this.destroy.destroyed || this.selected().id) return
						const row = this.tableRows().find(
							/** Match the originating template. */ (item) => item.rowKey() === id,
						)
						void row?.elementRef.nativeElement.focus()
					},
				),
			{ injector: this.injector },
		)
	}
	/** Follow confirmed source changes; a copy remains explicitly an ordinary schedule draft. */
	completed(result: { action: TemplateAction; id: string; versionId: string }): void {
		this.operation.set(null)
		this.load(false)
		if (result.action === 'copy') {
			this.notice.set(
				`Independent schedule draft created: ${result.id}. It must be reviewed in Work Schedules before publication or assignment.`,
			)
			return
		}
		this.notice.set('Template action confirmed.')
		void this.router
			.navigate([TEMPLATE_ROUTE, result.id], { queryParams: { version: result.versionId } })
			.then(
				/** Same-URL navigation also refreshes the source revision. */ () =>
					this.loadDetail(result.id, result.versionId),
			)
	}
	/** Consult the active reason dialog before leaving this feature or switching selection. */
	canLeave(): Promise<boolean> {
		return this.dialog()?.canLeave() ?? Promise.resolve(true)
	}
	/** Use the shared account-preference formatter without assigning a timezone to a local pattern. */
	wallTime(value: string): string {
		return this.runtime.formatWallTime(value)
	}
}
