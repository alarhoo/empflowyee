import { idValue, invalidField, readBody, revisionValue } from '@empflowyee/hcm-runtime-contract'
import { configurationText } from './configuration-validation'
import { parseScheduleDraft, type ScheduleDraft } from './hcm-attendance-contract'

export interface ScheduleDraftUpdate {
	draft: ScheduleDraft
	expectedRevision: number
}
export interface AttendanceCopyCommand {
	code: string
	name: string
	sourceVersionId: string
	expectedRevision: number
	reason: string
}
export interface AttendanceVersionCommand {
	sourceVersionId: string
	expectedRevision: number
	reason: string
}

/** Parse a whole-draft replacement while keeping the optimistic revision outside the editable business fields. */
export function parseScheduleDraftUpdate(value: unknown): ScheduleDraftUpdate {
	const input = readBody(
		value,
		['expectedRevision'],
		[
			'code',
			'name',
			'description',
			'isTemplate',
			'effectiveFrom',
			'effectiveTo',
			'timezoneMode',
			'fixedZone',
			'weekStartsOn',
			'minimumRestMinutes',
			'minimumRestMode',
			'days',
		],
	)
	const { expectedRevision, ...draft } = input
	return { draft: parseScheduleDraft(draft), expectedRevision: revisionValue(expectedRevision) }
}

/** Require the exact immutable source version and a preserved reason for creating its successor. */
export function parseAttendanceVersionCommand(value: unknown): AttendanceVersionCommand {
	const input = readBody(value, ['sourceVersionId', 'expectedRevision', 'reason'])
	return {
		sourceVersionId: idValue(input['sourceVersionId'], 'sourceVersionId'),
		expectedRevision: revisionValue(input['expectedRevision']),
		reason: configurationText(input['reason'], 'reason', 2000),
	}
}

/** Parse an explicitly named independent copy without permitting owner, tenant or status injection. */
export function parseAttendanceCopyCommand(value: unknown): AttendanceCopyCommand {
	const input = readBody(value, ['code', 'name', 'sourceVersionId', 'expectedRevision', 'reason'])
	const { code, name, ...source } = input
	const parsedCode = configurationText(code, 'code', 40)
	if (!/^[A-Z][A-Z0-9_-]*$/.test(parsedCode)) invalidField('code')
	return {
		code: parsedCode,
		name: configurationText(name, 'name', 120),
		...parseAttendanceVersionCommand(source),
	}
}
