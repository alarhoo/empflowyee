import type {
	EffectiveRequirementDto,
	PositionLifecycle,
} from '@empflowyee/hcm-job-architecture-contract'
import type { CapacityDecision } from '@empflowyee/hcm-api-job-architecture-domain'

/** The published placement of a position on a date. */
export interface PositionPlacement {
	positionId: string
	code: string
	name: string
	lifecycleStatus: PositionLifecycle
	versionId: string
	profileVersionId: string
	gradeId: string
	designationId: string
	legalEntityId: string
	unitId: string
	departmentId: string | null
	locationId: string
	headcountCapacity: number
	fteCapacity: number
}

/**
 * Published position facts for other domains (TDD-HCM-2-COMMON#ports). Workforce commands that
 * link an assignment to a position ask for a capacity decision in the same transaction.
 */
export interface PositionReadPort {
	/** The version effective on a date, or undefined when none is published for it. */
	placement(positionId: string, asOf: string): Promise<PositionPlacement | undefined>
	/**
	 * DEC-HCM2-007 decision for adding headcount and FTE on a date. A position that is not Open or
	 * has no effective published version is `not-open`.
	 */
	capacityDecision(
		positionId: string,
		asOf: string,
		addedHeadcount: number,
		addedFte: number,
	): Promise<CapacityDecision | 'not-open'>
	/** Effective requirements of the version effective on a date; empty when none is published. */
	effectiveRequirements(positionId: string, asOf: string): Promise<EffectiveRequirementDto[]>
}

/** Bind the position read port to a caller's open, authorized transaction. */
export abstract class PositionReadPortBinder {
	/** Return a port that reads inside the given transaction as the given actor. */
	abstract bind(
		transaction: unknown,
		actor: { tenantId: string; accountId: string },
	): PositionReadPort
}
