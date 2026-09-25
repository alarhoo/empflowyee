import { Link } from '@fundamental-ngx/ui5-webcomponents/link'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	HostListener,
	inject,
	input,
	output,
	signal,
	type OnInit,
	type OnDestroy,
} from '@angular/core'
import { form, FormField, required, maxLength, pattern } from '@angular/forms/signals'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import {
	AssignmentApi,
	assignmentErrorMessage,
} from '@empflowyee/hcm-web-access-control-data-access'
import type {
	AssignmentSummary,
	AssignmentRole,
	AssignmentRoleOption,
} from '@empflowyee/hcm-access-control-contract'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
export interface AssignmentAction {
	account: AssignmentSummary
	role?: AssignmentRole
}
@Component({
	selector: 'ef-hcm-assignment-dialog',
	imports: [
		Link,
		Text,
		Dialog,
		Form,
		FormItem,
		Label,
		Input,
		Select,
		Option,
		TextArea,
		Button,
		Bar,
		MessageStrip,
		FormField,
	],
	templateUrl: './assignment-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssignmentDialogComponent implements OnInit, OnDestroy {
	readonly action = input.required<AssignmentAction>()
	readonly closed = output<boolean>()
	private readonly api = inject(AssignmentApi)
	private readonly destroy = inject(DestroyRef)
	readonly draft = signal({ roleId: '', reason: '' })
	readonly fields = form(
		this.draft,
		/** Validate a bounded focused action with required target and reason. */ (schema) => {
			required(schema.roleId)
			required(schema.reason)
			pattern(schema.reason, /\S/)
			maxLength(schema.reason, 500)
		},
	)
	readonly search = signal({ q: '' })
	readonly searchForm = form(this.search)
	readonly options = signal<AssignmentRoleOption[]>([])
	readonly cursor = signal<string | null>(null)
	readonly loading = signal(false)
	readonly choiceError = signal('')
	readonly saving = signal(false)
	readonly error = signal('')
	readonly open = signal(true)
	readonly confirm = signal(false)
	private baseline = ''
	private appliedQuery = ''
	private allowClose = false
	private committed = false
	private resolveDiscard?: (value: boolean) => void
	private attempt?: { signature: string; key: string }
	/** Bind this disposable draft to a fresh account revision and exact revoke occurrence. */
	ngOnInit(): void {
		this.fields().reset({ roleId: this.action().role?.id ?? '', reason: '' })
		this.baseline = JSON.stringify(this.draft())
		if (!this.action().role) this.loadOptions()
	}
	/** Search resets the selected role; explicit growing preserves the current choice. */
	loadOptions(more = false): void {
		if (this.loading()) return
		if (!more) {
			this.draft.update(
				/** Require an explicit choice after changing the server-side role search. */ (value) => ({
					...value,
					roleId: '',
				}),
			)
			this.appliedQuery = this.search().q
			this.options.set([])
			this.cursor.set(null)
		}
		this.loading.set(true)
		this.choiceError.set('')
		this.api
			.options(this.appliedQuery, more ? (this.cursor() ?? undefined) : undefined)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish only the authorized server page. */ (page) => {
					this.options.update(
						/** Preserve previous choices only on explicit growing. */ (rows) =>
							more ? [...rows, ...page.items] : page.items,
					)
					this.cursor.set(page.nextCursor)
					this.loading.set(false)
				},
				error: /** Keep a failed picker distinguishable from no matching roles. */ (error) => {
					this.loading.set(false)
					this.choiceError.set(assignmentErrorMessage(error))
				},
			})
	}
	/** Prevent abandoning pending writes and confirm loss of a dirty draft. */
	canLeave(): Promise<boolean> {
		if (this.saving()) return Promise.resolve(false)
		if (JSON.stringify(this.draft()) === this.baseline) return Promise.resolve(true)
		if (this.resolveDiscard) return Promise.resolve(false)
		this.confirm.set(true)
		return new Promise(
			/** Release navigation only after an explicit user decision. */ (resolve) => {
				this.resolveDiscard = resolve
			},
		)
	}
	/** Complete the one outstanding native discard decision. */
	decide(value: boolean): void {
		this.confirm.set(false)
		this.resolveDiscard?.(value)
		this.resolveDiscard = undefined
	}
	/** Route Cancel and Escape through the same dirty-draft rule. */
	async cancel(): Promise<void> {
		if (await this.canLeave()) {
			this.allowClose = true
			this.open.set(false)
		}
	}
	/** Keep nested confirmation events from dismissing the parent action accidentally. */
	beforeClose(event: Event): void {
		if (event.target !== event.currentTarget) return
		if (!this.allowClose) {
			event.preventDefault()
			void this.cancel()
		}
	}
	/** Wait for native dialog focus restoration before removing the component. */
	finish(event: Event): void {
		if (event.target === event.currentTarget) this.closed.emit(this.committed)
	}
	/** Persist one explicit command, preserving both draft and retry key on failure. */
	save(): void {
		if (this.saving()) return
		this.fields().markAsTouched()
		if (this.fields.roleId().invalid()) {
			this.fields.roleId().focusBoundControl()
			return
		}
		if (this.fields.reason().invalid()) {
			this.fields.reason().focusBoundControl()
			return
		}
		const action = this.action(),
			operation = action.role ? 'revoke' : 'grant',
			body = {
				...this.draft(),
				reason: this.draft().reason.trim(),
				expectedRevision: action.account.revision,
				...(action.role ? { grantId: action.role.grantId } : {}),
			}
		const signature = JSON.stringify([action.account.accountId, operation, body])
		if (this.attempt?.signature !== signature)
			this.attempt = { signature, key: crypto.randomUUID() }
		this.saving.set(true)
		this.error.set('')
		this.api
			.command(action.account.accountId, operation, body, this.attempt.key)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Close only after the assignment, revision, audit and receipt commit. */ () => {
					this.baseline = JSON.stringify(this.draft())
					this.committed = true
					this.allowClose = true
					this.open.set(false)
				},
				error: /** Preserve the reviewable draft and safe retry attempt. */ (error) => {
					this.saving.set(false)
					this.error.set(assignmentErrorMessage(error))
				},
			})
	}
	/** Protect unsaved actions from full document reload as well as Angular navigation. */
	@HostListener('window:beforeunload', ['$event'])
	beforeUnload(event: BeforeUnloadEvent): void {
		if (this.saving() || JSON.stringify(this.draft()) !== this.baseline) {
			event.preventDefault()
			event.returnValue = ''
		}
	}
	/** Cancel a waiting navigation if the runtime context tears down the action. */
	ngOnDestroy(): void {
		this.resolveDiscard?.(false)
	}
}
