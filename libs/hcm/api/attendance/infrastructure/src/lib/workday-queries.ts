import { sql, type Kysely } from 'kysely'
import { Temporal } from '@js-temporal/polyfill'
import { AttendanceWorkdayReadPort } from '@empflowyee/hcm-api-attendance-application'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import type { HcmScopeSubject } from '@empflowyee/hcm-api-access-control-application'
import {
	requireAuthenticatedTenant,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import type { WorkforceTimeContextBinder } from '@empflowyee/hcm-api-workforce-foundation-application'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'
import type {
	AttendanceWorkdayQuery,
	WorkdayPage,
	WorkdayView,
} from '@empflowyee/hcm-attendance-contract'

/** Read immutable workday, interval and safe rest evidence without invoking resolution or changing queue state. */
export class KyselyAttendanceWorkdayQueries extends AttendanceWorkdayReadPort {
	/** Reuse current-authority transactions and Workforce's dated scope facts. */
	constructor(
		private readonly database: HcmAccessDatabase | null,
		private readonly workforce: WorkforceTimeContextBinder,
	) {
		super()
	}
	/** Authorize the entire date range before serializing a single workday or count. */
	async list(
		context: AuthenticatedHcmContext,
		query: AttendanceWorkdayQuery,
	): Promise<WorkdayPage> {
		if (!this.database) throw new HcmDomainError('record-incomplete')
		const tenant = requireAuthenticatedTenant(context)
		let employmentMissing = false
		return this.database.execute(
			context,
			{ permission: 'hcm.attendance.work-schedules.read', entitlement: 'hcm.attendance' },
			false,
			/** Read only after one complete current grant covers all resolved date facts. */ async (
				access,
			) => {
				if (employmentMissing) throw new HcmDomainError('not-found')
				const tx = access.transaction as unknown as Kysely<unknown>
				return readStoredWorkdays(tx, tenant, query)
			},
			/** Resolve source-owned dimensions only after Access checks the independent operation and entitlement. */ async (
				transaction,
			) => {
				const scopes: HcmScopeSubject[] = []
				const workforce = this.workforce.bind(transaction, tenant)
				for (
					let date = Temporal.PlainDate.from(query.from);
					Temporal.PlainDate.compare(date, query.to) <= 0;
					date = date.add({ days: 1 })
				) {
					const facts = await workforce.read(query.employmentId, date.toString())
					if (facts.state !== 'Available') {
						if (facts.reason === 'employment-unavailable') employmentMissing = true
						scopes.push({ employmentId: query.employmentId })
						continue
					}
					const base = {
						employmentId: query.employmentId,
						legalEntityId: facts.context.legalEntityId,
					}
					if (!facts.context.assignments.length) scopes.push(base)
					for (const assignment of facts.context.assignments)
						scopes.push({
							...base,
							assignmentId: assignment.id,
							orgUnitId: assignment.orgUnitId,
							locationId: assignment.locationId,
							...(assignment.departmentId ? { departmentId: assignment.departmentId } : {}),
						})
				}
				return scopes
			},
		)
	}
}

/** Reuse the owner's complete interval/source projection without granting its caller an Attendance UI permission. */
export async function readStoredWorkdays(
	tx: Kysely<unknown>,
	tenant: string,
	query: AttendanceWorkdayQuery,
): Promise<WorkdayPage> {
	const rows = await sql<{ view: WorkdayView }>`
WITH dates AS (SELECT generate_series(${query.from}::date,${query.to}::date,interval '1 day')::date AS work_date)
SELECT CASE
 WHEN intent.state IN ('Pending','Leased') THEN jsonb_build_object('state','Unavailable','employmentId',${query.employmentId}::text,'workDate',d.work_date::text,'unavailableCode','ResolutionPending')
 WHEN intent.state='Exception' THEN jsonb_build_object('state','Unavailable','employmentId',${query.employmentId}::text,'workDate',d.work_date::text,'unavailableCode','ResolutionFailed')
 WHEN receipt.state='Unavailable' THEN jsonb_build_object('state','Unavailable','employmentId',${query.employmentId}::text,'workDate',d.work_date::text,'unavailableCode',receipt.result_code)
 WHEN w.id IS NULL THEN jsonb_build_object('state','Unavailable','employmentId',${query.employmentId}::text,'workDate',d.work_date::text,'unavailableCode','NotResolved')
 ELSE jsonb_build_object('state','Published','employmentId',w.employment_id,'workDate',w.work_date::text,'id',w.id,'revision',w.revision,'digest',w.resolution_digest,
 'kind',CASE WHEN w.schedule_kind='Rest' AND w.schedule_override_id IS NOT NULL THEN 'NonWorkingOverride' WHEN w.schedule_kind='Rest' THEN 'Rest' WHEN w.scheduled_work_milliseconds>0 AND w.expected_work_milliseconds=0 THEN 'Holiday' ELSE 'Work' END,
 'zone',w.zone,'resolvedAt',to_char(w.resolved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'scheduledMilliseconds',w.scheduled_work_milliseconds::text,'breakMilliseconds',w.break_milliseconds::text,'elapsedMilliseconds',w.expected_work_milliseconds::text,'supersedesId',w.supersedes_id,
 'sourceVersions',(SELECT coalesce(jsonb_agg(b.source ORDER BY b.family,b.id),'[]'::jsonb) FROM (
 SELECT 'Schedule' AS family,s.id,jsonb_build_object('family','Schedule','id',s.schedule_id,'versionId',s.id,'versionNumber',s.version_number,'name',s.name) AS source FROM hcm.work_schedule_version s WHERE s.tenant_id=w.tenant_id AND s.id=w.work_schedule_version_id
 UNION ALL SELECT 'Shift',s.id,jsonb_build_object('family','Shift','id',s.shift_id,'versionId',s.id,'versionNumber',s.version_number,'name',s.name) FROM hcm.shift_version s WHERE s.tenant_id=w.tenant_id AND s.id=w.shift_version_id
 UNION ALL SELECT 'Policy',p.id,jsonb_build_object('family','Policy','id',p.policy_id,'versionId',p.id,'versionNumber',p.version_number,'name',p.name) FROM hcm.attendance_policy_version p WHERE p.tenant_id=w.tenant_id AND p.id=w.attendance_policy_version_id
 UNION ALL SELECT 'Holiday',h.id,jsonb_build_object('family','Holiday','id',h.calendar_id,'versionId',h.id,'versionNumber',h.version_number,'name',h.name) FROM hcm.published_workday_holiday_source r JOIN hcm.holiday_calendar_version h ON h.tenant_id=r.tenant_id AND h.id=r.calendar_version_id WHERE r.tenant_id=w.tenant_id AND r.workday_id=w.id) b),
 'datedSources',(SELECT coalesce(jsonb_agg(jsonb_build_object('family',d.family,'id',d.id,'name',d.name,'revision',(SELECT (v->>'assignmentRevision')::integer FROM jsonb_array_elements(coalesce(basis.dependencies,'[]'::jsonb)) v WHERE v->>'family'=d.family AND v->>'assignmentId'=d.id LIMIT 1))),'[]'::jsonb) FROM (
SELECT 'Override' AS family,o.id,'Schedule override' AS name FROM hcm.schedule_override o WHERE o.tenant_id=w.tenant_id AND o.id=w.schedule_override_id
UNION ALL SELECT 'Roster',e.id,r.name FROM hcm.shift_roster_entry e JOIN hcm.shift_roster r ON r.tenant_id=e.tenant_id AND r.id=e.roster_id WHERE e.tenant_id=w.tenant_id AND e.id=w.shift_roster_entry_id) d),
 'segments',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',s.kind,'startInstant',to_char(s.start_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'endInstant',to_char(s.end_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'startLocal',to_char(s.start_local,'YYYY-MM-DD"T"HH24:MI:SS.MS'),'endLocal',to_char(s.end_local,'YYYY-MM-DD"T"HH24:MI:SS.MS'),'startOffsetSeconds',s.start_offset_seconds,'endOffsetSeconds',s.end_offset_seconds,'elapsedMilliseconds',(extract(epoch FROM (s.end_at-s.start_at))*1000)::bigint::text,'holidayId',s.holiday_id,'holidayName',h.name) ORDER BY s.ordinal),'[]'::jsonb) FROM hcm.published_work_segment s LEFT JOIN hcm.holiday h ON h.tenant_id=s.tenant_id AND h.id=s.holiday_id AND h.version_id=s.holiday_calendar_version_id WHERE s.tenant_id=w.tenant_id AND s.workday_id=w.id),
 'rest',CASE WHEN basis.rest IS NULL THEN NULL ELSE jsonb_build_object('state',basis.rest->>'state','previousWorkDate',basis.rest->>'previousWorkDate','previousEnd',basis.rest->>'previousEnd','currentStart',basis.rest->>'currentStart','rules',(SELECT coalesce(jsonb_agg(jsonb_build_object('source',r->>'source','versionId',r->>'versionId','minutes',r->'minutes','mode',r->>'mode','outcome',r->'result'->>'state','elapsedMilliseconds',r->'result'->>'elapsedMilliseconds')),'[]'::jsonb) FROM jsonb_array_elements(coalesce(basis.rest->'outcomes',basis.rest->'rules','[]'::jsonb)) r)) END) END AS view
FROM dates d
LEFT JOIN LATERAL (SELECT id,state FROM hcm.attendance_outbox o WHERE o.tenant_id=${tenant} AND o.kind='attendance.workday.resolve' AND o.schema_version=1 AND o.payload->>'employmentId'=${query.employmentId} AND o.payload->>'workDate'=d.work_date::text ORDER BY o.created_at DESC,o.id DESC LIMIT 1) intent ON true
LEFT JOIN hcm.attendance_workday_resolution_receipt receipt ON receipt.tenant_id=${tenant} AND receipt.outbox_id=intent.id
LEFT JOIN LATERAL (SELECT * FROM hcm.published_workday p WHERE p.tenant_id=${tenant} AND p.employment_id=${query.employmentId} AND p.work_date=d.work_date ORDER BY p.revision DESC LIMIT 1) w ON true
LEFT JOIN LATERAL (SELECT r.evidence->'rest' AS rest,r.evidence->'dependencies' AS dependencies FROM hcm.attendance_workday_resolution_receipt r WHERE r.tenant_id=w.tenant_id AND r.workday_id=w.id AND r.state='Available' ORDER BY r.completed_at DESC LIMIT 1) basis ON true
ORDER BY d.work_date`.execute(tx)
	return {
		items: rows.rows.map(
			/** Serialize only the purpose-built public projection. */ (row) => row.view,
		),
		nextCursor: null,
	}
}
