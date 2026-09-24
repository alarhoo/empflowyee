import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	ElementRef,
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
import { toSignal } from '@angular/core/rxjs-interop'
import { FlexibleColumnLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout'
import { RoleDetailComponent } from './role-detail.component'
import { HttpErrorResponse } from '@angular/common/http'
import getActiveElement from '@ui5/webcomponents-base/dist/util/getActiveElement.js'
import { form, FormField } from '@angular/forms/signals'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { forkJoin, of, finalize } from 'rxjs'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { RoleApi, roleErrorMessage } from '@empflowyee/hcm-web-access-control-data-access'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableGrowing } from '@fundamental-ngx/ui5-webcomponents/table-growing'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import type { RoleSummary, PermissionOption } from '@empflowyee/hcm-access-control-contract'
import { RoleEditorComponent, type RoleEdit } from './role-editor.component'

@Component({
	selector: 'ef-hcm-role-management',
	imports: [
		HcmDynamicPage,
		FlexibleColumnLayout,
		RoleDetailComponent,
		Form,
		FormItem,
		Label,
		Input,
		Select,
		Option,
		Button,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableGrowing,
		MessageStrip,
		FormField,
		RoleEditorComponent,
	],
	templateUrl: './role-management.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleManagementComponent {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	readonly query = toSignal(this.route.queryParamMap, {
		initialValue: this.route.snapshot.queryParamMap,
	})
	readonly selectedId = computed(
		/** Keep role selection deep-linkable and browser history owned. */ () =>
			this.query().get('role'),
	)
	private readonly api = inject(RoleApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private readonly injector = inject(Injector)
	private readonly host = inject<ElementRef<HTMLElement>>(ElementRef)
	private focusOrigin: HTMLElement | null = null
	private focusPending = false
	readonly editor = viewChild(RoleEditorComponent)
	readonly filters = signal({ q: '', systemRole: '', sort: 'label:asc' })
	readonly filterForm = form(this.filters)
	private applied = { q: '', systemRole: '', sort: 'label:asc' }
	readonly rows = signal<RoleSummary[]>([])
	readonly cursor = signal<string | null>(null)
	readonly state = signal<HcmPageState>('loading')
	readonly busy = signal(false)
	readonly message = signal('')
	readonly notice = signal('')
	readonly edit = signal<RoleEdit | null>(null)
	readonly permissions = signal<PermissionOption[]>([])
	readonly canManage = computed(
		/** Present current capabilities without treating navigation as server authorization. */ () =>
			this.runtime.context()?.access.permissions.includes('hcm.access-control.roles.manage') ===
			true,
	)
	readonly actions = computed(
		/** Keep the native page action availability synchronized with request state. */ () => [
			{
				id: 'create',
				label: 'Create role',
				mutates: true,
				emphasized: true,
				disabled: this.busy(),
			},
		],
	)
	/** Clear all prior-context state and load real data after a verified context is ready. */
	constructor() {
		effect(
			/** Re-query only on context replacement, not while typing filter drafts. */ () => {
				const context = this.runtime.context()
				this.rows.set([])
				this.edit.set(null)
				this.permissions.set([])
				this.cursor.set(null)
				if (context)
					untracked(
						/** Load from this tenant and actor after clearing obsolete drafts. */ () =>
							this.load(),
					)
			},
		)
	}
	/** Apply current filter controls and request the first server-owned page. */
	load(): void {
		if (!this.runtime.context()) return
		this.applied = { ...this.filters() }
		this.cursor.set(null)
		this.rows.set([])
		this.state.set('loading')
		this.fetch(false)
	}
	/** Fetch the next stable cursor only while the existing page is idle. */
	more(): void {
		if (this.cursor() && !this.busy()) this.fetch(true)
	}
	/** Fetch one bounded page, preserving server errors rather than inventing empty business data. */
	private fetch(append: boolean): void {
		this.busy.set(true)
		this.message.set('')
		const cursor = append ? this.cursor() : null
		this.api
			.list({ ...this.applied, ...(cursor ? { cursor } : {}) })
			.pipe(
				takeUntilDestroyed(this.destroy),
				finalize(
					/** Release the pending UI state and restore a completed dialog's action focus. */ () => {
						this.busy.set(false)
						this.restoreEditorFocus()
					},
				),
			)
			.subscribe({
				next: /** Append only the page returned under the current verified request context. */ (
					page,
				) => {
					this.rows.update(
						/** Preserve earlier pages only for explicit growing. */ (rows) =>
							append ? [...rows, ...page.items] : page.items,
					)
					this.cursor.set(page.nextCursor)
					this.state.set('content')
				},
				error: /** Distinguish backend denial from temporary query failure. */ (error) => {
					this.message.set(roleErrorMessage(error))
					this.state.set(
						error instanceof HttpErrorResponse && [401, 403].includes(error.status)
							? 'denied'
							: 'error',
					)
				},
			})
	}
	/** Route meaningful detail and complex forms; load a fresh revision for the focused delete dialog. */
	open(mode: RoleEdit['mode'], role?: RoleSummary): void {
		if (this.busy() || (mode !== 'view' && !this.canManage())) return
		if (mode === 'view' && role) {
			this.focusOrigin = getActiveElement() as HTMLElement | null
			void this.router.navigate([], { relativeTo: this.route, queryParams: { role: role.id } })
			return
		}
		if (mode === 'create' || mode === 'update') {
			void this.router.navigate(mode === 'create' ? ['new'] : [role?.id, 'edit'], {
				relativeTo: this.route,
			})
			return
		}
		// Native read-loading disables the trigger before Dialog can capture it itself.
		this.focusOrigin = getActiveElement() as HTMLElement | null
		this.busy.set(true)
		this.message.set('')
		forkJoin({ role: role ? this.api.get(role.id) : of(null), permissions: this.api.permissions() })
			.pipe(
				takeUntilDestroyed(this.destroy),
				finalize(
					/** Release detail-loading state after success, error or teardown. */ () =>
						this.busy.set(false),
				),
			)
			.subscribe({
				next: /** Mount a fresh dialog model scoped to this loaded revision. */ (result) => {
					this.permissions.set(result.permissions.items)
					this.edit.set({ mode, role: result.role })
				},
				error: /** Preserve the list while explaining why details could not be loaded. */ (error) =>
					this.message.set(roleErrorMessage(error)),
			})
	}
	/** Close the routed detail and retain the begin-column query/results. */
	async closeDetail(): Promise<void> {
		if (!(await this.router.navigate([], { relativeTo: this.route, queryParams: {} }))) return
		this.focusPending = true
		this.restoreEditorFocus()
	}
	/** Refresh after the confirmed API commit without fabricating an optimistic row. */
	saved(): void {
		this.notice.set('Role changes saved.')
		this.cursor.set(null)
		this.fetch(false)
	}
	/** Remove a fully closed dialog and return focus after any committed list refresh. */
	closeEditor(): void {
		this.edit.set(null)
		this.focusPending = true
		this.restoreEditorFocus()
	}
	/** Wait for Angular and native control rendering before focusing a re-enabled trigger or remaining grid. */
	private restoreEditorFocus(): void {
		if (!this.focusPending || this.busy() || this.destroy.destroyed) return
		this.focusPending = false
		afterNextRender(
			/** Native control updates finish in microtasks before the next animation frame. */ () => {
				requestAnimationFrame(
					/** Never focus a destroyed feature after navigation or persona replacement. */ () => {
						if (this.destroy.destroyed) return
						const target = this.focusOrigin?.isConnected
							? this.focusOrigin
							: this.host.nativeElement.querySelector<HTMLElement>('ui5-table')
						target?.focus()
					},
				)
			},
			{ injector: this.injector },
		)
	}
	/** Let the native editor confirm dirty navigation, including persona changes. */
	canLeave(): Promise<boolean> {
		return this.editor()?.canLeave() ?? Promise.resolve(true)
	}
}
