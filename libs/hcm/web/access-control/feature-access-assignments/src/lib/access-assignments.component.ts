import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Link } from '@fundamental-ngx/ui5-webcomponents/link'
import { HcmViewSettings } from '@empflowyee/hcm-web-ux-tables'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { TableRowActionNavigation } from '@fundamental-ngx/ui5-webcomponents/table-row-action-navigation'
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
} from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { HttpErrorResponse } from '@angular/common/http'
import { form, FormField } from '@angular/forms/signals'
import getActiveElement from '@ui5/webcomponents-base/dist/util/getActiveElement.js'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	AssignmentApi,
	assignmentErrorMessage,
} from '@empflowyee/hcm-web-access-control-data-access'
import type { AssignmentSummary } from '@empflowyee/hcm-access-control-contract'
import { FlexibleColumnLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableGrowing } from '@fundamental-ngx/ui5-webcomponents/table-growing'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { AssignmentDetailComponent } from './assignment-detail.component'
@Component({
	selector: 'ef-hcm-access-assignments',
	imports: [
		ObjectStatusComponent,
		Link,
		HcmViewSettings,
		Text,
		TableRowActionNavigation,
		HcmDynamicPage,
		FlexibleColumnLayout,
		Form,
		FormItem,
		Label,
		Input,
		Select,
		Option,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableGrowing,
		Button,
		MessageStrip,
		FormField,
		AssignmentDetailComponent,
	],
	templateUrl: './access-assignments.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessAssignmentsComponent {
	private readonly api = inject(AssignmentApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly destroy = inject(DestroyRef)
	private readonly injector = inject(Injector)
	private focusOrigin: HTMLElement | null = null
	readonly query = toSignal(this.route.queryParamMap, {
		initialValue: this.route.snapshot.queryParamMap,
	})
	readonly selectedId = computed(
		/** Account selection remains deep-linkable and independent of domain ownership. */ () =>
			this.query().get('account'),
	)
	readonly detail = viewChild(AssignmentDetailComponent)
	readonly filters = signal({ q: '', enabled: '', sort: 'displayName:asc' })
	readonly filterForm = form(this.filters)
	private applied = this.filters()
	readonly rows = signal<AssignmentSummary[]>([])
	readonly cursor = signal<string | null>(null)
	readonly state = signal<HcmPageState>('loading')
	readonly busy = signal(false)
	readonly message = signal('')
	/** Clear previous-context data before the runtime interceptor starts fresh requests. */
	constructor() {
		effect(
			/** React only to authenticated context replacement. */ () => {
				this.runtime.context()
				untracked(/** HTTP dependencies must not join this effect. */ () => this.load())
			},
		)
	}
	/** Apply the current server filters and reset the result collection. */
	load(): void {
		this.applied = { ...this.filters() }
		this.rows.set([])
		this.cursor.set(null)
		this.state.set('loading')
		this.fetch(false)
	}
	/** Grow only an idle current result page. */
	more(): void {
		if (this.cursor() && !this.busy()) this.fetch(true)
	}
	/** Request a bounded page without frontend fixture filtering. */
	private fetch(append: boolean): void {
		this.busy.set(true)
		this.message.set('')
		this.api
			.list({
				...this.applied,
				...(append && this.cursor() ? { cursor: this.cursor() ?? undefined } : {}),
			})
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish rows only after the verified server response. */ (page) => {
					this.rows.update(
						/** Explicit growing preserves earlier pages. */ (rows) =>
							append ? [...rows, ...page.items] : page.items,
					)
					this.cursor.set(page.nextCursor)
					this.state.set('content')
					this.busy.set(false)
				},
				error: /** Preserve truthful denied and transport-failure states. */ (error) => {
					this.message.set(assignmentErrorMessage(error))
					this.state.set(
						error instanceof HttpErrorResponse && [401, 403].includes(error.status)
							? 'denied'
							: 'error',
					)
					this.busy.set(false)
				},
			})
	}
	/** Preserve the filter/list while opening an account in the native mid column. */
	async select(id: string): Promise<void> {
		this.focusOrigin = getActiveElement() as HTMLElement | null
		await this.router.navigate([], { relativeTo: this.route, queryParams: { account: id } })
	}
	/** Close details without losing begin-column filters and return keyboard focus. */
	async closeDetail(): Promise<void> {
		if (!(await this.router.navigate([], { relativeTo: this.route, queryParams: {} }))) return
		afterNextRender(
			/** Restore the retained native row action after layout updates. */ () =>
				requestAnimationFrame(
					/** Never focus a destroyed route. */ () => {
						if (!this.destroy.destroyed && this.focusOrigin?.isConnected) this.focusOrigin.focus()
					},
				),
			{ injector: this.injector },
		)
	}
	/** Delegate route/context leave protection to the sole pending assignment dialog. */
	canLeave(): Promise<boolean> {
		return this.detail()?.canLeave() ?? Promise.resolve(true)
	}

	/** Open the same object from native pointer or keyboard row activation. */
	openRow(key: string | undefined): void {
		const item = this.rows().find(
			/** Match the native row identity to the current server projection. */ (item) =>
				item.accountId === key,
		)
		if (item) void this.select(item.accountId)
	}
	/** Apply confirmed table sorting independently of filter-bar controls. */
	sortBy(sort: string): void {
		this.filters.update(
			/** Preserve current field filters while changing sort order. */ (value) => ({
				...value,
				sort,
			}),
		)
		this.load()
	}
}
