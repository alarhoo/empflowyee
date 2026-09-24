import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	untracked,
	effect,
	inject,
	input,
	output,
	signal,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { HttpErrorResponse } from '@angular/common/http'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { RoleApi, roleErrorMessage } from '@empflowyee/hcm-web-access-control-data-access'
import type { HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import type {
	RoleDetail,
	RoleAssignee,
	RoleHistoryItem,
	PermissionOption,
} from '@empflowyee/hcm-access-control-contract'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { RolePermissionsComponent } from './role-permissions.component'

@Component({
	selector: 'ef-hcm-role-detail',
	imports: [
		Text,
		Label,
		FormItem,
		Form,
		HcmObjectPage,
		HcmObjectSection,
		Button,
		MessageStrip,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		RolePermissionsComponent,
	],
	templateUrl: './role-detail.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleDetailComponent {
	readonly roleId = input.required<string>()
	readonly closed = output<void>()
	readonly editRole = output<RoleDetail>()
	private readonly api = inject(RoleApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	readonly role = signal<RoleDetail | null>(null)
	readonly permissions = signal<PermissionOption[]>([])
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly assignees = signal<RoleAssignee[]>([])
	readonly assigneeCursor = signal<string | null>(null)
	readonly assigneeState = signal('loading')
	readonly history = signal<RoleHistoryItem[]>([])
	readonly historyCursor = signal<string | null>(null)
	readonly historyState = signal('loading')
	readonly actions = computed(
		/** Preserve close on phones and expose edit only for a mutable authorized role. */ () => [
			{ id: 'close', label: 'Back to roles' },
			...(this.role() && !this.role()?.systemRole && this.has('hcm.access-control.roles.manage')
				? [{ id: 'edit', label: 'Edit role', mutates: true }]
				: []),
		],
	)
	/** Load a fresh object when the routed selection changes; the parent keys instances by role ID. */
	constructor() {
		effect(
			/** Invalidate data when the selected object or authenticated context changes. */ () => {
				this.roleId()
				this.runtime.context()
				untracked(
					/** Dispatch HTTP outside signal tracking; the runtime interceptor owns its context watcher. */ () =>
						this.load(),
				)
			},
		)
	}
	/** Present capabilities only; endpoints independently reload the same authority from PostgreSQL. */
	has(permission: string): boolean {
		return this.runtime.context()?.access.permissions.includes(permission) === true
	}
	/** Retrieve current role and registered definitions without creating an editable copy. */
	load(): void {
		this.state.set('loading')
		this.role.set(null)
		this.assignees.set([])
		this.history.set([])
		this.api
			.get(this.roleId())
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Expose only the current server revision and then request separately authorized sections. */ (
					role,
				) => {
					this.role.set(role)
					this.api
						.permissions()
						.pipe(takeUntilDestroyed(this.destroy))
						.subscribe({
							next: /** Publish registered definitions. */ (result) => {
								this.permissions.set(result.items)
								this.state.set('content')
							},
							error: /** Keep a failed permission projection retryable. */ (error) =>
								this.fail(error),
						})
					this.loadAssignees()
					this.loadHistory()
				},
				error: /** Report denied/missing objects without pretending there are no grants. */ (
					error,
				) => this.fail(error),
			})
	}
	/** Map a failed object load to native floorplan feedback. */
	private fail(error: unknown): void {
		this.message.set(roleErrorMessage(error))
		let state: HcmPageState = 'error'
		if (error instanceof HttpErrorResponse && error.status === 403) state = 'denied'
		if (error instanceof HttpErrorResponse && error.status === 404) state = 'empty'
		this.state.set(state)
	}
	/** Read bounded current assignments through their shared service; a role read grant alone is insufficient. */
	loadAssignees(more = false): void {
		if (!this.has('hcm.access-control.assignments.read')) {
			this.assigneeState.set('denied')
			return
		}
		this.assigneeState.set('loading')
		this.api
			.assignees(this.roleId(), more ? (this.assigneeCursor() ?? undefined) : undefined)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Preserve server pagination and grant occurrence identities. */ (page) => {
					this.assignees.update(
						/** Append only explicit growing pages. */ (rows) =>
							more ? [...rows, ...page.items] : page.items,
					)
					this.assigneeCursor.set(page.nextCursor)
					this.assigneeState.set('content')
				},
				error: /** Keep authorization failure distinct from an empty assignment list. */ (error) =>
					this.assigneeState.set(
						error instanceof HttpErrorResponse && error.status === 403 ? 'denied' : 'error',
					),
			})
	}
	/** Load actual role mutation history through the audit-owned projection. */
	loadHistory(more = false): void {
		if (!this.has('hcm.audit.events.read')) {
			this.historyState.set('denied')
			return
		}
		this.historyState.set('loading')
		this.api
			.history(this.roleId(), more ? (this.historyCursor() ?? undefined) : undefined)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Empty persisted history is valid and is never filled with synthetic events. */ (
					page,
				) => {
					this.history.update(
						/** Append the next chronological server page. */ (rows) =>
							more ? [...rows, ...page.items] : page.items,
					)
					this.historyCursor.set(page.nextCursor)
					this.historyState.set('content')
				},
				error: /** Separate audit denial from unavailable transport. */ (error) =>
					this.historyState.set(
						error instanceof HttpErrorResponse && error.status === 403 ? 'denied' : 'error',
					),
			})
	}
	/** Route native object actions through the feature's navigation owner. */
	action(id: string): void {
		const role = this.role()
		if (id === 'edit' && role) this.editRole.emit(role)
		else if (id === 'close') this.closed.emit()
	}
}
