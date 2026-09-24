import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import type { Subscription } from 'rxjs'
import { NotificationApi } from '@empflowyee/hcm-web-notifications-data-access'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
/** Share the bounded current-account unread projection between native shell chrome and inbox actions. */
@Injectable({ providedIn: 'root' })
export class NotificationSummary {
	private readonly api = inject(NotificationApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly count = signal('')
	/** Reset unread evidence whenever the verified account context is replaced. */
	constructor() {
		effect(
			/** Track identity, never previous-account request state. */ () => {
				this.runtime.context()
				untracked(/** Start a context-scoped read. */ () => this.refresh())
			},
		)
	}
	/** Query a bounded unread page; a continuation is represented honestly as 100+. */
	refresh(): void {
		this.request?.unsubscribe()
		this.count.set('')
		if (!this.runtime.context()?.access.permissions.includes('hcm.notifications.inbox.self.read'))
			return
		this.request = this.api
			.inbox({ q: '', unread: true, sort: 'createdAt:desc', limit: 100 })
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the current account's verified unread count or bounded lower limit. */ (
					page,
				) =>
					this.count.set(
						page.items.length ? `${page.items.length}${page.nextCursor ? '+' : ''}` : '',
					),
				error: /** Do not invent a numeric unread total when the request fails. */ () =>
					this.count.set(''),
			})
	}
}
