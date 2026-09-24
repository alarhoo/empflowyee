import { DocumentError, type DocumentType } from '@empflowyee/hcm-documents-contract'
/** Reject stale classification edits before persistence. */
export function requireDocumentRevision(current: number, expected: number): void {
	if (current !== expected) throw new DocumentError('revision-conflict')
}
/** Enforce disabled classifications only for new aggregates, never existing-request fulfillment or download. */
export function requireEnabledDocumentType(type: DocumentType): void {
	if (!type.enabled) throw new DocumentError('type-disabled')
}
