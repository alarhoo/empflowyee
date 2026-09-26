import {
	parseTeamQuery,
	parseWorkerId,
	type ProbationStatusKey,
	type ProfileFieldRef,
	type TeamMemberDto,
	type TeamMemberSummaryDto,
	type TeamPage,
} from '@empflowyee/hcm-employee-contract'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type { DirectoryRow } from '@empflowyee/hcm-api-workforce-foundation-application'
import type { EmployeeUnitOfWork, EmployeeWork } from './employee-unit'
import { allowedFilter } from './directory'
import { directoryPerson } from './directory-projection'

type Fields = ReadonlySet<ProfileFieldRef>
const READ = 'team.read'

/** Whether a standard field is on the allowlist. */
function has(fields: Fields, code: string): boolean {
	return fields.has(`standard:${code}` as ProfileFieldRef)
}

/** Set a property only when the field is allowed and the value exists. */
function put<T extends object>(target: T, key: keyof T, allowed: boolean, value: unknown): void {
	if (allowed && value !== null && value !== undefined && value !== '')
		(target as Record<string, unknown>)[key as string] = value
}

/** Project a row onto the team list entry through the Manager allowlist. */
export function teamSummary(row: DirectoryRow, fields: Fields): TeamMemberSummaryDto {
	const summary: TeamMemberSummaryDto = { workerId: row.workerId }
	put(summary, 'displayName', has(fields, 'display-name'), row.displayName)
	put(summary, 'preferredName', has(fields, 'preferred-name'), row.preferredName)
	put(summary, 'designation', has(fields, 'designation'), row.designation)
	put(summary, 'location', has(fields, 'location'), row.location)
	put(summary, 'employmentStatus', has(fields, 'employment-status'), row.facts.employmentStatus)
	put(
		summary,
		'probationStatus',
		has(fields, 'probation'),
		row.facts.probationStatus as ProbationStatusKey | null,
	)
	return summary
}

/** Project a row onto the team member detail through the Manager allowlist. */
export function teamMember(row: DirectoryRow, fields: Fields): TeamMemberDto {
	const facts = row.facts
	const person = directoryPerson(row, fields, undefined)
	const member: TeamMemberDto = { ...teamSummary(row, fields), assignments: person.assignments }
	put(member, 'workerNumber', has(fields, 'worker-number'), row.workerCode)
	put(member, 'workEmail', has(fields, 'work-email'), row.workEmail)
	put(member, 'department', has(fields, 'department'), row.department)
	put(member, 'organisationUnit', has(fields, 'organisation-unit'), row.organisationUnit)
	put(member, 'legalEntity', has(fields, 'legal-entity'), facts.legalEntity)
	put(member, 'workerType', has(fields, 'worker-type'), facts.workerType)
	put(member, 'employmentType', has(fields, 'employment-type'), facts.employmentType)
	put(member, 'hireDate', has(fields, 'hire-date'), facts.hireDate)
	put(
		member,
		'continuousServiceStartDate',
		has(fields, 'continuous-service-start-date'),
		facts.continuousServiceStartDate,
	)
	put(member, 'probationEndDate', has(fields, 'probation'), facts.probationEndDate)
	put(member, 'noticePeriodDays', has(fields, 'notice-period'), facts.noticePeriodDays)
	put(member, 'workMode', has(fields, 'work-mode'), facts.workMode)
	put(member, 'fullTimeEquivalent', has(fields, 'full-time-equivalent'), facts.fullTimeEquivalent)
	put(member, 'standardHoursPerWeek', has(fields, 'standard-hours'), facts.standardHoursPerWeek)
	put(member, 'costCentre', has(fields, 'cost-centre'), facts.costCentre)
	return member
}

/** Team Directory: the actor's direct reports (DEC-HCM2-015) with Manager-visible fields. */
export class TeamDirectory {
	/** Bind the use cases to the employee unit of work. */
	constructor(private readonly unit: EmployeeUnitOfWork) {}

	/** One page of the actor's team. */
	list(context: AuthenticatedHcmContext, params: URLSearchParams): Promise<TeamPage> {
		const query = parseTeamQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Resolve the team, then page it. */ async (w) => {
				const team = await w.team.resolve(w.accountId, w.today)
				if (!team.workerIds.length) return { items: [], nextCursor: null }
				const filter = await allowedFilter(
					w,
					'Manager',
					{
						q: query.q,
						limit: query.limit,
						descending: false,
						...(query.locationId ? { locationId: query.locationId } : {}),
					},
					{ workerIds: team.workerIds },
				)
				if (query.probationStatus) {
					const visible = await w.visibility.baseline('Manager')
					if (!visible.has('standard:probation'))
						throw new HcmDomainError('invalid-request', [
							{ field: 'probationStatus', code: 'not-visible' },
						])
					filter.probationStatus = query.probationStatus
				}
				const page = await w.directory.entries(filter, w.today, {
					limit: query.limit,
					descending: false,
					...(query.cursor ? { cursor: query.cursor } : {}),
				})
				const fields = await w.visibility.visibleFields(
					'Manager',
					page.items.map(/** Worker. */ (row) => row.workerId),
				)
				return {
					items: page.items.map(
						/** One member. */ (row) => teamSummary(row, fields.get(row.workerId) ?? new Set()),
					),
					nextCursor: page.nextCursor,
				}
			},
		)
	}

	/** One team member; a worker outside the actor's team is not found. */
	member(context: AuthenticatedHcmContext, workerId: string): Promise<TeamMemberDto> {
		const id = parseWorkerId(workerId)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Check scope, then read. */ async (w) => {
				if (!(await w.team.includes(w.accountId, id, w.today)))
					throw new HcmDomainError('not-found')
				const row = await this.require(w, id)
				const fields = await w.visibility.visibleFields('Manager', [id])
				return teamMember(row, fields.get(id) ?? new Set())
			},
		)
	}

	/** A current-workforce entry, or not-found. */
	private async require(w: EmployeeWork, id: string): Promise<DirectoryRow> {
		const row = await w.directory.entry(id, w.today)
		if (!row) throw new HcmDomainError('not-found')
		return row
	}
}
