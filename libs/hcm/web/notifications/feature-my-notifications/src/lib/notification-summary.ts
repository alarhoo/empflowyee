import { DOCUMENT } from '@angular/common'
import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { interval, type Subscription } from 'rxjs'
import type { NotificationPage } from '@empflowyee/hcm-notifications-contract'
import { NotificationApi } from '@empflowyee/hcm-web-notifications-data-access'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
/** Share the bounded current-account unread projection between native shell chrome and inbox actions. */
@Injectable({ providedIn: 'root' })
export class NotificationSummary {
	private readonly api = inject(NotificationApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private readonly document = inject(DOCUMENT)
	private request?: Subscription
	readonly count = signal('')
	readonly revision = signal(0)
	/** Invalidate inbox projections only after an acknowledged read transition. */
	readCommitted(): void {
		this.revision.update(
			/** Notify every mounted inbox of the same committed change. */ (value) => value + 1,
		)
		this.refresh()
	}
	/** Reset unread evidence whenever the verified account context is replaced. */
	constructor() {
		effect(
			/** Track identity, never previous-account request state. */ () => {
				this.runtime.context()
				untracked(
					/** Start a context-scoped read without showing the previous account's badge. */ () => {
						this.count.set('')
						this.refresh()
					},
				)
			},
		)
		interval(60_000)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe(
				/** Pick up newly delivered notifications while the user is looking at the application. */ () => {
					if (this.document.visibilityState === 'visible') this.refresh()
				},
			)
	}
	/** Publish the badge from the same bounded unread page shape the notification tray renders. */
	publish(page: NotificationPage): void {
		this.count.set(page.items.length ? `${page.items.length}${page.nextCursor ? '+' : ''}` : '')
	}
	/** Query a bounded unread page; a continuation is represented honestly as 100+. */
	refresh(): void {
		this.request?.unsubscribe()
		if (!this.runtime.context()?.access.permissions.includes('hcm.notifications.inbox.self.read'))
			return
		this.request = this.api
			.inbox({ q: '', unread: true, sort: 'createdAt:desc', limit: 100 })
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the current account's verified unread count or bounded lower limit. */ (
					page,
				) => this.publish(page),
				error: /** Do not invent a numeric unread total when the request fails. */ () =>
					this.count.set(''),
			})
	}
}
