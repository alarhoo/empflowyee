import { createHash, randomBytes } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { invalidField } from '@empflowyee/hcm-runtime-contract'

export type AttendanceCursorApp =
	| 'WORK_SCHEDULE_TEMPLATES'
	| 'WORK_SCHEDULES'
	| 'HOLIDAY_CALENDARS'
	| 'SHIFTS'
	| 'ATTENDANCE_POLICIES'
export interface AttendanceCursorPosition {
	value: string
	id: string
}

/** Shared owner-domain continuation mechanics; callers retain query construction and current authorization. */
export class AttendanceQueryCursors {
	/** Bind hash-only cursor reads/writes to the authenticated actor's tenant transaction. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenantId: string,
		private readonly accountId: string,
	) {}
	/** Validate the unpredictable handle against server-owned tenant, actor, query, grant and source revision facts. */
	async read(
		app: AttendanceCursorApp,
		cursor: string,
		binding: string,
	): Promise<AttendanceCursorPosition> {
		const token = createHash('sha256').update(cursor).digest('hex')
		const result = await sql<AttendanceCursorPosition>`
SELECT last_sort_value AS value,last_id AS id FROM hcm.attendance_query_cursor
WHERE tenant_id=${this.tenantId} AND token_digest=${token} AND actor_account_id=${this.accountId}
  AND app_code=${app} AND binding_digest=${binding} AND expires_at>clock_timestamp()
`.execute(this.transaction)
		if (!result.rows[0]) invalidField('cursor', 'stale-or-invalid')
		return result.rows[0]
	}

	/** Persist a hash-only continuation and prune at most 100 expired cache entries without a scheduling loop. */
	async store(
		app: AttendanceCursorApp,
		binding: string,
		position: AttendanceCursorPosition,
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
VALUES(${this.tenantId},${digest},${this.accountId},${app},${binding},${position.value},${position.id},statement_timestamp(),statement_timestamp()+interval '15 minutes')
`.execute(this.transaction)
		return token
	}
}
