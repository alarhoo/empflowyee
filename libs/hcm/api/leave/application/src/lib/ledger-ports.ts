import type { LeaveUnit, LeaveUnits } from '@empflowyee/hcm-leave-contract'

/** Internal evidence from an already authorized grant command, never an employee-entered opening balance. */
export interface LeaveGrantPosting {
	accountId: string
	grantId: string
	grantType: 'Opening' | 'Annual' | 'Prorated' | 'CarryForward' | 'Statutory' | 'Event'
	units: LeaveUnits
	effectiveDate: string
	expiresOn?: string
	sourceReference: string
	idempotencyKey: string
}
export interface LeavePostingReceipt {
	transactionId: string
	sequence: string
	date: string
	type: 'Grant'
	units: LeaveUnits
	unit: LeaveUnit
	sourceReference: string
	runningUnits: LeaveUnits
}
export interface LeaveGrantLedger {
	/** Append one already-authorized source grant and its exact account projection atomically; replay preserves its original receipt. */
	postGrant(input: LeaveGrantPosting): Promise<LeavePostingReceipt>
}
