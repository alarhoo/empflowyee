import type {
	DirectoryAssignmentDto,
	DirectoryEntryDto,
	DirectoryPersonDto,
	ProfileFieldRef,
} from '@empflowyee/hcm-employee-contract'
import type { DirectoryRow } from '@empflowyee/hcm-api-workforce-foundation-application'

type Fields = ReadonlySet<ProfileFieldRef>

/** Whether a standard field is on the allowlist. */
function has(fields: Fields, code: string): boolean {
	return fields.has(`standard:${code}` as ProfileFieldRef)
}

/** Set a property only when the field is allowed and the value exists. */
function put<T extends object>(target: T, key: keyof T, allowed: boolean, value: unknown): void {
	if (allowed && value !== null && value !== undefined && value !== '')
		(target as Record<string, unknown>)[key as string] = value
}

/** Project a directory row onto an entry; omitted fields are never serialized. */
export function directoryEntry(row: DirectoryRow, fields: Fields): DirectoryEntryDto {
	const entry: DirectoryEntryDto = { workerId: row.workerId }
	put(entry, 'displayName', has(fields, 'display-name'), row.displayName)
	put(entry, 'preferredName', has(fields, 'preferred-name'), row.preferredName)
	put(entry, 'designation', has(fields, 'designation'), row.designation)
	put(entry, 'department', has(fields, 'department'), row.department)
	put(entry, 'location', has(fields, 'location'), row.location)
	put(entry, 'workEmail', has(fields, 'work-email'), row.workEmail)
	return entry
}

/** Project a row onto the person DTO with its reporting context and concurrent assignments. */
export function directoryPerson(
	row: DirectoryRow,
	fields: Fields,
	managerFields: Fields | undefined,
): DirectoryPersonDto {
	const person: DirectoryPersonDto = {
		...directoryEntry(row, fields),
		directReportCount: row.directReportCount,
		assignments: row.assignments.map(
			/** One assignment. */ (assignment) => {
				const dto: DirectoryAssignmentDto = {
					assignmentId: assignment.assignmentId,
					primary: assignment.isPrimary,
				}
				put(dto, 'designation', has(fields, 'designation'), assignment.designation)
				put(dto, 'organisationUnit', has(fields, 'organisation-unit'), assignment.organisationUnit)
				put(dto, 'department', has(fields, 'department'), assignment.department)
				put(dto, 'location', has(fields, 'location'), assignment.location)
				put(dto, 'legalEntity', has(fields, 'legal-entity'), assignment.legalEntity)
				return dto
			},
		),
	}
	put(person, 'workerNumber', has(fields, 'worker-number'), row.workerCode)
	put(person, 'organisationUnit', has(fields, 'organisation-unit'), row.organisationUnit)
	if (has(fields, 'manager')) {
		person.manager = null
		if (row.managerWorkerId) {
			person.manager = { workerId: row.managerWorkerId }
			if (managerFields && has(managerFields, 'display-name') && row.managerDisplayName)
				person.manager.displayName = row.managerDisplayName
		}
	}
	return person
}
