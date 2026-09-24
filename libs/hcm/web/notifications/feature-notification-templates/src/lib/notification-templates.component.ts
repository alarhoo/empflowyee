import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { TableRowActionNavigation } from '@fundamental-ngx/ui5-webcomponents/table-row-action-navigation'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
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
import type { Subscription } from 'rxjs'
import { form, FormField } from '@angular/forms/signals'
import getActiveElement from '@ui5/webcomponents-base/dist/util/getActiveElement.js'
import {
	NotificationApi,
	notificationErrorMessage,
} from '@empflowyee/hcm-web-notifications-data-access'
import {
	notificationEventLabel,
	renderNotificationText,
	type NotificationTemplate,
} from '@empflowyee/hcm-notifications-contract'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { FlexibleColumnLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
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
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { TemplateDialogComponent } from './templates-dialog.component'
@Component({
	selector: 'ef-hcm-notification-templates',
	imports: [
		Title,
		TableRowActionNavigation,
		Text,
		HcmDynamicPage,
		FlexibleColumnLayout,
		HcmObjectPage,
		HcmObjectSection,
		Input,
		Form,
		FormItem,
		Label,
		Select,
		Option,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		Button,
		FormField,
		TemplateDialogComponent,
	],
	templateUrl: 'notification-templates.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationTemplatesComponent {
	private readonly api = inject(NotificationApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly eventLabel = notificationEventLabel
	readonly rows = signal<NotificationTemplate[]>([])
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly filters = signal({ sort: 'label' })
	readonly fields = form(this.filters)
	readonly ordered = computed(
		/** Sort only the explicitly bounded server collection. */ () =>
			[...this.rows()].sort(
				/** Respect the approved client-side sort field. */ (a, b) =>
					this.filters().sort === 'event'
						? a.eventType.localeCompare(b.eventType)
						: this.eventLabel(a.eventType).localeCompare(this.eventLabel(b.eventType)),
			),
	)
	readonly canManage = computed(
		/** Hide mutation affordances without replacing server authorization. */ () =>
			this.runtime.context()?.access.permissions.includes('hcm.notifications.templates.manage') ===
			true,
	)
	readonly dialog = viewChild(TemplateDialogComponent)
	readonly edit = signal<NotificationTemplate | null>(null)
	/** Clear previous-context data before resolving current tenant configuration. */
	constructor() {
		effect(
			/** Track only runtime context replacement. */ () => {
				this.runtime.context()
				untracked(
					/** Keep fetch dependencies outside the effect. */ () => {
						this.edit.set(null)
						this.load()
					},
				)
			},
		)
	}
	/** Reload the bounded actual configuration collection. */
	load(): void {
		this.request?.unsubscribe()
		this.rows.set([])
		this.state.set('loading')
		this.message.set('')
		this.request = this.api
			.templates()
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish only committed server configuration. */ (value) => {
					this.rows.set(value.items)
					this.state.set('content')
				},
				error: /** Distinguish denied from failed reads. */ (error) => {
					this.message.set(notificationErrorMessage(error))
					this.state.set(
						error instanceof HttpErrorResponse && [401, 403].includes(error.status)
							? 'denied'
							: 'error',
					)
				},
			})
	}
	/** Open a bounded action against the displayed immutable revision snapshot. */
	change(item: NotificationTemplate): void {
		if (this.canManage()) this.edit.set(item)
	}
	/** Refresh only after a committed command; native dialogs restore their trigger focus. */
	changed(event: string | null): void {
		this.edit.set(null)
		if (event) this.load()
	}
	/** Preserve unsaved actions across route and persona changes. */
	canLeave(): Promise<boolean> {
		return this.dialog()?.canLeave() ?? Promise.resolve(true)
	}
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly injector = inject(Injector)
	private focusOrigin: HTMLElement | null = null
	readonly query = toSignal(this.route.queryParamMap, {
		initialValue: this.route.snapshot.queryParamMap,
	})
	readonly selectedId = computed(
		/** Preserve deep-linkable event selection. */ () => this.query().get('event'),
	)
	readonly selected = computed(
		/** Resolve details only from the authorized bounded collection. */ () =>
			this.rows().find(
				/** Match the selected supported event. */ (row) => row.eventType === this.selectedId(),
			),
	)
	readonly samples = signal({ requestId: '', dueDate: '' })
	readonly sampleFields = form(this.samples)
	readonly actions = computed(
		/** Keep navigation available when the selected event is missing or inaccessible. */ () => [
			{ id: 'back', label: 'Back to templates' },
			...(this.canManage() && this.selected()
				? [{ id: 'edit', label: 'Edit template', mutates: true }]
				: []),
		],
	)
	/** Open the actual template in a native mid-column Object Page. */
	async select(event: string): Promise<void> {
		this.focusOrigin = getActiveElement() as HTMLElement | null
		await this.router.navigate([], { relativeTo: this.route, queryParams: { event } })
	}
	/** Render only explicit typed sample values into escaped plain text. */
	preview(value: string): string {
		return renderNotificationText(value, this.samples().requestId, this.samples().dueDate || null)
	}
	/** Dispatch focused editing or close the selected detail with focus restoration. */
	async action(id: string): Promise<void> {
		if (id === 'edit') {
			const item = this.selected()
			if (item) this.change(item)
			return
		}
		if (!(await this.router.navigate([], { relativeTo: this.route, queryParams: {} }))) return
		afterNextRender(
			/** Restore the retained begin-column row action. */ () => {
				if (this.focusOrigin?.isConnected) this.focusOrigin.focus()
			},
			{ injector: this.injector },
		)
	}

	/** Open the same object from native pointer or keyboard row activation. */
	openRow(key: string | undefined): void {
		const item = this.ordered().find(
			/** Match the native row identity to the current server projection. */ (item) =>
				item.eventType === key,
		)
		if (item) void this.select(item.eventType)
	}
}
