import { sql, type Kysely, type Transaction } from 'kysely'
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
import { enqueueHcmWork } from '@empflowyee/hcm-api-runtime-infrastructure'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'
import type {
	WorkAssignmentFamily,
	AttendanceScopeTarget,
	WorkAssignmentView,
} from '@empflowyee/hcm-attendance-contract'
import {
	AttendanceWorkAssignmentUnit,
	holidayTargetSubject,
	type WorkAssignmentWork,
} from '@empflowyee/hcm-api-attendance-application'
import type {
	WorkforceTimeContextBinder,
	WorkforceTimeSubjectsBinder,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import { SqlAttendanceCommandReceipts } from './command-receipts'
import { KyselyAttendanceConfigurationReader } from './configuration-readers'
import { KyselyScheduleReader } from './hcm-api-attendance-infrastructure'
import { KyselyAttendancePeriodFenceBinder } from './period-fences'
import { KyselyAttendanceConfigurationInputBinder } from './configuration-inputs'
import { KyselyAttendanceAssignmentReader } from './configuration-assignments'

/** Read only the declared assignment DTO; private reason remains in encrypted command evidence. */
async function readAssignment(
	transaction: Kysely<unknown>,
	tenant: string,
	id: string,
	family: WorkAssignmentFamily,
): Promise<WorkAssignmentView | null> {
	const table = sql.table(
		family === 'Schedule' ? 'hcm.work_schedule_assignment' : 'hcm.attendance_policy_assignment',
	)
	const versions = sql.table(
		family === 'Schedule' ? 'hcm.work_schedule_version' : 'hcm.attendance_policy_version',
	)
	const owner = sql.ref(family === 'Schedule' ? 'v.schedule_id' : 'v.policy_id')
	const result = await sql<{
		view: WorkAssignmentView
	}>`SELECT jsonb_build_object('id',a.id,'family',${family}::text,'configurationId',${owner},'configurationName',v.name,'versionId',a.version_id,'revision',a.revision,'effectiveFrom',a.effective_from::text,'effectiveTo',a.effective_to::text,'target',jsonb_strip_nulls(jsonb_build_object('kind',a.scope_kind,'id',coalesce(a.legal_entity_id,a.org_unit_id,a.department_id,a.location_id,a.assignment_id,a.employment_id)))) AS view FROM ${table} a JOIN ${versions} v ON v.tenant_id=a.tenant_id AND v.id=a.version_id WHERE a.tenant_id=${tenant} AND a.id=${id}`.execute(
		transaction,
	)
	return result.rows[0]?.view ?? null
}

/** Bind assignment operations to the existing tenant lock, Access policy, SQL constraints and durable outbox. */
export class KyselyWorkAssignmentUnit extends AttendanceWorkAssignmentUnit {
	/** Reuse maintained owner ports; no new database or authority service is introduced. */
	constructor(
		private readonly database: HcmAccessDatabase | null,
		private readonly cipher: FieldCipher,
		private readonly workforce: WorkforceTimeContextBinder,
		private readonly subjects: WorkforceTimeSubjectsBinder,
	) {
		super()
	}
	/** Check one target grant first, then recheck its complete dated impact before the transaction can commit. */
	async execute<T>(
		context: AuthenticatedHcmContext,
		family: WorkAssignmentFamily,
		target: AttendanceScopeTarget,
		write: boolean,
		work: (scope: WorkAssignmentWork) => Promise<T>,
	): Promise<T> {
		if (!this.database) throw new HcmDomainError('record-incomplete')
		const permission = 'hcm.attendance.work-schedules.' + (write ? 'manage' : 'read'),
			entitlement = 'hcm.attendance'
		try {
			return await this.database.execute(
				context,
				{ permission, entitlement, subject: holidayTargetSubject(target) },
				write,
				/** Every repository, owner port and receipt shares the verified transaction. */ async (
					access,
				) => {
					const tx = access.transaction as unknown as Kysely<unknown>,
						{ tenantId, accountId } = access.actor
					const policy = new TransactionalAccessPolicy(access.transaction, context)
					const table = sql.table(
						family === 'Schedule'
							? 'hcm.work_schedule_assignment'
							: 'hcm.attendance_policy_assignment',
					)
					const versions = sql.table(
						family === 'Schedule' ? 'hcm.work_schedule_version' : 'hcm.attendance_policy_version',
					)
					const owner = sql.ref(family === 'Schedule' ? 'schedule_id' : 'policy_id')
					const result = await work({
						workforce: this.workforce.bind(tx, tenantId),
						subjects: this.subjects.bind(tx, tenantId),
						inputs: new KyselyAttendanceConfigurationInputBinder(this.workforce).bind(tx, tenantId),
						periods: new KyselyAttendancePeriodFenceBinder().bind(tx, tenantId),
						audit: access.audit,
						receipts: new SqlAttendanceCommandReceipts(
							tx,
							tenantId,
							accountId,
							this.cipher.bind(tx, tenantId),
						),
						source:
						/** Select the exact source root without substituting the latest version. */ async (
							versionId,
						) => {
							const row = await sql<{
								id: string
							}>`SELECT ${owner} AS id FROM ${versions} WHERE tenant_id=${tenantId} AND id=${versionId}`.execute(
								tx,
							)
							if (!row.rows[0]) return null
							return family === 'Schedule'
								? new KyselyScheduleReader(tx, tenantId).version(row.rows[0].id, versionId)
								: new KyselyAttendanceConfigurationReader(tx, tenantId).policy(
									row.rows[0].id,
									versionId,
								)
						},
						read: /** Return only this tenant's typed assignment projection. */ (id) =>
							readAssignment(tx, tenantId, id, family),
						current:
						/** Exact target/date selection cannot disclose another scope or produce an unbounded collection. */ async (
							selected,
							asOf,
						) => {
							const rows = await sql<{
								id: string
							}>`SELECT id FROM ${table} WHERE tenant_id=${tenantId} AND scope_kind=${selected.kind} AND scope_key=${selected.kind === 'Tenant' ? 'tenant' : selected.id} AND effective_period @> ${asOf}::date`.execute(
								tx,
							)
							return rows.rows[0] ? readAssignment(tx, tenantId, rows.rows[0].id, family) : null
						},
						end: /** Optimistic revision checking protects the predecessor from stale supersession. */ async (
							id,
							revision,
							through,
						) => {
							const row = await sql<{
								id: string
							}>`UPDATE ${table} SET effective_to=${through}::date,revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=${tenantId} AND id=${id} AND revision=${revision} RETURNING id`.execute(
								tx,
							)
							if (!row.rows.length) throw new HcmDomainError('revision-conflict')
						},
						insert:
						/** SQL checks tenant-composite references, published coverage and same-target overlaps. */ async (
							id,
							input,
						) => {
							const subject = holidayTargetSubject(input.target)
							await sql`INSERT INTO ${table}(tenant_id,id,version_id,scope_kind,legal_entity_id,org_unit_id,department_id,location_id,assignment_id,employment_id,effective_from,effective_to,created_by_account_id) VALUES(${tenantId},${id},${input.versionId},${input.target.kind},${subject.legalEntityId ?? null},${subject.orgUnitId ?? null},${subject.departmentId ?? null},${subject.locationId ?? null},${subject.assignmentId ?? null},${subject.employmentId ?? null},${input.effectiveFrom}::date,${input.effectiveTo ?? null}::date,${accountId})`.execute(
								tx,
							)
							const view = await readAssignment(tx, tenantId, id, family)
							if (!view) throw new Error('Inserted assignment unavailable')
							return view
						},
						guardPeriods:
						/** Reject historical locked impact even outside the explicit workday production window. */ async (
							from,
							to,
						) => {
							const periods = await sql<{
								id: string
							}>`SELECT id FROM hcm.attendance_period WHERE tenant_id=${tenantId} AND month_end>=${from}::date AND (${to ?? null}::date IS NULL OR month_start<=${to ?? null}::date) AND state IN ('Closing','Locked','Reopened') LIMIT 1`.execute(
								tx,
							)
							if (periods.rows.length) throw new HcmDomainError('invalid-state')
						},
						requireNoTies:
						/** Keep all matches visible so a higher-precedence winner cannot conceal a same-level overlap. */ async (
							facts,
							kind,
						) => {
							const rows = await new KyselyAttendanceAssignmentReader(tx, tenantId).matching(
								family,
								facts.workDate,
								facts,
							)
							if (
								rows.filter(
									/** Compare the precedence of the command being admitted. */ (row) =>
										row.target.kind === kind,
								).length > 1
							)
								throw new HcmDomainError('overlapping-effective-period')
						},
						authorize:
						/** One complete grant must cover the target and every dated subject, without grant pooling. */ async (
							subjects,
						) => {
							await policy.require({ permission, entitlement, subjects })
						},
						requireRead:
						/** Recovered responses remain protected by independent current read authority. */ async () => {
							await policy.require({
								permission: 'hcm.attendance.work-schedules.read',
								entitlement,
								subject: holidayTargetSubject(target),
							})
						},
						enqueue:
						/** Admit immutable exact input evidence through the existing worker protocol. */ async (
							employmentId,
							workDate,
							inputDigest,
						) => {
							await enqueueHcmWork(tx as Transaction<unknown>, tenantId, {
								workload: 'AttendanceResolve',
								kind: 'attendance.workday.resolve',
								schemaVersion: 1,
								businessKey: `${employmentId}:${workDate}:${inputDigest}`,
								payload: { employmentId, workDate, inputDigest },
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
