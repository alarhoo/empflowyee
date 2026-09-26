import type { Kysely } from 'kysely'
import { SqlCommandReceipts } from '@empflowyee/hcm-api-database-kysely'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	EmployeeUnitOfWork,
	PolicyProfileFieldVisibility,
	TeamScopeResolver,
	type EmployeeWork,
	type ProfilePolicyRepository,
} from '@empflowyee/hcm-api-employee-application'
import type { WorkforcePortBinder } from '@empflowyee/hcm-api-workforce-foundation-application'
import { KyselyProfilePolicyRepository } from './profile-policy-repository'
import { KyselySelfServiceRepository } from './self-service-repository'

export class KyselyEmployeeUnitOfWork extends EmployeeUnitOfWork {
	/** Reuse the verified access transaction boundary and the workforce ports. */
	constructor(
		private readonly database: HcmAccessDatabase | null,
		private readonly workforce: WorkforcePortBinder,
	) {
		super()
	}

	/** Reauthorize the employee permission and bind adapters, audit and receipts to one transaction. */
	async execute<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		write: boolean,
		work: (scope: EmployeeWork) => Promise<T>,
	): Promise<T> {
		if (!this.database) throw new Error('Business runtime unavailable')
		return this.database.execute(
			context,
			{ permission: 'hcm.employee.' + permission, entitlement: 'hcm.employee' },
			write,
			/** Compose employee adapters on the authorized executor. */ async (access) => {
				const executor = access.transaction as unknown as Kysely<unknown>
				const actor = { tenantId: access.actor.tenantId, accountId: access.actor.accountId }
				const scope = { executor, ...actor }
				const policy: ProfilePolicyRepository = new KyselyProfilePolicyRepository(scope)
				const workforce = this.workforce.bind(executor, actor)
				const reads = workforce.reads
				return work({
					accountId: actor.accountId,
					policy,
					visibility: new PolicyProfileFieldVisibility(policy),
					team: new TeamScopeResolver(reads),
					reads,
					directory: workforce.directory,
					profile: workforce.profile,
					selfService: new KyselySelfServiceRepository(scope),
					receipts: new SqlCommandReceipts(
						executor,
						'hcm.employee_command_receipt',
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
