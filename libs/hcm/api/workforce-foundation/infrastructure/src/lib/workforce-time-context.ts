import { createHash } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { dateValue, idValue } from '@empflowyee/hcm-runtime-contract'
import {
	WorkforceTimeContextBinder,
	type WorkforceTimeContext,
	type WorkforceTimeContextPort,
	type WorkforceTimeContextResult,
} from '@empflowyee/hcm-api-workforce-foundation-application'

type TimeBasis = Omit<WorkforceTimeContext, 'inputDigest'>

/** Reuse only a caller-owned transaction; no independent connection or worker account is introduced. */
export class KyselyWorkforceTimeContextBinder extends WorkforceTimeContextBinder {
	/** The domain unit of work has already established tenant authority; refuse a pool handle that could escape its transaction. */
	bind(transaction: unknown, tenantId: string): WorkforceTimeContextPort {
		idValue(tenantId, 'tenantId')
		const executor = transaction as Kysely<unknown>
		if (!executor?.isTransaction)
			throw new Error('Workforce time context requires a tenant transaction')
		return new KyselyWorkforceTimeContext(executor, tenantId)
	}
}

class KyselyWorkforceTimeContext implements WorkforceTimeContextPort {
	/** Hold a read-only projection on the existing transaction and its explicit tenant identity. */
	constructor(
		private readonly executor: Kysely<unknown>,
		private readonly tenantId: string,
	) {}

	/** Use one SQL snapshot for employment and assignment facts; hash every projected revision so publication can detect drift. */
	async read(employmentId: string, workDate: string): Promise<WorkforceTimeContextResult> {
		idValue(employmentId, 'employmentId')
		dateValue(workDate, 'workDate')
		const result = await sql<{ basis: TimeBasis }>`SELECT jsonb_build_object(
			'employmentId',e.id,'employmentRevision',e.revision,'workerId',w.id,'workerRevision',w.revision,
			'workerTypeId',w.worker_type_id,'workerTypeRevision',wt.revision,
			'legalEntityId',e.legal_entity_id,'legalEntityRevision',le.revision,
			'employmentType',e.employment_type,'employmentStatus',e.employment_status,
			'hireDate',to_char(e.hire_date,'YYYY-MM-DD'),'employmentEndDate',to_char(e.employment_end_date,'YYYY-MM-DD'),
			'continuousServiceStartDate',to_char(e.continuous_service_start_date,'YYYY-MM-DD'),'workDate',${workDate}::text,
			'assignments',COALESCE((SELECT jsonb_agg(jsonb_build_object(
				'id',a.id,'revision',a.revision,'isPrimary',a.is_primary_assignment,
				'effectiveFrom',to_char(a.effective_from,'YYYY-MM-DD'),'effectiveTo',to_char(a.effective_to,'YYYY-MM-DD'),
				'orgUnitId',a.organisation_id,'orgUnitRevision',o.revision,
				'departmentId',a.department_id,'departmentRevision',d.revision,
				'locationId',a.location_id,'locationRevision',l.revision,'timezone',l.timezone,
				'countryCode',l.country_code,'region',l.state_or_province) ORDER BY a.id COLLATE "C")
				FROM hcm.assignment a
				JOIN hcm.organisation o ON o.tenant_id=a.tenant_id AND o.id=a.organisation_id
				JOIN hcm.location l ON l.tenant_id=a.tenant_id AND l.id=a.location_id
				LEFT JOIN hcm.department d ON d.tenant_id=a.tenant_id AND d.id=a.department_id
				WHERE a.tenant_id=e.tenant_id AND a.employment_id=e.id AND a.effective_period @> ${workDate}::date),'[]'::jsonb)
		) AS basis FROM hcm.employment e
		JOIN hcm.worker w ON w.tenant_id=e.tenant_id AND w.id=e.worker_id
		LEFT JOIN hcm.worker_type wt ON wt.tenant_id=w.tenant_id AND wt.id=w.worker_type_id
		LEFT JOIN hcm.legal_entity le ON le.tenant_id=e.tenant_id AND le.id=e.legal_entity_id
		WHERE e.tenant_id=${this.tenantId} AND e.tenant_id=hcm.current_tenant_id() AND e.id=${employmentId}
`.execute(this.executor)
		const basis = result.rows[0]?.basis
		if (!basis) return { state: 'Unavailable', reason: 'employment-unavailable' }
		if (
			!basis.hireDate ||
			!basis.legalEntityId ||
			!basis.workerTypeId ||
			!basis.employmentType ||
			!basis.employmentStatus
		)
			return { state: 'Unavailable', reason: 'incomplete-facts' }
		if (
			workDate < basis.hireDate ||
			(basis.employmentEndDate !== null && workDate > basis.employmentEndDate)
		)
			return { state: 'Unavailable', reason: 'outside-employment' }
		if (!basis.assignments.length) return { state: 'Unavailable', reason: 'assignment-unavailable' }
		for (const assignment of basis.assignments) {
			try {
				new Intl.DateTimeFormat('en', { timeZone: assignment.timezone }).format(0)
			} catch {
				return { state: 'Unavailable', reason: 'timezone-unavailable' }
			}
		}
		const inputDigest = createHash('sha256')
			.update(JSON.stringify({ tenantId: this.tenantId, basis }))
			.digest('hex')
		return { state: 'Available', context: { ...basis, inputDigest } }
	}
}
