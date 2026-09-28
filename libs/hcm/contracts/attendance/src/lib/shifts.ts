import { enumValue, intValue, invalidField, readBody } from '@empflowyee/hcm-runtime-contract'
import { configurationIdentity, configurationText } from './configuration-validation'
import {
	attendanceZone,
	parseAttendanceSegments,
	type ScheduleDraft,
	type ScheduleSegment,
	type AttendanceConfigurationState,
} from './hcm-attendance-contract'

export interface ShiftDraft extends Omit<ScheduleDraft, 'isTemplate' | 'weekStartsOn' | 'days'> {
	segments: ScheduleSegment[]
}
export interface ShiftVersionView extends ShiftDraft {
	id: string
	versionId: string
	versionNumber: number
	revision: number
	state: AttendanceConfigurationState
}

/** Parse a reusable single shift with explicit zone and optional minimum-rest policy, without inventing a weekly pattern. */
export function parseShiftDraft(value: unknown): ShiftDraft {
	const input = readBody(
		value,
		['code', 'name', 'effectiveFrom', 'timezoneMode', 'segments'],
		['description', 'effectiveTo', 'fixedZone', 'minimumRestMinutes', 'minimumRestMode'],
	)
	const result: ShiftDraft = {
		...configurationIdentity(input),
		timezoneMode: enumValue(input['timezoneMode'], 'timezoneMode', [
			'Employment',
			'Location',
			'Fixed',
		]),
		segments: parseAttendanceSegments(input['segments']),
	}
	if (input['description'] !== undefined)
		result.description = configurationText(input['description'], 'description', 2000, false)
	if (result.timezoneMode === 'Fixed')
		result.fixedZone = attendanceZone(input['fixedZone'], 'fixedZone')
	else if (input['fixedZone'] !== undefined) invalidField('fixedZone', 'not-applicable')
	if (input['minimumRestMinutes'] !== undefined) {
		result.minimumRestMinutes = intValue(
			input['minimumRestMinutes'],
			'minimumRestMinutes',
			0,
			Number.MAX_SAFE_INTEGER,
		)
		result.minimumRestMode = enumValue<'Warn' | 'Block'>(
			input['minimumRestMode'],
			'minimumRestMode',
			['Warn', 'Block'],
		)
	} else if (input['minimumRestMode'] !== undefined)
		invalidField('minimumRestMode', 'not-applicable')
	return result
}
