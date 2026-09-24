import type { DocumentDownloadAuditEvent } from '@empflowyee/hcm-api-audit-application'
import type { AuthorizedAccessWork } from '@empflowyee/hcm-api-access-control-infrastructure'
/** Append only a safe file-version identity through the audit-owned transaction port. */
export function appendDocumentDownloadAudit(
	scope: AuthorizedAccessWork,
	targetType: DocumentDownloadAuditEvent['targetType'],
	id: string,
	requestId: string,
	phase: 'Authorized' | 'Completed' | 'Failed',
	relatedId?: string,
): Promise<string> {
	let action: DocumentDownloadAuditEvent['action'] = 'document.download-authorized'
	if (phase === 'Completed') action = 'document.download-completed'
	if (phase === 'Failed') action = 'document.download-failed'
	return scope.audit.append({
		action,
		targetId: id,
		targetType,
		requestId,
		relatedEventId: relatedId ?? null,
		summary: {},
	})
}
