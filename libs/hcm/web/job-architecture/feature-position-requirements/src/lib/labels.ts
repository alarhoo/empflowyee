import type {
	EffectiveRequirementDto,
	PositionLifecycle,
	PositionRequestStatus,
	QuantityUnit,
	VarianceType,
} from '@empflowyee/hcm-job-architecture-contract'

export const REQUEST_PERMISSION = 'hcm.job-architecture.position-requirements.request'
export const BASE_ROUTE = '/job-architecture/position-requirements'
/** Decisions and withdrawals happen in Positions, which shows the same request. */
export const POSITIONS_ROUTE = '/job-architecture/positions'

type Semantic = 'positive' | 'critical' | 'negative' | 'informative' | 'neutral'

const LIFECYCLE: Record<PositionLifecycle, { label: string; status: Semantic }> = {
	Planned: { label: 'Planned', status: 'informative' },
	Open: { label: 'Open', status: 'positive' },
	Frozen: { label: 'Frozen', status: 'critical' },
	Closed: { label: 'Closed', status: 'neutral' },
	Cancelled: { label: 'Cancelled', status: 'neutral' },
}

/** Semantic presentation of a position lifecycle. */
export function lifecycleStatus(value: PositionLifecycle): { label: string; status: Semantic } {
	return LIFECYCLE[value]
}

const VARIANCE: Record<VarianceType, { label: string; status: Semantic }> = {
	Add: { label: 'Added', status: 'informative' },
	Replace: { label: 'Replaced', status: 'informative' },
	Strengthen: { label: 'Strengthened', status: 'informative' },
	Waive: { label: 'Waived', status: 'critical' },
}

/** Semantic presentation of a variance; Waived is Critical (TDD#UX). */
export function varianceStatus(value: VarianceType): { label: string; status: Semantic } {
	return VARIANCE[value]
}

/** Semantic presentation of where an effective requirement comes from. */
export function sourceStatus(item: EffectiveRequirementDto): { label: string; status: Semantic } {
	return item.source === 'Profile'
		? { label: 'Profile', status: 'neutral' }
		: { label: 'Position', status: 'informative' }
}

const UNIT_LABELS: Record<QuantityUnit, string> = {
	Years: 'years',
	Months: 'months',
	Hours: 'hours',
	Credits: 'credits',
	Count: '',
}

/** A minimum quantity with its unit, or a dash. */
export function minimum(quantity: number | null, unit: QuantityUnit | null): string {
	if (quantity === null || unit === null) return '—'
	const value = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(quantity)
	return `${value} ${UNIT_LABELS[unit]}`.trim()
}

export const TYPE_LABELS: Record<VarianceType, string> = {
	Add: 'Add requirement',
	Replace: 'Replace requirement',
	Strengthen: 'Strengthen requirement',
	Waive: 'Waive requirement',
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
