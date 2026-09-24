import { sql } from 'kysely'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import { SecuritySummaryReader } from '@empflowyee/hcm-api-identity-access-application'
import type {
	SecuritySummary,
	SecurityRoleQuery,
	SecurityRoles,
	IdentityQuery,
} from '@empflowyee/hcm-identity-access-contract'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import {
	KyselyIdentityAccounts,
	identityPosition,
	identityPage,
	identitySearch,
} from './hcm-api-identity-access-infrastructure'

const requirement = {
	permission: 'hcm.identity-access.security.self.read',
	entitlement: 'hcm.identity-access',
}
export class KyselySecuritySummaryReader extends SecuritySummaryReader {
	/** Bind self projections to the shared reauthorization and tenant executor. */
	constructor(private readonly database: HcmAccessDatabase | null) {
		super()
	}
	/** Read persisted identity for the private authenticated actor only. */
	async summary(context: AuthenticatedHcmContext): Promise<SecuritySummary> {
		if (!this.database) throw new Error('Business runtime unavailable')
		return this.database.execute(
			context,
			requirement,
			false,
			/** Combine own identity with the verified local-session envelope. */ async (scope) => {
				if (!context.session.development || !context.session.session.expiresAt)
					throw new Error('Local session projection unavailable')
				const account = await new KyselyIdentityAccounts(scope).get(scope.actor.accountId)
				return {
					accountId: account.id,
					displayName: account.displayName,
					email: account.email,
					enabled: account.enabled,
					sessionMode: 'local-development',
					expiresAt: context.session.session.expiresAt,
				}
			},
		)
	}
	/** Read assignment-owned labels without granting a tenant-wide account picker or writer. */
	async roles(context: AuthenticatedHcmContext, query: SecurityRoleQuery): Promise<SecurityRoles> {
		if (!this.database) throw new Error('Business runtime unavailable')
		return this.database.execute(
			context,
			requirement,
			false,
			/** Restrict both joins and cursor binding to the verified account. */ async (scope) => {
				const control: IdentityQuery = { ...query, sort: 'displayName:asc' }
				const kind = `self-roles:${scope.actor.tenantId}:${scope.actor.accountId}`
				const after = identityPosition(control, kind)
				const rows = (
					await sql<{
						id: string
						displayName: string
					}>`SELECT r.id,r.label AS "displayName" FROM hcm.account_role g JOIN hcm.access_role r ON r.tenant_id=g.tenant_id AND r.id=g.role_id WHERE g.tenant_id=${scope.actor.tenantId} AND g.account_id=${scope.actor.accountId} ${query.q ? sql`AND r.label ILIKE ${identitySearch(query.q)}` : sql``} ${after ? sql`AND (r.label,r.id)>(${after[0]},${after[1]})` : sql``} ORDER BY r.label,r.id LIMIT ${query.limit + 1}`.execute(
						scope.transaction,
					)
				).rows
				const page = identityPage(rows, control, kind)
				return {
					...page,
					items: page.items.map(
						/** Strip internal sort projection fields from the public role label. */ (row) => ({
							id: row.id,
							label: row.displayName,
						}),
					),
				}
			},
		)
	}
}
