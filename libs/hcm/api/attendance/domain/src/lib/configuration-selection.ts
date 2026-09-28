import { dateValue } from '@empflowyee/hcm-runtime-contract'
import type { AttendanceScopeTarget } from '@empflowyee/hcm-attendance-contract'

export interface AttendanceEmploymentScope {
	employmentId: string
	legalEntityId: string
	assignments: readonly {
		id: string
		orgUnitId: string
		departmentId: string | null
		locationId: string
	}[]
}
export interface DatedConfigurationAssignment {
	id: string
	revision: number
	versionId: string
	target: AttendanceScopeTarget
	effectiveFrom: string
	effectiveTo: string | null
}
export interface SelectedConfiguration {
	state: 'Selected'
	assignment: DatedConfigurationAssignment
}
export interface UnavailableConfiguration {
	state: 'Unavailable'
	reason: 'MissingConfiguration' | 'EqualPrecedenceConflict'
}
const precedence: Record<AttendanceScopeTarget['kind'], number> = {
	Tenant: 0,
	LegalEntity: 1,
	OrgUnit: 2,
	Department: 3,
	Location: 4,
	Assignment: 5,
	Employment: 6,
}

/** Match one typed scope against one employment's dated facts without merging concurrent employments. */
function matches(target: AttendanceScopeTarget, scope: AttendanceEmploymentScope): boolean {
	switch (target.kind) {
		case 'Tenant':
			return true
		case 'Employment':
			return target.id === scope.employmentId
		case 'LegalEntity':
			return target.id === scope.legalEntityId
		case 'Assignment':
			return scope.assignments.some(
				/** A matching assignment must belong to the selected employment context. */ (item) =>
					item.id === target.id,
			)
		case 'Location':
			return scope.assignments.some(
				/** Match exact location identity, never a display label. */ (item) =>
					item.locationId === target.id,
			)
		case 'Department':
			return scope.assignments.some(
				/** Missing departments cannot imply a department-wide scope. */ (item) =>
					item.departmentId === target.id,
			)
		case 'OrgUnit':
			return scope.assignments.some(
				/** Use the effective unit fact supplied by Workforce. */ (item) =>
					item.orgUnitId === target.id,
			)
		default:
			throw new Error('Unsupported attendance scope target')
	}
}

/** Select the most specific dated assignment, rejecting all ties rather than choosing a row or version by insertion order. */
export function selectAttendanceConfiguration(
	workDate: string,
	scope: AttendanceEmploymentScope,
	assignments: readonly DatedConfigurationAssignment[],
): SelectedConfiguration | UnavailableConfiguration {
	dateValue(workDate, 'workDate')
	let winner: DatedConfigurationAssignment | undefined
	let conflict = false
	for (const item of assignments) {
		if (
			item.effectiveFrom > workDate ||
			(item.effectiveTo !== null && item.effectiveTo < workDate) ||
			!matches(item.target, scope)
		)
			continue
		if (!winner || precedence[item.target.kind] > precedence[winner.target.kind]) {
			winner = item
			conflict = false
		} else if (precedence[item.target.kind] === precedence[winner.target.kind]) conflict = true
	}
	if (!winner) return { state: 'Unavailable', reason: 'MissingConfiguration' }
	if (conflict) return { state: 'Unavailable', reason: 'EqualPrecedenceConflict' }
	return { state: 'Selected', assignment: winner }
}
