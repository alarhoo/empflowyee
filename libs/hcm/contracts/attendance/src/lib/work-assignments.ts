import {
	parseHolidayAssignment,
	parseHolidayAssignmentQuery,
	type HolidayAssignmentCommand,
	type ParsedHolidayAssignment,
} from './holiday-assignments'
import type { AttendanceScopeTarget } from './assignments'

export type WorkAssignmentFamily = 'Schedule' | 'Policy'
export type WorkAssignmentCommand = HolidayAssignmentCommand
export type ParsedWorkAssignment = ParsedHolidayAssignment
export interface WorkAssignmentView {
	id: string
	family: WorkAssignmentFamily
	configurationId: string
	configurationName: string
	versionId: string
	revision: number
	target: AttendanceScopeTarget
	effectiveFrom: string
	effectiveTo: string | null
}
export interface WorkAssignmentResult extends WorkAssignmentView {
	resolutionFrom: string
	resolutionTo: string
	queuedWorkdays: number
	unavailableWorkdays: number
}
/** Reuse the closed seven-scope assignment, exact revision and bounded materialization contract. */
export function parseWorkAssignment(value: unknown): ParsedWorkAssignment {
	return parseHolidayAssignment(value)
}
/** Read only one exact authorized target/date, using the same maintained scope restrictions. */
export function parseWorkAssignmentQuery(params: URLSearchParams) {
	return parseHolidayAssignmentQuery(params)
}
