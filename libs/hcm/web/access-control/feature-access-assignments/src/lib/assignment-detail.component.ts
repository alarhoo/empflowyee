import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
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
	input,
	output,
	signal,
	untracked,
	viewChild,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { HttpErrorResponse } from '@angular/common/http'
import getActiveElement from '@ui5/webcomponents-base/dist/util/getActiveElement.js'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import type { HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	AssignmentApi,
	assignmentErrorMessage,
} from '@empflowyee/hcm-web-access-control-data-access'
import type { AssignmentSummary, AssignmentRole } from '@empflowyee/hcm-access-control-contract'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { AssignmentDialogComponent, type AssignmentAction } from './assignment-dialog.component'
@Component({
	selector: 'ef-hcm-assignment-detail',
	imports: [
		Text,
		Label,
		FormItem,
		Form,
		HcmObjectPage,
		HcmObjectSection,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		Button,
		MessageStrip,
		AssignmentDialogComponent,
	],
	templateUrl: './assignment-detail.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssignmentDetailComponent {
	readonly accountId = input.required<string>()
	readonly closed = output<void>()
	readonly changed = output<void>()
	private readonly api = inject(AssignmentApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private readonly injector = inject(Injector)
	private readonly host = inject<ElementRef<HTMLElement>>(ElementRef)
	private focusOrigin: HTMLElement | null = null
	readonly account = signal<AssignmentSummary | null>(null)
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly notice = signal('')
	readonly busy = signal(false)
	readonly edit = signal<AssignmentAction | null>(null)
	readonly dialog = viewChild(AssignmentDialogComponent)
	readonly canManage = computed(
		/** Expose current capability without replacing server authorization. */ () =>
			this.runtime
				.context()
				?.access.permissions.includes('hcm.access-control.assignments.manage') === true,
	)
	readonly actions = computed(
		/** Keep navigation available even when an object cannot be loaded. */ () => [
			{ id: 'back', label: 'Back to accounts' },
			...(this.canManage()
				? [{ id: 'grant', label: 'Grant role', mutates: true, disabled: this.busy() }]
				: []),
		],
	)
	/** Load a fresh account for this keyed routed selection. */
	constructor() {
		effect(
			/** Watch context replacement while keeping HTTP outside reactive dependency collection. */ () => {
				this.accountId()
				this.runtime.context()
				untracked(
					/** The runtime interceptor separately owns request-context cancellation. */ () =>
						this.load(),
				)
			},
		)
	}
	/** Read identity, revision and initial role page from the API. */
	load(): void {
		this.state.set('loading')
		this.account.set(null)
		this.message.set('')
		this.api
			.get(this.accountId())
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish committed account state only. */ (value) => {
					this.account.set(value)
					this.state.set('content')
				},
				error: /** Keep forbidden and missing accounts distinct from an empty role set. */ (
					error,
				) => {
					this.message.set(assignmentErrorMessage(error))
					let state: HcmPageState = 'error'
					if (error instanceof HttpErrorResponse && error.status === 403) state = 'denied'
					if (error instanceof HttpErrorResponse && error.status === 404) state = 'empty'
					this.state.set(state)
				},
			})
	}
	/** Continue the current bounded role collection without replacing account identity. */
	more(): void {
		const account = this.account(),
			cursor = account?.roles.nextCursor
		if (!account || !cursor || this.busy()) return
		this.busy.set(true)
		this.api
			.roles(account.accountId, cursor)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Append the explicit server continuation. */ (page) => {
					this.account.set({
						...account,
						roles: { items: [...account.roles.items, ...page.items], nextCursor: page.nextCursor },
					})
					this.busy.set(false)
				},
				error: /** Retain loaded rows and offer a retry of the same cursor. */ (error) => {
					this.message.set(assignmentErrorMessage(error))
					this.busy.set(false)
				},
			})
	}
	/** Load a current revision before opening a small grant/revoke dialog. */
	openAction(role?: AssignmentRole): void {
		if (this.busy() || !this.canManage()) return
		this.focusOrigin = getActiveElement() as HTMLElement | null
		this.busy.set(true)
		this.message.set('')
		this.api
			.get(this.accountId())
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Retain the exact selected occurrence so the server detects a stale revoke. */ (
					account,
				) => {
					this.account.set(account)
					this.edit.set({ account, role })
					this.busy.set(false)
				},
				error: /** Preserve the detail and explain a failed action load. */ (error) => {
					this.message.set(assignmentErrorMessage(error))
					this.busy.set(false)
				},
			})
	}
	/** Dispatch object actions without creating a second assignment writer. */
	action(id: string): void {
		if (id === 'back') this.closed.emit()
		else if (id === 'grant') this.openAction()
	}
	/** Refresh real state after commit and restore focus once native controls finish rendering. */
	closeDialog(committed: boolean): void {
		this.edit.set(null)
		if (committed) {
			this.notice.set('Assignment changes saved.')
			this.load()
			this.changed.emit()
		}
		afterNextRender(
			/** Restore the invoking control or a stable object action after a removed grant. */ () =>
				requestAnimationFrame(
					/** Avoid focusing destroyed context after navigation. */ () => {
						if (!this.destroy.destroyed)
							(this.focusOrigin?.isConnected
								? this.focusOrigin
								: this.host.nativeElement.querySelector<HTMLElement>('ui5-toolbar-button')
							)?.focus()
					},
				),
			{ injector: this.injector },
		)
	}
	/** Share one dirty-draft guard across query selection, navigation and persona switches. */
	canLeave(): Promise<boolean> {
		return this.dialog()?.canLeave() ?? Promise.resolve(true)
	}
}
