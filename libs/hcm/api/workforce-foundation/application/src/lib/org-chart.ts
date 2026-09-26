import {
	parseAssignmentId,
	parseOrgChartQuery,
	parseOrgChartSearch,
	type OrgChartNodeDto,
	type OrgChartPage,
	type OrgChartPersonDto,
	type OrgChartQuery,
	type OrgChartSearchQuery,
} from '@empflowyee/hcm-workforce-foundation-contract'
import { HcmDomainError, type HcmPage } from '@empflowyee/hcm-runtime-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type { OrgChartField, OrgChartFieldPolicy } from './workforce-ports'
import type { WorkforceUnitOfWork, WorkforceWork } from './structure'

/** One assignment row before field policy is applied. */
export interface OrgChartRow {
	assignmentId: string
	workerId: string
	displayName: string
	workerCode: string
	designation: string | null
	organisationUnit: string | null
	location: string | null
	department: string | null
	workEmail: string | null
	directReportCount: number
	concurrentContextLabel: string | null
	managerAssignmentId: string | null
	managerWorkerId: string | null
	managerDisplayName: string | null
}

/** Read-only org chart projections of engaged workers' current assignments on a date. */
export interface OrgChartRepository {
	/** Current primary assignments without a current primary solid manager line. */
	roots(asOf: string, query: OrgChartQuery): Promise<HcmPage<OrgChartRow>>
	/** Assignments whose current primary solid line points to an assignment. */
	reports(assignmentId: string, asOf: string, query: OrgChartQuery): Promise<HcmPage<OrgChartRow>>
	/** One current assignment, or undefined when absent, ended or foreign. */
	node(assignmentId: string, asOf: string): Promise<OrgChartRow | undefined>
	/** Ancestor assignment ids from a root to the node; null when the data contains a cycle. */
	path(assignmentId: string, asOf: string, depth: number): Promise<string[] | null>
	/** Several current assignments in the given order. */
	nodes(assignmentIds: readonly string[], asOf: string): Promise<OrgChartRow[]>
	/** Current assignments matching a normalized name or a worker number prefix. */
	search(
		query: OrgChartSearchQuery,
		fields: { names: boolean; workerNumber: boolean },
		asOf: string,
	): Promise<HcmPage<OrgChartRow>>
}

const READ = 'org-chart.read'
const MAX_DEPTH = 50

/** Org Chart use cases: informational, Organization-visible fields only, no actions. */
export class OrgChart {
	/** Bind the use cases to the workforce unit of work. */
	constructor(private readonly unit: WorkforceUnitOfWork) {}

	/** Root nodes. */
	roots(context: AuthenticatedHcmContext, params: URLSearchParams): Promise<OrgChartPage> {
		const query = parseOrgChartQuery(params)
		return this.read(
			context,
			/** Page roots. */ async (w, policy) =>
				this.page(policy, await w.orgChart.roots(w.today, query)),
		)
	}

	/** Direct reports of a node. */
	reports(
		context: AuthenticatedHcmContext,
		assignmentId: string,
		params: URLSearchParams,
	): Promise<OrgChartPage> {
		const id = parseAssignmentId(assignmentId)
		const query = parseOrgChartQuery(params)
		return this.read(
			context,
			/** Page reports of a visible node. */ async (w, policy) => {
				await this.require(w, id)
				return this.page(policy, await w.orgChart.reports(id, w.today, query))
			},
		)
	}

	/** One node with its Organization-visible details. */
	node(context: AuthenticatedHcmContext, assignmentId: string): Promise<OrgChartPersonDto> {
		const id = parseAssignmentId(assignmentId)
		return this.read(
			context,
			/** Read one node. */ async (w, policy) => {
				const row = await this.require(w, id)
				const workers = [row.workerId, ...(row.managerWorkerId ? [row.managerWorkerId] : [])]
				const fields = await policy.organizationFields(workers)
				const own = fields.get(row.workerId) ?? new Set<OrgChartField>()
				const person: OrgChartPersonDto = this.projectRow(row, own)
				if (own.has('worker-number')) person.workerNumber = row.workerCode
				if (own.has('department') && row.department) person.department = row.department
				if (own.has('work-email') && row.workEmail) person.workEmail = row.workEmail
				if (own.has('manager')) {
					const manager = row.managerWorkerId ? fields.get(row.managerWorkerId) : undefined
					person.manager = null
					if (row.managerAssignmentId) {
						person.manager = { assignmentId: row.managerAssignmentId }
						if (manager?.has('display-name') && row.managerDisplayName)
							person.manager.displayName = row.managerDisplayName
					}
				}
				return person
			},
		)
	}

	/** The ancestor path from a root to the node, bounded to 50 levels. */
	path(
		context: AuthenticatedHcmContext,
		assignmentId: string,
	): Promise<{ items: OrgChartNodeDto[] }> {
		const id = parseAssignmentId(assignmentId)
		return this.read(
			context,
			/** Resolve the path. */ async (w, policy) => {
				await this.require(w, id)
				const ids = await w.orgChart.path(id, w.today, MAX_DEPTH)
				if (!ids) throw new HcmDomainError('invalid-state')
				return { items: await this.projectRows(policy, await w.orgChart.nodes(ids, w.today)) }
			},
		)
	}

	/** Search by name or worker number prefix, only where those fields are Organization-searchable. */
	search(context: AuthenticatedHcmContext, params: URLSearchParams): Promise<OrgChartPage> {
		const query = parseOrgChartSearch(params)
		return this.read(
			context,
			/** Search visible fields. */ async (w, policy) => {
				const searchable = await policy.searchable()
				const fields = {
					names: searchable.has('display-name') || searchable.has('preferred-name'),
					workerNumber: searchable.has('worker-number'),
				}
				if (!fields.names && !fields.workerNumber) return { items: [], nextCursor: null }
				return this.page(policy, await w.orgChart.search(query, fields, w.today))
			},
		)
	}

	/** A current node, or not-found. */
	private async require(w: WorkforceWork, id: string): Promise<OrgChartRow> {
		const row = await w.orgChart.node(id, w.today)
		if (!row) throw new HcmDomainError('not-found')
		return row
	}

	/** Apply one worker's Organization allowlist; absent fields are omitted, never null. */
	private projectRow(row: OrgChartRow, fields: ReadonlySet<OrgChartField>): OrgChartNodeDto {
		const node: OrgChartNodeDto = {
			assignmentId: row.assignmentId,
			workerId: row.workerId,
			directReportCount: row.directReportCount,
			concurrentContextLabel: row.concurrentContextLabel,
		}
		if (fields.has('display-name')) node.displayName = row.displayName
		if (fields.has('designation') && row.designation) node.designation = row.designation
		if (fields.has('organisation-unit') && row.organisationUnit)
			node.organisationUnit = row.organisationUnit
		if (fields.has('location') && row.location) node.location = row.location
		return node
	}

	/** Project rows through the policy with one allowlist lookup. */
	private async projectRows(
		policy: OrgChartFieldPolicy,
		rows: OrgChartRow[],
	): Promise<OrgChartNodeDto[]> {
		const fields = await policy.organizationFields(rows.map(/** Worker. */ (row) => row.workerId))
		return rows.map(
			/** One node. */ (row) => this.projectRow(row, fields.get(row.workerId) ?? new Set()),
		)
	}

	/** Project one page. */
	private async page(
		policy: OrgChartFieldPolicy,
		page: HcmPage<OrgChartRow>,
	): Promise<OrgChartPage> {
		return { items: await this.projectRows(policy, page.items), nextCursor: page.nextCursor }
	}

	/** Run a read with the field policy bound to the same transaction. */
	private read<T>(
		context: AuthenticatedHcmContext,
		work: (w: WorkforceWork, policy: OrgChartFieldPolicy) => Promise<T>,
	): Promise<T> {
		return this.unit.execute(
			context,
			READ,
			false,
			/** Require the policy. */ (w) => {
				if (!w.orgChartPolicy) throw new Error('Org chart field policy unavailable')
				return work(w, w.orgChartPolicy)
			},
		)
	}
}
