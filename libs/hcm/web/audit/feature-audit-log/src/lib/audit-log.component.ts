import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { DateTimePicker } from '@fundamental-ngx/ui5-webcomponents/date-time-picker'
import { HcmDatePipe } from '@empflowyee/hcm-web-runtime-context'
import { HcmViewSettings } from '@empflowyee/hcm-web-ux-tables'
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	effect,
	inject,
	signal,
	untracked,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { form, FormField } from '@angular/forms/signals'
import { HttpErrorResponse } from '@angular/common/http'
import { Subscription } from 'rxjs'
import { AuditApi } from '@empflowyee/hcm-web-audit-data-access'
import { AUDIT_ACTIONS, parseAuditQuery, type AuditItem } from '@empflowyee/hcm-audit-contract'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'

@Component({
	selector: 'ef-hcm-audit-log',
	imports: [
		ObjectStatusComponent,
		DateTimePicker,
		HcmDatePipe,
		HcmViewSettings,
		HcmDynamicPage,
		Form,
		FormItem,
		Label,
		Input,
		Select,
		Option,
		Button,
		MessageStrip,
		Text,
		FormField,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
	],
	templateUrl: './audit-log.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogComponent {
	private readonly api = inject(AuditApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	private applied: Record<string, string> = {}
	readonly actions = AUDIT_ACTIONS
	readonly state = signal<HcmPageState>('loading')
	readonly error = signal('')
	readonly pending = signal(false)
	readonly rows = signal<AuditItem[]>([])
	readonly cursor = signal<string | null>(null)
	readonly filters = signal({
		from: '',
		to: '',
		action: '',
		outcome: '',
		actorAccountId: '',
		sort: 'occurredAt:desc',
	})
	readonly filterForm = form(this.filters)
	/** Reset all actor-scoped projections before loading fresh tenant evidence. */
	constructor() {
		effect(
			/** Track the verified runtime context only. */ () => {
				this.runtime.context()
				untracked(
					/** Clear obsolete filters when authority changes. */ () => {
						this.filters.set({
							from: '',
							to: '',
							action: '',
							outcome: '',
							actorAccountId: '',
							sort: 'occurredAt:desc',
						})
						this.state.set('loading')
						this.load()
					},
				)
			},
		)
	}
	/** Validate explicit query controls and execute server-owned filtering or continuation. */
	load(more = false): void {
		if (more && (!this.cursor() || this.pending())) return
		if (!more) {
			const query: Record<string, string> = { ...this.filters() }
			const params = new URLSearchParams()
			for (const [key, value] of Object.entries(query)) if (value) params.set(key, value)
			try {
				parseAuditQuery(params)
			} catch {
				this.error.set('Enter valid ISO date-times with a timezone, with From no later than To.')
				return
			}
			this.applied = query
			this.rows.set([])
			this.cursor.set(null)
		}
		this.request?.unsubscribe()
		this.pending.set(true)
		this.error.set('')
		this.request = this.api
			.list({ ...this.applied, ...(more ? { cursor: this.cursor() ?? '' } : {}) })
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish actual stored events; an empty success remains an editable filter state. */ (
					page,
				) => {
					this.rows.update(
						/** Append only the requested next server page. */ (rows) =>
							more ? [...rows, ...page.items] : page.items,
					)
					this.cursor.set(page.nextCursor)
					this.pending.set(false)
					this.state.set('content')
				},
				error: /** Keep filters and explain denied or failed reads. */ (error: unknown) => {
					this.error.set(
						error instanceof HttpErrorResponse && [401, 403].includes(error.status)
							? 'This session no longer has permission to read the audit log.'
							: 'Audit events could not be loaded. Retry the current filters.',
					)
					this.pending.set(false)
					this.state.set('content')
				},
			})
	}
	/** Render named allowlisted fields as text, never raw JSON or arbitrary payload keys. */
	summary(item: AuditItem): string {
		const value = item.summary,
			parts: string[] = []
		if (value.changedFields) parts.push('Changed fields: ' + value.changedFields.join(', '))
		if (value.roleId) parts.push('Role: ' + value.roleId)
		if (value.grantId) parts.push('Grant: ' + value.grantId)
		if (value.enabled !== undefined) parts.push('Enabled: ' + String(value.enabled))
		if (value.reason) parts.push('Reason: ' + value.reason)
		if (value.fromState) parts.push('From: ' + value.fromState)
		if (value.toState) parts.push('To: ' + value.toState)
		return parts.join(' · ')
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
