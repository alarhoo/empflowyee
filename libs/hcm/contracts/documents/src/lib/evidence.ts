import { documentText } from './hcm-documents-contract'
import { invalidField, readBody } from '@empflowyee/hcm-runtime-contract'

export type EvidencePurpose = 'AttendanceEvidence' | 'LeaveEvidence'
export type EvidenceClassification = 'General' | 'Confidential' | 'Restricted'
/** Purpose and immutable business subject are supplied by the source, never inferred from a filename. */
export interface EvidenceSubject {
	purpose: EvidencePurpose
	subject: string
	classification: EvidenceClassification
}
/** Safe admission result excludes private filename, hash and storage location. */
export interface StagedEvidence {
	id: string
	validation: 'Clean'
	classification: EvidenceClassification
}
/** Reject unknown fields and require explicit purpose, subject and classification. */
export function parseEvidenceSubject(value: unknown): EvidenceSubject {
	const input = readBody(value, ['purpose', 'subject', 'classification'])
	if (!['AttendanceEvidence', 'LeaveEvidence'].includes(String(input['purpose'])))
		invalidField('purpose')
	if (!['General', 'Confidential', 'Restricted'].includes(String(input['classification'])))
		invalidField('classification')
	return {
		purpose: input['purpose'] as EvidencePurpose,
		subject: documentText(input['subject'], 512),
		classification: input['classification'] as EvidenceClassification,
	}
}

/** Bounded evidence metadata returned only after current field-level authorization. */
export interface EvidenceFileView extends StagedEvidence {
	filename: string
	sizeBytes: number
}
export const EVIDENCE_MAX_ATTACHMENTS = 100
