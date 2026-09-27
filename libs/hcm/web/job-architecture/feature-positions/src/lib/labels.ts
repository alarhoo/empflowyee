import type {
	LifecycleRequestType,
	PositionLifecycle,
	PositionRequestStatus,
	PositionRequestType,
	PositionType,
} from '@empflowyee/hcm-job-architecture-contract'

export const REQUEST_PERMISSION = 'hcm.job-architecture.positions.request'
export const APPROVE_PERMISSION = 'hcm.job-architecture.positions.approve'
export const BASE_ROUTE = '/job-architecture/positions'

type Semantic = 'positive' | 'critical' | 'negative' | 'informative' | 'neutral'

const LIFECYCLE: Record<PositionLifecycle, { label: string; status: Semantic }> = {
	Planned: { label: 'Planned', status: 'informative' },
	Open: { label: 'Open', status: 'positive' },
	Frozen: { label: 'Frozen', status: 'critical' },
	Closed: { label: 'Closed', status: 'neutral' },
	Cancelled: { label: 'Cancelled', status: 'neutral' },
}

/** Semantic presentation of a position lifecycle; the label carries the meaning. */
export function lifecycleStatus(value: PositionLifecycle): { label: string; status: Semantic } {
	return LIFECYCLE[value]
}

const REQUEST: Record<PositionRequestStatus, { label: string; status: Semantic }> = {
	Draft: { label: 'Draft', status: 'informative' },
	Previewed: { label: 'Previewed', status: 'informative' },
	Submitted: { label: 'Submitted', status: 'critical' },
	PendingApproval: { label: 'Pending approval', status: 'critical' },
	Approved: { label: 'Approved', status: 'positive' },
	Rejected: { label: 'Rejected', status: 'negative' },
	Withdrawn: { label: 'Withdrawn', status: 'neutral' },
	Applying: { label: 'Applying', status: 'critical' },
	Applied: { label: 'Applied', status: 'positive' },
	Failed: { label: 'Failed', status: 'negative' },
}

/** Semantic presentation of a change request status. */
export function requestStatus(value: PositionRequestStatus): { label: string; status: Semantic } {
	return REQUEST[value]
}

export const REQUEST_TYPE_LABELS: Record<PositionRequestType, string> = {
	Create: 'New position',
	Change: 'Change',
	Freeze: 'Freeze',
	Reopen: 'Reopen',
	Close: 'Close',
	Cancel: 'Cancel',
}

export const POSITION_TYPE_LABELS: Record<PositionType, string> = {
	Regular: 'Regular',
	Temporary: 'Temporary',
	Project: 'Project',
}

/** The lifecycle requests that apply to a position status. */
export function lifecycleRequests(status: PositionLifecycle): LifecycleRequestType[] {
	const allowed: Record<PositionLifecycle, LifecycleRequestType[]> = {
		Planned: [],
		Open: ['Freeze', 'Close', 'Cancel'],
		Frozen: ['Reopen', 'Close', 'Cancel'],
		Closed: ['Reopen'],
		Cancelled: [],
	}
	return allowed[status]
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

/** Up to two initials of a name, for an Avatar next to the name. */
export function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map(/** First letter. */ (part) => part[0]?.toUpperCase() ?? '')
		.join('')
}
