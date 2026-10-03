import type { WorkdayQuantityBasis } from '@empflowyee/hcm-attendance-contract'
import type { AssignedWorkdayResult } from './assigned-workday'

export interface AttendanceLeaveImpactProposal {
	employmentId: string
	days: { workDate: string; zone: string; basis: WorkdayQuantityBasis }[]
}
export interface AttendanceLeaveImpact {
	digest: string
	affectedRequestCount: number
	changedRequestCount: number
	unavailableRequestCount: number
}
export interface AttendanceLeaveImpactPort {
	/** Calculate source-owned Leave impact inside the caller's authorized dated transaction, without exposing private requests. */
	review(proposal: AttendanceLeaveImpactProposal): Promise<AttendanceLeaveImpact>
}
export abstract class AttendanceLeaveImpactBinder {
	/** Bind the existing tenant transaction; the owning publisher must authorize the complete proposed range first. */
	abstract bind(transaction: unknown, tenantId: string): AttendanceLeaveImpactPort
}

/** Project actual resolver intervals into quantity evidence without passing Attendance implementation objects to Leave. */
export function leaveImpactProposal(
	employmentId: string,
	days: readonly {
		workDate: string
		result: Extract<AssignedWorkdayResult, { state: 'Available' }>
	}[],
): AttendanceLeaveImpactProposal {
	return {
		employmentId,
		days: days.map(
			/** Preserve exact scheduled denominator and holiday-subtracted expected work on every reviewed date. */ (
				day,
			) => {
				const value = day.result.resolution
				return {
					workDate: day.workDate,
					zone: value.zone,
					basis: {
						kind: value.scheduleKind,
						scheduledMilliseconds: value.scheduledWorkMilliseconds,
						elapsedMilliseconds: value.expectedWorkMilliseconds,
						segments: [
							...value.scheduledSegments,
							...value.expectedWorkIntervals.map(
								/** Expected intervals are already exact results from the Attendance owner. */ (
									interval,
								) => ({
									kind: 'ExpectedWork' as const,
									startInstant: new Date(interval.startMilliseconds).toISOString(),
									endInstant: new Date(interval.endMilliseconds).toISOString(),
									elapsedMilliseconds: String(
										interval.endMilliseconds - interval.startMilliseconds,
									),
								}),
							),
						],
					},
				}
			},
		),
	}
}
