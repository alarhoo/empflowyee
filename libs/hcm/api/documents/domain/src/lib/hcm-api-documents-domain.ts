import { DocumentError, type DocumentType } from '@empflowyee/hcm-documents-contract'
/** Reject stale classification edits before persistence. */
export function requireDocumentRevision(current: number, expected: number): void {
	if (current !== expected) throw new DocumentError('revision-conflict')
}
/** Enforce disabled classifications only for new aggregates, never existing-request fulfillment or download. */
export function requireEnabledDocumentType(type: DocumentType): void {
	if (!type.enabled) throw new DocumentError('type-disabled')
}

/** Enforce the approved manual request lifecycle without adding reopen or timer transitions. */
export function documentRequestTransition(
	current: import('@empflowyee/hcm-documents-contract').DocumentRequestStatus,
	action: 'submit' | 'accept' | 'replacement' | 'cancel',
): import('@empflowyee/hcm-documents-contract').DocumentRequestStatus {
	if (action === 'submit' && current === 'Open') return 'Submitted'
	if (action === 'accept' && current === 'Submitted') return 'Completed'
	if (action === 'replacement' && current === 'Submitted') return 'Open'
	if (action === 'cancel' && (current === 'Open' || current === 'Submitted')) return 'Cancelled'
	throw new DocumentError('invalid-state')
}
