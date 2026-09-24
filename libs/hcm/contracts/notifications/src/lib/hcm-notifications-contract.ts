export const NOTIFICATION_EVENTS = [
	'document.requested',
	'document.submitted',
	'document.replacement-requested',
] as const
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]
export interface NotificationItem {
	id: string
	eventType: NotificationEvent
	title: string
	body: string
	requestId: string
	createdAt: string
	readAt: string | null
	revision: number
}
export interface NotificationPage {
	items: NotificationItem[]
	nextCursor: string | null
}
export interface NotificationPreference {
	eventType: NotificationEvent
	enabled: boolean
	revision: number
}
export interface NotificationPreferences {
	items: NotificationPreference[]
}
export interface InboxQuery {
	q: string
	unread?: boolean
	eventType?: NotificationEvent
	sort: 'createdAt:asc' | 'createdAt:desc'
	limit: number
	cursor?: string
}
export interface NotificationRead {
	expectedRevision: number
}
export interface PreferenceSave {
	enabled: boolean
	expectedRevision: number
}
export class NotificationError extends Error {
	/** Carry only a stable public classification without data or database diagnostics. */
	constructor(
		readonly code: 'invalid-request' | 'not-found' | 'revision-conflict' | 'idempotency-conflict',
	) {
		super(code)
	}
}
/** Resolve one registered in-app event; no arbitrary event or external channel is accepted. */
export function notificationEvent(value: unknown): NotificationEvent {
	if (typeof value !== 'string' || !NOTIFICATION_EVENTS.includes(value as NotificationEvent))
		throw new NotificationError('invalid-request')
	return value as NotificationEvent
}
/** Accept bounded opaque notification identities without client-controlled ownership. */
export function notificationId(value: string): string {
	if (!/^[A-Za-z0-9_/-]{1,200}$/.test(value)) throw new NotificationError('invalid-request')
	return value
}
/** Reject ambiguous or extended JSON command bodies. */
function object(body: unknown, keys: string): Record<string, unknown> {
	if (
		!body ||
		typeof body !== 'object' ||
		Array.isArray(body) ||
		Object.keys(body).sort().join(',') !== keys
	)
		throw new NotificationError('invalid-request')
	return body as Record<string, unknown>
}
/** Require stored positive revisions, with the explicit first-preference-save zero exception. */
function revision(value: unknown, minimum: number): number {
	if (!Number.isSafeInteger(value) || Number(value) < minimum)
		throw new NotificationError('invalid-request')
	return Number(value)
}
/** Parse the single own-notification read command. */
export function parseNotificationRead(body: unknown): NotificationRead {
	const value = object(body, 'expectedRevision')
	return { expectedRevision: revision(value['expectedRevision'], 1) }
}
/** Parse an explicit own-category change, allowing revision zero only for absent storage. */
export function parsePreferenceSave(body: unknown): PreferenceSave {
	const value = object(body, 'enabled,expectedRevision')
	if (typeof value['enabled'] !== 'boolean') throw new NotificationError('invalid-request')
	return { enabled: value['enabled'], expectedRevision: revision(value['expectedRevision'], 0) }
}
/** Bound all server-owned inbox selectors and forbid account or tenant overrides. */
export function parseInboxQuery(params: URLSearchParams): InboxQuery {
	for (const key of params.keys())
		if (
			!['q', 'unread', 'eventType', 'sort', 'limit', 'cursor'].includes(key) ||
			params.getAll(key).length !== 1
		)
			throw new NotificationError('invalid-request')
	const q = params.get('q') ?? '',
		unread = params.get('unread'),
		event = params.get('eventType'),
		sort = params.get('sort') ?? 'createdAt:desc',
		limit = params.get('limit') ?? '25',
		cursor = params.get('cursor') ?? undefined
	if (
		q.length > 200 ||
		!['createdAt:asc', 'createdAt:desc'].includes(sort) ||
		!/^([1-9][0-9]{0,2})$/.test(limit) ||
		Number(limit) > 100 ||
		(unread !== null && !['true', 'false'].includes(unread)) ||
		(cursor !== undefined && (!cursor || cursor.length > 2048))
	)
		throw new NotificationError('invalid-request')
	return {
		q: q.trim(),
		...(unread !== null ? { unread: unread === 'true' } : {}),
		...(event !== null ? { eventType: notificationEvent(event) } : {}),
		sort: sort as InboxQuery['sort'],
		limit: Number(limit),
		cursor,
	}
}

/** Present the immutable in-app event registry in user-facing language. */
export function notificationEventLabel(event: NotificationEvent): string {
	const labels: Record<NotificationEvent, string> = {
		'document.requested': 'Document requested',
		'document.submitted': 'Document submitted',
		'document.replacement-requested': 'Replacement requested',
	}
	return labels[event]
}
