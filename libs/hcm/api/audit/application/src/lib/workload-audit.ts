export interface WorkloadAuditEvent {
	action:
		'background.claimed' | 'background.completed' | 'background.failed' | 'background.reconciled'
	workId: string
	attempt: number
	fence: number
	errorCode?: string
}

export interface AppendWorkloadAudit {
	append(event: WorkloadAuditEvent): Promise<string>
}

/** Accept only operational references and bounded safe codes, never a payload or employee narrative. */
export function validateWorkloadAudit(event: WorkloadAuditEvent): void {
	if (
		![
			'background.claimed',
			'background.completed',
			'background.failed',
			'background.reconciled',
		].includes(event.action) ||
		!event.workId ||
		event.workId.length > 200 ||
		!Number.isSafeInteger(event.attempt) ||
		event.attempt < 0 ||
		!Number.isSafeInteger(event.fence) ||
		event.fence < 1 ||
		(event.errorCode !== undefined && !/^[a-z0-9][a-z0-9.-]{0,79}$/.test(event.errorCode))
	)
		throw new Error('Invalid workload audit evidence')
}
