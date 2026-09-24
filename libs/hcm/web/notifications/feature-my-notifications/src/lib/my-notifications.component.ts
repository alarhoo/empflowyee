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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { form, FormField } from '@angular/forms/signals'
import { HttpErrorResponse } from '@angular/common/http'
import { Router } from '@angular/router'
import type { Subscription } from 'rxjs'
import {
	NotificationApi,
	notificationErrorMessage,
} from '@empflowyee/hcm-web-notifications-data-access'
import {
	NOTIFICATION_EVENTS,
	notificationEventLabel,
	parseInboxQuery,
	type InboxQuery,
	type NotificationItem,
} from '@empflowyee/hcm-notifications-contract'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { findHcmFeature, canAccessHcmFeature } from '@empflowyee/hcm-web-navigation-catalog'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { ExpandableText } from '@fundamental-ngx/ui5-webcomponents/expandable-text'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
@Component({
	selector: 'ef-hcm-my-notifications',
	imports: [
		HcmDynamicPage,
		Form,
		FormItem,
		Label,
		Input,
		Select,
		Option,
		Button,
		MessageStrip,
		ExpandableText,
		FormField,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
	],
	templateUrl: './my-notifications.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyNotificationsComponent {
	private readonly api = inject(NotificationApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly router = inject(Router)
	private readonly destroy = inject(DestroyRef)
	private readonly injector = inject(Injector)
	private request?: Subscription
	private applied: InboxQuery = { q: '', sort: 'createdAt:desc', limit: 25 }
	private readonly attempts = new Map<string, { revision: number; key: string }>()
	private focusAfterLoad = false
	readonly table = viewChild(Table)
	readonly events = NOTIFICATION_EVENTS
	readonly eventLabel = notificationEventLabel
	readonly filters = signal({ q: '', unread: '', eventType: '', sort: 'createdAt:desc' })
	readonly filterForm = form(this.filters)
	readonly state = signal<HcmPageState>('loading')
	readonly rows = signal<NotificationItem[]>([])
	readonly cursor = signal<string | null>(null)
	readonly pending = signal(false)
	readonly reading = signal<string | null>(null)
	readonly error = signal('')
	readonly notice = signal('')
	readonly canManage = computed(
		/** Reflect capability without replacing backend authorization. */ () =>
			this.runtime.context()?.access.permissions.includes('hcm.notifications.inbox.self.manage') ===
			true,
	)
	readonly requestFeature = computed(
		/** Offer navigation only for an implemented discoverable destination. */ () => {
			const feature = findHcmFeature('DOCUMENT_REQUESTS'),
				access = this.runtime.context()?.access
			return access && canAccessHcmFeature(feature, access) ? feature : undefined
		},
	)
	/** Drop prior-account projections and retry keys when verified context changes. */
	constructor() {
		effect(
			/** Track context replacement only. */ () => {
				this.runtime.context()
				untracked(
					/** Keep request state outside reactive dependency collection. */ () => {
						this.attempts.clear()
						this.reading.set(null)
						this.notice.set('')
						this.filters.set({ q: '', unread: '', eventType: '', sort: 'createdAt:desc' })
						this.load()
					},
				)
			},
		)
	}
	/** Apply server controls or fetch the explicit next cursor while preserving current filters. */
	load(more = false): void {
		if (this.reading() || (more && (!this.cursor() || this.pending()))) return
		if (!more) {
			const params = new URLSearchParams()
			for (const [key, value] of Object.entries(this.filters())) if (value) params.set(key, value)
			try {
				this.applied = parseInboxQuery(params)
			} catch {
				this.error.set('Search is limited to 200 characters. Choose supported filters.')
				return
			}
			this.rows.set([])
			this.cursor.set(null)
		}
		this.request?.unsubscribe()
		this.pending.set(true)
		this.error.set('')
		this.request = this.api
			.inbox({ ...this.applied, ...(more ? { cursor: this.cursor() ?? undefined } : {}) })
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the current account's actual inbox page. */ (page) => {
					this.rows.update(
						/** Grow only the requested server continuation. */ (rows) =>
							more ? [...rows, ...page.items] : page.items,
					)
					this.cursor.set(page.nextCursor)
					this.state.set('content')
					this.pending.set(false)
					if (this.focusAfterLoad) {
						this.focusAfterLoad = false
						afterNextRender(
							/** Restore focus after the completed row action disappears. */ () =>
								void this.table()?.elementRef.nativeElement.focus(),
							{ injector: this.injector },
						)
					}
				},
				error: /** Keep failed reads distinct from an honestly empty inbox. */ (error) => {
					this.error.set(notificationErrorMessage(error))
					this.pending.set(false)
					this.state.set(
						error instanceof HttpErrorResponse && [401, 403].includes(error.status)
							? 'denied'
							: 'content',
					)
				},
			})
	}
	/** Submit one exact read transition and retain its receipt key across transport failures. */
	markRead(item: NotificationItem): void {
		if (this.reading() || this.pending() || item.readAt || !this.canManage()) return
		let attempt = this.attempts.get(item.id)
		if (attempt?.revision !== item.revision) {
			attempt = { revision: item.revision, key: crypto.randomUUID() }
			this.attempts.set(item.id, attempt)
		}
		this.reading.set(item.id)
		this.error.set('')
		this.api
			.read(item.id, item.revision, attempt.key)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Refresh filters only after the committed first-read timestamp is acknowledged. */ () => {
					this.reading.set(null)
					this.notice.set('Notification marked as read.')
					this.focusAfterLoad = true
					this.load()
				},
				error: /** Retain current evidence and its safe retry identity. */ (error) => {
					this.reading.set(null)
					this.error.set(notificationErrorMessage(error))
				},
			})
	}
	/** Follow the catalogue route; the destination still authorizes its own request subject. */
	openRequest(item: NotificationItem): void {
		const feature = this.requestFeature()
		if (feature)
			void this.router.navigate([feature.route], { queryParams: { request: item.requestId } })
	}
}
