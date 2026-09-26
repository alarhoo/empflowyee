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
	DirectoryFilter,
	DirectoryOptionKind,
	DirectoryOptionRow,
	DirectoryPageQuery,
	DirectoryRow,
	WorkforceDirectoryPort,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import { personSearchText } from '@empflowyee/hcm-api-workforce-foundation-domain'
import type { WorkforceScope } from './structure-repository'

/** The current workforce: open employments; Pending and Ended never appear. */
const DIRECTORY_STATUSES = sql`('Active','OnNotice','Suspended')`

/** Kysely projections of the current workforce for employee directories. */
export class KyselyWorkforceDirectory implements WorkforceDirectoryPort {
	/** Bind to the caller's authorized transaction. */
	constructor(private readonly scope: WorkforceScope) {}

	/** Execute one query and classify integrity failures safely. */
	private async run<T>(query: RawBuilder<T>): Promise<T[]> {
		try {
			return (await query.execute(this.scope.executor)).rows
		} catch (error) {
			return classifyConstraint(error)
		}
	}

	/** Current engaged assignments, ranked so rank 1 is the worker's primary placement. */
	private current(asOf: string): RawBuilder<unknown> {
		return sql`SELECT a.id,a.is_primary_assignment AS primary_assignment,e.worker_id,e.id AS employment_id,a.work_mode,a.full_time_equivalent,a.standard_hours_per_week,a.cost_center_code,a.designation_id,a.department_id,a.location_id,a.organisation_id,e.legal_entity_id,e.work_email,
			row_number() OVER (PARTITION BY e.worker_id ORDER BY a.is_primary_assignment DESC NULLS LAST,e.is_primary_employment DESC NULLS LAST,a.effective_from,a.id) AS rank
			FROM hcm.assignment a JOIN hcm.employment e ON e.tenant_id=a.tenant_id AND e.id=a.employment_id
			WHERE a.tenant_id=${this.scope.tenantId} AND a.effective_period @> ${asOf}::date AND e.employment_status IN ${DIRECTORY_STATUSES}`
	}

	/** One row per worker with the primary placement, manager, report count and all assignments. */
	private rows(asOf: string): RawBuilder<DirectoryRow & { searchText: string }> {
		const t = this.scope.tenantId
		const d = sql`${asOf}::date`
		/** Unit name at the date, falling back to the unit's own name. */
		const unit = (alias: string) =>
			sql`coalesce((SELECT v.name FROM hcm.organisation_version v WHERE v.tenant_id=${t} AND v.organisation_id=${sql.ref(alias + '.organisation_id')} AND v.effective_period @> ${d}),(SELECT o.name FROM hcm.organisation o WHERE o.tenant_id=${t} AND o.id=${sql.ref(alias + '.organisation_id')}))`
		/** Name of a referenced structure row. */
		const name = (table: string, alias: string, column: string) =>
			sql`(SELECT x.name FROM ${sql.table('hcm.' + table)} x WHERE x.tenant_id=${t} AND x.id=${sql.ref(alias + '.' + column)})`
		return sql<DirectoryRow & { searchText: string }>`WITH cur AS (${this.current(asOf)})
			SELECT c.worker_id AS "workerId",p.display_name AS "displayName",p.preferred_name AS "preferredName",p.search_text AS "searchText",wk.worker_code AS "workerCode",c.work_email AS "workEmail",
				${name('designation', 'c', 'designation_id')} AS designation,${unit('c')} AS "organisationUnit",${name('department', 'c', 'department_id')} AS department,${name('location', 'c', 'location_id')} AS location,
				mw.id AS "managerWorkerId",mp.display_name AS "managerDisplayName",
				(SELECT count(DISTINCT rc.worker_id)::int FROM hcm.reporting_line r JOIN cur rc ON rc.id=r.assignment_id
					WHERE r.tenant_id=${t} AND r.is_primary AND r.effective_period @> ${d} AND r.manager_assignment_id IN (SELECT cm.id FROM cur cm WHERE cm.worker_id=c.worker_id)) AS "directReportCount",
				(SELECT jsonb_agg(jsonb_build_object('assignmentId',ca.id,'isPrimary',coalesce(ca.primary_assignment,false),'designation',${name('designation', 'ca', 'designation_id')},'organisationUnit',${unit('ca')},'department',${name('department', 'ca', 'department_id')},'location',${name('location', 'ca', 'location_id')},'legalEntity',${name('legal_entity', 'ca', 'legal_entity_id')}) ORDER BY ca.rank)
					FROM cur ca WHERE ca.worker_id=c.worker_id) AS assignments,
				jsonb_build_object('workerType',(SELECT wt.name FROM hcm.worker_type wt WHERE wt.tenant_id=${t} AND wt.id=wk.worker_type_id),
					'employmentType',ep.employment_type,'employmentStatus',ep.employment_status,
					'hireDate',to_char(ep.hire_date,'YYYY-MM-DD'),'continuousServiceStartDate',to_char(ep.continuous_service_start_date,'YYYY-MM-DD'),
					'probationStatus',ep.probation_status,'probationEndDate',to_char(ep.probation_end_date,'YYYY-MM-DD'),'noticePeriodDays',ep.notice_period_days,
					'legalEntity',${name('legal_entity', 'ep', 'legal_entity_id')},'workMode',c.work_mode,'fullTimeEquivalent',c.full_time_equivalent::float8,
					'standardHoursPerWeek',c.standard_hours_per_week::float8,'costCentre',nullif(c.cost_center_code,'')) AS facts
			FROM cur c
			JOIN hcm.worker wk ON wk.tenant_id=${t} AND wk.id=c.worker_id
			JOIN hcm.person p ON p.tenant_id=wk.tenant_id AND p.id=wk.person_id
			JOIN hcm.employment ep ON ep.tenant_id=${t} AND ep.id=c.employment_id
			LEFT JOIN hcm.reporting_line m ON m.tenant_id=${t} AND m.assignment_id=c.id AND m.is_primary AND m.effective_period @> ${d}
			LEFT JOIN cur mc ON mc.id=m.manager_assignment_id
			LEFT JOIN hcm.worker mw ON mw.tenant_id=${t} AND mw.id=mc.worker_id
			LEFT JOIN hcm.person mp ON mp.tenant_id=mw.tenant_id AND mp.id=mw.person_id
			WHERE c.rank=1`
	}

	/** Predicates of a filter; searches only the fields the caller's allowlist permits. */
	private where(filter: DirectoryFilter, asOf: string): RawBuilder<unknown> {
		const t = this.scope.tenantId
		const parts: RawBuilder<unknown>[] = [sql`true`]
		/** The worker has a current assignment placed on this structure row. */
		const placed = (column: string, id: string) =>
			sql`EXISTS (SELECT 1 FROM hcm.assignment fa JOIN hcm.employment fe ON fe.tenant_id=fa.tenant_id AND fe.id=fa.employment_id WHERE fa.tenant_id=${t} AND fe.worker_id=n."workerId" AND fa.effective_period @> ${asOf}::date AND ${sql.ref('fa.' + column)}=${id})`
		if (filter.unitId) parts.push(placed('organisation_id', filter.unitId))
		if (filter.departmentId) parts.push(placed('department_id', filter.departmentId))
		if (filter.locationId) parts.push(placed('location_id', filter.locationId))
		if (filter.designationId) parts.push(placed('designation_id', filter.designationId))
		if (filter.probationStatus)
			parts.push(sql`n.facts->>'probationStatus'=${filter.probationStatus}`)
		if (filter.workerIds) parts.push(sql`n."workerId" = ANY(${[...filter.workerIds]}::text[])`)
		if (filter.reportsOf)
			parts.push(sql`EXISTS (SELECT 1 FROM hcm.reporting_line r JOIN hcm.assignment ra ON ra.tenant_id=r.tenant_id AND ra.id=r.assignment_id JOIN hcm.employment re ON re.tenant_id=ra.tenant_id AND re.id=ra.employment_id
				JOIN hcm.assignment ma ON ma.tenant_id=r.tenant_id AND ma.id=r.manager_assignment_id JOIN hcm.employment me ON me.tenant_id=ma.tenant_id AND me.id=ma.employment_id
				WHERE r.tenant_id=${t} AND r.is_primary AND r.effective_period @> ${asOf}::date AND ra.effective_period @> ${asOf}::date AND ma.effective_period @> ${asOf}::date
				AND re.worker_id=n."workerId" AND me.worker_id=${filter.reportsOf})`)
		const search = filter.search
		if (search) {
			const any: RawBuilder<unknown>[] = []
			if (search.names)
				any.push(sql`n."searchText" LIKE ${likePattern(personSearchText(search.text))}`)
			if (search.workEmail) any.push(sql`n."workEmail" ILIKE ${prefixPattern(search.text)}`)
			if (search.workerNumber) any.push(sql`n."workerCode" ILIKE ${prefixPattern(search.text)}`)
			parts.push(any.length ? sql`(${sql.join(any, sql` OR `)})` : sql`false`)
		}
		return sql.join(parts, sql` AND `)
	}

	/** One page of entries sorted by display name then worker id. */
	async entries(
		filter: DirectoryFilter,
		asOf: string,
		page: DirectoryPageQuery,
	): Promise<HcmPage<DirectoryRow>> {
		const key = cursorBinding([
			this.scope.tenantId,
			this.scope.accountId,
			asOf,
			filter,
			page.limit,
			page.descending,
		])
		const after = decodeCursor(page.cursor, key, 2)
		const direction = page.descending ? sql`DESC` : sql`ASC`
		const compare = page.descending ? sql`<` : sql`>`
		const rows = await this.run(
			sql<DirectoryRow>`SELECT * FROM (${this.rows(asOf)}) n WHERE ${this.where(filter, asOf)}
				${after ? sql`AND ("displayName" COLLATE "C","workerId" COLLATE "C") ${compare} (${after[0]} COLLATE "C",${after[1]} COLLATE "C")` : sql``}
				ORDER BY "displayName" COLLATE "C" ${direction},"workerId" COLLATE "C" ${direction} LIMIT ${page.limit + 1}`,
		)
		return keysetPage(
			rows,
			page.limit,
			key,
			/** Continue after the last entry. */ (row) => [row.displayName, row.workerId],
		)
	}

	/** One entry of the current workforce. */
	async entry(workerId: string, asOf: string): Promise<DirectoryRow | undefined> {
		return (
			await this.run(
				sql<DirectoryRow>`SELECT * FROM (${this.rows(asOf)}) n WHERE n."workerId"=${workerId}`,
			)
		)[0]
	}

	/** One page of active structure options of a kind, matched by name. */
	async options(
		kind: DirectoryOptionKind,
		q: string,
		asOf: string,
		page: { limit: number; cursor?: string },
	): Promise<HcmPage<DirectoryOptionRow>> {
		const t = this.scope.tenantId
		const tables: Record<DirectoryOptionKind, string> = {
			units: 'organisation',
			departments: 'department',
			locations: 'location',
			designations: 'designation',
		}
		const label =
			kind === 'units'
				? sql`coalesce((SELECT v.name FROM hcm.organisation_version v WHERE v.tenant_id=x.tenant_id AND v.organisation_id=x.id AND v.effective_period @> ${asOf}::date),x.name)`
				: sql`x.name`
		const key = cursorBinding([t, this.scope.accountId, 'options', kind, q, page.limit])
		const after = decodeCursor(page.cursor, key, 2)
		const rows = await this.run(
			sql<DirectoryOptionRow>`SELECT * FROM (SELECT x.id,${label} AS name FROM ${sql.table('hcm.' + tables[kind])} x WHERE x.tenant_id=${t} AND x.is_active) o
				WHERE ${q ? sql`o.name ILIKE ${likePattern(q)}` : sql`true`}
				${after ? sql`AND (o.name COLLATE "C",o.id COLLATE "C") > (${after[0]} COLLATE "C",${after[1]} COLLATE "C")` : sql``}
				ORDER BY o.name COLLATE "C",o.id COLLATE "C" LIMIT ${page.limit + 1}`,
		)
		return keysetPage(
			rows,
			page.limit,
			key,
			/** Continue after the last option. */ (row) => [row.name, row.id],
		)
	}
}
