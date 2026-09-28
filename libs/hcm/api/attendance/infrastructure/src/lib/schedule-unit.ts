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
	AttendanceScheduleUnitOfWork,
	type AttendanceScheduleWork,
	type ScheduleApplication,
} from '@empflowyee/hcm-api-attendance-application'
import { KyselyScheduleRepository } from './schedule-repository'
import { SqlAttendanceCommandReceipts } from './command-receipts'

/** Compose schedule configuration commands on Access Control's current-authority transaction boundary. */
export class KyselyAttendanceScheduleUnit extends AttendanceScheduleUnitOfWork {
	/** Reuse the existing database authorization and field encryption capabilities. */
	constructor(
		private readonly database: HcmAccessDatabase | null,
		private readonly cipher: FieldCipher,
	) {
		super()
	}

	/** Global roots require a tenant-wide operation grant; writes serialize with revocation and other configuration changes. */
	async execute<T>(
		context: AuthenticatedHcmContext,
		app: ScheduleApplication,
		operation: 'draft' | 'read',
		write: boolean,
		work: (scope: AttendanceScheduleWork) => Promise<T>,
	): Promise<T> {
		if (!this.database) throw new Error('Attendance runtime unavailable')
		const prefix =
			app === 'Templates'
				? 'hcm.attendance.work-schedule-templates.'
				: 'hcm.attendance.work-schedules.'
		try {
			return await this.database.execute(
				context,
				{ permission: prefix + operation, entitlement: 'hcm.attendance' },
				write,
				/** Bind every adapter to the same verified tenant transaction. */ async (access) => {
					const transaction = access.transaction as unknown as Kysely<unknown>
					const { tenantId, accountId } = access.actor
					/** Returning a stored response requires current source read authority. */
					const requireRead = async (): Promise<void> => {
						await new TransactionalAccessPolicy(access.transaction, context).require({
							permission: prefix + 'read',
							entitlement: 'hcm.attendance',
						})
					}
					const result = await work({
						schedules: new KyselyScheduleRepository(transaction, tenantId, accountId),
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
