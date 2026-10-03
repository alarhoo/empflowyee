import { sql, type Kysely } from 'kysely'
import type {
	AttendancePolicyVersionView,
	HolidayVersionView,
	ShiftVersionView,
} from '@empflowyee/hcm-attendance-contract'
import type { HolidayResolutionVersion } from '@empflowyee/hcm-api-attendance-application'

/** Share exact holiday business fields while reserving source identity for internal resolution evidence. */
function holidayProjection(includeIdentity: boolean) {
	return sql`jsonb_strip_nulls(jsonb_build_object(
  'id',r.id,'code',r.code,'versionId',v.id,'versionNumber',v.version_number,'revision',v.revision,'state',v.state,
  'name',v.name,'effectiveFrom',v.effective_from::text,'effectiveTo',v.effective_to::text,
  'entries',coalesce((SELECT jsonb_agg(jsonb_build_object('date',h.actual_date::text,'observedDate',h.observed_date::text,
    'category',h.category,'name',h.name,'priority',h.priority,'regionCode',h.region_code,'locationId',h.location_id,
    'startTime',h.start_time::text,'endTime',h.end_time::text,
    'overlapOffset',CASE WHEN h.start_overlap_choice IS NULL AND h.end_overlap_choice IS NULL THEN NULL
      ELSE jsonb_build_object('start',h.start_overlap_choice,'end',h.end_overlap_choice) END) || ${includeIdentity ? sql`jsonb_build_object('id',h.id,'versionId',h.version_id)` : sql`'{}'::jsonb`} ORDER BY h.ordinal)
    FROM hcm.holiday h WHERE h.tenant_id=v.tenant_id AND h.version_id=v.id),'[]'::jsonb)))`
}
/** Closed holiday DTO projection shared by authorized exact-version and latest-version reads. */
export const holidayVersionProjection = holidayProjection(false)

/** Closed shift projection shared by exact and latest-version authorized reads. */
export const shiftVersionProjection = sql`jsonb_strip_nulls(jsonb_build_object(
  'id',r.id,'code',r.code,'versionId',v.id,'versionNumber',v.version_number,'revision',v.revision,'state',v.state,
  'name',v.name,'description',v.description,'effectiveFrom',v.effective_from::text,'effectiveTo',v.effective_to::text,
  'timezoneMode',v.timezone_mode,'fixedZone',v.fixed_zone,'minimumRestMinutes',v.minimum_rest_minutes,'minimumRestMode',v.minimum_rest_mode,
  'segments',coalesce((SELECT jsonb_agg(jsonb_build_object('startTime',s.start_time::text,'endTime',s.end_time::text,
    'endDayOffset',s.end_day_offset,'kind',s.kind,'overlapOffset',CASE WHEN s.start_overlap_choice IS NULL AND s.end_overlap_choice IS NULL THEN NULL
      ELSE jsonb_build_object('start',s.start_overlap_choice,'end',s.end_overlap_choice) END) ORDER BY s.ordinal)
    FROM hcm.shift_segment s WHERE s.tenant_id=v.tenant_id AND s.version_id=v.id),'[]'::jsonb)))`

/** Closed policy projection shared by exact and latest-version authorized reads. */
export const policyVersionProjection = sql`jsonb_strip_nulls(jsonb_build_object(
  'id',r.id,'code',r.code,'versionId',v.id,'versionNumber',v.version_number,'revision',v.revision,'state',v.state,
  'name',v.name,'effectiveFrom',v.effective_from::text,'effectiveTo',v.effective_to::text,
  'graceInMinutes',v.grace_in_minutes,'graceOutMinutes',v.grace_out_minutes,'rounding',v.rounding,
  'roundingIncrementMinutes',v.rounding_increment_minutes,'roundingDirection',v.rounding_direction,
  'minimumRestMinutes',v.minimum_rest_minutes,'minimumRestMode',v.minimum_rest_mode,
  'overtime',jsonb_build_object('enabled',v.overtime_enabled,'qualification',v.overtime_qualification,
    'capMinutes',v.overtime_cap_minutes,'preapprovalRequired',v.overtime_preapproval_required),
  'approvalRules',coalesce((SELECT jsonb_agg(jsonb_build_object('subjectType',a.subject_type,'stage',a.stage,
    'independent',a.independent,'candidateRule',jsonb_build_object('source',a.candidate_source,
      'managerLevel',a.manager_level,'functionCode',a.function_code,'accountId',a.account_id)) ORDER BY a.ordinal)
    FROM hcm.attendance_approval_rule a WHERE a.tenant_id=v.tenant_id AND a.version_id=v.id),'[]'::jsonb)))`

/** Purpose-built configuration projections; callers retain authorization and transaction ownership. */
export class KyselyAttendanceConfigurationReader {
	/** Bind reads to one already authorized tenant transaction, never a pooled executor with ambient state. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenantId: string,
	) {
		if (!transaction.isTransaction || !tenantId)
			throw new Error('Attendance configuration requires a tenant transaction')
	}

	/** Read one reusable shift with ordered exact wall endpoints, leaving dated DST resolution to the domain. */
	async shift(id: string, versionId: string): Promise<ShiftVersionView | null> {
		const result = await sql<{ view: ShiftVersionView }>`
SELECT ${shiftVersionProjection} AS view
FROM hcm.shift r JOIN hcm.shift_version v ON v.tenant_id=r.tenant_id AND v.shift_id=r.id
WHERE r.tenant_id=${this.tenantId} AND r.id=${id} AND v.id=${versionId}
`.execute(this.transaction)
		return result.rows[0]?.view ?? null
	}

	/** Read a policy and ordered typed candidate selectors without exposing audit actors or persistence rows. */
	async policy(id: string, versionId: string): Promise<AttendancePolicyVersionView | null> {
		const result = await sql<{ view: AttendancePolicyVersionView }>`
SELECT ${policyVersionProjection} AS view
FROM hcm.attendance_policy r JOIN hcm.attendance_policy_version v ON v.tenant_id=r.tenant_id AND v.policy_id=r.id
WHERE r.tenant_id=${this.tenantId} AND r.id=${id} AND v.id=${versionId}
`.execute(this.transaction)
		return result.rows[0]?.view ?? null
	}

	/** Read actual and observed dates with exact partial endpoints, excluding storage-only identity and publication fields. */
	async holidayCalendar(id: string, versionId: string): Promise<HolidayVersionView | null> {
		const result = await sql<{ view: HolidayVersionView }>`
SELECT ${holidayVersionProjection} AS view
FROM hcm.holiday_calendar r JOIN hcm.holiday_calendar_version v ON v.tenant_id=r.tenant_id AND v.calendar_id=r.id
WHERE r.tenant_id=${this.tenantId} AND r.id=${id} AND v.id=${versionId}
`.execute(this.transaction)
		return result.rows[0]?.view ?? null
	}

	/** Retain exact tenant-owned holiday entry IDs for the internal resolver; never expose this projection through calendar HTTP queries. */
	async holidayResolutionCalendar(
		id: string,
		versionId: string,
	): Promise<HolidayResolutionVersion | null> {
		const result = await sql<{ view: HolidayResolutionVersion }>`
SELECT ${holidayProjection(true)} AS view
FROM hcm.holiday_calendar r JOIN hcm.holiday_calendar_version v ON v.tenant_id=r.tenant_id AND v.calendar_id=r.id
WHERE r.tenant_id=${this.tenantId} AND r.id=${id} AND v.id=${versionId}
`.execute(this.transaction)
		return result.rows[0]?.view ?? null
	}
}
