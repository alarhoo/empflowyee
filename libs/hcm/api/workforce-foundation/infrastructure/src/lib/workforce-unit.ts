import type { Kysely } from 'kysely'
import { SqlCommandReceipts } from '@empflowyee/hcm-api-database-kysely'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	WorkforceUnitOfWork,
	type WorkforceWork,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import { organisationToday } from './business-date'
import { KyselyStructureRepository, type WorkforceScope } from './structure-repository'
import { KyselyIdentificationTypeRepository } from './identification-type-repository'
import { KyselyWorkforceFacts, KyselyWorkforceReads } from './workforce-facts'
import { KyselyLookupRepository } from './lookup-repository'

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
					identification: new KyselyIdentificationTypeRepository(scope),
					lookups: new KyselyLookupRepository(scope),
					facts: new KyselyWorkforceFacts(scope),
					reads: new KyselyWorkforceReads(scope),
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
