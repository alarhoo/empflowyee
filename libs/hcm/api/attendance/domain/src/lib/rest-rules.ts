import { minimumRest, type MinimumRestResult } from './hcm-api-attendance-domain'

export interface AttendanceRestRule {
	source: 'Schedule' | 'Policy'
	versionId: string
	minutes: number | null
	mode?: 'Warn' | 'Block'
}
export interface AttendanceRestOutcome extends AttendanceRestRule {
	result: MinimumRestResult
}

/** Enforce DEC-HCM3-022 independently, retaining each rule's own source, threshold and mode; never let a warning mask another source's block. */
export function evaluateAttendanceRest(
	previousEnd: number,
	nextStart: number,
	schedule: AttendanceRestRule & { source: 'Schedule' },
	policy: AttendanceRestRule & { source: 'Policy' },
): { blocked: boolean; outcomes: AttendanceRestOutcome[] } {
	const outcomes = [schedule, policy].map(
		/** Use the same exact instants for both comparisons without selecting one rule as an override. */ (
			rule,
		) => ({
			...rule,
			result: minimumRest(previousEnd, nextStart, rule.minutes, rule.mode),
		}),
	)
	return {
		blocked: outcomes.some(
			/** A configured Block from either source prevents publication. */ (item) =>
				item.result.state === 'Block',
		),
		outcomes,
	}
}
