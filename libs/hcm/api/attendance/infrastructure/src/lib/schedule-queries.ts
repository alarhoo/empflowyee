import { createHash, randomBytes } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { invalidField, type HcmPage } from '@empflowyee/hcm-runtime-contract'
import type {
	ScheduleListQuery,
	ScheduleVersionView,
	ScheduleSeedDefaults,
} from '@empflowyee/hcm-attendance-contract'
import type {
	ScheduleApplication,
	ScheduleQueryRepository,
} from '@empflowyee/hcm-api-attendance-application'
import { commandHash } from '@empflowyee/hcm-api-runtime-application'
import { likePattern } from '@empflowyee/hcm-api-database-kysely'
import { scheduleVersionProjection } from './hcm-api-attendance-infrastructure'

interface Position {
	value: string
	id: string
}

/** Latest-version reads and opaque server-authenticated continuation inside one current-authority transaction. */
export class KyselyScheduleQueries implements ScheduleQueryRepository {
	/** Bind private cursor records to the actual authorized grant, never public session role claims. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenantId: string,
		private readonly accountId: string,
		private readonly grantId: string,
	) {}

	/** Read the tenant's draft defaults without dates, timezone or a fabricated resolved duration. */
	async defaults(): Promise<ScheduleSeedDefaults | null> {
		const result = await sql<{ view: ScheduleSeedDefaults }>`
SELECT jsonb_strip_nulls(jsonb_build_object('id',d.id,'revision',d.revision,'state','DraftDefaults','code',d.code,'name',d.name,'weekStartsOn',d.week_starts_on,
  'days',coalesce((SELECT jsonb_agg(jsonb_build_object('weekday',p.weekday,'kind',p.kind,'startTime',p.start_time::text,'endTime',p.end_time::text,
    'endDayOffset',p.end_day_offset,'unpaidBreakMinutes',p.unpaid_break_minutes) ORDER BY p.weekday)
    FROM hcm.work_schedule_seed_day p WHERE p.tenant_id=d.tenant_id AND p.default_id=d.id),'[]'::jsonb))) AS view
FROM hcm.work_schedule_seed_default d WHERE d.tenant_id=${this.tenantId}
`.execute(this.transaction)
		return result.rows[0]?.view ?? null
	}

	/** Project the requested version, hiding ordinary schedules on template routes and vice versa. */
	async detail(
		app: ScheduleApplication,
		ownerId: string,
		versionId?: string,
	): Promise<ScheduleVersionView | null> {
		const version = versionId === undefined ? sql`TRUE` : sql`v.id=${versionId}`
		const result = await sql<{ view: ScheduleVersionView }>`
SELECT ${scheduleVersionProjection} AS view FROM hcm.work_schedule s
JOIN hcm.work_schedule_version v ON v.tenant_id=s.tenant_id AND v.schedule_id=s.id
WHERE s.tenant_id=${this.tenantId} AND s.id=${ownerId} AND s.is_template=${app === 'Templates'} AND ${version}
ORDER BY v.version_number DESC LIMIT 1
`.execute(this.transaction)
		return result.rows[0]?.view ?? null
	}

	/** Select latest versions before filtering, with a deterministic same-direction ID tie-break and no client-supplied SQL. */
	async list(
		app: ScheduleApplication,
		query: ScheduleListQuery,
	): Promise<HcmPage<ScheduleVersionView>> {
		const generation = (
			await sql<{ revision: string }>`
SELECT coalesce(sum(v.revision),0)::text AS revision FROM hcm.work_schedule_version v
JOIN hcm.work_schedule s ON s.tenant_id=v.tenant_id AND s.id=v.schedule_id
WHERE s.tenant_id=${this.tenantId} AND s.is_template=${app === 'Templates'}
`.execute(this.transaction)
		).rows[0].revision
		const { cursor, ...parameters } = query
		const binding = commandHash('ScheduleList', {
			tenant: this.tenantId,
			actor: this.accountId,
			grant: this.grantId,
			permission:
				app === 'Templates'
					? 'hcm.attendance.work-schedule-templates.read'
					: 'hcm.attendance.work-schedules.read',
			scope: 'Tenant',
			parameters,
			generation,
		})
		const after = cursor === undefined ? null : await this.readCursor(app, cursor, binding)
		const fields = { code: sql`s.code`, name: sql`v.name`, state: sql`v.state`, id: sql`s.id` }
		const sort = fields[query.sort]
		const direction = query.direction === 'asc' ? sql`ASC` : sql`DESC`
		const compare = query.direction === 'asc' ? sql`>` : sql`<`
		const clauses = [sql`s.tenant_id=${this.tenantId}`, sql`s.is_template=${app === 'Templates'}`]
		if (query.id) clauses.push(sql`s.id=${query.id}`)
		if (query.code) clauses.push(sql`s.code ILIKE ${likePattern(query.code)}`)
		if (query.name) clauses.push(sql`v.name ILIKE ${likePattern(query.name)}`)
		if (query.state) clauses.push(sql`v.state=${query.state}`)
		if (after)
			clauses.push(
				sql`(${sort} COLLATE "C",s.id COLLATE "C") ${compare} (${after.value},${after.id})`,
			)
		const rows = (
			await sql<{ view: ScheduleVersionView; sortValue: string }>`
SELECT ${scheduleVersionProjection} AS view, ${sort} AS "sortValue" FROM hcm.work_schedule s
JOIN LATERAL (SELECT v1.* FROM hcm.work_schedule_version v1 WHERE v1.tenant_id=s.tenant_id AND v1.schedule_id=s.id ORDER BY v1.version_number DESC LIMIT 1) v ON TRUE
WHERE ${sql.join(clauses, sql` AND `)} ORDER BY ${sort} COLLATE "C" ${direction},s.id COLLATE "C" ${direction} LIMIT ${query.limit + 1}
`.execute(this.transaction)
		).rows
		const page = rows.slice(0, query.limit)
		const last = page.at(-1)
		const nextCursor =
			rows.length > query.limit && last
				? await this.storeCursor(app, binding, { value: last.sortValue, id: last.view.id })
				: null
		return {
			items: page.map(
				/** Expose only the declared DTO, never pagination or persistence internals. */ (row) =>
					row.view,
			),
			nextCursor,
		}
	}

	/** Validate the unpredictable handle against server-owned tenant, actor, query, grant and source revision facts. */
	private async readCursor(
		app: ScheduleApplication,
		cursor: string,
		binding: string,
	): Promise<Position> {
		const token = createHash('sha256').update(cursor).digest('hex')
		const result = await sql<Position>`
SELECT last_sort_value AS value,last_id AS id FROM hcm.attendance_query_cursor
WHERE tenant_id=${this.tenantId} AND token_digest=${token} AND actor_account_id=${this.accountId}
  AND app_code=${this.appCode(app)} AND binding_digest=${binding} AND expires_at>clock_timestamp()
`.execute(this.transaction)
		if (!result.rows[0]) invalidField('cursor', 'stale-or-invalid')
		return result.rows[0]
	}

	/** Persist a hash-only continuation and prune at most 100 expired cache entries without a scheduling loop. */
	private async storeCursor(
		app: ScheduleApplication,
		binding: string,
		position: Position,
	): Promise<string> {
		const token = randomBytes(32).toString('base64url')
		const digest = createHash('sha256').update(token).digest('hex')
		await sql`
DELETE FROM hcm.attendance_query_cursor WHERE tenant_id=${this.tenantId} AND token_digest IN (
  SELECT token_digest FROM hcm.attendance_query_cursor WHERE tenant_id=${this.tenantId} AND expires_at<=clock_timestamp()
  ORDER BY expires_at,token_digest LIMIT 100)
`.execute(this.transaction)
		await sql`
INSERT INTO hcm.attendance_query_cursor(tenant_id,token_digest,actor_account_id,app_code,binding_digest,last_sort_value,last_id,created_at,expires_at)
VALUES(${this.tenantId},${digest},${this.accountId},${this.appCode(app)},${binding},${position.value},${position.id},statement_timestamp(),statement_timestamp()+interval '15 minutes')
`.execute(this.transaction)
		return token
	}

	/** Map the closed application family to its persistent catalogue identity. */
	private appCode(app: ScheduleApplication): string {
		return app === 'Templates' ? 'WORK_SCHEDULE_TEMPLATES' : 'WORK_SCHEDULES'
	}
}
