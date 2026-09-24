export interface RoleAuditEvent {
	action: 'role.created' | 'role.updated' | 'role.deleted'
	targetId: string
	requestId: string
	summary: { reason: string; changedFields: ('label' | 'permissionCodes')[] }
}
export interface AssignmentAuditEvent {
	action: 'role.granted' | 'role.revoked'
	targetId: string
	requestId: string
	summary: { reason: string; roleId: string; grantId: string }
}
export interface AccountAuditEvent {
	action: 'account.created' | 'account.enabled' | 'account.disabled'
	targetId: string
	requestId: string
	summary: { reason: string; enabled: boolean }
}
export type AccessAuditEvent = RoleAuditEvent | AssignmentAuditEvent | AccountAuditEvent
export interface AppendAudit {
	/** Append safe evidence in the existing business transaction, deriving actor from its verified scope. */
	append(event: AccessAuditEvent): Promise<string>
}
/** Validate assignment-specific safe evidence without permitting account names or permission payloads. */
export function validateAccessAudit(event: AccessAuditEvent): void {
	if (
		event?.action === 'account.created' ||
		event?.action === 'account.enabled' ||
		event?.action === 'account.disabled'
	) {
		validateAccountAudit(event)
		return
	}
	if (event?.action !== 'role.granted' && event?.action !== 'role.revoked') {
		validateRoleAudit(event as RoleAuditEvent)
		return
	}
	if (
		Object.keys(event).sort().join(',') !== 'action,requestId,summary,targetId' ||
		typeof event.targetId !== 'string' ||
		!event.targetId.length ||
		event.targetId.length > 200 ||
		typeof event.requestId !== 'string' ||
		!/^[A-Za-z0-9._-]{1,100}$/.test(event.requestId) ||
		!event.summary ||
		Object.keys(event.summary).sort().join(',') !== 'grantId,reason,roleId' ||
		typeof event.summary.reason !== 'string' ||
		!event.summary.reason.trim() ||
		event.summary.reason.length > 500 ||
		typeof event.summary.roleId !== 'string' ||
		!/^[A-Za-z0-9_-]{1,64}$/.test(event.summary.roleId) ||
		typeof event.summary.grantId !== 'string' ||
		!/^[a-f0-9-]{36}$/i.test(event.summary.grantId)
	)
		throw new Error('Invalid assignment audit envelope')
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

/** Account evidence records opaque identity and enablement only; email and person names are prohibited. */
export function validateAccountAudit(event: AccountAuditEvent): void {
	if (
		!event ||
		Object.keys(event).sort().join(',') !== 'action,requestId,summary,targetId' ||
		!['account.created', 'account.enabled', 'account.disabled'].includes(event.action) ||
		typeof event.targetId !== 'string' ||
		!event.targetId.length ||
		event.targetId.length > 200 ||
		typeof event.requestId !== 'string' ||
		!/^[A-Za-z0-9._-]{1,100}$/.test(event.requestId) ||
		!event.summary ||
		Object.keys(event.summary).sort().join(',') !== 'enabled,reason' ||
		typeof event.summary.reason !== 'string' ||
		!event.summary.reason.trim() ||
		event.summary.reason.length > 500 ||
		typeof event.summary.enabled !== 'boolean' ||
		event.summary.enabled !== (event.action !== 'account.disabled')
	)
		throw new Error('Invalid account audit envelope')
}
