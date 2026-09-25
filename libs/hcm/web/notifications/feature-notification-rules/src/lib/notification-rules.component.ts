import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { HcmViewSettings } from '@empflowyee/hcm-web-ux-tables'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { HttpErrorResponse } from '@angular/common/http'
import type { Subscription } from 'rxjs'
import { form } from '@angular/forms/signals'
import {
	NotificationApi,
	notificationErrorMessage,
} from '@empflowyee/hcm-web-notifications-data-access'
import {
	notificationEventLabel,
	type NotificationRule,
} from '@empflowyee/hcm-notifications-contract'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { RuleDialogComponent } from './rules-dialog.component'
@Component({
	selector: 'ef-hcm-notification-rules',
	imports: [
		ObjectStatusComponent,
		HcmViewSettings,
		Text,
		HcmDynamicPage,
		Form,
		FormItem,
		Label,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		Button,
		RuleDialogComponent,
	],
	templateUrl: 'notification-rules.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationRulesComponent {
	private readonly api = inject(NotificationApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly eventLabel = notificationEventLabel
	readonly rows = signal<NotificationRule[]>([])
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly filters = signal({ sort: 'label:asc' })
	readonly fields = form(this.filters)
	readonly ordered = computed(
		/** Sort only the explicitly bounded server collection. */ () =>
			[...this.rows()].sort(
				/** Respect the approved client-side sort field. */ (a, b) =>
					(this.filters().sort.startsWith('event:')
						? a.eventType.localeCompare(b.eventType)
						: this.eventLabel(a.eventType).localeCompare(this.eventLabel(b.eventType))) *
					(this.filters().sort.endsWith(':desc') ? -1 : 1),
			),
	)
	readonly canManage = computed(
		/** Hide mutation affordances without replacing server authorization. */ () =>
			this.runtime.context()?.access.permissions.includes('hcm.notifications.rules.manage') ===
			true,
	)
	readonly dialog = viewChild(RuleDialogComponent)
	readonly edit = signal<NotificationRule | null>(null)
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
			.rules()
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
	change(item: NotificationRule): void {
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
	/** Apply confirmed table sorting independently of filter-bar controls. */
	sortBy(sort: string): void {
		this.filters.update(
			/** Preserve current field filters while changing sort order. */ (value) => ({
				...value,
				sort,
			}),
		)
	}
}
