import { sql, type Kysely } from 'kysely'
import { SqlCommandReceipts } from '@empflowyee/hcm-api-database-kysely'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import type { AuthenticatedHcmContext, FieldCipher } from '@empflowyee/hcm-api-runtime-application'
import {
	JobArchitectureUnitOfWork,
	type JobArchitectureWork,
} from '@empflowyee/hcm-api-job-architecture-application'
import type { WorkforcePortBinder } from '@empflowyee/hcm-api-workforce-foundation-application'
import { KyselyCatalogueRepository } from './catalogue-repository'
import { KyselyPositionRepository } from './position-repository'

export class KyselyJobArchitectureUnitOfWork extends JobArchitectureUnitOfWork {
	/** Reuse the verified access transaction boundary; the business date comes from workforce. */
	constructor(
		private readonly database: HcmAccessDatabase | null,
		private readonly workforce: WorkforcePortBinder,
		private readonly cipher: FieldCipher,
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
				const workforce = this.workforce.bind(executor, actor)
				const held = new Map<string, Promise<boolean>>()
				return work({
					accountId: actor.accountId,
					catalogue: new KyselyCatalogueRepository({ executor, ...actor }),
					positions: new KyselyPositionRepository({ executor, ...actor }),
					cipher: this.cipher.bind(executor, actor.tenantId),
					structure: workforce.structure,
					occupancy: workforce.occupancy,
					holds: /** Check one more business grant, once per transaction. */ (permission) => {
						const code = 'hcm.job-architecture.' + permission
						let result = held.get(code)
						if (!result) {
							result = this.holds(executor, actor.accountId, code)
							held.set(code, result)
						}
						return result
					},
					receipts: new SqlCommandReceipts(
						executor,
						'hcm.job_architecture_command_receipt',
						actor.tenantId,
						actor.accountId,
					),
					audit: access.audit,
					today: await workforce.reads.businessToday(),
				})
			},
		)
	}

	/** Whether an account holds a business-operation grant, under the same rules as authorization. */
	private async holds(
		executor: Kysely<unknown>,
		accountId: string,
		code: string,
	): Promise<boolean> {
		const query = sql<{ held: boolean }>`SELECT EXISTS (SELECT 1 FROM hcm.account_role a
			JOIN hcm.role_permission p ON p.tenant_id=a.tenant_id AND p.role_id=a.role_id
			JOIN hcm.access_permission d ON d.tenant_id=p.tenant_id AND d.code=p.permission_code
			WHERE a.account_id=${accountId} AND p.permission_code=${code} AND d.kind='business-operation') AS held`
		const { rows } = await query.execute(executor)
		return rows[0]?.held === true
	}
}
