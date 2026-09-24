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
import { IdentityApi, identityErrorMessage } from '@empflowyee/hcm-web-identity-access-data-access'
import type { AccountSummary, PersonOption } from '@empflowyee/hcm-identity-access-contract'
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
@Component({
	selector: 'ef-hcm-account-dialog',
	imports: [
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
	templateUrl: './account-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountDialogComponent implements OnInit, OnDestroy {
	readonly account = input<AccountSummary | null>(null)
	readonly closed = output<AccountSummary | null>()
	private readonly api = inject(IdentityApi)
	private readonly destroy = inject(DestroyRef)
	readonly draft = signal({ personId: '', email: '', reason: '' })
	readonly fields = form(
		this.draft,
		/** Validate a bounded focused action with required target and reason. */ (schema) => {
			required(schema.personId, {
				when: /** Existing account identity is immutable during enablement. */ () =>
					this.account() === null,
			})
			required(schema.email, {
				when: /** Email is editable only during creation. */ () => this.account() === null,
			})
			pattern(schema.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
				when: /** Do not reinterpret immutable existing email during enablement. */ () =>
					this.account() === null,
			})
			maxLength(schema.email, 254)
			required(schema.reason)
			pattern(schema.reason, /\S/)
			maxLength(schema.reason, 500)
		},
	)
	readonly search = signal({ q: '' })
	readonly searchForm = form(this.search)
	readonly options = signal<PersonOption[]>([])
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
	private committed: AccountSummary | null = null
	private resolveDiscard?: (value: boolean) => void
	private attempt?: { signature: string; key: string }
	/** Bind this disposable draft to a fresh account revision or existing-person creation choice. */
	ngOnInit(): void {
		this.fields().reset({
			personId: this.account()?.personId ?? '',
			email: this.account()?.email ?? '',
			reason: '',
		})
		this.baseline = JSON.stringify(this.draft())
		if (!this.account()) this.loadOptions()
	}
	/** Search resets the selected person; explicit growing preserves the current choice. */
	loadOptions(more = false): void {
		if (this.loading()) return
		if (!more) {
			this.draft.update(
				/** Require an explicit choice after changing the server-side person search. */ (
					value,
				) => ({
					...value,
					personId: '',
				}),
			)
			this.appliedQuery = this.search().q
			this.options.set([])
			this.cursor.set(null)
		}
		this.loading.set(true)
		this.choiceError.set('')
		this.api
			.people(this.appliedQuery, more ? (this.cursor() ?? undefined) : undefined)
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
				error: /** Keep a failed picker distinguishable from no matching persons. */ (error) => {
					this.loading.set(false)
					this.choiceError.set(identityErrorMessage(error))
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
		if (this.fields.personId().invalid()) {
			this.fields.personId().focusBoundControl()
			return
		}
		if (this.fields.email().invalid()) {
			this.fields.email().focusBoundControl()
			return
		}
		if (this.fields.reason().invalid()) {
			this.fields.reason().focusBoundControl()
			return
		}
		const signature = JSON.stringify([this.account()?.id ?? 'create', this.draft()])
		if (this.attempt?.signature !== signature)
			this.attempt = { signature, key: crypto.randomUUID() }
		this.saving.set(true)
		this.error.set('')
		const request = this.submit(this.attempt.key)
		request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Close only after the account, revision, audit and receipt commit. */ (value) => {
				this.baseline = JSON.stringify(this.draft())
				this.committed = value
				this.allowClose = true
				this.open.set(false)
			},
			error: /** Preserve the reviewable draft and safe retry attempt. */ (error) => {
				this.saving.set(false)
				this.error.set(identityErrorMessage(error))
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

	/** Map the focused form to exactly one approved API command shape. */
	private submit(key: string) {
		const account = this.account(),
			reason = this.draft().reason.trim()
		if (account)
			return this.api.enabled(
				account.id,
				{ enabled: !account.enabled, expectedRevision: account.revision, reason },
				key,
			)
		return this.api.create({ ...this.draft(), email: this.draft().email.trim(), reason }, key)
	}
}
