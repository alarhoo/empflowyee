export const AUDIT_ACTIONS = [
	'role.created',
	'role.updated',
	'role.deleted',
	'role.granted',
	'role.revoked',
	'account.created',
	'account.enabled',
	'account.disabled',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]
export interface AuditQuery {
	from?: string
	to?: string
	action?: AuditAction
	outcome?: 'Succeeded'
	actorAccountId?: string
	sort: 'occurredAt:asc' | 'occurredAt:desc'
	limit: number
	cursor?: string
}
export interface AuditItem {
	id: string
	occurredAt: string
	actorAccountId: string
	action: AuditAction
	targetType: string
	targetId: string
	outcome: 'Succeeded'
	requestId: string
	summary: {
		reason?: string
		changedFields?: string[]
		roleId?: string
		grantId?: string
		enabled?: boolean
	}
}
export interface AuditPage {
	items: AuditItem[]
	nextCursor: string | null
}
export class AuditQueryError extends Error {
	/** Carry a safe validation classification without retaining query contents. */
	constructor() {
		super('invalid-request')
	}
}
/** Accept explicit ISO instants, rejecting impossible calendar dates and ambiguous local time. */
export function isAuditInstant(value: string): boolean {
	const match =
		/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
			value,
		)
	if (!match || !Number.isFinite(Date.parse(value))) return false
	return new Date(match[1] + 'T00:00:00Z').toISOString().slice(0, 10) === match[1]
}
/** Compare valid ISO bounds without discarding PostgreSQL sub-millisecond precision. */
function auditInstantMicros(value: string): bigint {
	const fraction = /\.(\d{1,6})/.exec(value)?.[1] ?? ''
	return BigInt(Date.parse(value)) * 1000n + BigInt(fraction.padEnd(6, '0').slice(3))
}
/** Validate the complete allowlisted audit query; no arbitrary JSON or text selectors exist. */
export function parseAuditQuery(params: URLSearchParams): AuditQuery {
	const allowed = ['from', 'to', 'action', 'outcome', 'actorAccountId', 'sort', 'limit', 'cursor']
	for (const key of params.keys())
		if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new AuditQueryError()
	const from = params.get('from') ?? undefined,
		to = params.get('to') ?? undefined,
		action = params.get('action') ?? undefined,
		outcome = params.get('outcome') ?? undefined,
		actorAccountId = params.get('actorAccountId') ?? undefined,
		sort = params.get('sort') ?? 'occurredAt:desc',
		size = params.get('limit') ?? '25',
		cursor = params.get('cursor') ?? undefined
	if (
		(from !== undefined && !isAuditInstant(from)) ||
		(to !== undefined && !isAuditInstant(to)) ||
		(from && to && auditInstantMicros(from) > auditInstantMicros(to)) ||
		(action !== undefined && !AUDIT_ACTIONS.includes(action as AuditAction)) ||
		(outcome !== undefined && outcome !== 'Succeeded') ||
		(actorAccountId !== undefined &&
			(!actorAccountId ||
				actorAccountId.length > 200 ||
				[...actorAccountId].some(
					/** Exclude transport control characters from opaque account IDs. */ (character) =>
						character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
				))) ||
		!['occurredAt:asc', 'occurredAt:desc'].includes(sort) ||
		!/^[1-9][0-9]{0,2}$/.test(size) ||
		Number(size) > 100 ||
		(cursor !== undefined && (!cursor || cursor.length > 2048))
	)
		throw new AuditQueryError()
	return {
		from,
		to,
		action: action as AuditAction | undefined,
		outcome: outcome as 'Succeeded' | undefined,
		actorAccountId,
		sort: sort as AuditQuery['sort'],
		limit: Number(size),
		cursor,
	}
}

/** Self-service evidence deliberately excludes actor, diagnostics and operator-entered reasons. */
export interface MyActivityItem {
	id: string
	occurredAt: string
	action: AuditAction
	targetType: string
	targetId: string
	outcome: 'Succeeded'
	summary: { changedFields?: string[]; fromState?: string; toState?: string }
}
export type MyActivityQuery = Omit<AuditQuery, 'actorAccountId'>
export interface MyActivityPage {
	items: MyActivityItem[]
	nextCursor: string | null
}
/** Reject any actor selector before applying the common bounded business-event controls. */
export function parseMyActivityQuery(params: URLSearchParams): MyActivityQuery {
	if (params.has('actorAccountId')) throw new AuditQueryError()
	return parseAuditQuery(params)
}

/** Export producers are deferred; adding an action requires its separately reviewed event schema. */
export const EXPORT_ACTIONS: readonly string[] = []
export type ExportQuery = Omit<AuditQuery, 'action' | 'outcome'>
export interface ExportItem {
	id: string
	occurredAt: string
	actorAccountId: string
	action: string
	targetType: string
	targetId: string
	outcome: string
}
export interface ExportPage {
	items: ExportItem[]
	nextCursor: string | null
}
/** No export action or outcome is registered yet; reject invented selector values. */
export function parseExportQuery(params: URLSearchParams): ExportQuery {
	if (params.has('action') || params.has('outcome')) throw new AuditQueryError()
	return parseAuditQuery(params)
}
