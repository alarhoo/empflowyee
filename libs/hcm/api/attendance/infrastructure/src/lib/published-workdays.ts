import { randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import {
	commandHash,
	requireWorkloadScope,
	type HcmWorkloadContext,
} from '@empflowyee/hcm-api-runtime-application'
import { dateValue, idValue, HcmDomainError } from '@empflowyee/hcm-runtime-contract'
import type {
	PublishedWorkdayInput,
	PublishedWorkdayReference,
	PublishedWorkdayWriter,
} from '@empflowyee/hcm-api-attendance-application'

interface SegmentInsert {
	id: string
	ordinal: number
	kind: 'Work' | 'UnpaidBreak' | 'Holiday' | 'ExpectedWork'
	start: string
	end: string
	startOffset: number | null
	endOffset: number | null
	holidayVersion: string | null
	holidayId: string | null
}
/** Preserve exact offset seconds without rounding historical IANA offsets to minutes. */
function offsetSeconds(value: string): number {
	const match = /^([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
	if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59)
		throw new Error('Invalid resolved offset')
	return (
		(match[1] === '-' ? -1 : 1) *
		(Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4] ?? 0))
	)
}
/** Convert domain intervals into typed SQL input while rejecting inconsistent duplicate instant representations. */
function segments(input: PublishedWorkdayInput): SegmentInsert[] {
	const result: SegmentInsert[] = []
	for (const segment of input.resolution.scheduledSegments) {
		if (
			Date.parse(segment.startInstant) !== segment.startMilliseconds ||
			Date.parse(segment.endInstant) !== segment.endMilliseconds ||
			BigInt(segment.elapsedMilliseconds) !==
				BigInt(segment.endMilliseconds - segment.startMilliseconds)
		)
			throw new Error('Invalid resolved schedule evidence')
		result.push({
			id: randomUUID(),
			ordinal: result.length + 1,
			kind: segment.kind,
			start: segment.startInstant,
			end: segment.endInstant,
			startOffset: offsetSeconds(segment.startOffset),
			endOffset: offsetSeconds(segment.endOffset),
			holidayVersion: null,
			holidayId: null,
		})
	}
	for (const segment of input.resolution.holidaySegments)
		result.push({
			id: randomUUID(),
			ordinal: result.length + 1,
			kind: 'Holiday',
			start: new Date(segment.startMilliseconds).toISOString(),
			end: new Date(segment.endMilliseconds).toISOString(),
			startOffset: null,
			endOffset: null,
			holidayVersion: segment.versionId,
			holidayId: segment.holidayId,
		})
	for (const segment of input.resolution.expectedWorkIntervals)
		result.push({
			id: randomUUID(),
			ordinal: result.length + 1,
			kind: 'ExpectedWork',
			start: new Date(segment.startMilliseconds).toISOString(),
			end: new Date(segment.endMilliseconds).toISOString(),
			startOffset: null,
			endOffset: null,
			holidayVersion: null,
			holidayId: null,
		})
	return result
}

/** Append successful resolution evidence under the existing workload trust boundary; this adapter does not claim or complete durable jobs. */
export class KyselyPublishedWorkdayWriter<Database = unknown> implements PublishedWorkdayWriter {
	/** Require a real caller-owned transaction and opaque AttendanceResolve capability, never a fabricated human actor. */
	constructor(
		private readonly transaction: Kysely<Database>,
		private readonly context: HcmWorkloadContext,
	) {
		if (!transaction.isTransaction)
			throw new Error('Workday publication requires a tenant transaction')
		requireWorkloadScope(context, 'AttendanceResolve')
	}
	/** Serialize the employment/date, recover identical evidence and insert the complete source/interval graph atomically. */
	async append(input: PublishedWorkdayInput): Promise<PublishedWorkdayReference> {
		const scope = requireWorkloadScope(this.context, 'AttendanceResolve'),
			tenantId = scope.tenantId
		idValue(input.employmentId, 'employmentId')
		if (input.scheduleVersionId !== null) idValue(input.scheduleVersionId, 'scheduleVersionId')
		const workDate = dateValue(input.resolution.workDate, 'workDate'),
			month = workDate.slice(0, 7) + '-01'
		const holidays = [...input.holidayCalendarVersionIds].sort()
		if (new Set(holidays).size !== holidays.length) throw new HcmDomainError('invalid-request')
		for (const version of holidays) idValue(version, 'holidayCalendarVersionId')
		const digest = commandHash('PublishedWorkday', {
			tenantId,
			employmentId: input.employmentId,
			scheduleVersionId: input.scheduleVersionId,
			...(input.datedSources ? { datedSources: input.datedSources } : {}),
			policyVersionId: input.policyVersionId,
			holidayCalendarVersionIds: holidays,
			inputDigest: input.inputDigest,
			resolution: input.resolution,
		})
		await sql`SELECT hcm.fence_attendance_month(${tenantId},${month}::date,false)`.execute(
			this.transaction,
		)
		await sql`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId}||':workday:'||${input.employmentId}||':'||${workDate},0))`.execute(
			this.transaction,
		)
		const existing = await sql<{
			id: string
			revision: number
		}>`SELECT id,revision FROM hcm.published_workday WHERE tenant_id=${tenantId} AND employment_id=${input.employmentId} AND work_date=${workDate}::date AND resolution_digest=${digest}`.execute(
			this.transaction,
		)
		if (existing.rows[0]) {
			requireWorkloadScope(this.context, 'AttendanceResolve')
			return { ...existing.rows[0], digest, replayed: true }
		}
		const rows = segments(input),
			id = randomUUID(),
			revision = (input.previous?.revision ?? 0) + 1,
			r = input.resolution
		await sql`INSERT INTO hcm.published_workday(tenant_id,id,employment_id,work_date,zone,schedule_kind,work_schedule_version_id,attendance_policy_version_id,revision,input_digest,resolution_digest,scheduled_work_milliseconds,break_milliseconds,expected_work_milliseconds,supersedes_id,workload_run_id,shift_version_id,shift_roster_entry_id,schedule_override_id)
   VALUES(${tenantId},${id},${input.employmentId},${workDate}::date,${r.zone},${r.scheduleKind},${input.scheduleVersionId},${input.policyVersionId},${revision},${input.inputDigest},${digest},${r.scheduledWorkMilliseconds}::bigint,${r.breakMilliseconds}::bigint,${r.expectedWorkMilliseconds}::bigint,${input.previous?.id ?? null},${scope.runId}::uuid,${input.datedSources?.shiftVersionId ?? null},${input.datedSources?.rosterEntryId ?? null},${input.datedSources?.overrideId ?? null})`.execute(
		this.transaction,
	)
		for (const version of holidays)
			await sql`INSERT INTO hcm.published_workday_holiday_source(tenant_id,workday_id,calendar_version_id) VALUES(${tenantId},${id},${version})`.execute(
				this.transaction,
			)
		if (rows.length)
			await sql`INSERT INTO hcm.published_work_segment(tenant_id,id,workday_id,ordinal,kind,start_at,end_at,start_local,end_local,start_offset_seconds,end_offset_seconds,holiday_calendar_version_id,holiday_id)
   SELECT ${tenantId},i.id,${id},i.ordinal,i.kind,i.start,i."end",i.start AT TIME ZONE ${r.zone},i."end" AT TIME ZONE ${r.zone},
    coalesce(i."startOffset",extract(epoch FROM ((i.start AT TIME ZONE ${r.zone})-(i.start AT TIME ZONE 'UTC')))::integer),
    coalesce(i."endOffset",extract(epoch FROM ((i."end" AT TIME ZONE ${r.zone})-(i."end" AT TIME ZONE 'UTC')))::integer),i."holidayVersion",i."holidayId"
   FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS i(id text,ordinal integer,kind text,start timestamptz,"end" timestamptz,"startOffset" integer,"endOffset" integer,"holidayVersion" text,"holidayId" text)`.execute(
		this.transaction,
	)
		requireWorkloadScope(this.context, 'AttendanceResolve')
		return { id, revision, digest, replayed: false }
	}
}
