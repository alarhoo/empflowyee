import { HcmDomainError, invalidField } from '@empflowyee/hcm-runtime-contract'
import type {
	EffectiveRequirementDto,
	PositionLifecycle,
	PositionRequestStatus,
	PositionRequestType,
	RequirementDto,
	VarianceDraft,
} from '@empflowyee/hcm-job-architecture-contract'

/** Occupancy of one position; counts are null when any linked assignment is not countable. */
export interface OccupancyFacts {
	headcount: number | null
	fte: number | null
	complete: boolean
}

/** Published capacity of one position version. */
export interface CapacityFacts {
	headcountCapacity: number
	fteCapacity: number
}

export type CapacityDecision = 'allowed' | 'capacity-exceeded' | 'occupancy-unknown'

/** Round a fixed two-place decimal after arithmetic. */
function cents(value: number): number {
	return Math.round(value * 100) / 100
}

/**
 * Remaining capacity from exact published capacity and complete occupancy; null when occupancy is
 * unavailable, never zero (business rule 14).
 */
export function remainingCapacity(
	capacity: CapacityFacts,
	occupancy: OccupancyFacts,
): { headcount: number | null; fte: number | null } {
	if (!occupancy.complete || occupancy.headcount === null || occupancy.fte === null)
		return { headcount: null, fte: null }
	return {
		headcount: capacity.headcountCapacity - occupancy.headcount,
		fte: cents(capacity.fteCapacity - occupancy.fte),
	}
}

/**
 * DEC-HCM2-007: partial FTE is allowed; an assignment is allowed only when occupancy is complete and
 * neither headcount nor FTE would exceed capacity. There is no overfill.
 */
export function capacityDecision(
	capacity: CapacityFacts,
	occupancy: OccupancyFacts,
	addedHeadcount: number,
	addedFte: number,
): CapacityDecision {
	if (!occupancy.complete || occupancy.headcount === null || occupancy.fte === null)
		return 'occupancy-unknown'
	if (occupancy.headcount + addedHeadcount > capacity.headcountCapacity) return 'capacity-exceeded'
	if (cents(occupancy.fte + addedFte) > capacity.fteCapacity) return 'capacity-exceeded'
	return 'allowed'
}

/** Throw the safe error of a refused capacity decision. */
export function requireCapacity(decision: CapacityDecision): void {
	if (decision !== 'allowed') throw new HcmDomainError(decision)
}

/**
 * The lifecycle status a request leaves the position in, or `invalid-state` when the request does
 * not apply to the current status. Closing or freezing never ends an assignment (business rule 17).
 */
export function lifecycleTarget(
	requestType: PositionRequestType,
	current: PositionLifecycle,
): PositionLifecycle {
	const transitions: Record<
		PositionRequestType,
		Partial<Record<PositionLifecycle, PositionLifecycle>>
	> = {
		Create: { Planned: 'Open' },
		Change: { Open: 'Open', Frozen: 'Frozen' },
		Freeze: { Open: 'Frozen' },
		Reopen: { Frozen: 'Open', Closed: 'Open' },
		Close: { Open: 'Closed', Frozen: 'Closed' },
		Cancel: { Open: 'Cancelled', Frozen: 'Cancelled' },
	}
	const target = transitions[requestType][current]
	if (!target) throw new HcmDomainError('invalid-state')
	return target
}

/** Cancelling is for positions never staffed: occupancy must be known and empty. */
export function requireCancellable(occupancy: OccupancyFacts): void {
	if (!occupancy.complete) throw new HcmDomainError('occupancy-unknown')
	if (occupancy.headcount !== 0) throw new HcmDomainError('invalid-state')
}

/** The request steps a command may take (Positions TDD#action). */
export function requireRequestStatus(
	current: PositionRequestStatus,
	allowed: readonly PositionRequestStatus[],
): void {
	if (!allowed.includes(current)) throw new HcmDomainError('invalid-state')
}

/** A preview authorizes submission only while Ready, unexpired and matching the source digest. */
export function requirePreviewValid(
	preview: { status: string; expiresAt: string; sourceDigest: string } | undefined,
	now: Date,
	currentDigest: string,
): void {
	if (
		!preview ||
		preview.status !== 'Ready' ||
		new Date(preview.expiresAt).getTime() <= now.getTime() ||
		preview.sourceDigest !== currentDigest
	)
		throw new HcmDomainError('preview-stale')
}

/** The requester never decides their own request (DEC-HCM2-008). */
export function requireIndependentDecider(requesterId: string, deciderId: string): void {
	if (requesterId === deciderId) throw new HcmDomainError('self-approval-forbidden')
}

/** A solid line never leads back to the position itself (business rule 12). */
export function requireNoPositionCycle(positionId: string, ancestors: readonly string[]): void {
	if (ancestors.includes(positionId)) invalidField('reportsToPositionId', 'cycle')
}

/**
 * Validate variances against the profile's requirements: Add introduces a new code; Replace,
 * Strengthen and Waive act on an existing profile requirement under its code. Strengthen keeps the
 * requirement's type and unit and never lowers its quantity or mandatory flag.
 */
export function requireVariances(
	variances: readonly VarianceDraft[],
	profile: readonly RequirementDto[],
): void {
	const byCode = new Map(profile.map(/** Key by code. */ (item) => [item.code, item]))
	variances.forEach(
		/** Check one variance. */ (variance, index) => {
			const field = `variances.${index}`
			if (variance.varianceType === 'Add') {
				if (byCode.has(variance.code)) invalidField(`${field}.code`, 'duplicate')
				return
			}
			const source = variance.sourceCode === null ? undefined : byCode.get(variance.sourceCode)
			if (!source) invalidField(`${field}.sourceCode`, 'unknown')
			if (variance.code !== source.code) invalidField(`${field}.code`, 'source-mismatch')
			if (variance.varianceType !== 'Strengthen') return
			if (variance.type !== source.type) invalidField(`${field}.type`, 'weakened')
			if (variance.unit !== source.unit) invalidField(`${field}.unit`, 'weakened')
			if ((variance.minimumQuantity ?? 0) < (source.minimumQuantity ?? 0))
				invalidField(`${field}.minimumQuantity`, 'weakened')
			if (source.mandatory && !variance.mandatory) invalidField(`${field}.mandatory`, 'weakened')
		},
	)
}

/**
 * Effective requirements: the profile's requirements with position variances applied. A waived
 * requirement stays visible, marked waived; additions follow the profile's list.
 */
export function effectiveRequirements(
	profile: readonly RequirementDto[],
	variances: readonly Omit<VarianceDraft, 'justification'>[],
): EffectiveRequirementDto[] {
	const bySource = new Map(
		variances
			.filter(/** Variances acting on a profile requirement. */ (item) => item.sourceCode !== null)
			.map(/** Key by source code. */ (item) => [item.sourceCode as string, item]),
	)
	/** Project one requirement. */
	const project = (
		item: Omit<VarianceDraft, 'justification' | 'varianceType' | 'sourceCode'>,
		source: 'Profile' | 'Position',
		variance: VarianceDraft['varianceType'] | null,
	): EffectiveRequirementDto => ({
		code: item.code,
		type: item.type,
		name: item.name,
		description: item.description,
		proficiency: item.proficiency,
		minimumQuantity: item.minimumQuantity,
		unit: item.unit,
		mandatory: item.mandatory,
		source,
		variance,
		waived: variance === 'Waive',
	})
	const effective = [...profile]
		.sort(/** Profile order. */ (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
		.map(
			/** Apply the variance acting on this requirement, if any. */ (item) => {
				const variance = bySource.get(item.code)
				if (!variance) return project(item, 'Profile', null)
				if (variance.varianceType === 'Waive') return project(item, 'Profile', 'Waive')
				return project(variance, 'Position', variance.varianceType)
			},
		)
	for (const item of variances)
		if (item.varianceType === 'Add') effective.push(project(item, 'Position', 'Add'))
	return effective
}
