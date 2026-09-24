import { sql, type Kysely } from 'kysely'
import type { AuditTables } from './hcm-api-audit-infrastructure'

export interface RoleHistoryProjection {
	id: string
	occurredAt: string
	actorAccountId: string
	action: string
	outcome: string
	summary: { reason: string; changedFields: string[] }
}
/** Audit-owned read projection bound to an already authorized transaction. */
export async function readRoleHistory(
	transaction: Kysely<AuditTables>,
	tenantId: string,
	roleId: string,
	limit: number,
	after?: { time: string; id: string },
): Promise<RoleHistoryProjection[]> {
	const position = after
		? sql`(occurred_at,id)<(${after.time}::timestamptz,${after.id})`
		: sql`true`
	const rows = (
		await sql<RoleHistoryProjection>`SELECT id,occurred_at::text AS "occurredAt",actor_account_id AS "actorAccountId",action,outcome,
	 jsonb_build_object('reason',safe_summary->>'reason','changedFields',safe_summary->'changedFields') AS summary
	 FROM hcm.audit_event WHERE tenant_id=${tenantId} AND target_type='access-role' AND target_id=${roleId}
	 AND action IN ('role.created','role.updated','role.deleted') AND ${position}
	 ORDER BY occurred_at DESC,id DESC LIMIT ${limit}`.execute(transaction)
	).rows
	return rows
}
