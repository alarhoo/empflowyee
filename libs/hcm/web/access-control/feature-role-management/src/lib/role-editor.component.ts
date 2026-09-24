import {
	ChangeDetectionStrategy,
	HostListener,
	type OnInit,
	type OnDestroy,
	Component,
	DestroyRef,
	computed,
	inject,
	input,
	output,
	signal,
} from '@angular/core'
import { NgTemplateOutlet } from '@angular/common'
import { HcmDynamicPage } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { form, FormField, required, maxLength, pattern } from '@angular/forms/signals'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import type {
	RoleDetail,
	PermissionOption,
	CreateRole,
	UpdateRole,
	DeleteRole,
} from '@empflowyee/hcm-access-control-contract'
import { RoleApi, roleErrorMessage } from '@empflowyee/hcm-web-access-control-data-access'
import { RolePermissionsComponent } from './role-permissions.component'
export interface RoleEdit {
	mode: 'create' | 'update' | 'delete' | 'view'
	role: RoleDetail | null
}

@Component({
	selector: 'ef-hcm-role-editor',
	imports: [
		Dialog,
		NgTemplateOutlet,
		HcmDynamicPage,
		Form,
		FormItem,
		Label,
		Input,
		TextArea,
		Button,
		Bar,
		MessageStrip,
		FormField,
		RolePermissionsComponent,
	],
	templateUrl: './role-editor.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleEditorComponent implements OnInit, OnDestroy {
	readonly edit = input.required<RoleEdit>()
	readonly options = input.required<PermissionOption[]>()
	readonly saved = output<void>()
	readonly closed = output<void>()
	private readonly api = inject(RoleApi)
	private readonly destroy = inject(DestroyRef)
	readonly draft = signal({ label: '', reason: '', permissionCodes: [] as string[] })
	readonly fields = form(
		this.draft,
		/** Apply the approved synchronous field constraints through Signal Forms. */ (path) => {
			required(path.label)
			pattern(path.label, /\S/)
			maxLength(path.label, 100)
			required(path.reason)
			pattern(path.reason, /\S/)
			maxLength(path.reason, 500)
		},
	)
	readonly open = signal(true)
	readonly saving = signal(false)
	readonly error = signal('')
	readonly confirmOpen = signal(false)
	readonly title = computed(
		/** Name the exact explicit operation being reviewed. */ () =>
			({ create: 'Create role', update: 'Edit role', delete: 'Delete role', view: 'Role details' })[
				this.edit().mode
			],
	)
	readonly selected = computed(
		/** Expose the current permission selection to the native picker. */ () =>
			this.draft().permissionCodes,
	)
	private baseline = ''
	private attempt?: { signature: string; key: string }
	private resolveDiscard?: (discard: boolean) => void
	private allowClose = false
	private committed = false
	/** Initialize once after required inputs are available; drafts never live beyond this dialog instance. */
	ngOnInit(): void {
		const role = this.edit().role
		const initial = {
			label: role?.label ?? '',
			reason: '',
			permissionCodes: [...(role?.permissionCodes ?? [])],
		}
		this.fields().reset(initial)
		this.baseline = JSON.stringify(initial)
	}
	/** Keep permission edits in the same Signal Forms model as label and reason. */
	selectPermissions(permissionCodes: string[]): void {
		this.draft.update(
			/** Replace only the registered selection. */ (value) => ({ ...value, permissionCodes }),
		)
	}
	/** Ask before leaving a dirty draft; a pending write cannot be abandoned into another persona. */
	canLeave(): Promise<boolean> {
		if (this.saving()) return Promise.resolve(false)
		if (this.edit().mode === 'view' || JSON.stringify(this.draft()) === this.baseline)
			return Promise.resolve(true)
		if (this.resolveDiscard) return Promise.resolve(false)
		this.confirmOpen.set(true)
		return new Promise(
			/** Resolve the router only after an explicit native-dialog choice. */ (resolve) => {
				this.resolveDiscard = resolve
			},
		)
	}
	/** Complete one explicit discard decision and release its waiting navigation. */
	decide(discard: boolean): void {
		this.confirmOpen.set(false)
		this.resolveDiscard?.(discard)
		this.resolveDiscard = undefined
	}
	/** Route Cancel and Escape through the same discard rule. */
	async cancel(): Promise<void> {
		if (await this.canLeave()) {
			this.allowClose = true
			this.open.set(false)
			if (this.edit().mode !== 'delete') {
				this.baseline = JSON.stringify(this.draft())
				this.closed.emit()
			}
		}
	}
	/** Preserve dirty drafts when native Escape requests dismissal. */
	beforeClose(event: Event): void {
		if (event.target !== event.currentTarget) return
		if (!this.allowClose) {
			event.preventDefault()
			void this.cancel()
		}
	}
	/** Finish the native close before refreshing the page or destroying slotted form content. */
	finishClose(event: Event): void {
		if (event.target !== event.currentTarget) return
		if (this.committed) this.saved.emit()
		this.closed.emit()
	}
	/** Validate, preserve a safe retry key and persist exactly one explicit command. */
	save(): void {
		if (this.saving() || this.edit().mode === 'view') return
		this.fields().markAsTouched()
		if (!this.draft().label.trim() || this.fields.label().invalid()) {
			this.fields.label().focusBoundControl()
			return
		}
		if (!this.draft().reason.trim() || this.fields.reason().invalid()) {
			this.fields.reason().focusBoundControl()
			return
		}
		const edit = this.edit(),
			value = this.draft(),
			mode = edit.mode
		if (mode === 'view') return
		let body: CreateRole | UpdateRole | DeleteRole = {
			...value,
			label: value.label.trim(),
			reason: value.reason.trim(),
		}
		if (mode === 'update') body = { ...body, expectedRevision: edit.role?.revision ?? 0 }
		if (mode === 'delete')
			body = { reason: value.reason.trim(), expectedRevision: edit.role?.revision ?? 0 }
		const signature = JSON.stringify({ mode, id: edit.role?.id, body })
		if (this.attempt?.signature !== signature)
			this.attempt = { signature, key: crypto.randomUUID() }
		this.saving.set(true)
		this.error.set('')
		this.api
			.command(mode, edit.role?.id, body, this.attempt.key)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Close only after the server confirms the transactional command. */ () => {
					this.baseline = JSON.stringify(this.draft())
					this.allowClose = true
					this.committed = true
					this.open.set(false)
					if (this.edit().mode !== 'delete') {
						this.saving.set(false)
						this.saved.emit()
						this.closed.emit()
					}
				},
				error: /** Preserve both draft and retry key after conflicts or availability failures. */ (
					error,
				) => {
					this.saving.set(false)
					this.error.set(roleErrorMessage(error))
				},
			})
	}
	/** Ask the browser before a full document unload would discard a pending or dirty draft. */
	@HostListener('window:beforeunload', ['$event'])
	beforeUnload(event: BeforeUnloadEvent): void {
		if (
			this.saving() ||
			(this.edit().mode !== 'view' && JSON.stringify(this.draft()) !== this.baseline)
		) {
			event.preventDefault()
			event.returnValue = ''
		}
	}
	/** Unblock pending navigation safely when context teardown destroys the dialog. */
	ngOnDestroy(): void {
		this.resolveDiscard?.(false)
	}
}
