import type {
	ProfileVisibility,
	SelfContactPointType,
	SelfEditMode,
} from '@empflowyee/hcm-employee-contract'

export const VISIBILITY_LABELS: Record<ProfileVisibility, string> = {
	Self: 'Only me',
	Hr: 'Me and HR',
	Manager: 'Me, HR and my manager',
	Organization: 'Everyone in the organisation',
}

export const EDIT_MODE_LABELS: Record<SelfEditMode, string> = {
	NotEditable: 'Maintained by HR',
	ServiceRequest: 'Change through HR',
	Direct: 'Editable',
}

export const CONTACT_LABELS: Record<SelfContactPointType, string> = {
	PersonalEmail: 'Personal email',
	MobilePhone: 'Mobile phone',
}

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

export const ADDRESS_TYPES: Record<string, string> = {
	Permanent: 'Permanent',
	Current: 'Current',
	Correspondence: 'Correspondence',
	Emergency: 'Emergency',
}

type Semantic = 'positive' | 'negative' | 'critical' | 'informative' | 'neutral'

/** Semantic status of an employment status; the label carries the meaning, not the colour. */
export function employmentStatus(status: string): { status: Semantic; label: string } {
	const map: Record<string, { status: Semantic; label: string }> = {
		Pending: { status: 'informative', label: 'Pending' },
		Active: { status: 'positive', label: 'Active' },
		OnNotice: { status: 'critical', label: 'On notice' },
		Suspended: { status: 'negative', label: 'Suspended' },
	}
	return map[status] ?? { status: 'neutral', label: status }
}

/** Semantic status of a probation status. */
export function probationStatus(status: string): { status: Semantic; label: string } {
	const map: Record<string, { status: Semantic; label: string }> = {
		NotApplicable: { status: 'neutral', label: 'Not applicable' },
		InProgress: { status: 'informative', label: 'In progress' },
		Confirmed: { status: 'positive', label: 'Confirmed' },
		Extended: { status: 'critical', label: 'Extended' },
		Failed: { status: 'negative', label: 'Not confirmed' },
	}
	return map[status] ?? { status: 'neutral', label: status }
}

/** Initials of a display name for the header Avatar. */
export function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.map(/** First letter. */ (part) => part[0]?.toUpperCase() ?? '')
		.slice(0, 2)
		.join('')
}
