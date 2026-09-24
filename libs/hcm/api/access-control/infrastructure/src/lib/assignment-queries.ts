import { contextCursor, readContextCursor } from './context-cursor'
import { sql } from 'kysely'
import {
	type ContextQuery,
	type Page,
	type RoleAssignee,
} from '@empflowyee/hcm-access-control-contract'
import type { AuthorizedAccessWork } from './hcm-api-access-control-infrastructure'

/** Assignment-owned queries reused by Role Management and Access Assignments. */
export class KyselyAssignmentQueries {
	/** Bind the read projection to verified tenant authority. */
	constructor(private readonly scope: AuthorizedAccessWork) {}
	/** Read one stable page of current grants, without copying grant mutation policy into Role Management. */
	async assignees(roleId: string, query: ContextQuery): Promise<Page<RoleAssignee>> {
		const after =
			readContextCursor(query.cursor, 'accountId:asc', roleId, query.limit, 1)?.[0] ?? ''
		const rows = (
			await sql<RoleAssignee>`SELECT a.id AS "accountId",p.display_name AS "displayName",a.email,a.enabled,g.grant_id AS "grantId"
		 FROM hcm.account_role g JOIN hcm.user_account a ON a.tenant_id=g.tenant_id AND a.id=g.account_id
		 JOIN hcm.person p ON p.tenant_id=a.tenant_id AND p.id=a.person_id
		 WHERE g.tenant_id=${this.scope.actor.tenantId} AND g.role_id=${roleId} AND a.id>${after}
		 ORDER BY a.id LIMIT ${query.limit + 1}`.execute(this.scope.transaction)
		).rows
		const items = rows.slice(0, query.limit),
			last = items.at(-1)
		let nextCursor: string | null = null
		if (rows.length > query.limit && last)
			nextCursor = contextCursor('accountId:asc', roleId, query.limit, [last.accountId])
		return { items, nextCursor }
	}
}
