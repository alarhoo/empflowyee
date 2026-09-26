type Status = 'positive' | 'critical' | 'negative' | 'informative' | 'neutral'

const EMPLOYMENT: Record<string, { label: string; status: Status }> = {
	Active: { label: 'Active', status: 'positive' },
	OnNotice: { label: 'On notice', status: 'critical' },
	Suspended: { label: 'Suspended', status: 'negative' },
	Pending: { label: 'Pending', status: 'informative' },
	Ended: { label: 'Ended', status: 'neutral' },
}
const PROBATION: Record<string, { label: string; status: Status }> = {
	NotApplicable: { label: 'Not applicable', status: 'neutral' },
	InProgress: { label: 'In probation', status: 'informative' },
	Confirmed: { label: 'Confirmed', status: 'positive' },
	Extended: { label: 'Extended', status: 'critical' },
	Failed: { label: 'Not confirmed', status: 'negative' },
}

/** Semantic presentation of an employment status. */
export function employmentStatus(value: string): { label: string; status: Status } {
	return EMPLOYMENT[value] ?? { label: value, status: 'neutral' }
}

/** Semantic presentation of a probation status. */
export function probationStatus(value: string): { label: string; status: Status } {
	return PROBATION[value] ?? { label: value, status: 'neutral' }
}

export const PROBATION_FILTERS = Object.entries(PROBATION).map(
	/** Filter option. */ ([value, entry]) => ({ value, label: entry.label }),
)

/** Readable labels of employment enums. */
export const EMPLOYMENT_TYPES: Record<string, string> = {
	Permanent: 'Permanent',
	FixedTerm: 'Fixed term',
	Contract: 'Contract',
	Internship: 'Internship',
	Apprenticeship: 'Apprenticeship',
	Consultant: 'Consultant',
}
export const WORK_MODES: Record<string, string> = {
	OnSite: 'On site',
	Remote: 'Remote',
	Hybrid: 'Hybrid',
}
