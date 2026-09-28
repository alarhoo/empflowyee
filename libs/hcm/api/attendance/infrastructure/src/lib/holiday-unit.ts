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
	AttendanceHolidayUnitOfWork,
	type AttendanceHolidayWork,
} from '@empflowyee/hcm-api-attendance-application'
import { KyselyHolidayRepository } from './holiday-repository'
import { SqlAttendanceCommandReceipts } from './command-receipts'

/** Holiday-root commands use current tenant-wide grants and the existing revocation/transaction boundary. */
export class KyselyAttendanceHolidayUnit extends AttendanceHolidayUnitOfWork {
	/** Reuse Access Control and Runtime encryption without creating another trust or storage boundary. */
	constructor(
		private readonly database: HcmAccessDatabase | null,
		private readonly cipher: FieldCipher,
	) {
		super()
	}
	/** Authorize the explicit operation before all reads, mutations and receipt recovery. */
	async execute<T>(
		context: AuthenticatedHcmContext,
		operation: 'draft' | 'read',
		write: boolean,
		work: (scope: AttendanceHolidayWork) => Promise<T>,
	): Promise<T> {
		if (!this.database) throw new Error('Attendance runtime unavailable')
		const prefix = 'hcm.attendance.holiday-calendars.'
		try {
			return await this.database.execute(
				context,
				{ permission: prefix + operation, entitlement: 'hcm.attendance' },
				write,
				/** Bind every adapter and audit effect to one verified tenant transaction. */ async (
					access,
				) => {
					const transaction = access.transaction as unknown as Kysely<unknown>
					const { tenantId, accountId } = access.actor
					const result = await work({
						holidayCalendars: new KyselyHolidayRepository(transaction, tenantId, accountId),
						receipts: new SqlAttendanceCommandReceipts(
							transaction,
							tenantId,
							accountId,
							this.cipher.bind(transaction, tenantId),
						),
						audit: access.audit,
						requireRead: /** Recheck read authority on replay. */ async () => {
							await new TransactionalAccessPolicy(access.transaction, context).require({
								permission: prefix + 'read',
								entitlement: 'hcm.attendance',
							})
						},
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
