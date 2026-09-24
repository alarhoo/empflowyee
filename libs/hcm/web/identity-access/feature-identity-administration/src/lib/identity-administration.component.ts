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
import { IdentityApi, identityErrorMessage } from '@empflowyee/hcm-web-identity-access-data-access'
import type { AccountSummary } from '@empflowyee/hcm-identity-access-contract'
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
import { AccountDetailComponent } from './account-detail.component'
import { AccountDialogComponent } from './account-dialog.component'
@Component({
	selector: 'ef-hcm-identity-administration',
	imports: [
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
		AccountDetailComponent,
		AccountDialogComponent,
	],
	templateUrl: './identity-administration.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IdentityAdministrationComponent {
	private readonly api = inject(IdentityApi)
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
	readonly detail = viewChild(AccountDetailComponent)
	readonly dialog = viewChild(AccountDialogComponent)
	readonly edit = signal<{ account?: AccountSummary } | null>(null)
	readonly canManage = computed(
		/** Reflect current account management capability without authorizing writes. */ () =>
			this.runtime.context()?.access.permissions.includes('hcm.identity-access.accounts.manage') ===
			true,
	)
	readonly actions = computed(
		/** Present the focused account-create command in the native page header. */ () => [
			{
				id: 'create',
				label: 'Create account',
				mutates: true,
				emphasized: true,
				disabled: this.busy(),
			},
		],
	)
	readonly filters = signal({ q: '', enabled: '', sort: 'displayName:asc' })
	readonly filterForm = form(this.filters)
	private applied = this.filters()
	readonly rows = signal<AccountSummary[]>([])
	readonly cursor = signal<string | null>(null)
	readonly state = signal<HcmPageState>('loading')
	readonly busy = signal(false)
	readonly message = signal('')
	/** Clear previous-context data before the runtime interceptor starts fresh requests. */
	constructor() {
		effect(
			/** React only to authenticated context replacement. */ () => {
				this.runtime.context()
				this.edit.set(null)
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
					this.message.set(identityErrorMessage(error))
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
	/** Delegate route/context leave protection to the sole pending account dialog. */
	canLeave(): Promise<boolean> {
		return this.dialog()?.canLeave() ?? Promise.resolve(true)
	}

	/** Prepare a current enablement revision or a small fresh account creation draft. */
	open(account?: AccountSummary): void {
		if (!this.canManage() || this.busy()) return
		this.focusOrigin = getActiveElement() as HTMLElement | null
		if (!account) {
			this.edit.set({})
			return
		}
		this.busy.set(true)
		this.api
			.get(account.id)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Open only after resolving the latest persisted revision. */ (value) => {
					this.edit.set({ account: value })
					this.busy.set(false)
				},
				error: /** Retain the list and explain a failed command preparation. */ (error) => {
					this.message.set(identityErrorMessage(error))
					this.busy.set(false)
				},
			})
	}
	/** Refresh persisted state after commit and restore the native triggering control after dismissal. */
	closeDialog(value: AccountSummary | null): void {
		this.edit.set(null)
		if (value) {
			this.load()
			this.detail()?.load()
			void this.select(value.id)
		}
		afterNextRender(
			/** Native dialog has already restored focus before its host is removed. */ () =>
				requestAnimationFrame(
					/** Refocus only a still-mounted control. */ () => {
						if (!this.destroy.destroyed && this.focusOrigin?.isConnected) this.focusOrigin.focus()
					},
				),
			{ injector: this.injector },
		)
	}

	/** Open the same object from native pointer or keyboard row activation. */
	openRow(key: string | undefined): void {
		const item = this.rows().find(
			/** Match the native row identity to the current server projection. */ (item) =>
				item.id === key,
		)
		if (item) void this.select(item.id)
	}
}
