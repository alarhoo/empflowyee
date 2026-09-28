import {
	boolValue,
	dateValue,
	idValue,
	invalidField,
	readBody,
	revisionValue,
} from '@empflowyee/hcm-runtime-contract'
import { configurationText } from './configuration-validation'

export interface AttendanceNamedScopeTarget {
	kind: 'LegalEntity' | 'OrgUnit' | 'Department' | 'Location' | 'Assignment' | 'Employment'
	id: string
}
export type AttendanceScopeTarget = { kind: 'Tenant' } | AttendanceNamedScopeTarget
export interface AttendanceAssignmentFields {
	versionId: string
	effectiveFrom: string
	effectiveTo?: string
	expectedRevision?: number
	reason: string
}
export type AttendanceAssignmentCommand = AttendanceAssignmentFields &
	(
		| { tenantScope: true }
		| { legalEntityId: string }
		| { orgUnitId: string }
		| { departmentId: string }
		| { locationId: string }
		| { assignmentId: string }
		| { employmentId: string }
	)
export interface ParsedAttendanceAssignment extends AttendanceAssignmentFields {
	target: AttendanceScopeTarget
}

/** Map exactly one declared request selector to a typed internal target; tenant ownership always comes from context. */
export function parseAttendanceAssignment(value: unknown): ParsedAttendanceAssignment {
	const selectors = {
		legalEntityId: 'LegalEntity',
		orgUnitId: 'OrgUnit',
		departmentId: 'Department',
		locationId: 'Location',
		assignmentId: 'Assignment',
		employmentId: 'Employment',
	} as const
	const input = readBody(
		value,
		['versionId', 'effectiveFrom', 'reason'],
		['effectiveTo', 'expectedRevision', 'tenantScope', ...Object.keys(selectors)],
	)
	let target: AttendanceScopeTarget | undefined
	if (input['tenantScope'] !== undefined) {
		if (!boolValue(input['tenantScope'], 'tenantScope')) invalidField('tenantScope')
		target = { kind: 'Tenant' }
	}
	for (const [field, kind] of Object.entries(selectors)) {
		if (input[field] === undefined) continue
		if (target) invalidField(field, 'exactly-one-scope-required')
		target = { kind, id: idValue(input[field], field) }
	}
	if (!target) invalidField('tenantScope', 'exactly-one-scope-required')
	const result: ParsedAttendanceAssignment = {
		versionId: idValue(input['versionId'], 'versionId'),
		effectiveFrom: dateValue(input['effectiveFrom'], 'effectiveFrom'),
		reason: configurationText(input['reason'], 'reason', 2000),
		target,
	}
	if (input['effectiveTo'] !== undefined) {
		result.effectiveTo = dateValue(input['effectiveTo'], 'effectiveTo')
		if (result.effectiveTo < result.effectiveFrom) invalidField('effectiveTo')
	}
	if (input['expectedRevision'] !== undefined)
		result.expectedRevision = revisionValue(input['expectedRevision'])
	return result
}
