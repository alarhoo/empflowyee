import { map } from 'rxjs'
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
import { RouterLink } from '@angular/router'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import type { HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { IdentityApi, identityErrorMessage } from '@empflowyee/hcm-web-identity-access-data-access'
import {
	AssignmentApi,
	assignmentErrorMessage,
} from '@empflowyee/hcm-web-access-control-data-access'
import type { AccountSummary } from '@empflowyee/hcm-identity-access-contract'
import type { AssignmentRole } from '@empflowyee/hcm-access-control-contract'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Link } from '@fundamental-ngx/ui5-webcomponents/link'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
@Component({
	selector: 'ef-hcm-account-detail',
	imports: [
		HcmObjectPage,
		HcmObjectSection,
		Button,
		Link,
		RouterLink,
		MessageStrip,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
	],
	templateUrl: './account-detail.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountDetailComponent {
	readonly accountId = input.required<string>()
	readonly closed = output<void>()
	readonly manage = output<AccountSummary>()
	private readonly api = inject(IdentityApi)
	private readonly assignments = inject(AssignmentApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	readonly account = signal<AccountSummary | null>(null)
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly roles = signal<AssignmentRole[]>([])
	readonly cursor = signal<string | null>(null)
	readonly roleBusy = signal(false)
	readonly roleError = signal('')
	readonly canManage = computed(
		/** Present account-management capability only; APIs reauthorize independently. */ () =>
			this.runtime.context()?.access.permissions.includes('hcm.identity-access.accounts.manage') ===
			true,
	)
	readonly canReadRoles = computed(
		/** Contextual roles retain the owning domain's separate permission and entitlement. */ () => {
			const access = this.runtime.context()?.access
			return (
				!!access?.permissions.includes('hcm.access-control.assignments.read') &&
				access.entitlements.includes('hcm.access-control')
			)
		},
	)
	readonly actions = computed(
		/** Keep navigation and account commands available in their native slots. */ () => {
			const actions: { id: string; label: string; mutates?: boolean }[] = [
				{ id: 'back', label: 'Back to accounts' },
			]
			if (this.canManage())
				actions.push({
					id: 'enabled',
					label: this.account()?.enabled ? 'Disable account' : 'Enable account',
					mutates: true,
				})
			return actions
		},
	)
	/** Reload only the keyed account and authenticated runtime context. */
	constructor() {
		effect(
			/** Keep HTTP interceptor dependency tracking separate from component state. */ () => {
				this.accountId()
				this.runtime.context()
				untracked(/** Dispatch verified reads without an active signal effect. */ () => this.load())
			},
		)
	}
	/** Resolve the real account before separately authorized role context. */
	load(): void {
		this.state.set('loading')
		this.account.set(null)
		this.message.set('')
		this.roles.set([])
		this.cursor.set(null)
		this.api
			.get(this.accountId())
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Expose only committed identity and then load optional domain context. */ (
					value,
				) => {
					this.account.set(value)
					this.state.set('content')
					if (this.canReadRoles()) this.loadRoles()
				},
				error: /** Preserve an unavailable or denied object as a truthful error page. */ (
					error,
				) => {
					this.message.set(identityErrorMessage(error))
					this.state.set('error')
				},
			})
	}
	/** Delegate all role projections to Access Assignments; identity has no assignment writer. */
	loadRoles(more = false): void {
		if (this.roleBusy() || !this.canReadRoles()) return
		this.roleBusy.set(true)
		this.roleError.set('')
		const request = this.roleRequest(more)
		request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Append only explicit server continuations from the owning API. */ (value) => {
				const page = value
				this.roles.update(
					/** Clear previous results unless the user requested another page. */ (rows) =>
						more ? [...rows, ...page.items] : page.items,
				)
				this.cursor.set(page.nextCursor)
				this.roleBusy.set(false)
			},
			error: /** Role denial must not erase accessible account identity. */ (error) => {
				this.roleError.set(assignmentErrorMessage(error))
				this.roleBusy.set(false)
			},
		})
	}
	/** Emit account actions without implementing commands inside the object projection. */
	action(id: string): void {
		const account = this.account()
		if (id === 'back') this.closed.emit()
		else if (account && id === 'enabled') this.manage.emit(account)
	}

	/** Normalize the owning API responses into the same role page contract. */
	private roleRequest(more: boolean) {
		const cursor = this.cursor()
		if (more && cursor) return this.assignments.roles(this.accountId(), cursor)
		return this.assignments
			.get(this.accountId())
			.pipe(map(/** Extract only the contextual projection. */ (value) => value.roles))
	}
}
