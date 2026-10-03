export const HCM3_AUDIT_ACTIONS = [
	'attendance.configuration-created',
	'attendance.configuration-updated',
	'attendance.configuration-versioned',
	'attendance.configuration-copied',
	'attendance.configuration-previewed',
	'attendance.configuration-published',
	'attendance.configuration-retired',
	'attendance.configuration-assigned',
	'attendance.override-submitted',
	'workflow.action-requested',
	'leave.policy-created',
	'leave.enrollment-created',
	'leave.request-drafted',
	'leave.policy-updated',
	'leave.policy-versioned',
] as const

export const AUDIT_ACTIONS = [
	...HCM3_AUDIT_ACTIONS,
	'document.request-created',
	'document.request-submitted',
	'document.request-accepted',
	'document.request-replacement',
	'document.request-cancelled',
	'document.template-version-added',
	'document.worker-version-added',
	'document.visibility-changed',
	'document.type-created',
	'document.type-updated',
	'notification.template-changed',
	'notification.rule-changed',
	'notification.read',
	'notification.preference-changed',
	'role.created',
	'role.updated',
	'role.deleted',
	'role.granted',
	'role.revoked',
	'account.created',
	'account.enabled',
	'account.disabled',
	'review.started',
	'review.decided',
	'review.refreshed',
	'review.closed',
	'workforce.profile-updated',
	'workforce.structure-created',
	'workforce.structure-updated',
	'workforce.structure-activated',
	'workforce.structure-retired',
	'workforce.unit-versioned',
	'workforce.lookup-created',
	'workforce.lookup-updated',
	'workforce.lookup-activated',
	'workforce.lookup-retired',
	'employee.profile-policy-changed',
	'employee.profile-policy-reset',
	'employee.custom-field-created',
	'employee.custom-field-updated',
	'employee.custom-field-retired',
	'employee.custom-field-activated',
	'employee.custom-field-option-added',
	'employee.custom-field-option-updated',
	'employee.my-profile-changed',
	'employee.visibility-preference-changed',
	'employee.record-person-corrected',
	'employee.record-item-added',
	'employee.record-item-changed',
	'employee.emergency-revealed',
	'employee.duplicate-resolved',
	'employee.worker-created',
	'employee.person-merged',
	'employee.change-requested',
	'employee.change-updated',
	'employee.change-submitted',
	'employee.change-approved',
	'employee.change-rejected',
	'employee.change-executed',
	'employee.change-failed',
	'employee.change-cancelled',
	'employee.import-template-created',
	'employee.import-template-updated',
	'employee.import-template-published',
	'employee.import-template-versioned',
	'employee.import-run-created',
	'employee.import-run-validated',
	'employee.import-row-resolved',
	'employee.import-run-committed',
	'employee.import-run-cancelled',
	'employee.import-issues-exported',
	'employee.probation-review-scheduled',
	'employee.probation-reviewer-assigned',
	'employee.probation-review-cancelled',
	'employee.probation-decided',
	'employee.probation-assessment-submitted',
	'employee.hr-request-created',
	'employee.hr-request-replied',
	'employee.hr-request-noted',
	'employee.hr-request-assigned',
	'employee.hr-request-status-changed',
	'employee.hr-request-cancelled',
	'employee.hr-request-reopened',
	'employee.hr-attachment-downloaded',
	'employee.hr-service-configured',
	'job-architecture.catalogue-version-created',
	'job-architecture.catalogue-element-added',
	'job-architecture.catalogue-element-updated',
	'job-architecture.catalogue-version-submitted',
	'job-architecture.catalogue-version-published',
	'job-architecture.profile-created',
	'job-architecture.profile-version-created',
	'job-architecture.profile-version-updated',
	'job-architecture.profile-version-submitted',
	'job-architecture.profile-version-published',
	'job-architecture.position-change-requested',
	'job-architecture.position-change-updated',
	'job-architecture.position-change-previewed',
	'job-architecture.position-change-submitted',
	'job-architecture.position-change-withdrawn',
	'job-architecture.position-change-approved',
	'job-architecture.position-change-rejected',
	'job-architecture.position-version-published',
	'job-architecture.position-lifecycle-changed',
] as const
/** HCM-2 workforce, job architecture and employee actions recorded with explicit target types. */
export const HCM2_AUDIT_ACTIONS: readonly string[] = AUDIT_ACTIONS.filter(
	/** Select the HCM-2 domain prefixes. */ (action) =>
		/^(workforce|job-architecture|employee)./.test(action),
)
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
		fromState?: string | null
		toState?: string
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

/** Approved document stream lifecycle; authorization never means successful client receipt. */
export const SENSITIVE_ACTIONS = [
	'document.download-authorized',
	'document.download-completed',
	'document.download-failed',
] as const
export const SENSITIVE_OUTCOMES = ['Authorized', 'Completed', 'Failed'] as const
export type SensitiveAction = (typeof SENSITIVE_ACTIONS)[number]
export type SensitiveOutcome = (typeof SENSITIVE_OUTCOMES)[number]
export interface SensitiveAccessQuery extends Omit<AuditQuery, 'action' | 'outcome'> {
	action?: SensitiveAction
	outcome?: SensitiveOutcome
}
export interface SensitiveAccessItem extends Omit<AuditItem, 'action' | 'outcome' | 'summary'> {
	action: SensitiveAction
	outcome: SensitiveOutcome
	phase: 'authorization' | 'stream-completion'
	relatedEventId: string | null
	summary: Record<string, never>
}
export interface SensitiveAccessPage {
	items: SensitiveAccessItem[]
	nextCursor: string | null
}
/** Validate registered stream phases and reuse bounded date, actor, sort and cursor controls. */
export function parseSensitiveAccessQuery(params: URLSearchParams): SensitiveAccessQuery {
	const action = params.get('action') ?? undefined,
		outcome = params.get('outcome') ?? undefined
	if (
		params.getAll('action').length > 1 ||
		params.getAll('outcome').length > 1 ||
		(action !== undefined && !SENSITIVE_ACTIONS.includes(action as SensitiveAction)) ||
		(outcome !== undefined && !SENSITIVE_OUTCOMES.includes(outcome as SensitiveOutcome))
	)
		throw new AuditQueryError()
	const common = new URLSearchParams(params)
	common.delete('action')
	common.delete('outcome')
	return {
		...parseAuditQuery(common),
		action: action as SensitiveAction | undefined,
		outcome: outcome as SensitiveOutcome | undefined,
	}
}
