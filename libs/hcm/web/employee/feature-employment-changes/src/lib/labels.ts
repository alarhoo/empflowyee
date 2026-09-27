import type { ChangeStatus, ChangeType } from '@empflowyee/hcm-employee-contract'

export const REQUEST_PERMISSION = 'hcm.employee.changes.request'
export const APPROVE_PERMISSION = 'hcm.employee.changes.approve'
export const BASE_ROUTE = '/employee/employment-changes'

type Semantic = 'positive' | 'critical' | 'negative' | 'informative' | 'neutral'

export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
	Rehire: 'Rehire',
	Transfer: 'Transfer',
	Promotion: 'Promotion',
	Demotion: 'Demotion',
	LocationChange: 'Location change',
	ManagerChange: 'Manager change',
	HoursChange: 'Hours change',
	EmploymentTypeChange: 'Employment type change',
	Suspension: 'Suspension',
	ReturnToWork: 'Return to work',
	Correction: 'Correction',
}

export const REASON_LABELS: Record<string, string> = {
	RETURNING_EMPLOYEE: 'Returning employee',
	SEASONAL_RETURN: 'Seasonal return',
	BUSINESS_NEED: 'Business need',
	EMPLOYEE_REQUEST: 'Employee request',
	REORGANISATION: 'Reorganisation',
	MERIT: 'Merit',
	ROLE_EXPANSION: 'Role expansion',
	PERFORMANCE: 'Performance',
	RELOCATION: 'Relocation',
	CONVERSION: 'Conversion',
	CONTRACT_RENEWAL: 'Contract renewal',
	INVESTIGATION: 'Investigation',
	DISCIPLINARY: 'Disciplinary',
	SUSPENSION_ENDED: 'Suspension ended',
	DATA_ENTRY_ERROR: 'Data entry error',
	MISSING_RECORD: 'Missing record',
}

const STATUS: Record<ChangeStatus, { label: string; status: Semantic }> = {
	Draft: { label: 'Draft', status: 'neutral' },
	PendingApproval: { label: 'Pending approval', status: 'informative' },
	Approved: { label: 'Approved, awaiting Apply', status: 'informative' },
	Rejected: { label: 'Rejected', status: 'negative' },
	Executing: { label: 'Executing', status: 'informative' },
	Completed: { label: 'Completed', status: 'positive' },
	Failed: { label: 'Failed', status: 'negative' },
	Cancelled: { label: 'Cancelled', status: 'neutral' },
}

/** Semantic presentation of a request status. */
export function requestStatus(value: ChangeStatus): { label: string; status: Semantic } {
	return STATUS[value]
}

/** Semantic presentation of an approval slot or execution step status. */
export function outcomeStatus(value: string): { label: string; status: Semantic } {
	const outcomes: Record<string, { label: string; status: Semantic }> = {
		Pending: { label: 'Pending', status: 'informative' },
		Approved: { label: 'Approved', status: 'positive' },
		Rejected: { label: 'Rejected', status: 'negative' },
		Succeeded: { label: 'Succeeded', status: 'positive' },
		Failed: { label: 'Failed', status: 'negative' },
		Skipped: { label: 'Skipped', status: 'neutral' },
	}
	return outcomes[value] ?? { label: value, status: 'neutral' }
}

export const STEP_LABELS: Record<string, string> = {
	'set-worker-type': 'Set worker type',
	'create-employment': 'Create employment',
	'open-assignment': 'Open assignment',
	'supersede-assignment': 'Close and replace assignment',
	'establish-assignment': 'Establish assignment',
	'set-manager': 'Start manager line',
	'end-manager': 'End manager line',
	'apply-employment-facts': 'Change employment facts',
	'record-event': 'Record worker event',
	execute: 'Execute change',
}

export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
	Permanent: 'Permanent',
	FixedTerm: 'Fixed term',
	Contract: 'Contract',
	Internship: 'Internship',
	Apprenticeship: 'Apprenticeship',
	Consultant: 'Consultant',
}

export const WORK_MODE_LABELS: Record<string, string> = {
	OnSite: 'On site',
	Remote: 'Remote',
	Hybrid: 'Hybrid',
}

export const EMPLOYMENT_STATUS_LABELS: Record<string, string> = {
	Pending: 'Pending',
	Active: 'Active',
	OnNotice: 'On notice',
	Suspended: 'Suspended',
	Ended: 'Ended',
}

/** Display text of a compared value: codes read as their labels. */
export function comparisonText(field: string, value: string | null): string {
	if (value === null || value === '') return '—'
	if (field === 'employmentType') return EMPLOYMENT_TYPE_LABELS[value] ?? value
	if (field === 'workMode') return WORK_MODE_LABELS[value] ?? value
	if (field === 'employmentStatus') return EMPLOYMENT_STATUS_LABELS[value] ?? value
	return value
}

/** The ISO date of today in the viewer's calendar, for date defaults. */
export function isoToday(): string {
	const now = new Date()
	return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** An ISO date some days from another. */
export function addDays(date: string, days: number): string {
	const value = new Date(`${date}T00:00:00Z`)
	value.setUTCDate(value.getUTCDate() + days)
	return value.toISOString().slice(0, 10)
}
