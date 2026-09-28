import { sql, type Kysely } from 'kysely'
import type { AttendanceConfigurationFamily } from '@empflowyee/hcm-api-attendance-application'
import { dateValue, idValue } from '@empflowyee/hcm-runtime-contract'
import type {
	AttendanceEmploymentScope,
	DatedConfigurationAssignment,
} from '@empflowyee/hcm-api-attendance-domain'

const families = {
	Schedule: 'work_schedule',
	Policy: 'attendance_policy',
	Holiday: 'holiday_calendar',
} as const
export type { AttendanceConfigurationFamily } from '@empflowyee/hcm-api-attendance-application'

/** Scope-filter configuration inputs before domain selection; this reader does not grant permission or choose a conflicting winner. */
export class KyselyAttendanceAssignmentReader {
	/** Bind the existing authorized tenant transaction and retain RLS for every selected family. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenantId: string,
	) {
		idValue(tenantId, 'tenantId')
		if (!transaction.isTransaction)
			throw new Error('Configuration selection requires a tenant transaction')
	}

	/** Return only published, covering assignments that match the selected employment's authoritative dated workforce scope. */
	async matching(
		family: AttendanceConfigurationFamily,
		workDate: string,
		scope: AttendanceEmploymentScope,
	): Promise<DatedConfigurationAssignment[]> {
		dateValue(workDate, 'workDate')
		const owner = Object.hasOwn(families, family) ? families[family] : undefined
		if (!owner) throw new Error('Unsupported attendance configuration family')
		const assignmentIds = scope.assignments.map(
			/** Exact workforce assignment IDs are source facts, not browser filters. */ (item) =>
				item.id,
		)
		const locationIds = scope.assignments.map(
			/** Select by identity even when two locations share a label. */ (item) => item.locationId,
		)
		const departmentIds = scope.assignments.flatMap(
			/** Null departments cannot match any configured department target. */ (item) =>
				item.departmentId === null ? [] : [item.departmentId],
		)
		const orgUnitIds = scope.assignments.map(
			/** Preserve all effective units so equal-precedence conflicts remain detectable. */ (item) =>
				item.orgUnitId,
		)
		const result = await sql<{ assignment: DatedConfigurationAssignment }>`
SELECT jsonb_build_object('id',a.id,'revision',a.revision,'versionId',a.version_id,
  'effectiveFrom',a.effective_from::text,'effectiveTo',a.effective_to::text,
  'target',jsonb_strip_nulls(jsonb_build_object('kind',a.scope_kind,
    'id',coalesce(a.legal_entity_id,a.org_unit_id,a.department_id,a.location_id,a.assignment_id,a.employment_id)))) AS assignment
FROM ${sql.table('hcm.' + owner + '_assignment')} AS a
JOIN ${sql.table('hcm.' + owner + '_version')} AS v ON v.tenant_id=a.tenant_id AND v.id=a.version_id
WHERE a.tenant_id=${this.tenantId} AND v.state='Published'
  AND a.effective_period @> ${workDate}::date AND v.effective_period @> ${workDate}::date
  AND (a.scope_kind='Tenant' OR a.legal_entity_id=${scope.legalEntityId} OR a.employment_id=${scope.employmentId}
    OR a.assignment_id=ANY(${assignmentIds}::text[]) OR a.location_id=ANY(${locationIds}::text[])
    OR a.department_id=ANY(${departmentIds}::text[]) OR a.org_unit_id=ANY(${orgUnitIds}::text[]))
ORDER BY a.id COLLATE "C"
`.execute(this.transaction)
		return result.rows.map(
			/** Project only the declared selection input, never the SQL row. */ (row) => row.assignment,
		)
	}
}
