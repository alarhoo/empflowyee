export interface RoleAuditEvent {
	action: 'role.created' | 'role.updated' | 'role.deleted'
	targetId: string
	requestId: string
	summary: { reason: string; changedFields: ('label' | 'permissionCodes')[] }
}
export interface AppendAudit {
	/** Append safe evidence in the existing business transaction, deriving actor from its verified scope. */
	append(event: RoleAuditEvent): Promise<string>
}
/** Reject unknown event fields and sensitive payload expansion before evidence reaches persistence. */
export function validateRoleAudit(event: RoleAuditEvent): void {
	if (
		!event ||
		typeof event !== 'object' ||
		Object.keys(event).sort().join(',') !== 'action,requestId,summary,targetId' ||
		!['role.created', 'role.updated', 'role.deleted'].includes(event.action) ||
		typeof event.targetId !== 'string' ||
		!event.targetId.length ||
		event.targetId.length > 200 ||
		typeof event.requestId !== 'string' ||
		!/^[A-Za-z0-9._-]{1,100}$/.test(event.requestId) ||
		!event.summary ||
		Object.keys(event.summary).sort().join(',') !== 'changedFields,reason' ||
		typeof event.summary.reason !== 'string' ||
		event.summary.reason.trim().length < 1 ||
		event.summary.reason.length > 500 ||
		!Array.isArray(event.summary.changedFields) ||
		event.summary.changedFields.length > 2 ||
		new Set(event.summary.changedFields).size !== event.summary.changedFields.length ||
		event.summary.changedFields.some(
			/** Only safe field identifiers, never their values. */ (field) =>
				!['label', 'permissionCodes'].includes(field),
		)
	)
		throw new Error('Invalid role audit envelope')
}
