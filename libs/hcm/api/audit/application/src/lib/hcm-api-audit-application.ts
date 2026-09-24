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
export interface ReviewAuditEvent {
	action: 'review.started' | 'review.decided' | 'review.refreshed' | 'review.closed'
	targetId: string
	requestId: string
	summary: { reason: string; fromState: string | null; toState: string }
}
export interface NotificationAuditEvent {
	action: 'notification.read' | 'notification.preference-changed'
	targetId: string
	requestId: string
	summary: { changedFields: ('enabled' | 'readAt')[] }
}
export interface NotificationConfigurationAuditEvent {
	action: 'notification.template-changed' | 'notification.rule-changed'
	targetId: string
	requestId: string
	summary: { reason: string; changedFields: ('title' | 'body' | 'enabled')[] }
}
export interface DocumentTypeAuditEvent {
	action: 'document.type-created' | 'document.type-updated'
	targetId: string
	requestId: string
	summary: { reason: string; changedFields: ('code' | 'label' | 'description' | 'enabled')[] }
}
export interface TemplateVersionAuditEvent {
	action:
		| 'document.template-version-added'
		| 'document.worker-version-added'
		| 'document.visibility-changed'
	targetId: string
	requestId: string
	summary: { reason: string; changedFields: ('version' | 'employeeVisible')[] }
}
export interface DocumentRequestAuditEvent {
	action:
		| 'document.request-created'
		| 'document.request-submitted'
		| 'document.request-accepted'
		| 'document.request-replacement'
		| 'document.request-cancelled'
	targetId: string
	requestId: string
	summary: { reason: string | null; fromState: string | null; toState: string }
}
export interface DocumentDownloadAuditEvent {
	action:
		'document.download-authorized' | 'document.download-completed' | 'document.download-failed'
	targetId: string
	targetType:
		'document-template-version' | 'employee-document-version' | 'document-request-submission'
	requestId: string
	relatedEventId: string | null
	summary: Record<string, never>
}
export type AccessAuditEvent =
	| DocumentRequestAuditEvent
	| TemplateVersionAuditEvent
	| DocumentDownloadAuditEvent
	| RoleAuditEvent
	| AssignmentAuditEvent
	| AccountAuditEvent
	| ReviewAuditEvent
	| NotificationAuditEvent
	| NotificationConfigurationAuditEvent
	| DocumentTypeAuditEvent
export interface AppendAudit {
	/** Append safe evidence in the existing business transaction, deriving actor from its verified scope. */
	append(event: AccessAuditEvent): Promise<string>
}
/** Validate assignment-specific safe evidence without permitting account names or permission payloads. */
export function validateAccessAudit(event: AccessAuditEvent): void {
	if (
		event.action === 'document.request-created' ||
		event.action === 'document.request-submitted' ||
		event.action === 'document.request-accepted' ||
		event.action === 'document.request-replacement' ||
		event.action === 'document.request-cancelled'
	) {
		validateDocumentRequestAudit(event)
		return
	}
	if ('relatedEventId' in event) {
		validateDocumentDownloadAudit(event)
		return
	}
	if (
		event.action === 'document.template-version-added' ||
		event.action === 'document.worker-version-added' ||
		event.action === 'document.visibility-changed'
	) {
		if (
			Object.keys(event).sort().join(',') !== 'action,requestId,summary,targetId' ||
			typeof event.targetId !== 'string' ||
			!event.targetId ||
			event.targetId.length > 200 ||
			!/^[A-Za-z0-9._-]{1,100}$/.test(event.requestId) ||
			!event.summary ||
			Object.keys(event.summary).sort().join(',') !== 'changedFields,reason' ||
			typeof event.summary.reason !== 'string' ||
			!event.summary.reason.trim() ||
			event.summary.reason.length > 500 ||
			!Array.isArray(event.summary.changedFields) ||
			event.summary.changedFields.length !== 1 ||
			event.summary.changedFields[0] !==
				(event.action === 'document.visibility-changed' ? 'employeeVisible' : 'version')
		)
			throw new Error('Invalid template audit envelope')
		return
	}
	if (event?.action === 'document.type-created' || event?.action === 'document.type-updated') {
		validateDocumentTypeAudit(event)
		return
	}
	if (
		event?.action === 'notification.template-changed' ||
		event?.action === 'notification.rule-changed'
	) {
		validateNotificationConfigurationAudit(event)
		return
	}
	if (event?.action?.startsWith('notification.')) {
		validateNotificationAudit(event as NotificationAuditEvent)
		return
	}
	if (event?.action?.startsWith('review.')) {
		validateReviewAudit(event as ReviewAuditEvent)
		return
	}
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

/** Bound review transition evidence without retaining labels, account identities or item payloads. */
export function validateReviewAudit(event: ReviewAuditEvent): void {
	const summary = event?.summary
	const validTransition =
		(event?.action === 'review.started' &&
			summary?.fromState === null &&
			summary?.toState === 'Open') ||
		(event?.action === 'review.closed' &&
			summary?.fromState === 'Open' &&
			summary?.toState === 'Closed') ||
		(event?.action === 'review.decided' &&
			summary?.fromState === 'Pending' &&
			['Retain', 'Revoke'].includes(summary?.toState)) ||
		(event?.action === 'review.refreshed' &&
			['Pending', 'Retain'].includes(summary?.fromState ?? '') &&
			['Pending', 'Removed'].includes(summary?.toState))
	if (
		!event ||
		Object.keys(event).sort().join(',') !== 'action,requestId,summary,targetId' ||
		typeof event.targetId !== 'string' ||
		!event.targetId ||
		event.targetId.length > 200 ||
		typeof event.requestId !== 'string' ||
		!/^[A-Za-z0-9._-]{1,100}$/.test(event.requestId) ||
		!summary ||
		Object.keys(summary).sort().join(',') !== 'fromState,reason,toState' ||
		typeof summary.reason !== 'string' ||
		!summary.reason.trim() ||
		summary.reason.length > 500 ||
		!validTransition
	)
		throw new Error('Invalid review audit envelope')
}

/** Notification evidence records field names only, never inbox text or preference payloads. */
export function validateNotificationAudit(event: NotificationAuditEvent): void {
	const field = event?.action === 'notification.read' ? 'readAt' : 'enabled'
	if (
		!event ||
		Object.keys(event).sort().join(',') !== 'action,requestId,summary,targetId' ||
		!['notification.read', 'notification.preference-changed'].includes(event.action) ||
		typeof event.targetId !== 'string' ||
		!event.targetId ||
		event.targetId.length > 200 ||
		typeof event.requestId !== 'string' ||
		!/^[A-Za-z0-9._-]{1,100}$/.test(event.requestId) ||
		!event.summary ||
		Object.keys(event.summary).join(',') !== 'changedFields' ||
		!Array.isArray(event.summary.changedFields) ||
		event.summary.changedFields.length !== 1 ||
		event.summary.changedFields[0] !== field
	)
		throw new Error('Invalid notification audit envelope')
}

/** Validate bounded administration audit without storing template content or recipient data. */
export function validateNotificationConfigurationAudit(
	event: NotificationConfigurationAuditEvent,
): void {
	const allowed = event.action === 'notification.template-changed' ? ['title', 'body'] : ['enabled']
	if (
		Object.keys(event).sort().join(',') !== 'action,requestId,summary,targetId' ||
		!['document.requested', 'document.submitted', 'document.replacement-requested'].includes(
			event.targetId,
		) ||
		!/^[A-Za-z0-9._-]{1,100}$/.test(event.requestId) ||
		!event.summary ||
		Object.keys(event.summary).sort().join(',') !== 'changedFields,reason' ||
		typeof event.summary.reason !== 'string' ||
		!event.summary.reason.trim() ||
		event.summary.reason.length > 500 ||
		!Array.isArray(event.summary.changedFields) ||
		new Set(event.summary.changedFields).size !== event.summary.changedFields.length ||
		event.summary.changedFields.some(
			/** Reject bodies and unsupported summary fields. */ (field) => !allowed.includes(field),
		)
	)
		throw new Error('Invalid notification configuration audit envelope')
}

/** Keep classification audit bounded to changed field names and a required reason. */
export function validateDocumentTypeAudit(event: DocumentTypeAuditEvent): void {
	const allowed =
		event.action === 'document.type-created'
			? ['code', 'label', 'description', 'enabled']
			: ['label', 'description', 'enabled']
	if (
		Object.keys(event).sort().join(',') !== 'action,requestId,summary,targetId' ||
		typeof event.targetId !== 'string' ||
		!event.targetId ||
		event.targetId.length > 200 ||
		!/^[A-Za-z0-9._-]{1,100}$/.test(event.requestId) ||
		!event.summary ||
		Object.keys(event.summary).sort().join(',') !== 'changedFields,reason' ||
		typeof event.summary.reason !== 'string' ||
		!event.summary.reason.trim() ||
		event.summary.reason.length > 500 ||
		!Array.isArray(event.summary.changedFields) ||
		new Set(event.summary.changedFields).size !== event.summary.changedFields.length ||
		event.summary.changedFields.some(
			/** Reject raw labels, descriptions and unregistered fields. */ (field) =>
				!allowed.includes(field),
		)
	)
		throw new Error('Invalid document type audit envelope')
}

/** Permit only bounded attachment evidence and exact authorization/completion linkage. */
export function validateDocumentDownloadAudit(event: DocumentDownloadAuditEvent): void {
	if (
		Object.keys(event).sort().join(',') !==
			'action,relatedEventId,requestId,summary,targetId,targetType' ||
		![
			'document.download-authorized',
			'document.download-completed',
			'document.download-failed',
		].includes(event.action) ||
		![
			'document-template-version',
			'employee-document-version',
			'document-request-submission',
		].includes(event.targetType) ||
		typeof event.targetId !== 'string' ||
		!event.targetId ||
		event.targetId.length > 200 ||
		!/^[A-Za-z0-9._-]{1,100}$/.test(event.requestId) ||
		!event.summary ||
		Object.keys(event.summary).length ||
		(event.action === 'document.download-authorized'
			? event.relatedEventId !== null
			: typeof event.relatedEventId !== 'string' || !/^[0-9a-f-]{36}$/.test(event.relatedEventId))
	)
		throw new Error('Invalid document download envelope')
}

/** Bound request evidence to state/reason metadata, excluding instructions and file contents. */
export function validateDocumentRequestAudit(event: DocumentRequestAuditEvent): void {
	const transitions: Record<DocumentRequestAuditEvent['action'], readonly string[]> = {
		'document.request-created': ['null>Open'],
		'document.request-submitted': ['Open>Submitted'],
		'document.request-accepted': ['Submitted>Completed'],
		'document.request-replacement': ['Submitted>Open'],
		'document.request-cancelled': ['Open>Cancelled', 'Submitted>Cancelled'],
	}
	if (
		Object.keys(event).sort().join(',') !== 'action,requestId,summary,targetId' ||
		!event.targetId ||
		event.targetId.length > 200 ||
		!/^[A-Za-z0-9._-]{1,100}$/.test(event.requestId) ||
		Object.keys(event.summary).sort().join(',') !== 'fromState,reason,toState' ||
		!transitions[event.action]?.includes(
			String(event.summary.fromState) + '>' + event.summary.toState,
		) ||
		(event.action === 'document.request-submitted'
			? event.summary.reason !== null
			: typeof event.summary.reason !== 'string' ||
				!event.summary.reason.trim() ||
				event.summary.reason.length > 500)
	)
		throw new Error('Invalid document request audit envelope')
}
