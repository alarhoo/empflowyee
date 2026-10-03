import { intValue, readBody } from '@empflowyee/hcm-runtime-contract'
import { parseAttendancePolicyDraft, type AttendancePolicyDraft } from './attendance-policies'
import { parseShiftDraft, type ShiftDraft } from './shifts'

/** Parse a whole policy replacement while keeping optimistic concurrency outside its business payload. */
export function parseAttendancePolicyUpdate(value: unknown): {
	expectedRevision: number
	draft: AttendancePolicyDraft
} {
	const input = readBody(
		value,
		['expectedRevision'],
		[
			'code',
			'name',
			'effectiveFrom',
			'effectiveTo',
			'graceInMinutes',
			'graceOutMinutes',
			'rounding',
			'roundingIncrementMinutes',
			'roundingDirection',
			'minimumRestMinutes',
			'minimumRestMode',
			'overtime',
			'approvalRules',
		],
	)
	const { expectedRevision, ...draft } = input
	return {
		expectedRevision: intValue(expectedRevision, 'expectedRevision', 1, 2147483647),
		draft: parseAttendancePolicyDraft(draft),
	}
}

/** Parse an exact shift Draft replacement with the same segment validator used at creation. */
export function parseShiftUpdate(value: unknown): { expectedRevision: number; draft: ShiftDraft } {
	const input = readBody(
		value,
		['expectedRevision'],
		[
			'code',
			'name',
			'description',
			'effectiveFrom',
			'effectiveTo',
			'timezoneMode',
			'fixedZone',
			'minimumRestMinutes',
			'minimumRestMode',
			'segments',
		],
	)
	const { expectedRevision, ...draft } = input
	return {
		expectedRevision: intValue(expectedRevision, 'expectedRevision', 1, 2147483647),
		draft: parseShiftDraft(draft),
	}
}
