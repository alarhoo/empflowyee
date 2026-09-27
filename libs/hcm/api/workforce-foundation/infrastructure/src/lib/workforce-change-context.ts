import { sql, type RawBuilder } from 'kysely'
import { classifyConstraint } from '@empflowyee/hcm-api-database-kysely'
import type {
	WorkerChangeContext,
	WorkforceChangeContextPort,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import type { WorkforceScope } from './structure-repository'

/** An ISO date column. */
const date = (column: string) => sql`to_char(${sql.ref(column)},'YYYY-MM-DD')`

/** Current employment and assignment facts for change requests, in the caller's transaction. */
export class KyselyWorkforceChangeContext implements WorkforceChangeContextPort {
	/** Bind to the authorized tenant transaction. */
	constructor(private readonly scope: WorkforceScope) {}

	/** Execute one query and classify integrity failures safely. */
	private async run<T>(query: RawBuilder<T>): Promise<T[]> {
		try {
			return (await query.execute(this.scope.executor)).rows
		} catch (error) {
			return classifyConstraint(error)
		}
	}

	/** A reference object of a structure row, or null. */
	private ref(table: string, column: string): RawBuilder<unknown> {
		const t = this.scope.tenantId
		return sql`(SELECT jsonb_build_object('id',x.id,'name',x.name) FROM ${sql.table('hcm.' + table)} x WHERE x.tenant_id=${t} AND x.id=${sql.ref(column)})`
	}

	/** A worker's current facts on a date; merged-away workers are not returned. */
	async context(workerId: string, asOf: string): Promise<WorkerChangeContext | undefined> {
		const t = this.scope.tenantId
		const d = sql`${asOf}::date`
		const [worker] = await this.run(
			sql<{
				workerId: string
				personId: string
				displayName: string
				workerNumber: string
				workerType: { id: string; name: string } | null
			}>`SELECT w.id AS "workerId",p.id AS "personId",p.display_name AS "displayName",w.worker_code AS "workerNumber",${this.ref('worker_type', 'w.worker_type_id')} AS "workerType"
				FROM hcm.worker w JOIN hcm.person p ON p.tenant_id=w.tenant_id AND p.id=w.person_id
				WHERE w.tenant_id=${t} AND w.id=${workerId} AND p.merged_into_person_id IS NULL`,
		)
		if (!worker) return undefined
		const employments = await this.run(
			sql<
				WorkerChangeContext['employments'][number]
			>`SELECT e.id AS "employmentId",e.revision,coalesce(e.is_primary_employment,false) AS primary,e.employment_sequence AS sequence,
				${this.ref('legal_entity', 'e.legal_entity_id')} AS "legalEntity",e.employment_type AS "employmentType",e.employment_status AS "employmentStatus",
				${date('e.hire_date')} AS "hireDate",${date('e.employment_end_date')} AS "endDate",${date('e.continuous_service_start_date')} AS "continuousServiceStartDate",
				${date('e.probation_end_date')} AS "probationEndDate",e.notice_period_days AS "noticePeriodDays",e.is_eligible_for_rehire AS "eligibleForRehire",
				(e.hire_date IS NOT NULL AND e.employment_status IS NOT NULL) AS established
				FROM hcm.employment e WHERE e.tenant_id=${t} AND e.worker_id=${workerId}
				ORDER BY e.hire_date NULLS FIRST,e.id`,
		)
		const assignments = await this.run(
			sql<
				WorkerChangeContext['assignments'][number]
			>`SELECT a.id AS "assignmentId",a.employment_id AS "employmentId",a.revision,coalesce(a.is_primary_assignment,false) AS primary,
				${date('a.effective_from')} AS "effectiveFrom",${date('a.effective_to')} AS "effectiveTo",
				${this.ref('organisation', 'a.organisation_id')} AS unit,${this.ref('department', 'a.department_id')} AS department,
				${this.ref('designation', 'a.designation_id')} AS designation,${this.ref('location', 'a.location_id')} AS location,
				${this.ref('position', 'a.position_id')} AS position,a.job_title AS "jobTitle",a.work_mode AS "workMode",
				a.full_time_equivalent::float8 AS "fullTimeEquivalent",a.standard_hours_per_week::float8 AS "standardHoursPerWeek",a.cost_center_code AS "costCenterCode",coalesce(a.is_billable,false) AS billable,
				(SELECT jsonb_build_object('id',mw.id,'name',mp.display_name,'assignmentId',l.manager_assignment_id)
					FROM hcm.reporting_line l
					JOIN hcm.assignment ma ON ma.tenant_id=l.tenant_id AND ma.id=l.manager_assignment_id
					JOIN hcm.employment me ON me.tenant_id=ma.tenant_id AND me.id=ma.employment_id
					JOIN hcm.worker mw ON mw.tenant_id=me.tenant_id AND mw.id=me.worker_id
					JOIN hcm.person mp ON mp.tenant_id=mw.tenant_id AND mp.id=mw.person_id
					WHERE l.tenant_id=${t} AND l.assignment_id=a.id AND l.is_primary
						AND l.effective_period @> greatest(${d},a.effective_from)) AS manager
				FROM hcm.assignment a JOIN hcm.employment e ON e.tenant_id=a.tenant_id AND e.id=a.employment_id
				WHERE a.tenant_id=${t} AND e.worker_id=${workerId} AND a.superseded_by_id IS NULL
					AND (a.effective_to IS NULL OR a.effective_to >= ${d})
				ORDER BY a.effective_from NULLS FIRST,a.id`,
		)
		return { ...worker, employments, assignments }
	}

	/** Lock an employment and return its revision and worker. */
	async lockEmployment(
		employmentId: string,
	): Promise<{ workerId: string; revision: number; established: boolean } | undefined> {
		const [row] = await this.run(
			sql<{
				workerId: string
				revision: number
				established: boolean
			}>`SELECT worker_id AS "workerId",revision,(hire_date IS NOT NULL AND employment_status IS NOT NULL) AS established FROM hcm.employment WHERE tenant_id=${this.scope.tenantId} AND id=${employmentId} FOR UPDATE`,
		)
		return row
	}

	/** Lock an assignment and return its revision, employment and whether it is still open. */
	async lockAssignment(assignmentId: string) {
		const [row] = await this.run(
			sql<{
				employmentId: string
				revision: number
				established: boolean
				open: boolean
			}>`SELECT employment_id AS "employmentId",revision,effective_from IS NOT NULL AS established,(superseded_by_id IS NULL AND effective_to IS NULL) AS open FROM hcm.assignment WHERE tenant_id=${this.scope.tenantId} AND id=${assignmentId} FOR UPDATE`,
		)
		return row
	}

	/** The primary assignment of a worker effective on a date, for a manager line. */
	async primaryAssignment(workerId: string, asOf: string): Promise<string | undefined> {
		const [row] = await this.run(
			sql<{
				id: string
			}>`SELECT a.id FROM hcm.assignment a JOIN hcm.employment e ON e.tenant_id=a.tenant_id AND e.id=a.employment_id
				WHERE a.tenant_id=${this.scope.tenantId} AND e.worker_id=${workerId} AND a.is_primary_assignment AND e.is_primary_employment
					AND a.effective_period @> ${asOf}::date ORDER BY a.id LIMIT 1`,
		)
		return row?.id
	}

	/** The worker holding an assignment. */
	async assignmentWorker(assignmentId: string): Promise<string | undefined> {
		const [row] = await this.run(
			sql<{
				workerId: string
			}>`SELECT e.worker_id AS "workerId" FROM hcm.assignment a JOIN hcm.employment e ON e.tenant_id=a.tenant_id AND e.id=a.employment_id WHERE a.tenant_id=${this.scope.tenantId} AND a.id=${assignmentId}`,
		)
		return row?.workerId
	}
}
