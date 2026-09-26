import type { Kysely } from 'kysely'
import { SqlCommandReceipts } from '@empflowyee/hcm-api-database-kysely'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	JobArchitectureUnitOfWork,
	type JobArchitectureWork,
} from '@empflowyee/hcm-api-job-architecture-application'
import type { WorkforcePortBinder } from '@empflowyee/hcm-api-workforce-foundation-application'
import { KyselyCatalogueRepository } from './catalogue-repository'

export class KyselyJobArchitectureUnitOfWork extends JobArchitectureUnitOfWork {
	/** Reuse the verified access transaction boundary; the business date comes from workforce. */
	constructor(
		private readonly database: HcmAccessDatabase | null,
		private readonly workforce: WorkforcePortBinder,
	) {
		super()
	}

	/** Reauthorize the permission and bind adapters, audit and receipts to one transaction. */
	async execute<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		write: boolean,
		work: (scope: JobArchitectureWork) => Promise<T>,
	): Promise<T> {
		if (!this.database) throw new Error('Business runtime unavailable')
		return this.database.execute(
			context,
			{ permission: 'hcm.job-architecture.' + permission, entitlement: 'hcm.job-architecture' },
			write,
			/** Compose job architecture adapters on the authorized executor. */ async (access) => {
				const executor = access.transaction as unknown as Kysely<unknown>
				const actor = { tenantId: access.actor.tenantId, accountId: access.actor.accountId }
				const reads = this.workforce.bind(executor, actor).reads
				return work({
					accountId: actor.accountId,
					catalogue: new KyselyCatalogueRepository({ executor, ...actor }),
					receipts: new SqlCommandReceipts(
						executor,
						'hcm.job_architecture_command_receipt',
						actor.tenantId,
						actor.accountId,
					),
					audit: access.audit,
					today: await reads.businessToday(),
				})
			},
		)
	}
}
