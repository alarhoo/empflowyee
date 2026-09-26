import {
	parseDirectoryOptionKind,
	parseDirectoryOptionQuery,
	parseDirectoryQuery,
	parseDirectoryReportsQuery,
	parseWorkerId,
	type DirectoryOptionPage,
	type DirectoryPage,
	type DirectoryPersonDto,
	type DirectoryQuery,
	type ProfileFieldRef,
	type ViewerRelation,
} from '@empflowyee/hcm-employee-contract'
import { HcmDomainError, type HcmPage } from '@empflowyee/hcm-runtime-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type {
	DirectoryFilter,
	DirectoryRow,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import type { EmployeeUnitOfWork, EmployeeWork } from './employee-unit'
import { directoryEntry, directoryPerson } from './directory-projection'

const READ = 'directory.read'
const FILTER_FIELDS = {
	unitId: 'organisation-unit',
	departmentId: 'department',
	locationId: 'location',
	designationId: 'designation',
} as const

/** Build a filter whose search and structure predicates use only fields the relation may see. */
export async function allowedFilter(
	w: EmployeeWork,
	relation: ViewerRelation,
	query: DirectoryQuery,
	scope: Pick<DirectoryFilter, 'workerIds' | 'reportsOf'> = {},
): Promise<DirectoryFilter> {
	const visible = await w.visibility.baseline(relation)
	const filter: DirectoryFilter = { ...scope }
	for (const [key, code] of Object.entries(FILTER_FIELDS) as [
		keyof typeof FILTER_FIELDS,
		string,
	][]) {
		const value = query[key]
		if (value === undefined) continue
		if (!visible.has(`standard:${code}` as ProfileFieldRef))
			throw new HcmDomainError('invalid-request', [{ field: key, code: 'not-visible' }])
		filter[key] = value
	}
	if (query.q) {
		const searchable = await w.visibility.searchable(relation)
		filter.search = {
			text: query.q,
			names: searchable.has('standard:display-name') || searchable.has('standard:preferred-name'),
			workEmail: searchable.has('standard:work-email'),
			workerNumber: searchable.has('standard:worker-number'),
		}
	}
	return filter
}

/** Project one page through the per-worker allowlist of a relation. */
export async function projectPage(
	w: EmployeeWork,
	relation: ViewerRelation,
	page: HcmPage<DirectoryRow>,
): Promise<DirectoryPage> {
	const fields = await w.visibility.visibleFields(
		relation,
		page.items.map(/** Worker. */ (row) => row.workerId),
	)
	return {
		items: page.items.map(
			/** One entry. */ (row) => directoryEntry(row, fields.get(row.workerId) ?? new Set()),
		),
		nextCursor: page.nextCursor,
	}
}

/** Project one person through the relation's allowlist, with the manager's own allowlist. */
export async function projectPerson(
	w: EmployeeWork,
	relation: ViewerRelation,
	row: DirectoryRow,
	managerRelation: ViewerRelation = relation,
): Promise<DirectoryPersonDto> {
	const fields = await w.visibility.visibleFields(relation, [row.workerId])
	const manager = row.managerWorkerId
		? await w.visibility.visibleFields(managerRelation, [row.managerWorkerId])
		: undefined
	return directoryPerson(
		row,
		fields.get(row.workerId) ?? new Set(),
		row.managerWorkerId ? manager?.get(row.managerWorkerId) : undefined,
	)
}

/** Employee Directory: the current workforce with Organization-visible fields only. */
export class EmployeeDirectory {
	/** Bind the use cases to the employee unit of work. */
	constructor(private readonly unit: EmployeeUnitOfWork) {}

	/** One page of colleagues. */
	search(context: AuthenticatedHcmContext, params: URLSearchParams): Promise<DirectoryPage> {
		const query = parseDirectoryQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Search the directory. */ async (w) => {
				const filter = await allowedFilter(w, 'Organization', query)
				return projectPage(
					w,
					'Organization',
					await w.directory.entries(filter, w.today, {
						limit: query.limit,
						descending: query.descending,
						...(query.cursor ? { cursor: query.cursor } : {}),
					}),
				)
			},
		)
	}

	/** One colleague. */
	person(context: AuthenticatedHcmContext, workerId: string): Promise<DirectoryPersonDto> {
		const id = parseWorkerId(workerId)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Read one entry. */ async (w) =>
				projectPerson(w, 'Organization', await this.require(w, id)),
		)
	}

	/** One page of a colleague's direct reports. */
	reports(
		context: AuthenticatedHcmContext,
		workerId: string,
		params: URLSearchParams,
	): Promise<DirectoryPage> {
		const id = parseWorkerId(workerId)
		const query = parseDirectoryReportsQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Page the reports. */ async (w) => {
				await this.require(w, id)
				return projectPage(
					w,
					'Organization',
					await w.directory.entries({ reportsOf: id }, w.today, {
						limit: query.limit,
						descending: false,
						...(query.cursor ? { cursor: query.cursor } : {}),
					}),
				)
			},
		)
	}

	/** Filter options of a kind, only while that field is Organization-visible. */
	options(
		context: AuthenticatedHcmContext,
		kind: string,
		params: URLSearchParams,
	): Promise<DirectoryOptionPage> {
		const key = parseDirectoryOptionKind(kind)
		const query = parseDirectoryOptionQuery(params)
		const field: Record<typeof key, string> = {
			units: 'organisation-unit',
			departments: 'department',
			locations: 'location',
			designations: 'designation',
		}
		return this.unit.execute(
			context,
			READ,
			false,
			/** Read options. */ async (w) => {
				const visible = await w.visibility.baseline('Organization')
				if (!visible.has(`standard:${field[key]}` as ProfileFieldRef))
					return { items: [], nextCursor: null }
				return w.directory.options(key, query.q, w.today, {
					limit: query.limit,
					...(query.cursor ? { cursor: query.cursor } : {}),
				})
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
