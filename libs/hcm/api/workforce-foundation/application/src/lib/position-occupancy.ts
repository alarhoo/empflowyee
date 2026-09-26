import type { HcmPage } from '@empflowyee/hcm-runtime-contract'

/**
 * Occupancy of one position on a date, derived from effective assignments linked to it. When any
 * linked assignment lacks the facts needed to count it, occupancy is incomplete and the counts are
 * null: unavailable occupancy is never zero (job architecture rule 14).
 */
export interface PositionOccupancy {
	positionId: string
	headcount: number | null
	fte: number | null
	complete: boolean
}

/** One effective assignment occupying a position. */
export interface IncumbentRow {
	assignmentId: string
	workerId: string
	displayName: string
	designation: string | null
	fullTimeEquivalent: number | null
	primary: boolean
	effectiveFrom: string
}

/** Effective assignment occupancy per position, read inside the caller's transaction. */
export interface PositionOccupancyPort {
	/** Occupancy of each position on a date; positions without assignments are complete zeros. */
	occupancy(positionIds: readonly string[], asOf: string): Promise<Map<string, PositionOccupancy>>
	/** Effective assignments occupying one position, by name then assignment id. */
	incumbents(
		positionId: string,
		asOf: string,
		page: { limit: number; cursor?: string },
	): Promise<HcmPage<IncumbentRow>>
}
