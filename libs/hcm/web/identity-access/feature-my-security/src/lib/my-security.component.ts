import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Link } from '@fundamental-ngx/ui5-webcomponents/link'
import { HcmDatePipe } from '@empflowyee/hcm-web-runtime-context'
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
import { Subscription } from 'rxjs'
import { IdentityApi } from '@empflowyee/hcm-web-identity-access-data-access'
import type { SecuritySummary, SecurityRole } from '@empflowyee/hcm-identity-access-contract'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { Page } from '@fundamental-ngx/ui5-webcomponents-fiori/page'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'

@Component({
	selector: 'ef-hcm-my-security',
	imports: [
		ObjectStatusComponent,
		Link,
		HcmDatePipe,
		Page,
		Bar,
		Title,
		Button,
		MessageStrip,
		Text,
		Input,
		Label,
		Form,
		FormItem,
		FormField,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
	],
	templateUrl: './my-security.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MySecurityComponent {
	private readonly api = inject(IdentityApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private summaryRequest?: Subscription
	private roleRequest?: Subscription
	private appliedQuery = ''
	readonly data = signal<SecuritySummary | null>(null)
	readonly busy = signal(false)
	readonly error = signal('')
	readonly roles = signal<SecurityRole[]>([])
	readonly cursor = signal<string | null>(null)
	readonly roleBusy = signal(false)
	readonly roleError = signal('')
	readonly filter = signal({ q: '' })
	readonly filterForm = form(this.filter)
	/** Clear self projections and filters when the verified actor changes. */
	constructor() {
		effect(
			/** Observe only the active runtime context. */ () => {
				this.runtime.context()
				untracked(
					/** Refresh HTTP projections independently of view signals. */ () => {
						this.filter.set({ q: '' })
						this.load()
					},
				)
			},
		)
	}
	/** Cancel stale requests and reload the current account summary before its dependent role list. */
	load(): void {
		this.summaryRequest?.unsubscribe()
		this.roleRequest?.unsubscribe()
		this.data.set(null)
		this.roles.set([])
		this.cursor.set(null)
		this.error.set('')
		this.roleError.set('')
		this.busy.set(true)
		this.roleBusy.set(false)
		this.summaryRequest = this.api
			.security()
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish real identity and start the authorized own-role query. */ (data) => {
					this.data.set(data)
					this.busy.set(false)
					this.loadRoles()
				},
				error: /** Keep prior identity cleared after unavailable or denied reads. */ () => {
					this.error.set(
						'Your security summary could not be loaded. Retry to check your current access.',
					)
					this.busy.set(false)
				},
			})
	}
	/** Execute server-owned role search or grow its current continuation without mixing queries. */
	loadRoles(more = false): void {
		if (more && (!this.cursor() || this.roleBusy())) return
		this.roleRequest?.unsubscribe()
		if (!more) {
			this.appliedQuery = this.filter().q
			this.roles.set([])
			this.cursor.set(null)
		}
		this.roleBusy.set(true)
		this.roleError.set('')
		this.roleRequest = this.api
			.securityRoles(this.appliedQuery, more ? (this.cursor() ?? undefined) : undefined)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Append only explicitly requested continuation rows. */ (page) => {
					this.roles.update(
						/** Preserve earlier rows only during growing. */ (rows) =>
							more ? [...rows, ...page.items] : page.items,
					)
					this.cursor.set(page.nextCursor)
					this.roleBusy.set(false)
				},
				error: /** Do not translate service failure into an empty role collection. */ () => {
					this.roleError.set('Your roles could not be loaded. Retry the search.')
					this.roleBusy.set(false)
				},
			})
	}
}
