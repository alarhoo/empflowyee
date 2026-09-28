import { randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'
import type { HolidayDraft, HolidayVersionView } from '@empflowyee/hcm-attendance-contract'
import type {
	HolidayRepository,
	HolidayVersionInsert,
} from '@empflowyee/hcm-api-attendance-application'
import { KyselyAttendanceConfigurationReader } from './configuration-readers'

/** Holiday SQL writes share the existing version lifecycle, child guards and tenant-composite references. */
export class KyselyHolidayRepository implements HolidayRepository {
	private readonly reader: KyselyAttendanceConfigurationReader
	/** Bind all writes to an authorized tenant transaction and its verified actor. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenantId: string,
		private readonly accountId: string,
	) {
		this.reader = new KyselyAttendanceConfigurationReader(transaction, tenantId)
	}
	/** Return a purpose-built projection rather than serializing persistence rows. */
	read(ownerId: string, versionId: string): Promise<HolidayVersionView | null> {
		return this.reader.holidayCalendar(ownerId, versionId)
	}
	/** Lock the exact tenant/calendar/version and then read its current projection. */
	async lock(ownerId: string, versionId: string): Promise<HolidayVersionView | null> {
		await sql`SELECT id FROM hcm.holiday_calendar_version WHERE tenant_id=${this.tenantId} AND calendar_id=${ownerId} AND id=${versionId} FOR UPDATE`.execute(
			this.transaction,
		)
		return this.read(ownerId, versionId)
	}
	/** Create an immutable calendar root; duplicate codes fail under the SQL constraint. */
	async createOwner(id: string, code: string): Promise<void> {
		await sql`INSERT INTO hcm.holiday_calendar(tenant_id,id,code,created_by_account_id) VALUES(${this.tenantId},${id},${code},${this.accountId})`.execute(
			this.transaction,
		)
	}
	/** Allocate the next ordinal while the unit holds the tenant mutation lock. */
	async nextVersionNumber(ownerId: string): Promise<number> {
		return (
			await sql<{
				next: number
			}>`SELECT coalesce(max(version_number),0)+1 AS next FROM hcm.holiday_calendar_version WHERE tenant_id=${this.tenantId} AND calendar_id=${ownerId}`.execute(
				this.transaction,
			)
		).rows[0].next
	}
	/** Insert only a Draft, with supersession constrained to the same tenant and calendar. */
	async insertVersion(input: HolidayVersionInsert): Promise<void> {
		const d = input.draft
		await sql`
INSERT INTO hcm.holiday_calendar_version(tenant_id,id,calendar_id,version_number,name,effective_from,effective_to,supersedes_id,created_by_account_id)
VALUES(${this.tenantId},${input.id},${input.ownerId},${input.versionNumber},${d.name},${d.effectiveFrom}::date,${d.effectiveTo ?? null}::date,${input.supersedesId},${this.accountId})
`.execute(this.transaction)
		await this.insertEntries(input.id, d)
	}
	/** Replace Draft fields and entries atomically, advancing exactly one expected revision. */
	async replace(
		ownerId: string,
		versionId: string,
		revision: number,
		draft: HolidayDraft,
	): Promise<void> {
		const changed = await sql<{ id: string }>`
UPDATE hcm.holiday_calendar_version SET name=${draft.name},effective_from=${draft.effectiveFrom}::date,effective_to=${draft.effectiveTo ?? null}::date,revision=revision+1,updated_at=clock_timestamp()
WHERE tenant_id=${this.tenantId} AND calendar_id=${ownerId} AND id=${versionId} AND revision=${revision} AND state='Draft' RETURNING id
`.execute(this.transaction)
		if (!changed.rows.length) throw new HcmDomainError('revision-conflict')
		await sql`DELETE FROM hcm.holiday WHERE tenant_id=${this.tenantId} AND version_id=${versionId}`.execute(
			this.transaction,
		)
		await this.insertEntries(versionId, draft)
	}
	/** Preserve declared categories, dates, order, priority and exact local partial intervals without substituting dates. */
	private async insertEntries(versionId: string, draft: HolidayDraft): Promise<void> {
		if (!draft.entries.length) return
		const entries = draft.entries.map(
			/** Produce transient typed insert parameters, excluding read metadata. */ (
				entry,
				index,
			) => ({
				id: randomUUID(),
				ordinal: index + 1,
				...entry,
				startChoice: entry.overlapOffset?.start ?? null,
				endChoice: entry.overlapOffset?.end ?? null,
			}),
		)
		await sql`
INSERT INTO hcm.holiday(tenant_id,id,version_id,ordinal,actual_date,observed_date,category,name,priority,region_code,location_id,start_time,end_time,start_overlap_choice,end_overlap_choice)
SELECT ${this.tenantId},x.id,${versionId},x.ordinal,x.date::date,x."observedDate"::date,x.category,x.name,x.priority,x."regionCode",x."locationId",x."startTime"::time,x."endTime"::time,x."startChoice",x."endChoice"
FROM jsonb_to_recordset(${JSON.stringify(entries)}::jsonb) AS x(id text,ordinal integer,date text,"observedDate" text,category text,name text,priority integer,"regionCode" text,"locationId" text,"startTime" text,"endTime" text,"startChoice" text,"endChoice" text)
`.execute(this.transaction)
	}
}
