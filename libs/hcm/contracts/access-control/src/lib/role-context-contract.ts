/** Contextual assignment projection owned by Access Assignments, never by the role editor. */
export interface RoleAssignee {
	accountId: string
	displayName: string
	email: string
	enabled: boolean
	grantId: string
}
/** Safe operational history; this view requires the audit business permission. */
export interface RoleHistoryItem {
	id: string
	occurredAt: string
	actorAccountId: string
	action: string
	outcome: string
	summary: { reason: string; changedFields: string[] }
}
export interface ContextQuery {
	limit: number
	cursor?: string
}
