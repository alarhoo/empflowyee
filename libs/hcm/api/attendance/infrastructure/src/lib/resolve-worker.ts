import { sql, type Transaction } from 'kysely'
import type { WorkloadAuditTables } from '@empflowyee/hcm-api-audit-infrastructure'
import {
	AssignedWorkdayResolver,
	type AttendanceConfigurationInputBinder,
	type AssignedWorkdayResult,
	type PublishedWorkdayReference,
} from '@empflowyee/hcm-api-attendance-application'
import {
	requireWorkloadScope,
	HcmWorkError,
	type HcmWorkloadContext,
	type ClaimedHcmWork,
} from '@empflowyee/hcm-api-runtime-application'
import type { HcmWorkHandler } from '@empflowyee/hcm-api-runtime-infrastructure'
import { dateValue, idValue, readBody } from '@empflowyee/hcm-runtime-contract'
import { KyselyAttendancePeriodFenceBinder } from './period-fences'
import { KyselyPublishedWorkdayWriter } from './published-workdays'

/** Publish only current assigned-source evidence in Runtime's lease-fenced transaction, retaining an honest durable outcome for unavailable inputs. */
export class KyselyAttendanceResolveHandler implements HcmWorkHandler<WorkloadAuditTables> {
	readonly kind = 'attendance.workday.resolve'
	readonly schemaVersion = 1
	/** Receive the source-owned transaction binder from composition; this handler cannot issue workload authority. */
	constructor(private readonly inputs: AttendanceConfigurationInputBinder) {}

	/** Validate the closed immutable intent, acquire period/date fences and commit evidence with Runtime's receipt/audit/completion boundary. */
	async execute(
		transaction: Transaction<WorkloadAuditTables>,
		context: HcmWorkloadContext,
		work: ClaimedHcmWork,
	): Promise<void> {
		const scope = requireWorkloadScope(context, 'AttendanceResolve')
		if (
			!transaction.isTransaction ||
			work.workload !== 'AttendanceResolve' ||
			work.kind !== this.kind ||
			work.schemaVersion !== this.schemaVersion
		)
			throw new HcmWorkError('invalid-work')
		const payload = readBody(work.payload, ['employmentId', 'workDate', 'inputDigest'])
		const employmentId = idValue(payload['employmentId'], 'employmentId'),
			workDate = dateValue(payload['workDate'], 'workDate'),
			expectedDigest = payload['inputDigest']
		if (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))
			throw new HcmWorkError('invalid-work')
		const period = await new KyselyAttendancePeriodFenceBinder()
			.bind(transaction, scope.tenantId)
			.fence(workDate, workDate)
		await sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope.tenantId}||':workday:'||${employmentId}||':'||${workDate},0))`.execute(
			transaction,
		)
		let result: AssignedWorkdayResult
		if (
			period.months.some(
				/** Ordinary materialization cannot alter a closing or locked/reopened basis. */ (month) =>
					month.period && ['Closing', 'Locked', 'Reopened'].includes(month.period.state),
			)
		)
			result = { state: 'Unavailable', reason: 'PeriodUnavailable' }
		else
			result = await new AssignedWorkdayResolver(
				this.inputs.bind(transaction, scope.tenantId),
				366,
			).resolve(employmentId, workDate)
		if (result.state === 'Available' && result.inputDigest !== expectedDigest)
			result = { state: 'Unavailable', reason: 'InputChanged' }
		requireWorkloadScope(context, 'AttendanceResolve')
		let reference: PublishedWorkdayReference | null = null
		if (result.state === 'Available') {
			const previous = await sql<{
				id: string
				revision: number
			}>`SELECT id,revision FROM hcm.published_workday WHERE tenant_id=${scope.tenantId} AND employment_id=${employmentId} AND work_date=${workDate}::date ORDER BY revision DESC LIMIT 1`.execute(
				transaction,
			)
			reference = await new KyselyPublishedWorkdayWriter<WorkloadAuditTables>(
				transaction,
				context,
			).append({
				...result,
				previous: previous.rows[0] ?? null,
			})
		}
		const evidence =
			result.state === 'Available'
				? {
					inputDigest: result.inputDigest,
					rest: result.rest,
					dependencies: result.dependencies,
					period,
					reference,
				}
				: { ...result, period }
		await sql`INSERT INTO hcm.attendance_workday_resolution_receipt(tenant_id,outbox_id,request_digest,lease_fence,workload_run_id,state,workday_id,result_code,evidence)
VALUES(${scope.tenantId},${work.id},${work.digest},${work.fence},${scope.runId}::uuid,${result.state},${reference?.id ?? null},${result.state === 'Available' ? 'Resolved' : result.reason},${JSON.stringify(evidence)}::jsonb)`.execute(
	transaction,
)
		requireWorkloadScope(context, 'AttendanceResolve')
	}
}
