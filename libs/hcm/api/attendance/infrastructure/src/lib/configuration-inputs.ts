import { sql, type Kysely } from 'kysely'
import { idValue } from '@empflowyee/hcm-runtime-contract'
import {
	AttendanceConfigurationInputBinder,
	AttendanceConfigurationInputs,
	type AttendanceConfigurationFamily,
	type AttendanceConfigurationInputPort,
	type AttendanceConfigurationInputRepository,
	type AttendanceConfigurationVersions,
} from '@empflowyee/hcm-api-attendance-application'
import type { WorkforceTimeContextBinder } from '@empflowyee/hcm-api-workforce-foundation-application'
import { KyselyAttendanceAssignmentReader } from './configuration-assignments'
import { KyselyAttendanceConfigurationReader } from './configuration-readers'
import { KyselyScheduleReader } from './hcm-api-attendance-infrastructure'

const families = {
	Schedule: { table: 'work_schedule_version', owner: 'schedule_id' },
	Policy: { table: 'attendance_policy_version', owner: 'policy_id' },
	Holiday: { table: 'holiday_calendar_version', owner: 'calendar_id' },
} as const

/** Join exact source identity to existing safe version projections; the caller retains transaction and authorization ownership. */
class KyselyAttendanceConfigurationInputs
	extends KyselyAttendanceAssignmentReader
	implements AttendanceConfigurationInputRepository {
	/** Share the same bound executor with the scope-filtered assignment reader. */
	constructor(
		private readonly executor: Kysely<unknown>,
		private readonly ownerTenant: string,
	) {
		super(executor, ownerTenant)
	}
	/** Select only fixed table/column identifiers and require the exact tenant/version pair before reading its content. */
	async version<Family extends AttendanceConfigurationFamily>(
		family: Family,
		versionId: string,
	): Promise<AttendanceConfigurationVersions[Family] | null> {
		idValue(versionId, 'versionId')
		const descriptor = Object.hasOwn(families, family) ? families[family] : undefined
		if (!descriptor) throw new Error('Unsupported attendance configuration family')
		const rows = await sql<{
			ownerId: string
		}>`SELECT ${sql.ref(descriptor.owner)} AS "ownerId" FROM ${sql.table('hcm.' + descriptor.table)} WHERE tenant_id=${this.ownerTenant} AND id=${versionId}`.execute(
			this.executor,
		)
		const ownerId = rows.rows[0]?.ownerId
		if (!ownerId) return null
		const configurations = new KyselyAttendanceConfigurationReader(this.executor, this.ownerTenant)
		const readers: {
			[Key in AttendanceConfigurationFamily]: () => Promise<
				AttendanceConfigurationVersions[Key] | null
			>
		} = {
			Schedule: /** Read the exact schedule and all ordered pattern children. */ () =>
				new KyselyScheduleReader(this.executor, this.ownerTenant).version(ownerId, versionId),
			Policy: /** Reuse the closed policy and approval-rule projection. */ () =>
				configurations.policy(ownerId, versionId),
			Holiday: /** Preserve explicit observed dates and exact partial endpoints. */ () =>
				configurations.holidayCalendar(ownerId, versionId),
		}
		return readers[family]()
	}
}

/** Resolve source-owned input DTOs without importing Workforce persistence into Attendance. */
export class KyselyAttendanceConfigurationInputBinder extends AttendanceConfigurationInputBinder {
	/** Receive Workforce's maintained application port from composition. */
	constructor(private readonly workforce: WorkforceTimeContextBinder) {
		super()
	}
	/** Refuse pool executors and bind both owners to the same transaction-local tenant. */
	bind(transaction: unknown, tenantId: string): AttendanceConfigurationInputPort {
		idValue(tenantId, 'tenantId')
		const executor = transaction as Kysely<unknown>
		if (!executor?.isTransaction) throw new Error('Attendance inputs require a tenant transaction')
		return new AttendanceConfigurationInputs(
			tenantId,
			this.workforce.bind(transaction, tenantId),
			new KyselyAttendanceConfigurationInputs(executor, tenantId),
		)
	}
}
