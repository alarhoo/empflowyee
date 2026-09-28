import type { CommandReceiptStore } from '@empflowyee/hcm-api-runtime-application'

export type AttendanceConfigurationOwner = 'Schedule' | 'Shift' | 'Policy' | 'Holiday'
export interface AttendanceConfigurationEvidence {
	owner: AttendanceConfigurationOwner
	versionId: string
	revision: number
	reason: string | null
}

/** Attendance-owned command evidence accompanies the shared idempotent result contract. */
export interface AttendanceCommandReceiptStore extends CommandReceiptStore {
	/** Attach the exact changed configuration and private reason once; save seals the reason in the same transaction. */
	setEvidence(evidence: AttendanceConfigurationEvidence): void
}
