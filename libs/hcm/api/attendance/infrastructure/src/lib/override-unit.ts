import type { HcmScopeSubject } from '@empflowyee/hcm-api-access-control-application'
import { randomUUID } from 'node:crypto'
import { Temporal } from '@js-temporal/polyfill'
import { sql, type Kysely, type Transaction } from 'kysely'
import { enqueueHcmWork } from '@empflowyee/hcm-api-runtime-infrastructure'
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
import { HcmDomainError, dateValue } from '@empflowyee/hcm-runtime-contract'
import { wallMilliseconds, type AttendanceOverrideView } from '@empflowyee/hcm-attendance-contract'
import {
	AttendanceOverrideUnit,
	type AttendanceLeaveImpactBinder,
	type AttendanceOverrideTarget,
	type AttendanceOverrideWork,
} from '@empflowyee/hcm-api-attendance-application'
import type {
	WorkforceTimeContextBinder,
	WorkforceApprovalRoutingBinder,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import type {
	WorkflowSourceBinder,
	WorkflowIntakeBinder,
} from '@empflowyee/hcm-api-workflow-application'
import { SqlOverrideApprovalIntake } from './override-approval-intake'
import { KyselyAttendanceConfigurationInputBinder } from './configuration-inputs'
import { KyselyAttendancePeriodFenceBinder } from './period-fences'
import { SqlAttendanceCommandReceipts } from './command-receipts'

/** Project only dated intervals and source lifecycle; encrypted receipt narrative never enters this read representation. */
export async function readOverride(
	tx: Kysely<unknown>,
	tenant: string,
	id: string,
): Promise<AttendanceOverrideView | null> {
	const result = await sql<{ view: AttendanceOverrideView }>`
SELECT jsonb_strip_nulls(jsonb_build_object('id',o.id,'revision',o.revision,'state',o.state,'employmentId',o.employment_id,'workDate',o.work_date::text,'workdayRevision',w.revision,'zone',o.zone,
'approval',(SELECT jsonb_build_object('caseId',c.id,'revision',c.revision,'generation',c.generation,'state',c.state,'requiredSlots',(SELECT count(*)::int FROM hcm.attendance_approval_slot s WHERE s.tenant_id=c.tenant_id AND s.case_id=c.id),'pendingSlots',(SELECT count(*)::int FROM hcm.attendance_approval_slot s WHERE s.tenant_id=c.tenant_id AND s.case_id=c.id AND s.state='Pending')) FROM hcm.attendance_approval_case c WHERE c.tenant_id=o.tenant_id AND c.schedule_override_id=o.id ORDER BY c.generation DESC LIMIT 1),
'segments',(SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('kind',s.kind,'startTime',s.start_time::text,'endTime',s.end_time::text,'endDayOffset',s.end_day_offset,'overlapOffset',CASE WHEN s.start_overlap_choice IS NOT NULL OR s.end_overlap_choice IS NOT NULL THEN jsonb_strip_nulls(jsonb_build_object('start',s.start_overlap_choice,'end',s.end_overlap_choice)) ELSE NULL END)) ORDER BY s.ordinal),'[]'::jsonb) FROM hcm.schedule_override_segment s WHERE s.tenant_id=o.tenant_id AND s.override_id=o.id))) AS view
FROM hcm.schedule_override o JOIN hcm.published_workday w ON w.tenant_id=o.tenant_id AND w.id=o.basis_workday_id WHERE o.tenant_id=${tenant} AND o.id=${id}`.execute(
	tx,
)
	return result.rows[0]?.view ?? null
}

/** Bind override draft/review commands to current Access scope, SQL constraints and encrypted Attendance receipts. */
export class KyselyAttendanceOverrideUnit extends AttendanceOverrideUnit {
	/** Reuse the existing tenant transaction and dated Workforce owner port. */
	constructor(
		private readonly database: HcmAccessDatabase | null,
		private readonly cipher: FieldCipher,
		private readonly workforce: WorkforceTimeContextBinder,
		private readonly routing: WorkforceApprovalRoutingBinder,
		private readonly workflowSources: WorkflowSourceBinder,
		private readonly workflowIntake: WorkflowIntakeBinder,
		private readonly leaveImpact: AttendanceLeaveImpactBinder,
	) {
		super()
	}
	/** Authorize one complete grant over the actual dated employment before exposing any source fields. */
	async execute<T>(
		context: AuthenticatedHcmContext,
		target: AttendanceOverrideTarget,
		operation: 'read' | 'manage' | 'preview',
		work: (scope: AttendanceOverrideWork) => Promise<T>,
	): Promise<T> {
		if (!this.database) throw new HcmDomainError('record-incomplete')
		const tenant = requireAuthenticatedTenant(context)
		let dated: { employmentId: string; workDate: string } | undefined
		let missingFacts = false
		let scopes: HcmScopeSubject[] = []
		try {
			return await this.database.execute(
				context,
				{ permission: 'hcm.attendance.work-schedules.' + operation, entitlement: 'hcm.attendance' },
				operation !== 'read',
				/** Source storage and command effects share the current-authority transaction. */ async (
					access,
				) => {
					if (!dated) throw new HcmDomainError('not-found')
					if (missingFacts) throw new HcmDomainError('record-incomplete')
					const tx = access.transaction as unknown as Kysely<unknown>
					const { accountId } = access.actor
					const sourceDate = dated.workDate,
						employmentId = dated.employmentId
					const checkedDates = new Set([sourceDate])
					/** Add a future date's minimal Workforce scope, requiring one grant over the entire accumulated review. */
					const requireDate = async (date: string, permission: string) => {
						dateValue(date, 'workDate')
						if (date < sourceDate || Temporal.PlainDate.from(sourceDate).until(date).days > 365)
							throw new HcmDomainError('record-incomplete')
						if (!checkedDates.has(date)) {
							const facts = await this.workforce.bind(tx, tenant).read(employmentId, date)
							if (facts.state !== 'Available' || !facts.context.assignments.length)
								throw new HcmDomainError('record-incomplete')
							for (const assignment of facts.context.assignments)
								scopes.push({
									employmentId,
									legalEntityId: facts.context.legalEntityId,
									assignmentId: assignment.id,
									orgUnitId: assignment.orgUnitId,
									locationId: assignment.locationId,
									...(assignment.departmentId ? { departmentId: assignment.departmentId } : {}),
								})
							checkedDates.add(date)
						}
						await new TransactionalAccessPolicy(access.transaction, context).require({
							permission: 'hcm.attendance.work-schedules.' + permission,
							entitlement: 'hcm.attendance',
							subjects: scopes,
						})
					}
					return work({
						approve:
						/** Record the source decision only after the application has consumed its current no-required-slot review. */ async (
							source,
							digest,
						) => {
							const updated =
								await sql`UPDATE hcm.schedule_override SET state='Approved',revision=revision+1,approval_digest=${digest},approved_at=clock_timestamp(),approved_by_account_id=${accountId},updated_at=clock_timestamp() WHERE tenant_id=${tenant} AND id=${source.id} AND revision=${source.revision} AND state='Draft' RETURNING id`.execute(
									tx,
								)
							if (!updated.rows.length) throw new HcmDomainError('revision-conflict')
						},
						enqueue:
						/** Keep every affected date's exact resolution intent atomic with the source lifecycle and receipt. */ (
							employmentId,
							workDate,
							inputDigest,
						) =>
							enqueueHcmWork(tx as Transaction<unknown>, tenant, {
								workload: 'AttendanceResolve',
								kind: 'attendance.workday.resolve',
								schemaVersion: 1,
								businessKey: `${employmentId}:${workDate}:${inputDigest}`,
								payload: { employmentId, workDate, inputDigest },
							}),
						leaveImpact: this.leaveImpact.bind(tx, tenant),
						requireImpactDate: /** Keep resolver reads behind complete dated operation scope. */ (
							date,
						) => requireDate(date, operation),
						inputs: new KyselyAttendanceConfigurationInputBinder(this.workforce).bind(tx, tenant),
						periods: new KyselyAttendancePeriodFenceBinder().bind(tx, tenant),
						receipts: new SqlAttendanceCommandReceipts(
							tx,
							tenant,
							accountId,
							this.cipher.bind(tx, tenant),
						),
						audit: access.audit,
						read: /** Read safe fields only after the full dated scope check. */ (id) =>
							readOverride(tx, tenant, id),
						requestApproval:
						/** Source obligations and Workflow acceptance must commit or roll back together. */ (
							source,
							policyVersionId,
							inputDigest,
							workforceDigest,
						) =>
							new SqlOverrideApprovalIntake(
								tx,
								tenant,
								accountId,
								this.workflowSources,
								this.workflowIntake,
								this.routing,
							).request(source, policyVersionId, inputDigest, workforceDigest),
						requireRead:
						/** Recovery rechecks every date retained by the original review, even when the current next shift has changed. */ async (
							response,
						) => {
							if (
								response &&
									typeof response === 'object' &&
									'reviewedThrough' in response &&
									response.reviewedThrough !== undefined
							) {
								const through = dateValue(response.reviewedThrough, 'reviewedThrough')
								if (
									through < sourceDate ||
										Temporal.PlainDate.from(sourceDate).until(through).days > 365
								)
									throw new HcmDomainError('record-incomplete')
								for (
									let date = Temporal.PlainDate.from(sourceDate);
									Temporal.PlainDate.compare(date, through) <= 0;
									date = date.add({ days: 1 })
								)
									await requireDate(date.toString(), 'read')
							}
							await new TransactionalAccessPolicy(access.transaction, context).require({
								permission: 'hcm.attendance.work-schedules.read',
								entitlement: 'hcm.attendance',
								subjects: scopes,
							})
						},
						requireBasis:
						/** Serialize against dated publication and reject a stale immutable workday revision. */ async (
							employmentId,
							date,
							revision,
						) => {
							await sql`SELECT pg_advisory_xact_lock(hashtextextended(${tenant + ':dated-source:' + employmentId + ':' + date},0))`.execute(
								tx,
							)
							await sql`SELECT pg_advisory_xact_lock(hashtextextended(${tenant + ':workday:' + employmentId + ':' + date},0))`.execute(
								tx,
							)
							const rows = await sql<{
								id: string
								revision: number
							}>`SELECT id,revision FROM hcm.published_workday WHERE tenant_id=${tenant} AND employment_id=${employmentId} AND work_date=${date}::date ORDER BY revision DESC LIMIT 1`.execute(
								tx,
							)
							const row = rows.rows[0]
							if (!row) throw new HcmDomainError('record-incomplete')
							if (row.revision !== revision) throw new HcmDomainError('revision-conflict')
							return row.id
						},
						insert:
						/** Persist actual wall intervals with their derived start offsets; no workday row is updated. */ async (
							id,
							basis,
							draft,
						) => {
							await sql`INSERT INTO hcm.schedule_override(tenant_id,id,employment_id,work_date,basis_workday_id,zone,kind,created_by_account_id) VALUES(${tenant},${id},${draft.employmentId},${draft.workDate}::date,${basis},${draft.zone},${draft.segments.length ? 'Work' : 'Rest'},${accountId})`.execute(
								tx,
							)
							let previousEnd = 0
							for (const [index, segment] of draft.segments.entries()) {
								const startOffset = index ? Math.floor(previousEnd / 86400000) : 0
								await sql`INSERT INTO hcm.schedule_override_segment(tenant_id,id,override_id,ordinal,kind,start_time,end_time,start_day_offset,end_day_offset,start_overlap_choice,end_overlap_choice) VALUES(${tenant},${randomUUID()},${id},${index + 1},${segment.kind},${segment.startTime}::time,${segment.endTime}::time,${startOffset},${segment.endDayOffset},${segment.overlapOffset?.start ?? null},${segment.overlapOffset?.end ?? null})`.execute(
									tx,
								)
								previousEnd = wallMilliseconds(segment.endTime) + segment.endDayOffset * 86400000
							}
						},
						attachEvidence:
						/** Never accept ungoverned IDs while the required Documents consumer-purpose adapter is unavailable. */ async (
							_id,
							draft,
						) => {
							if (draft.evidenceIds.length) throw new HcmDomainError('record-incomplete')
						},
						proposedInputs:
						/** Preserve production tie detection and exact stored intervals without writing temporary approval state. */ (
							source,
						) =>
							new KyselyAttendanceConfigurationInputBinder(this.workforce).bind(
								tx,
								tenant,
								source,
							),
					})
				},
				/** Resolve private source coordinates only after Access verifies the independent operation and entitlement. */ async (
					transaction,
				) => {
					const tx = transaction as unknown as Kysely<unknown>
					if ('id' in target) {
						const rows = await sql<{
							employmentId: string
							workDate: string
						}>`SELECT employment_id AS "employmentId",work_date::text AS "workDate" FROM hcm.schedule_override WHERE tenant_id=${tenant} AND id=${target.id}`.execute(
							tx,
						)
						dated = rows.rows[0]
					} else dated = target
					if (!dated) return (scopes = [{}])
					const facts = await this.workforce
						.bind(tx, tenant)
						.read(dated.employmentId, dated.workDate)
					if (facts.state !== 'Available') {
						missingFacts = true
						return (scopes = [{ employmentId: dated.employmentId }])
					}
					const base = {
						employmentId: dated.employmentId,
						legalEntityId: facts.context.legalEntityId,
					}
					return (scopes = facts.context.assignments.length
						? facts.context.assignments.map(
							/** Each assignment supplies its own full scope dimensions; partial grants cannot be combined. */ (
								assignment,
							) => ({
								...base,
								assignmentId: assignment.id,
								orgUnitId: assignment.orgUnitId,
								locationId: assignment.locationId,
								...(assignment.departmentId ? { departmentId: assignment.departmentId } : {}),
							}),
						)
						: [base])
				},
			)
		} catch (error) {
			return classifyConstraint(error)
		}
	}
}
