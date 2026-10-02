import { Temporal } from '@js-temporal/polyfill'
import {
	dateValue,
	enumValue,
	idValue,
	invalidField,
	readBody,
	revisionValue,
} from '@empflowyee/hcm-runtime-contract'
import {
	parseAttendanceAssignment,
	type AttendanceAssignmentCommand,
	type ParsedAttendanceAssignment,
	type AttendanceScopeTarget,
} from './assignments'

export interface HolidayAssignmentExecution {
	expectedRevision: number
	resolutionFrom: string
	resolutionTo: string
	supersedes?: { id: string; expectedRevision: number }
}
export type HolidayAssignmentCommand = AttendanceAssignmentCommand & HolidayAssignmentExecution
export type ParsedHolidayAssignment = ParsedAttendanceAssignment & HolidayAssignmentExecution
export interface HolidayAssignmentView {
	id: string
	calendarId: string
	calendarName: string
	versionId: string
	revision: number
	target: AttendanceScopeTarget
	effectiveFrom: string
	effectiveTo: string | null
}

/** Parse one exact dated target query; SQL exclusions bound the result to zero or one assignment. */
export function parseHolidayAssignmentQuery(params: URLSearchParams): {
	target: AttendanceScopeTarget
	asOf: string
} {
	for (const key of params.keys())
		if (!['kind', 'id', 'asOf'].includes(key) || params.getAll(key).length !== 1) invalidField(key)
	const kind = enumValue(params.get('kind'), 'kind', [
		'Tenant',
		'LegalEntity',
		'OrgUnit',
		'Department',
		'Location',
		'Assignment',
		'Employment',
	] as const)
	if (kind === 'Tenant' && params.has('id')) invalidField('id')
	return {
		target: kind === 'Tenant' ? { kind } : { kind, id: idValue(params.get('id'), 'id') },
		asOf: dateValue(params.get('asOf'), 'asOf'),
	}
}
export interface HolidayAssignmentResult extends HolidayAssignmentView {
	resolutionFrom: string
	resolutionTo: string
	queuedWorkdays: number
	unavailableWorkdays: number
}

/** Validate the closed assignment and explicit bounded execution window without shortening business coverage. */
export function parseHolidayAssignment(value: unknown): ParsedHolidayAssignment {
	const body = readBody(
		value,
		['versionId', 'effectiveFrom', 'reason', 'expectedRevision', 'resolutionFrom', 'resolutionTo'],
		[
			'effectiveTo',
			'tenantScope',
			'legalEntityId',
			'orgUnitId',
			'departmentId',
			'locationId',
			'assignmentId',
			'employmentId',
			'supersedes',
		],
	)
	const { resolutionFrom: from, resolutionTo: to, supersedes, ...assignment } = body
	const base = parseAttendanceAssignment(assignment)
	const resolutionFrom = dateValue(from, 'resolutionFrom'),
		resolutionTo = dateValue(to, 'resolutionTo')
	if (
		resolutionFrom < base.effectiveFrom ||
		resolutionTo < resolutionFrom ||
		(base.effectiveTo && resolutionTo > base.effectiveTo) ||
		Temporal.PlainDate.from(resolutionFrom).until(resolutionTo).days > 365
	)
		invalidField('resolutionTo')
	const result: ParsedHolidayAssignment = {
		...base,
		expectedRevision: revisionValue(body['expectedRevision']),
		resolutionFrom,
		resolutionTo,
	}
	if (supersedes !== undefined) {
		const previous = readBody(supersedes, ['id', 'expectedRevision'])
		result.supersedes = {
			id: idValue(previous['id'], 'supersedes.id'),
			expectedRevision: revisionValue(previous['expectedRevision'], 'supersedes.expectedRevision'),
		}
		if (base.effectiveFrom === '0001-01-01') invalidField('effectiveFrom')
	}
	return result
}
