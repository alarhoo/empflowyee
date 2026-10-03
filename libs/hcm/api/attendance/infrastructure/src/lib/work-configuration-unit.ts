import type { Kysely } from 'kysely'
import {
	HcmAccessDatabase,
	TransactionalAccessPolicy,
} from '@empflowyee/hcm-api-access-control-infrastructure'
import { classifyConstraint } from '@empflowyee/hcm-api-database-kysely'
import {
	requireAuthenticatedTenant,
	type AuthenticatedHcmContext,
	type FieldCipher,
} from '@empflowyee/hcm-api-runtime-application'
import {
	WorkConfigurationUnitOfWork,
	type WorkConfigurationWork,
	type WorkConfigurationFamily,
} from '@empflowyee/hcm-api-attendance-application'
import { KyselyWorkConfigurationRepository } from './work-configuration-repository'
import { KyselyPolicyPreviews } from './policy-previews'
import { SqlAttendanceCommandReceipts } from './command-receipts'
import type { WorkforcePortBinder } from '@empflowyee/hcm-api-workforce-foundation-application'
import { KyselyHolidayReferences } from './holiday-references'

/** Compose policy and shift commands on Access Control's current-authority transaction boundary. */
export class KyselyWorkConfigurationUnit extends WorkConfigurationUnitOfWork {
	/** Reuse the existing database authorization and field encryption capabilities. */
	constructor(
		private readonly database: HcmAccessDatabase | null,
		private readonly cipher: FieldCipher,
		private readonly workforceReferences?: WorkforcePortBinder,
	) {
		super()
	}

	/** Global roots require a tenant-wide operation grant; writes serialize with revocation and other configuration changes. */
	async execute<T>(
		context: AuthenticatedHcmContext,
		family: WorkConfigurationFamily,
		operation: 'read' | 'draft' | 'preview' | 'publish' | 'retire',
		write: boolean,
		work: (scope: WorkConfigurationWork) => Promise<T>,
	): Promise<T> {
		if (!this.database) throw new Error('Attendance runtime unavailable')
		const prefix = 'hcm.attendance.work-schedules.'
		try {
			return await this.database.execute(
				context,
				{ permission: prefix + operation, entitlement: 'hcm.attendance' },
				write,
				/** Bind every adapter to the same verified tenant transaction. */ async (access) => {
					const transaction = access.transaction as unknown as Kysely<unknown>
					const { tenantId, accountId } = access.actor
					if (!access.actor.grantId) throw new Error('Verified configuration grant unavailable')
					/** Returning a stored response requires current source read authority. */
					const requireRead = async (): Promise<void> => {
						await new TransactionalAccessPolicy(access.transaction, context).require({
							permission: prefix + 'read',
							entitlement: 'hcm.attendance',
						})
					}
					const result = await work({
						references: this.workforceReferences
							? new KyselyHolidayReferences(
								this.workforceReferences.bind(transaction, { tenantId, accountId }),
							)
							: undefined,
						previews: new KyselyPolicyPreviews(transaction, tenantId, accountId),
						configurations: new KyselyWorkConfigurationRepository(
							transaction,
							tenantId,
							accountId,
							access.actor.grantId,
							family,
						),
						receipts: new SqlAttendanceCommandReceipts(
							transaction,
							tenantId,
							accountId,
							this.cipher.bind(transaction, tenantId),
						),
						audit: access.audit,
						requireRead,
					})
					requireAuthenticatedTenant(context)
					return result
				},
			)
		} catch (error) {
			return classifyConstraint(error)
		}
	}
}
