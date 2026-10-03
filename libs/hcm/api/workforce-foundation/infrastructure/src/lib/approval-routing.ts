import { sql, type Kysely } from 'kysely'
import {
	WorkforceApprovalRoutingBinder,
	type WorkforceApprovalRoutingPort,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import { commandHash } from '@empflowyee/hcm-api-runtime-application'
import { dateValue, idValue, intValue } from '@empflowyee/hcm-runtime-contract'

interface RoutingStep {
	id: string
	revision: number
	managerAssignmentId: string
	assignmentRevision: number
	employmentRevision: number
	workerRevision: number
	personId: string
}

/** Workforce owns employment-bound reporting facts; neither role titles nor another employment substitutes for the chosen chain. */
export class KyselyWorkforceApprovalRoutingBinder extends WorkforceApprovalRoutingBinder {
	/** Require the caller's existing live tenant transaction. */
	bind(transaction: unknown, tenantId: string): WorkforceApprovalRoutingPort {
		idValue(tenantId, 'tenantId')
		const executor = transaction as Kysely<unknown>
		if (!executor?.isTransaction) throw new Error('Approval routing requires a tenant transaction')
		return {
			read: /** Return minimal identity/revision evidence with no names or profile fields. */ async (
				employmentId,
				asOf,
				managerLevel,
			) => {
				idValue(employmentId, 'employmentId')
				dateValue(asOf, 'asOf')
				if (managerLevel !== null) intValue(managerLevel, 'managerLevel', 1, 2147483647)
				const employment = (
					await sql<{
						personId: string
						employmentRevision: number
						workerRevision: number
					}>`SELECT w.person_id AS "personId",e.revision AS "employmentRevision",w.revision AS "workerRevision" FROM hcm.employment e JOIN hcm.worker w ON w.tenant_id=e.tenant_id AND w.id=e.worker_id WHERE e.tenant_id=${tenantId} AND e.tenant_id=hcm.current_tenant_id() AND e.id=${employmentId} AND e.hire_date<=${asOf}::date AND (e.employment_end_date IS NULL OR e.employment_end_date>=${asOf}::date) AND e.employment_status IN ('Active','OnNotice','Suspended')`.execute(
						executor,
					)
				).rows[0]
				if (!employment) return null
				const chain: RoutingStep[] = []
				let managerPersonId: string | null = null
				let primaryAssignment: { id: string; revision: number } | null = null
				if (managerLevel !== null) {
					const assignments = (
						await sql<{
							id: string
							revision: number
						}>`SELECT id,revision FROM hcm.assignment WHERE tenant_id=${tenantId} AND employment_id=${employmentId} AND is_primary_assignment AND effective_period @> ${asOf}::date`.execute(
							executor,
						)
					).rows
					if (assignments.length !== 1) return null
					primaryAssignment = assignments[0]
					let assignmentId = primaryAssignment.id
					const visited = new Set([assignmentId])
					for (let level = 0; level < managerLevel; level++) {
						const rows = (
							await sql<RoutingStep>`SELECT r.id,r.revision,r.manager_assignment_id AS "managerAssignmentId",a.revision AS "assignmentRevision",e.revision AS "employmentRevision",w.revision AS "workerRevision",w.person_id AS "personId"
     FROM hcm.reporting_line r JOIN hcm.assignment a ON a.tenant_id=r.tenant_id AND a.id=r.manager_assignment_id
     JOIN hcm.employment e ON e.tenant_id=a.tenant_id AND e.id=a.employment_id JOIN hcm.worker w ON w.tenant_id=e.tenant_id AND w.id=e.worker_id
     WHERE r.tenant_id=${tenantId} AND r.assignment_id=${assignmentId} AND r.is_primary AND r.effective_period @> ${asOf}::date
     AND a.effective_period @> ${asOf}::date AND e.employment_status IN ('Active','OnNotice','Suspended') AND e.hire_date<=${asOf}::date AND (e.employment_end_date IS NULL OR e.employment_end_date>=${asOf}::date)`.execute(
								executor,
							)
						).rows
						if (rows.length !== 1 || visited.has(rows[0].managerAssignmentId)) break
						const step = rows[0]
						chain.push(step)
						assignmentId = step.managerAssignmentId
						visited.add(assignmentId)
						if (level === managerLevel - 1) managerPersonId = step.personId
					}
				}
				return {
					beneficiaryPersonId: employment.personId,
					managerPersonId,
					digest: commandHash('WorkforceApprovalRouting:1', {
						tenantId,
						employmentId,
						asOf,
						managerLevel,
						employment,
						primaryAssignment,
						chain,
					}),
				}
			},
		}
	}
}
