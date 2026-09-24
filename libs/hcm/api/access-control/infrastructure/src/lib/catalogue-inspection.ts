import { sql } from 'kysely'
import {
	CatalogueInspectionUnit,
	type CatalogueInspectionWork,
} from '@empflowyee/hcm-api-access-control-application'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type {
	AssignmentQuery,
	CatalogueAccount,
	Page,
} from '@empflowyee/hcm-access-control-contract'
import {
	HcmAccessDatabase,
	type AuthorizedAccessWork,
} from './hcm-api-access-control-infrastructure'
import { KyselyAssignmentAccounts } from './assignment-repository'
class KyselyCatalogueQueries implements CatalogueInspectionWork {
	private readonly accountProjection: KyselyAssignmentAccounts
	/** Bind all projections to the same authorized tenant transaction. */
	constructor(private readonly scope: AuthorizedAccessWork) {
		this.accountProjection = new KyselyAssignmentAccounts(scope)
	}
	/** Read enabled commercial projections without exposing mutation capability. */
	async entitlements(): Promise<string[]> {
		return (
			await sql<{
				code: string
			}>`SELECT code FROM hcm.tenant_entitlement WHERE tenant_id=${this.scope.actor.tenantId} AND enabled ORDER BY code`.execute(
				this.scope.transaction,
			)
		).rows.map(/** Return only safe capability codes. */ (row) => row.code)
	}
	/** Reuse bounded account pagination but strip identity lifecycle and assignment details. */
	async accounts(query: AssignmentQuery): Promise<Page<CatalogueAccount>> {
		const page = await this.accountProjection.list(query)
		return {
			...page,
			items: page.items.map(
				/** Expose only the approved picker projection. */ (row) => ({
					id: row.accountId,
					displayName: row.displayName,
					email: row.email,
				}),
			),
		}
	}
	/** Query actual grants for a tenant subject without creating an impersonated session. */
	async subject(id: string) {
		const account = await this.accountProjection.get(id)
		const roles = (
			await sql<{
				id: string
			}>`SELECT role_id AS id FROM hcm.account_role WHERE tenant_id=${this.scope.actor.tenantId} AND account_id=${id} ORDER BY role_id`.execute(
				this.scope.transaction,
			)
		).rows.map(/** Project persisted role identities for canonical placement. */ (row) => row.id)
		const permissions = (
			await sql<{
				code: string
			}>`SELECT DISTINCT p.permission_code AS code FROM hcm.account_role g JOIN hcm.role_permission p ON p.tenant_id=g.tenant_id AND p.role_id=g.role_id WHERE g.tenant_id=${this.scope.actor.tenantId} AND g.account_id=${id} ORDER BY p.permission_code`.execute(
				this.scope.transaction,
			)
		).rows.map(
			/** Project granted permission codes for the shared discovery predicate. */ (row) => row.code,
		)
		return {
			enabled: account.enabled,
			access: { roles, permissions, entitlements: await this.entitlements(), featureFlags: [] },
		}
	}
}
export class KyselyCatalogueInspectionUnit extends CatalogueInspectionUnit {
	/** Reuse common access authorization; this slice adds no writes or grants. */
	constructor(private readonly database: HcmAccessDatabase | null) {
		super()
	}
	/** Retain verified caller authority independently of optional subject selection. */
	async execute<T>(
		context: AuthenticatedHcmContext,
		work: (scope: CatalogueInspectionWork) => Promise<T>,
	): Promise<T> {
		if (!this.database) throw new Error('Business runtime unavailable')
		return this.database.execute(
			context,
			{ permission: 'hcm.access-control.catalogue.read', entitlement: 'hcm.access-control' },
			false,
			/** Bind read adapters to the authorized executor. */ (scope) =>
				work(new KyselyCatalogueQueries(scope)),
		)
	}
}
