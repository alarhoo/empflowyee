import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	InboxQuery,
	NotificationTemplate,
	NotificationRule,
	TemplateSave,
	RuleSave,
	NotificationPage,
	NotificationItem,
	NotificationPreferences,
	NotificationPreference,
	NotificationEvent,
	PreferenceSave,
} from '@empflowyee/hcm-notifications-contract'
@Injectable({ providedIn: 'root' })
export class NotificationApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/notifications/me'
	/** Fetch the bounded persisted template collection. */
	templates() {
		return this.http
			.get<{ items: NotificationTemplate[] }>('/api/v1/notifications/templates')
			.pipe(timeout(15000))
	}
	/** Fetch the three supported rule switches. */
	rules() {
		return this.http
			.get<{ items: NotificationRule[] }>('/api/v1/notifications/rules')
			.pipe(timeout(15000))
	}
	/** Save an explicit template revision with an unchanged retry key. */
	saveTemplate(event: NotificationEvent, body: TemplateSave, key: string) {
		return this.http
			.put<NotificationTemplate>(
				'/api/v1/notifications/templates/' + encodeURIComponent(event),
				body,
				{ headers: { 'Idempotency-Key': key } },
			)
			.pipe(timeout(15000))
	}
	/** Toggle one event rule, never its recipient policy. */
	saveRule(event: NotificationEvent, body: RuleSave, key: string) {
		return this.http
			.put<NotificationRule>('/api/v1/notifications/rules/' + encodeURIComponent(event), body, {
				headers: { 'Idempotency-Key': key },
			})
			.pipe(timeout(15000))
	}

	/** Query only the current server-authenticated account's inbox. */
	inbox(query: InboxQuery) {
		let params = new HttpParams()
			.set('q', query.q)
			.set('sort', query.sort)
			.set('limit', query.limit)
		if (query.unread !== undefined) params = params.set('unread', String(query.unread))
		if (query.eventType) params = params.set('eventType', query.eventType)
		if (query.cursor) params = params.set('cursor', query.cursor)
		return this.http.get<NotificationPage>(`${this.base}/inbox`, { params }).pipe(timeout(15000))
	}
	/** Mark one exact revision read with a stable successful-retry identity. */
	read(id: string, expectedRevision: number, key: string) {
		return this.http
			.post<NotificationItem>(
				`${this.base}/inbox/${encodeURIComponent(id)}/read`,
				{ expectedRevision },
				{ headers: { 'Idempotency-Key': key } },
			)
			.pipe(timeout(15000))
	}
	/** Load the bounded server-owned category collection and persisted choices. */
	preferences() {
		return this.http.get<NotificationPreferences>(`${this.base}/preferences`).pipe(timeout(15000))
	}
	/** Persist only this account's explicit category choice. */
	savePreference(event: NotificationEvent, body: PreferenceSave, key: string) {
		return this.http
			.put<NotificationPreference>(`${this.base}/preferences/${encodeURIComponent(event)}`, body, {
				headers: { 'Idempotency-Key': key },
			})
			.pipe(timeout(15000))
	}
}
/** Display safe failure classifications while retaining the current choice for retry. */
export function notificationErrorMessage(error: unknown): string {
	const code = error instanceof HttpErrorResponse ? error.error?.code : undefined
	const messages: Record<string, string> = {
		'invalid-request': 'Check the selected filters and fields.',
		'not-found': 'This notification is no longer available.',
		'revision-conflict':
			'The saved state changed. Your choice is preserved; reload before continuing.',
		'idempotency-conflict': 'This retry belongs to another change. Reload before continuing.',
		forbidden: 'You no longer have permission for this operation.',
		unauthenticated: 'Your session is no longer available.',
	}
	return typeof code === 'string' && messages[code]
		? messages[code]
		: 'The operation could not be completed. Retry safely with the same choice.'
}
