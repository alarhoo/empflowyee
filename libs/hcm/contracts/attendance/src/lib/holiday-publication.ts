import { idValue, readBody } from '@empflowyee/hcm-runtime-contract'
import { attendanceZone } from './hcm-attendance-contract'
import {
	parseConfigurationPreview,
	type ConfigurationPreviewCommand,
} from './configuration-publication'

export interface HolidayPreviewCommand extends ConfigurationPreviewCommand {
	employmentId: string
	timezone: string
}
export interface HolidayPreviewView {
	previewId: string
	operationId: string
	statusUrl: string
	state: 'Running' | 'Ready' | 'Failed' | 'Expired' | 'Consumed'
	digest: string | null
	affectedEmploymentCount: number | null
	affectedWorkdayCount: number | null
	conflicts: number | null
	lockedImpact: boolean | null
	failureCode: string | null
	expiresAt: string
}

/** Require explicit employment and timezone context without accepting caller-supplied Workforce facts. */
export function parseHolidayPreview(value: unknown): HolidayPreviewCommand {
	const input = readBody(
		value,
		['expectedRevision', 'effectiveFrom', 'employmentId', 'timezone'],
		['effectiveTo'],
	)
	const { employmentId, timezone, ...range } = input
	return {
		...parseConfigurationPreview(range),
		employmentId: idValue(employmentId, 'employmentId'),
		timezone: attendanceZone(timezone),
	}
}
