import { sql } from 'kysely'
import {
	RoleError,
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
		let after = ''
		if (query.cursor) {
			try {
				const cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'))
				if (
					cursor.roleId !== roleId ||
					cursor.limit !== query.limit ||
					typeof cursor.accountId !== 'string' ||
					cursor.accountId.length > 200
				)
					throw new Error('cursor')
				after = cursor.accountId
			} catch {
				throw new RoleError('invalid-request')
			}
		}
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
			nextCursor = Buffer.from(
				JSON.stringify({ roleId, limit: query.limit, accountId: last.accountId }),
			).toString('base64url')
		return { items, nextCursor }
	}
}
