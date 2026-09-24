import { sql } from 'kysely'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import { DomainProjectionReader } from '@empflowyee/hcm-api-identity-access-application'
import type { DomainProjection } from '@empflowyee/hcm-identity-access-contract'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'

export class KyselyDomainProjectionReader extends DomainProjectionReader {
	/** Reuse the existing runtime-role transaction boundary without acquiring table ownership. */
	constructor(private readonly database: HcmAccessDatabase | null) {
		super()
	}
	/** Reauthorize the caller and restrict the global routing index to the verified tenant. */
	async read(context: AuthenticatedHcmContext): Promise<DomainProjection> {
		if (!this.database) throw new Error('Business runtime unavailable')
		return this.database.execute(
			context,
			{
				permission: 'hcm.identity-access.domains.read',
				entitlement: 'hcm.identity-access',
			},
			false,
			/** Project only approved hostname and lifecycle fields. */ async (scope) => {
				const tenant = (
					await sql<{
						slug: string
						status: DomainProjection['tenantStatus']
					}>`SELECT slug,status FROM hcm.tenant WHERE id=${scope.actor.tenantId}`.execute(
						scope.transaction,
					)
				).rows[0]
				if (!tenant) throw new Error('Tenant projection unavailable')
				const hostnames = (
					await sql<{
						hostname: string
					}>`SELECT hostname FROM hcm.tenant_hostname WHERE tenant_id=${scope.actor.tenantId} ORDER BY hostname`.execute(
						scope.transaction,
					)
				).rows
				return {
					tenantSlug: tenant.slug,
					tenantStatus: tenant.status,
					source: 'account-projection',
					hostnames,
				}
			},
		)
	}
}
