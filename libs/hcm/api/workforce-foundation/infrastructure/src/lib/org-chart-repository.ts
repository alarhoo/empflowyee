import { sql, type RawBuilder } from 'kysely'
import {
	classifyConstraint,
	cursorBinding,
	decodeCursor,
	keysetPage,
	likePattern,
	prefixPattern,
} from '@empflowyee/hcm-api-database-kysely'
import type { HcmPage } from '@empflowyee/hcm-runtime-contract'
import type {
	OrgChartQuery,
	OrgChartSearchQuery,
} from '@empflowyee/hcm-workforce-foundation-contract'
import type {
	OrgChartRepository,
	OrgChartRow,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import { personSearchText } from '@empflowyee/hcm-api-workforce-foundation-domain'
import type { WorkforceScope } from './structure-repository'

/** Engaged workers appear in the chart; Pending and Ended employments never do. */
const CHART_STATUSES = sql`('Active','OnNotice','Suspended')`

/** Read-only org chart projections over current established assignments. */
export class KyselyOrgChartRepository implements OrgChartRepository {
	/** Bind to the authorized transaction. */
	constructor(private readonly scope: WorkforceScope) {}

	/** Execute one query and classify integrity failures safely. */
	private async run<T>(query: RawBuilder<T>): Promise<T[]> {
		try {
			return (await query.execute(this.scope.executor)).rows
		} catch (error) {
			return classifyConstraint(error)
		}
	}

	/** Current engaged assignment rows with their structure names, manager and report counts. */
	private rowsAt(asOf: string): RawBuilder<OrgChartRow> {
		const t = this.scope.tenantId
		const d = sql`${asOf}::date`
		return sql<OrgChartRow>`SELECT a.id AS "assignmentId",e.worker_id AS "workerId",p.display_name AS "displayName",w.worker_code AS "workerCode",
			dsg.name AS designation,coalesce(ov.name,o.name) AS "organisationUnit",l.name AS location,dep.name AS department,e.work_email AS "workEmail",
			(SELECT count(*)::int FROM hcm.reporting_line r JOIN hcm.assignment ra ON ra.tenant_id=r.tenant_id AND ra.id=r.assignment_id JOIN hcm.employment re ON re.tenant_id=ra.tenant_id AND re.id=ra.employment_id
				WHERE r.tenant_id=a.tenant_id AND r.manager_assignment_id=a.id AND r.is_primary AND r.effective_period @> ${d} AND ra.effective_period @> ${d} AND re.employment_status IN ${CHART_STATUSES}) AS "directReportCount",
			CASE WHEN (SELECT count(*) FROM hcm.assignment a2 JOIN hcm.employment e2 ON e2.tenant_id=a2.tenant_id AND e2.id=a2.employment_id
				WHERE a2.tenant_id=a.tenant_id AND e2.worker_id=e.worker_id AND a2.effective_period @> ${d} AND e2.employment_status IN ${CHART_STATUSES}) > 1
				THEN coalesce(le.name,ov.name,o.name) END AS "concurrentContextLabel",
			m.manager_assignment_id AS "managerAssignmentId",mw.id AS "managerWorkerId",mp.display_name AS "managerDisplayName"
		FROM hcm.assignment a
		JOIN hcm.employment e ON e.tenant_id=a.tenant_id AND e.id=a.employment_id
		JOIN hcm.worker w ON w.tenant_id=e.tenant_id AND w.id=e.worker_id
		JOIN hcm.person p ON p.tenant_id=w.tenant_id AND p.id=w.person_id
		LEFT JOIN hcm.designation dsg ON dsg.tenant_id=a.tenant_id AND dsg.id=a.designation_id
		LEFT JOIN hcm.department dep ON dep.tenant_id=a.tenant_id AND dep.id=a.department_id
		LEFT JOIN hcm.location l ON l.tenant_id=a.tenant_id AND l.id=a.location_id
		LEFT JOIN hcm.organisation o ON o.tenant_id=a.tenant_id AND o.id=a.organisation_id
		LEFT JOIN hcm.organisation_version ov ON ov.tenant_id=a.tenant_id AND ov.organisation_id=a.organisation_id AND ov.effective_period @> ${d}
		LEFT JOIN hcm.legal_entity le ON le.tenant_id=e.tenant_id AND le.id=e.legal_entity_id
		LEFT JOIN hcm.reporting_line m ON m.tenant_id=a.tenant_id AND m.assignment_id=a.id AND m.is_primary AND m.effective_period @> ${d}
		LEFT JOIN hcm.assignment ma ON ma.tenant_id=m.tenant_id AND ma.id=m.manager_assignment_id
		LEFT JOIN hcm.employment me ON me.tenant_id=ma.tenant_id AND me.id=ma.employment_id
		LEFT JOIN hcm.worker mw ON mw.tenant_id=me.tenant_id AND mw.id=me.worker_id
		LEFT JOIN hcm.person mp ON mp.tenant_id=mw.tenant_id AND mp.id=mw.person_id
		WHERE a.tenant_id=${t} AND a.effective_period @> ${d} AND e.employment_status IN ${CHART_STATUSES}`
	}

	/** One keyset page of node rows matching a predicate, sorted by display name then assignment. */
	private async page(
		asOf: string,
		where: RawBuilder<unknown>,
		query: OrgChartQuery,
		binding: unknown[],
	): Promise<HcmPage<OrgChartRow>> {
		const key = cursorBinding([
			this.scope.tenantId,
			this.scope.accountId,
			asOf,
			query.limit,
			...binding,
		])
		const after = decodeCursor(query.cursor, key, 2)
		const rows = await this.run(
			sql<OrgChartRow>`SELECT * FROM (${this.rowsAt(asOf)}) n WHERE ${where} ${after ? sql`AND ("displayName" COLLATE "C","assignmentId" COLLATE "C") > (${after[0]} COLLATE "C",${after[1]} COLLATE "C")` : sql``} ORDER BY "displayName" COLLATE "C","assignmentId" COLLATE "C" LIMIT ${query.limit + 1}`,
		)
		return keysetPage(
			rows,
			query.limit,
			key,
			/** Continue after the last node. */ (row) => [row.displayName, row.assignmentId],
		)
	}

	/** Current primary assignments without a current primary solid manager line. */
	roots(asOf: string, query: OrgChartQuery): Promise<HcmPage<OrgChartRow>> {
		return this.page(
			asOf,
			sql`n."managerAssignmentId" IS NULL AND EXISTS (SELECT 1 FROM hcm.assignment pa WHERE pa.tenant_id=${this.scope.tenantId} AND pa.id=n."assignmentId" AND pa.is_primary_assignment)`,
			query,
			['roots'],
		)
	}

	/** Assignments whose current primary solid line points to an assignment. */
	reports(assignmentId: string, asOf: string, query: OrgChartQuery): Promise<HcmPage<OrgChartRow>> {
		return this.page(asOf, sql`n."managerAssignmentId"=${assignmentId}`, query, [
			'reports',
			assignmentId,
		])
	}

	/** One current assignment. */
	async node(assignmentId: string, asOf: string): Promise<OrgChartRow | undefined> {
		return (
			await this.run(
				sql<OrgChartRow>`SELECT * FROM (${this.rowsAt(asOf)}) n WHERE n."assignmentId"=${assignmentId}`,
			)
		)[0]
	}

	/** Several current assignments in the given order. */
	async nodes(assignmentIds: readonly string[], asOf: string): Promise<OrgChartRow[]> {
		if (!assignmentIds.length) return []
		const rows = await this.run(
			sql<OrgChartRow>`SELECT * FROM (${this.rowsAt(asOf)}) n WHERE n."assignmentId" = ANY(${[...assignmentIds]}::text[])`,
		)
		const byId = new Map(rows.map(/** Index. */ (row) => [row.assignmentId, row]))
		return assignmentIds.flatMap(/** Keep path order. */ (id) => byId.get(id) ?? [])
	}

	/** Ancestors from a root to the node; null when a cycle or the depth bound stops the walk. */
	async path(assignmentId: string, asOf: string, depth: number): Promise<string[] | null> {
		const t = this.scope.tenantId
		const rows = await this.run(
			sql<{
				id: string
				depth: number
				open: boolean
			}>`WITH RECURSIVE up(id,depth,trail) AS (
				SELECT ${assignmentId}::text,0,ARRAY[${assignmentId}::text]
				UNION ALL
				SELECT r.manager_assignment_id,up.depth+1,up.trail||r.manager_assignment_id FROM up
				JOIN hcm.reporting_line r ON r.tenant_id=${t} AND r.assignment_id=up.id AND r.is_primary AND r.effective_period @> ${asOf}::date
				WHERE up.depth < ${depth} AND NOT r.manager_assignment_id = ANY(up.trail)
			)
			SELECT id,depth,EXISTS (SELECT 1 FROM hcm.reporting_line r WHERE r.tenant_id=${t} AND r.assignment_id=up.id AND r.is_primary AND r.effective_period @> ${asOf}::date) AS open
			FROM up ORDER BY depth`,
		)
		const top = rows[rows.length - 1]
		if (!top || top.open) return null
		return rows.map(/** Id. */ (row) => row.id).reverse()
	}

	/** Current assignments matching a normalized name or a worker number prefix. */
	search(
		query: OrgChartSearchQuery,
		fields: { names: boolean; workerNumber: boolean },
		asOf: string,
	): Promise<HcmPage<OrgChartRow>> {
		const t = this.scope.tenantId
		const name = likePattern(personSearchText(query.q))
		const number = prefixPattern(query.q)
		const byName = fields.names
			? sql`EXISTS (SELECT 1 FROM hcm.worker sw JOIN hcm.person sp ON sp.tenant_id=sw.tenant_id AND sp.id=sw.person_id WHERE sw.tenant_id=${t} AND sw.id=n."workerId" AND sp.search_text LIKE ${name})`
			: sql`false`
		const byNumber = fields.workerNumber ? sql`n."workerCode" ILIKE ${number}` : sql`false`
		return this.page(asOf, sql`(${byName} OR ${byNumber})`, query, [
			'search',
			query.q,
			fields.names,
			fields.workerNumber,
		])
	}
}
