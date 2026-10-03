import { dateValue, idValue, invalidField, readBody } from '@empflowyee/hcm-runtime-contract'
import type { EvidenceClassification } from '@empflowyee/hcm-documents-contract'

export interface AttendanceEvidenceStage {
	employmentId: string
	workDate: string
	purpose: 'AttendanceEvidence'
	classification: EvidenceClassification
}
/** Require an exact dated employment, purpose and explicit immutable classification. */
export function parseAttendanceEvidenceStage(value: unknown): AttendanceEvidenceStage {
	const input = readBody(value, ['employmentId', 'workDate', 'purpose', 'classification'])
	if (input['purpose'] !== 'AttendanceEvidence') invalidField('purpose')
	if (!['General', 'Confidential', 'Restricted'].includes(String(input['classification'])))
		invalidField('classification')
	return {
		employmentId: idValue(input['employmentId'], 'employmentId'),
		workDate: dateValue(input['workDate'], 'workDate'),
		purpose: 'AttendanceEvidence',
		classification: input['classification'] as EvidenceClassification,
	}
}
