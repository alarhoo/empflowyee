import { randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'
import type { ScheduleDraft, ScheduleVersionView } from '@empflowyee/hcm-attendance-contract'
import type {
	ScheduleRepository,
	ScheduleVersionInsert,
} from '@empflowyee/hcm-api-attendance-application'
import { KyselyScheduleReader } from './hcm-api-attendance-infrastructure'

/** SQL-first schedule mutations on an existing authorized transaction; published children are protected by database triggers. */
export class KyselyScheduleRepository implements ScheduleRepository {
	private readonly reader: KyselyScheduleReader

	/** Require the owning use case's current tenant/actor and transaction; no adapter commits independently. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenantId: string,
		private readonly accountId: string,
	) {
		this.reader = new KyselyScheduleReader(transaction, tenantId)
	}

	/** Return only the public configuration projection. */
	read(ownerId: string, versionId: string): Promise<ScheduleVersionView | null> {
		return this.reader.version(ownerId, versionId)
	}

	/** Publish only the reviewed Draft revision; SQL independently validates the complete immutable pattern. */
	async publish(
		ownerId: string,
		versionId: string,
		revision: number,
		digest: string,
	): Promise<void> {
		const result = await sql<{ id: string }>`
UPDATE hcm.work_schedule_version SET state='Published',revision=revision+1,publication_digest=${digest},published_at=clock_timestamp(),published_by_account_id=${this.accountId},updated_at=clock_timestamp()
WHERE tenant_id=${this.tenantId} AND schedule_id=${ownerId} AND id=${versionId} AND revision=${revision} AND state='Draft' RETURNING id
`.execute(this.transaction)
		if (!result.rows.length) throw new HcmDomainError('revision-conflict')
	}

	/** Preserve published content and attribution while removing this version from future reuse. */
	async retire(ownerId: string, versionId: string, revision: number): Promise<void> {
		const result = await sql<{ id: string }>`
UPDATE hcm.work_schedule_version SET state='Retired',revision=revision+1,updated_at=clock_timestamp()
WHERE tenant_id=${this.tenantId} AND schedule_id=${ownerId} AND id=${versionId} AND revision=${revision} AND state='Published' RETURNING id
`.execute(this.transaction)
		if (!result.rows.length) throw new HcmDomainError('revision-conflict')
	}

	/** Lock the exact version before reading its immutable identity and current draft revision. */
	async lock(ownerId: string, versionId: string): Promise<ScheduleVersionView | null> {
		await sql`SELECT id FROM hcm.work_schedule_version WHERE tenant_id=${this.tenantId} AND schedule_id=${ownerId} AND id=${versionId} FOR UPDATE`.execute(
			this.transaction,
		)
		return this.read(ownerId, versionId)
	}

	/** Insert the stable template/schedule identity; SQL forbids runtime changes to its code or type. */
	async createOwner(id: string, code: string, isTemplate: boolean): Promise<void> {
		await sql`INSERT INTO hcm.work_schedule(tenant_id,id,code,is_template,created_by_account_id) VALUES(${this.tenantId},${id},${code},${isTemplate},${this.accountId})`.execute(
			this.transaction,
		)
	}

	/** Determine the next ordinal under the unit of work's exclusive tenant mutation lock. */
	async nextVersionNumber(ownerId: string): Promise<number> {
		return (
			await sql<{
				next: number
			}>`SELECT coalesce(max(version_number),0)+1 AS next FROM hcm.work_schedule_version WHERE tenant_id=${this.tenantId} AND schedule_id=${ownerId}`.execute(
				this.transaction,
			)
		).rows[0].next
	}

	/** Store one complete Draft followed by its explicitly typed weekday and segment children. */
	async insertVersion(input: ScheduleVersionInsert): Promise<void> {
		const d = input.draft
		await sql`
INSERT INTO hcm.work_schedule_version(tenant_id,id,schedule_id,version_number,name,description,effective_from,effective_to,
  timezone_mode,fixed_zone,week_starts_on,minimum_rest_minutes,minimum_rest_mode,supersedes_id,copied_from_id,created_by_account_id)
VALUES(${this.tenantId},${input.id},${input.ownerId},${input.versionNumber},${d.name},${d.description ?? ''},${d.effectiveFrom}::date,${d.effectiveTo ?? null}::date,
  ${d.timezoneMode},${d.fixedZone ?? null},${d.weekStartsOn},${d.minimumRestMinutes ?? null},${d.minimumRestMode ?? null},${input.supersedesId},${input.copiedFromId},${this.accountId})
`.execute(this.transaction)
		await this.insertDays(input.id, d)
	}

	/** Replace only the expected Draft revision; deletion is guarded by the version lock and SQL child lifecycle triggers. */
	async replace(
		ownerId: string,
		versionId: string,
		expectedRevision: number,
		d: ScheduleDraft,
	): Promise<void> {
		const updated = await sql<{ id: string }>`
UPDATE hcm.work_schedule_version SET name=${d.name},description=${d.description ?? ''},effective_from=${d.effectiveFrom}::date,effective_to=${d.effectiveTo ?? null}::date,
  timezone_mode=${d.timezoneMode},fixed_zone=${d.fixedZone ?? null},week_starts_on=${d.weekStartsOn},minimum_rest_minutes=${d.minimumRestMinutes ?? null},minimum_rest_mode=${d.minimumRestMode ?? null},
  revision=revision+1,updated_at=clock_timestamp()
WHERE tenant_id=${this.tenantId} AND id=${versionId} AND schedule_id=${ownerId} AND revision=${expectedRevision} AND state='Draft' RETURNING id
`.execute(this.transaction)
		if (!updated.rows.length) throw new HcmDomainError('revision-conflict')
		await sql`DELETE FROM hcm.work_schedule_segment WHERE tenant_id=${this.tenantId} AND version_id=${versionId}`.execute(
			this.transaction,
		)
		await sql`DELETE FROM hcm.work_schedule_day WHERE tenant_id=${this.tenantId} AND version_id=${versionId}`.execute(
			this.transaction,
		)
		await this.insertDays(versionId, d)
	}

	/** Batch explicit transient insert projections; persistence columns and casts remain defined by the SQL migration. */
	private async insertDays(versionId: string, draft: ScheduleDraft): Promise<void> {
		const days = draft.days.map(
			/** Assign stable child identities without exposing storage records as API DTOs. */ (
				day,
			) => ({ id: randomUUID(), weekday: day.weekday, kind: day.kind, segments: day.segments }),
		)
		const segments = days.flatMap(
			/** Derive each contiguous segment's start-day offset from the preceding explicit end day. */ (
				day,
			) => {
				let startDayOffset = 0
				return day.segments.map(
					/** Preserve exact submitted wall time and independent overlap choices. */ (
						segment,
						index,
					) => {
						const row = {
							id: randomUUID(),
							dayId: day.id,
							ordinal: index + 1,
							kind: segment.kind,
							startTime: segment.startTime,
							endTime: segment.endTime,
							startDayOffset,
							endDayOffset: segment.endDayOffset,
							startChoice: segment.overlapOffset?.start ?? null,
							endChoice: segment.overlapOffset?.end ?? null,
						}
						startDayOffset = segment.endDayOffset
						return row
					},
				)
			},
		)
		const dayRows = days.map(
			/** The day insert contains no nested data or source-only metadata. */ ({
				id,
				weekday,
				kind,
			}) => ({ id, weekday, kind }),
		)
		await sql`
INSERT INTO hcm.work_schedule_day(tenant_id,id,version_id,weekday,kind)
SELECT ${this.tenantId},x.id,${versionId},x.weekday,x.kind FROM jsonb_to_recordset(${JSON.stringify(dayRows)}::jsonb) AS x(id text,weekday smallint,kind text)
`.execute(this.transaction)
		if (!segments.length) return
		await sql`
INSERT INTO hcm.work_schedule_segment(tenant_id,id,version_id,day_id,ordinal,kind,start_time,end_time,start_day_offset,end_day_offset,start_overlap_choice,end_overlap_choice)
SELECT ${this.tenantId},x.id,${versionId},x."dayId",x.ordinal,x.kind,x."startTime"::time,x."endTime"::time,x."startDayOffset",x."endDayOffset",x."startChoice",x."endChoice"
FROM jsonb_to_recordset(${JSON.stringify(segments)}::jsonb)
  AS x(id text,"dayId" text,ordinal integer,kind text,"startTime" text,"endTime" text,"startDayOffset" smallint,"endDayOffset" smallint,"startChoice" text,"endChoice" text)
`.execute(this.transaction)
	}
}
