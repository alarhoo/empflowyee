import { NgTemplateOutlet } from '@angular/common'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	HostListener,
	computed,
	effect,
	inject,
	input,
	signal,
	untracked,
	type OnDestroy,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { form, FormField } from '@angular/forms/signals'
import { HttpErrorResponse } from '@angular/common/http'
import type { Subscription } from 'rxjs'
import {
	NotificationApi,
	notificationErrorMessage,
} from '@empflowyee/hcm-web-notifications-data-access'
import {
	notificationEventLabel,
	type NotificationEvent,
	type NotificationPreference,
} from '@empflowyee/hcm-notifications-contract'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import type { HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { Page } from '@fundamental-ngx/ui5-webcomponents-fiori/page'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
@Component({
	selector: 'ef-hcm-notification-preferences',
	imports: [
		NgTemplateOutlet,
		Text,
		Page,
		Title,
		Form,
		FormItem,
		CheckBox,
		FormField,
		Button,
		MessageStrip,
		Dialog,
		Bar,
	],
	templateUrl: './notification-preferences.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationPreferencesComponent implements OnDestroy {
	readonly embedded = input(false)
	private readonly api = inject(NotificationApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	private resolveDiscard?: (value: boolean) => void
	private readonly attempts = new Map<NotificationEvent, { signature: string; key: string }>()
	readonly eventLabel = notificationEventLabel
	readonly preferences = signal<NotificationPreference[]>([])
	readonly draft = signal<Record<string, boolean>>({})
	readonly fields = form(this.draft)
	readonly state = signal<HcmPageState>('loading')
	readonly pending = signal(false)
	readonly saving = signal<NotificationEvent | null>(null)
	readonly error = signal('')
	readonly notice = signal('')
	readonly confirm = signal(false)
	readonly dirty = computed(
		/** Compare each editable choice with its last confirmed persisted state. */ () =>
			this.preferences().some(
				/** Detect only explicit changed category values. */ (item) =>
					this.draft()[item.eventType] !== item.enabled,
			),
	)
	readonly canManage = computed(
		/** Render controls from current capabilities while the server reauthorizes every save. */ () =>
			this.runtime
				.context()
				?.access.permissions.includes('hcm.notifications.preferences.self.manage') === true,
	)
	/** Reload verified own-account preferences on runtime replacement. */
	constructor() {
		effect(
			/** Track authenticated context only. */ () => {
				this.runtime.context()
				untracked(
					/** Clear stale drafts before any new-context request. */ () => {
						this.attempts.clear()
						this.saving.set(null)
						this.notice.set('')
						this.load()
					},
				)
			},
		)
	}
	/** Load the bounded server collection; reads never create preference rows. */
	private load(): void {
		this.request?.unsubscribe()
		this.pending.set(true)
		this.state.set('loading')
		this.error.set('')
		this.preferences.set([])
		this.fields().reset({})
		this.request = this.api
			.preferences()
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Initialize drafts from persisted choices or server-defined absent-row defaults. */ (
					value,
				) => {
					this.preferences.set(value.items)
					this.fields().reset(
						Object.fromEntries(
							value.items.map(
								/** Bind every checkbox to its own registered category. */ (item) => [
									item.eventType,
									item.enabled,
								],
							),
						),
					)
					this.pending.set(false)
					this.state.set('content')
				},
				error: /** Distinguish denial from failed reads. */ (error) => {
					this.error.set(notificationErrorMessage(error))
					this.pending.set(false)
					this.state.set(
						error instanceof HttpErrorResponse && [401, 403].includes(error.status)
							? 'denied'
							: 'error',
					)
				},
			})
	}
	/** Confirm before replacing unsaved choices with a fresh server projection. */
	async reload(): Promise<void> {
		if (await this.canLeave()) this.load()
	}
	/** Expose per-category explicit Save/Cancel only for changed choices. */
	changed(item: NotificationPreference): boolean {
		return this.draft()[item.eventType] !== item.enabled
	}
	/** Discard only the selected category's draft, preserving other unsaved choices. */
	cancel(item: NotificationPreference): void {
		if (this.saving()) return
		this.draft.update(
			/** Restore this category's last acknowledged choice. */ (value) => ({
				...value,
				[item.eventType]: item.enabled,
			}),
		)
		this.attempts.delete(item.eventType)
		this.error.set('')
	}
	/** Persist one category with a stable retry key and the loaded optimistic revision. */
	save(item: NotificationPreference): void {
		if (this.saving() || !this.canManage() || !this.changed(item)) return
		const body = { enabled: this.draft()[item.eventType], expectedRevision: item.revision },
			signature = JSON.stringify(body)
		let attempt = this.attempts.get(item.eventType)
		if (attempt?.signature !== signature) {
			attempt = { signature, key: crypto.randomUUID() }
			this.attempts.set(item.eventType, attempt)
		}
		this.saving.set(item.eventType)
		this.error.set('')
		this.notice.set('')
		this.api
			.savePreference(item.eventType, body, attempt.key)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Update only the saved baseline, preserving drafts for every other category. */ (
					saved,
				) => {
					this.preferences.update(
						/** Replace the acknowledged category revision. */ (rows) =>
							rows.map(
								/** Retain unrelated persisted choices. */ (row) =>
									row.eventType === saved.eventType ? saved : row,
							),
					)
					this.saving.set(null)
					this.notice.set(this.eventLabel(saved.eventType) + ' preference saved.')
					this.fields[saved.eventType]().focusBoundControl()
				},
				error: /** Retain both choice and retry identity after conflicts or transport failure. */ (
					error,
				) => {
					this.saving.set(null)
					this.error.set(notificationErrorMessage(error))
				},
			})
	}
	/** Share one dirty-draft decision across route, reload and persona transitions. */
	canLeave(): Promise<boolean> {
		if (this.saving()) return Promise.resolve(false)
		if (!this.dirty()) return Promise.resolve(true)
		if (this.resolveDiscard) return Promise.resolve(false)
		this.confirm.set(true)
		return new Promise(
			/** Release navigation only after the user's explicit discard decision. */ (resolve) => {
				this.resolveDiscard = resolve
			},
		)
	}
	/** Resolve exactly one outstanding native confirmation. */
	decide(discard: boolean): void {
		this.confirm.set(false)
		this.resolveDiscard?.(discard)
		this.resolveDiscard = undefined
	}
	/** Protect unsaved choices during full-document reload. */
	@HostListener('window:beforeunload', ['$event'])
	beforeUnload(event: BeforeUnloadEvent): void {
		if (this.dirty() || this.saving()) {
			event.preventDefault()
			event.returnValue = ''
		}
	}
	/** Cancel a pending navigation promise if the current context is destroyed. */
	ngOnDestroy(): void {
		this.resolveDiscard?.(false)
	}
}
