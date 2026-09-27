import { sql, type Kysely } from 'kysely'
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
import type { PositionReadPortBinder } from '@empflowyee/hcm-api-job-architecture-application'
import type { DocumentStoragePort } from '@empflowyee/hcm-api-documents-application'
import { KyselyEmploymentChangeRepository } from './employment-change-repository'
import { KyselyEmployeeImportRepository } from './employee-import-repository'
import { KyselyProbationRepository } from './probation-repository'
import { KyselyProfilePolicyRepository } from './profile-policy-repository'
import { KyselySelfServiceRepository } from './self-service-repository'

export class KyselyEmployeeUnitOfWork extends EmployeeUnitOfWork {
	/** Reuse the verified access transaction boundary and the workforce ports. */
	constructor(
		private readonly database: HcmAccessDatabase | null,
		private readonly workforce: WorkforcePortBinder,
		private readonly positions: PositionReadPortBinder,
		private readonly documents: DocumentStoragePort,
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
				const held = new Map<string, Promise<boolean>>()
				return work({
					accountId: actor.accountId,
					policy,
					visibility: new PolicyProfileFieldVisibility(policy),
					team: new TeamScopeResolver(reads),
					reads,
					directory: workforce.directory,
					profile: workforce.profile,
					facts: workforce.facts,
					records: workforce.records,
					structure: workforce.structure,
					changes: workforce.changes,
					changeRequests: new KyselyEmploymentChangeRepository(scope),
					positions: this.positions.bind(executor, actor),
					imports: new KyselyEmployeeImportRepository(scope),
					sources: this.documents.bind(executor, actor),
					probation: new KyselyProbationRepository(scope),
					holds: /** Check one more business grant, once per transaction. */ (permission) => {
						const code = 'hcm.employee.' + permission
						let result = held.get(code)
						if (!result) {
							result = this.holds(executor, actor.accountId, code)
							held.set(code, result)
						}
						return result
					},
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
		const [row] = (await query.execute(executor)).rows
		return row?.held === true
	}
}
