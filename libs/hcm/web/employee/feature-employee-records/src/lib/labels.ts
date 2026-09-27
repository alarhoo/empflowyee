import type { AddressTypeValue, RecordStateValue } from '@empflowyee/hcm-employee-contract'

export const MANAGE_PERMISSION = 'hcm.employee.records.manage'
export const EMERGENCY_PERMISSION = 'hcm.employee.records.emergency.read'
export const BASE_ROUTE = '/employee/employee-records'
/** Employment and assignment facts change in Employment Changes. */
export const EMPLOYMENT_CHANGES_ROUTE = '/employee/employment-changes'

type Semantic = 'positive' | 'critical' | 'negative' | 'informative' | 'neutral'

const EMPLOYMENT: Record<string, { label: string; status: Semantic }> = {
	Pending: { label: 'Pending', status: 'informative' },
	Active: { label: 'Active', status: 'positive' },
	OnNotice: { label: 'On notice', status: 'critical' },
	Suspended: { label: 'Suspended', status: 'critical' },
	Ended: { label: 'Ended', status: 'neutral' },
}

/** Semantic presentation of an employment status; unknown status is stated, never guessed. */
export function employmentStatus(value: string | null | undefined): {
	label: string
	status: Semantic
} {
	return (value && EMPLOYMENT[value]) || { label: 'Not established', status: 'neutral' }
}

/** Semantic presentation of a record state. */
export function recordState(value: RecordStateValue): { label: string; status: Semantic } {
	return value === 'Complete'
		? { label: 'Complete', status: 'positive' }
		: { label: 'Incomplete', status: 'critical' }
}

export const ADDRESS_TYPE_LABELS: Record<AddressTypeValue, string> = {
	Permanent: 'Permanent',
	Current: 'Current',
	Correspondence: 'Correspondence',
	Emergency: 'Emergency',
}

export const CONTACT_TYPE_LABELS: Record<string, string> = {
	PersonalEmail: 'Personal email',
	MobilePhone: 'Mobile phone',
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

/** Up to two initials of a name, for an Avatar next to the name. */
export function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map(/** First letter. */ (part) => part[0]?.toUpperCase() ?? '')
		.join('')
}

/** A number with at most two decimals for the viewer's locale. */
export function decimal(value: number | null | undefined): string {
	return value === null || value === undefined
		? '—'
		: new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
}

/** The ISO date of today in the viewer's calendar, for date defaults. */
export function isoToday(): string {
	const now = new Date()
	return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
