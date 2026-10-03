import { idValue, readBody } from '@empflowyee/hcm-runtime-contract'
import {
	parseConfigurationPreview,
	type ConfigurationPreviewCommand,
} from './configuration-publication'
import type { HolidayPreviewView } from './holiday-publication'
import type { WorkAssignmentLeaveImpact } from './work-assignments'

export type DatedConfigurationFamily = 'Schedule' | 'Shift'
export interface DatedConfigurationPreviewCommand extends ConfigurationPreviewCommand {
	employmentId: string
}
export type DatedConfigurationPreviewView = HolidayPreviewView & {
	/** Present only after real owner recalculation has completed. */
	leaveImpact?: WorkAssignmentLeaveImpact
}

/** Require a real employment for dated time validation; timezone follows the explicit source mode and Workforce facts. */
export function parseDatedConfigurationPreview(value: unknown): DatedConfigurationPreviewCommand {
	const input = readBody(
		value,
		['expectedRevision', 'effectiveFrom', 'employmentId'],
		['effectiveTo'],
	)
	const { employmentId, ...range } = input
	return {
		...parseConfigurationPreview(range),
		employmentId: idValue(employmentId, 'employmentId'),
	}
}
