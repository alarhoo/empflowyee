import { sql, type Kysely } from 'kysely'
import { commandHash } from '@empflowyee/hcm-api-runtime-application'
import { idValue } from '@empflowyee/hcm-runtime-contract'
import {
	AttendancePeriodFenceBinder,
	attendancePeriodMonths,
	type AttendancePeriodFencePort,
	type AttendancePeriodBasis,
	type AttendancePeriodMonth,
} from '@empflowyee/hcm-api-attendance-application'

/** Read minimal period facts without creating or opening a missing month. */
class KyselyAttendancePeriodFence implements AttendancePeriodFencePort {
	/** The source command or workload owns the current authority and containing transaction. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenantId: string,
	) {}
	/** Observe current monthly input evidence; callers later compare the digest under publication fences. */
	async read(from: string, to: string): Promise<AttendancePeriodBasis> {
		return await this.snapshot(attendancePeriodMonths(from, to))
	}
	/** Acquire shared fences in chronological order, including absent months, before querying any state. */
	async fence(from: string, to: string): Promise<AttendancePeriodBasis> {
		const months = attendancePeriodMonths(from, to)
		for (const month of months)
			await sql`SELECT hcm.fence_attendance_month(${this.tenantId},${month}::date,false)`.execute(
				this.transaction,
			)
		return this.snapshot(months)
	}
	/** Keep both absence and exact revision/current-lock facts in one SQL snapshot and tenant-bound digest. */
	private async snapshot(months: string[]): Promise<AttendancePeriodBasis> {
		const result = await sql<{
			month: AttendancePeriodMonth
		}>`SELECT jsonb_build_object('monthStart',to_char(m.month,'YYYY-MM-DD'),
    'period',CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id',p.id,'revision',p.revision,'state',p.state,'currentLockId',p.current_lock_id) END) AS month
   FROM unnest(${months}::date[]) AS m(month)
   LEFT JOIN hcm.attendance_period p ON p.tenant_id=${this.tenantId} AND p.month_start=m.month
   ORDER BY m.month`.execute(this.transaction)
		const values = result.rows.map(
			/** Project only revision-bound period facts. */ (row) => row.month,
		)
		return {
			months: values,
			digest: commandHash('AttendancePeriodBasis', { tenantId: this.tenantId, months: values }),
		}
	}
}

/** Compose period evidence on existing tenant authority without a new persistence or authentication boundary. */
export class KyselyAttendancePeriodFenceBinder extends AttendancePeriodFenceBinder {
	/** Reject raw pools; publication fences last only for the caller-owned transaction. */
	bind(transaction: unknown, tenantId: string): AttendancePeriodFencePort {
		idValue(tenantId, 'tenantId')
		const executor = transaction as Kysely<unknown>
		if (!executor?.isTransaction)
			throw new Error('Attendance period fences require a tenant transaction')
		return new KyselyAttendancePeriodFence(executor, tenantId)
	}
}
