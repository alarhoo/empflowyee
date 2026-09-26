import { sql, type Kysely } from 'kysely'
import { SqlCommandReceipts } from '@empflowyee/hcm-api-database-kysely'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	WorkforceUnitOfWork,
	type WorkforceWork,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import { todayIn } from '@empflowyee/hcm-api-workforce-foundation-domain'
import { KyselyStructureRepository, type WorkforceScope } from './structure-repository'

/** Resolve today's business date from the organisation profile, then the tenant default, then UTC. */
export async function organisationToday(
	executor: Kysely<unknown>,
	tenantId: string,
): Promise<string> {
	const row = (
		await sql<{
			zone: string | null
		}>`SELECT coalesce((SELECT default_time_zone FROM hcm.organisation_profile WHERE tenant_id=${tenantId}),(SELECT defaults->>'timezone' FROM hcm.tenant WHERE id=${tenantId})) AS zone`.execute(
			executor,
		)
	).rows[0]
	try {
		return todayIn(row?.zone ?? 'UTC')
	} catch {
		return todayIn('UTC')
	}
}

export class KyselyWorkforceUnitOfWork extends WorkforceUnitOfWork {
	/** Reuse the verified access transaction boundary without introducing a new trust boundary. */
	constructor(private readonly database: HcmAccessDatabase | null) {
		super()
	}
	/** Reauthorize the workforce permission and bind repositories, audit and receipts to one transaction. */
	async execute<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		write: boolean,
		work: (scope: WorkforceWork) => Promise<T>,
	): Promise<T> {
		if (!this.database) throw new Error('Business runtime unavailable')
		return this.database.execute(
			context,
			{
				permission: 'hcm.workforce-foundation.' + permission,
				entitlement: 'hcm.workforce-foundation',
			},
			write,
			/** Compose workforce adapters on the authorized executor. */ async (access) => {
				const scope: WorkforceScope = {
					executor: access.transaction as unknown as Kysely<unknown>,
					tenantId: access.actor.tenantId,
					accountId: access.actor.accountId,
				}
				return work({
					structure: new KyselyStructureRepository(scope),
					receipts: new SqlCommandReceipts(
						scope.executor,
						'hcm.workforce_command_receipt',
						scope.tenantId,
						scope.accountId,
					),
					audit: access.audit,
					today: await organisationToday(scope.executor, scope.tenantId),
				})
			},
		)
	}
}
