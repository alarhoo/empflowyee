import { sql, type Kysely } from 'kysely'
import type { HcmPage } from '@empflowyee/hcm-runtime-contract'
import type { HolidayListQuery, HolidayVersionView } from '@empflowyee/hcm-attendance-contract'
import type { HolidayQueryRepository } from '@empflowyee/hcm-api-attendance-application'
import { commandHash } from '@empflowyee/hcm-api-runtime-application'
import { likePattern } from '@empflowyee/hcm-api-database-kysely'
import { holidayVersionProjection } from './configuration-readers'
import { AttendanceQueryCursors } from './query-cursors'

/** Latest holiday versions and deterministic authenticated continuation, with no implicit scope authority. */
export class KyselyHolidayQueries implements HolidayQueryRepository {
	/** Bind list projection and continuation to the currently authorized grant. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenantId: string,
		private readonly accountId: string,
		private readonly grantId: string,
	) {}
	/** Select latest versions before filtering, with a deterministic same-direction ID tie-break and no client-supplied SQL. */
	async list(query: HolidayListQuery): Promise<HcmPage<HolidayVersionView>> {
		const generation = (
			await sql<{ revision: string }>`
SELECT coalesce(sum(v.revision),0)::text AS revision FROM hcm.holiday_calendar_version v
JOIN hcm.holiday_calendar r ON r.tenant_id=v.tenant_id AND r.id=v.calendar_id
WHERE r.tenant_id=${this.tenantId}
`.execute(this.transaction)
		).rows[0].revision
		const { cursor, ...parameters } = query
		const binding = commandHash('HolidayList', {
			tenant: this.tenantId,
			actor: this.accountId,
			grant: this.grantId,
			permission: 'hcm.attendance.holiday-calendars.read',
			scope: 'Tenant',
			parameters,
			generation,
		})
		const cursors = new AttendanceQueryCursors(this.transaction, this.tenantId, this.accountId)
		const after =
			cursor === undefined ? null : await cursors.read('HOLIDAY_CALENDARS', cursor, binding)
		const fields = { code: sql`r.code`, name: sql`v.name`, state: sql`v.state`, id: sql`r.id` }
		const sort = fields[query.sort]
		const direction = query.direction === 'asc' ? sql`ASC` : sql`DESC`
		const compare = query.direction === 'asc' ? sql`>` : sql`<`
		const clauses = [sql`r.tenant_id=${this.tenantId}`]
		if (query.id) clauses.push(sql`r.id=${query.id}`)
		if (query.code) clauses.push(sql`r.code ILIKE ${likePattern(query.code)}`)
		if (query.name) clauses.push(sql`v.name ILIKE ${likePattern(query.name)}`)
		if (query.state) clauses.push(sql`v.state=${query.state}`)
		if (after)
			clauses.push(
				sql`(${sort} COLLATE "C",r.id COLLATE "C") ${compare} (${after.value},${after.id})`,
			)
		const rows = (
			await sql<{ view: HolidayVersionView; sortValue: string }>`
SELECT ${holidayVersionProjection} AS view, ${sort} AS "sortValue" FROM hcm.holiday_calendar r
JOIN LATERAL (SELECT v1.* FROM hcm.holiday_calendar_version v1 WHERE v1.tenant_id=r.tenant_id AND v1.calendar_id=r.id ORDER BY v1.version_number DESC LIMIT 1) v ON TRUE
WHERE ${sql.join(clauses, sql` AND `)} ORDER BY ${sort} COLLATE "C" ${direction},r.id COLLATE "C" ${direction} LIMIT ${query.limit + 1}
`.execute(this.transaction)
		).rows
		const page = rows.slice(0, query.limit)
		const last = page.at(-1)
		let nextCursor: string | null = null
		if (rows.length > query.limit && last)
			nextCursor = await cursors.store('HOLIDAY_CALENDARS', binding, {
				value: last.sortValue,
				id: last.view.id,
			})
		return {
			items: page.map(
				/** Expose only the declared DTO, never pagination or persistence internals. */ (row) =>
					row.view,
			),
			nextCursor,
		}
	}
}
