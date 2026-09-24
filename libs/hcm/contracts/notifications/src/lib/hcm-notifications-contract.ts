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

export interface NotificationTemplate {
	eventType: NotificationEvent
	title: string
	body: string
	revision: number
}
export interface NotificationRule {
	eventType: NotificationEvent
	enabled: boolean
	revision: number
}
export interface TemplateSave {
	title: string
	body: string
	expectedRevision: number
	reason: string
}
export interface RuleSave {
	enabled: boolean
	expectedRevision: number
	reason: string
}
/** Reject unsupported template syntax before rendering any preview or delivery. */
export function notificationText(value: unknown, maximum: number): string {
	if (
		typeof value !== 'string' ||
		!value.trim() ||
		value.length > maximum ||
		/[<>\p{Cc}]/u.test(value) ||
		/(?:[a-z][a-z0-9+.-]*:\/\/|www\.|mailto:|https?:|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,63}\b)/iu.test(
			value,
		)
	)
		throw new NotificationError('invalid-request')
	const remaining = value.replace(/\{(?:requestId|dueDate)\}/gu, '')
	if (/[{}]/u.test(remaining)) throw new NotificationError('invalid-request')
	return value.trim()
}
/** Validate administrator reason and optimistic revision without accepting hidden fields. */
function configurationCommand(body: unknown, expected: string[]): Record<string, unknown> {
	if (!body || typeof body !== 'object' || Array.isArray(body))
		throw new NotificationError('invalid-request')
	const value = body as Record<string, unknown>
	if (
		Object.keys(value).sort().join(',') !== expected.sort().join(',') ||
		!Number.isSafeInteger(value['expectedRevision']) ||
		Number(value['expectedRevision']) < 1 ||
		typeof value['reason'] !== 'string' ||
		!value['reason'].trim() ||
		value['reason'].length > 500 ||
		/\p{Cc}/u.test(value['reason'])
	)
		throw new NotificationError('invalid-request')
	return value
}
/** Parse one exact bounded template edit shared by browser and API. */
export function parseTemplateSave(body: unknown): TemplateSave {
	const value = configurationCommand(body, ['title', 'body', 'expectedRevision', 'reason'])
	return {
		title: notificationText(value['title'], 120),
		body: notificationText(value['body'], 1000),
		expectedRevision: Number(value['expectedRevision']),
		reason: (value['reason'] as string).trim(),
	}
}
/** Parse one supported rule toggle without destinations or expressions. */
export function parseRuleSave(body: unknown): RuleSave {
	const value = configurationCommand(body, ['enabled', 'expectedRevision', 'reason'])
	if (typeof value['enabled'] !== 'boolean') throw new NotificationError('invalid-request')
	return {
		enabled: value['enabled'],
		expectedRevision: Number(value['expectedRevision']),
		reason: (value['reason'] as string).trim(),
	}
}
/** Substitute only literal approved values; returned text is never HTML or executable syntax. */
export function renderNotificationText(
	text: string,
	requestId: string,
	dueDate: string | null,
): string {
	return text.replace(
		/\{(requestId|dueDate)\}/gu,
		/** Replace fixed placeholders without interpreting replacement strings. */ (
			_match,
			name: string,
		) => (name === 'requestId' ? requestId : (dueDate ?? '')),
	)
}
