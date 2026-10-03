import { sql, type Kysely } from 'kysely'
import { Temporal } from '@js-temporal/polyfill'
import type { ScheduleSegment } from '@empflowyee/hcm-attendance-contract'
import { selectDatedWorkSource, type DatedWorkSource } from '@empflowyee/hcm-api-attendance-domain'
import type {
	AttendanceDatedPatternPort,
	AttendanceDatedPatternResult,
	AttendanceResolvedPattern,
	AttendanceOverrideProposal,
} from '@empflowyee/hcm-api-attendance-application'
import type { WorkforceTimeContextPort } from '@empflowyee/hcm-api-workforce-foundation-application'
import { commandHash } from '@empflowyee/hcm-api-runtime-application'
import { KyselyAttendanceConfigurationReader } from './configuration-readers'

/** Read typed dated sources under the caller's verified tenant transaction; no selection or read creates work. */
export class KyselyAttendanceDatedPatterns implements AttendanceDatedPatternPort {
	/** Bind Attendance records and source-owned Workforce facts to one stable transaction. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenant: string,
		private readonly workforce: WorkforceTimeContextPort,
		private readonly proposal?: AttendanceOverrideProposal,
	) {}
	/** Resolve only Approved overrides or Published roster entries before falling back to ordinary scope selection. */
	async read(employmentId: string, workDate: string): Promise<AttendanceDatedPatternResult> {
		const proposed =
			this.proposal?.employmentId === employmentId && this.proposal.workDate === workDate
				? this.proposal
				: undefined
		if (proposed) {
			const draft =
				await sql`SELECT id FROM hcm.schedule_override WHERE tenant_id=${this.tenant} AND id=${proposed.id} AND employment_id=${employmentId} AND work_date=${workDate}::date AND revision=${proposed.revision} AND state='Draft'`.execute(
					this.transaction,
				)
			if (!draft.rows.length)
				return { state: 'Unavailable', family: 'Schedule', reason: 'ConfigurationUnavailable' }
		}
		const rows = await sql<{ source: DatedWorkSource }>`
SELECT jsonb_build_object('kind','Override','id',id,'employmentId',employment_id,'workDate',work_date::text,'state',state,'revision',revision) AS source FROM hcm.schedule_override WHERE tenant_id=${this.tenant} AND employment_id=${employmentId} AND work_date=${workDate}::date AND state='Approved'
UNION ALL
SELECT jsonb_build_object('kind','Roster','id',e.id,'employmentId',e.employment_id,'workDate',e.work_date::text,'state','Published','rosterState',r.state,'revision',r.revision) FROM hcm.shift_roster_entry e JOIN hcm.shift_roster r ON r.tenant_id=e.tenant_id AND r.id=e.roster_id WHERE e.tenant_id=${this.tenant} AND e.employment_id=${employmentId} AND e.work_date=${workDate}::date AND r.state='Published'`.execute(
	this.transaction,
)
		const sources = rows.rows.map(
			/** Preserve every matching source for explicit tie rejection. */ (row) => row.source,
		)
		// This candidate exists only in resolver input. Existing approvals remain present so ties still fail.
		if (proposed)
			sources.push({
				kind: 'Override',
				id: proposed.id,
				employmentId,
				workDate,
				state: 'Approved',
				revision: proposed.revision + 1,
			})
		sources.sort(
			/** Keep source evidence stable independently of SQL row order or process locale. */ (
				left,
				right,
			) => {
				const a = left.kind + left.id,
					b = right.kind + right.id
				if (a === b) return 0
				return a < b ? -1 : 1
			},
		)
		const selected = selectDatedWorkSource(employmentId, workDate, sources)
		if (selected.state === 'AssignedSchedule') return { state: 'Absent' }
		if (selected.state === 'Unavailable')
			return { state: 'Unavailable', family: 'Schedule', reason: selected.reason }
		const facts = await this.workforce.read(employmentId, workDate)
		if (facts.state === 'Unavailable')
			return { state: 'Unavailable', family: 'Schedule', reason: facts.reason }
		const source = selected.source
		let pattern: Omit<AttendanceResolvedPattern, 'state' | 'workforce' | 'digest'> | null
		if (source.kind === 'Roster') pattern = await this.roster(source, workDate)
		else pattern = await this.override(source, workDate)
		if (!pattern)
			return { state: 'Unavailable', family: 'Schedule', reason: 'ConfigurationUnavailable' }
		return {
			...pattern,
			state: 'Available',
			workforce: facts.context,
			digest: commandHash('DatedWorkPattern:2', {
				tenant: this.tenant,
				sources: sources.map(
					/** Canonicalize keys so an in-memory proposal and its persisted JSONB source have identical evidence. */ (
						source,
					) => ({
						kind: source.kind,
						id: source.id,
						employmentId: source.employmentId,
						workDate: source.workDate,
						state: source.state,
						revision: source.revision,
						...(source.kind === 'Roster' ? { rosterState: source.rosterState } : {}),
					}),
				),
				pattern,
				workforce: facts.context.inputDigest,
			}),
		}
	}
	/** Normalize one published shift for its actual date without inventing a weekly schedule or schedule-version identity. */
	private async roster(
		source: DatedWorkSource,
		date: string,
	): Promise<Omit<AttendanceResolvedPattern, 'state' | 'workforce' | 'digest'> | null> {
		const result = await sql<{
			assignment: string | null
			shiftId: string
			versionId: string
		}>`SELECT e.assignment_id AS assignment,v.shift_id AS "shiftId",v.id AS "versionId" FROM hcm.shift_roster_entry e JOIN hcm.shift_version v ON v.tenant_id=e.tenant_id AND v.id=e.shift_version_id WHERE e.tenant_id=${this.tenant} AND e.id=${source.id}`.execute(
			this.transaction,
		)
		const row = result.rows[0]
		if (!row) return null
		const shift = await new KyselyAttendanceConfigurationReader(
			this.transaction,
			this.tenant,
		).shift(row.shiftId, row.versionId)
		if (
			!shift ||
			shift.state !== 'Published' ||
			shift.effectiveFrom > date ||
			(shift.effectiveTo && shift.effectiveTo < date)
		)
			return null
		return {
			family: 'Roster',
			assignment: {
				id: source.id,
				revision: source.revision,
				target: row.assignment
					? { kind: 'Assignment', id: row.assignment }
					: { kind: 'Employment', id: source.employmentId },
			},
			version: {
				versionId: shift.versionId,
				revision: shift.revision,
				timezoneMode: shift.timezoneMode,
				fixedZone: shift.fixedZone,
				minimumRestMinutes: shift.minimumRestMinutes,
				minimumRestMode: shift.minimumRestMode,
				days: [
					{
						weekday: Temporal.PlainDate.from(date).dayOfWeek,
						kind: 'Work',
						segments: shift.segments,
					},
				],
			},
			sources: {
				scheduleVersionId: null,
				shiftVersionId: shift.versionId,
				rosterEntryId: source.id,
				overrideId: null,
			},
		}
	}
	/** Retain custom local intervals and inherit the exact immutable prior workday's schedule-side rest rule. */
	private async override(
		source: DatedWorkSource,
		date: string,
	): Promise<Omit<AttendanceResolvedPattern, 'state' | 'workforce' | 'digest'> | null> {
		const result = await sql<{
			zone: string
			kind: 'Work' | 'Rest'
			scheduleId: string | null
			shiftId: string | null
			restMinutes: number | null
			restMode: 'Warn' | 'Block' | null
			segments: ScheduleSegment[]
		}>`
SELECT o.zone,o.kind,w.work_schedule_version_id AS "scheduleId",w.shift_version_id AS "shiftId",coalesce(s.minimum_rest_minutes,v.minimum_rest_minutes) AS "restMinutes",coalesce(s.minimum_rest_mode,v.minimum_rest_mode) AS "restMode",
(SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('kind',p.kind,'startTime',p.start_time::text,'endTime',p.end_time::text,'endDayOffset',p.end_day_offset,'overlapOffset',CASE WHEN p.start_overlap_choice IS NOT NULL OR p.end_overlap_choice IS NOT NULL THEN jsonb_strip_nulls(jsonb_build_object('start',p.start_overlap_choice,'end',p.end_overlap_choice)) ELSE NULL END)) ORDER BY p.ordinal),'[]'::jsonb) FROM hcm.schedule_override_segment p WHERE p.tenant_id=o.tenant_id AND p.override_id=o.id) AS segments
FROM hcm.schedule_override o JOIN hcm.published_workday w ON w.tenant_id=o.tenant_id AND w.id=o.basis_workday_id LEFT JOIN hcm.work_schedule_version s ON s.tenant_id=w.tenant_id AND s.id=w.work_schedule_version_id LEFT JOIN hcm.shift_version v ON v.tenant_id=w.tenant_id AND v.id=w.shift_version_id WHERE o.tenant_id=${this.tenant} AND o.id=${source.id}`.execute(
	this.transaction,
)
		const row = result.rows[0]
		if (!row || (!row.scheduleId && !row.shiftId)) return null
		return {
			family: 'Override',
			assignment: {
				id: source.id,
				revision: source.revision,
				target: { kind: 'Employment', id: source.employmentId },
			},
			version: {
				versionId: source.id,
				revision: source.revision,
				timezoneMode: 'Fixed',
				fixedZone: row.zone,
				...(row.restMinutes === null
					? {}
					: { minimumRestMinutes: row.restMinutes, minimumRestMode: row.restMode ?? undefined }),
				days: [
					{
						weekday: Temporal.PlainDate.from(date).dayOfWeek,
						kind: row.kind,
						segments: row.segments,
					},
				],
			},
			restSourceVersionId: row.scheduleId ?? row.shiftId ?? undefined,
			sources: {
				scheduleVersionId: row.scheduleId,
				shiftVersionId: row.shiftId,
				overrideId: source.id,
				rosterEntryId: null,
			},
		}
	}
}
