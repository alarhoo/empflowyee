import { sql, type Kysely } from 'kysely'
import { idValue } from '@empflowyee/hcm-runtime-contract'
import type { ScheduleVersionView } from '@empflowyee/hcm-attendance-contract'

/** Read explicit schedule DTOs from a caller-owned, already authorized tenant transaction. */
export class KyselyScheduleReader {
	/** The owning unit of work supplies current permission/scope and transaction-local tenant RLS. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenantId: string,
	) {
		idValue(tenantId, 'tenantId')
		if (!transaction.isTransaction) throw new Error('Schedule reader requires a tenant transaction')
	}

	/** Project one version with its ordered pattern in one snapshot, omitting SQL actors, digests and storage-only fields. */
	async version(id: string, versionId: string): Promise<ScheduleVersionView | null> {
		idValue(id, 'id')
		idValue(versionId, 'versionId')
		const rows = await sql<{
			view: ScheduleVersionView
		}>`SELECT jsonb_strip_nulls(jsonb_build_object(
			'id',s.id,'code',s.code,'isTemplate',s.is_template,'versionId',v.id,'versionNumber',v.version_number,
			'revision',v.revision,'state',v.state,'name',v.name,'description',v.description,
			'copiedFromVersionId',v.copied_from_id,
			'effectiveFrom',to_char(v.effective_from,'YYYY-MM-DD'),'effectiveTo',to_char(v.effective_to,'YYYY-MM-DD'),
			'timezoneMode',v.timezone_mode,'fixedZone',v.fixed_zone,'weekStartsOn',v.week_starts_on,
			'minimumRestMinutes',v.minimum_rest_minutes,'minimumRestMode',v.minimum_rest_mode,
			'days',COALESCE((SELECT jsonb_agg(jsonb_build_object('weekday',d.weekday,'kind',d.kind,
				'segments',COALESCE((SELECT jsonb_agg(jsonb_build_object('startTime',g.start_time::text,
					'endTime',g.end_time::text,'endDayOffset',g.end_day_offset,'kind',g.kind,
					'overlapOffset',CASE WHEN g.start_overlap_choice IS NOT NULL OR g.end_overlap_choice IS NOT NULL
					THEN jsonb_build_object('start',g.start_overlap_choice,'end',g.end_overlap_choice) ELSE NULL END)
					ORDER BY g.ordinal) FROM hcm.work_schedule_segment g
					WHERE g.tenant_id=d.tenant_id AND g.version_id=d.version_id AND g.day_id=d.id),'[]'::jsonb))
				ORDER BY d.weekday) FROM hcm.work_schedule_day d WHERE d.tenant_id=v.tenant_id AND d.version_id=v.id),'[]'::jsonb)
		)) AS view FROM hcm.work_schedule s JOIN hcm.work_schedule_version v ON v.tenant_id=s.tenant_id AND v.schedule_id=s.id
		WHERE s.tenant_id=${this.tenantId} AND s.tenant_id=hcm.current_tenant_id() AND s.id=${id} AND v.id=${versionId}
`.execute(this.transaction)
		return rows.rows[0]?.view ?? null
	}
}
