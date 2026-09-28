import { sql, type Kysely, type RawBuilder } from 'kysely'
import { dateValue, enumValue, idValue, intValue, readBody } from '@empflowyee/hcm-runtime-contract'
import {
	WorkforceTimeSubjectsBinder,
	type WorkforceTimeSubjectPage,
	type WorkforceTimeSubjectsPort,
	type WorkforceTimeTarget,
} from '@empflowyee/hcm-api-workforce-foundation-application'

/** Project only employment identity/revision; a later owner time-context read reports incomplete facts explicitly. */
class KyselyWorkforceTimeSubjects implements WorkforceTimeSubjectsPort {
	/** The owning source has already established current human/workload scope and stable transaction locks. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenantId: string,
	) {}

	/** Apply date/scope predicates before the keyset and limit, preserving historical employments and deduplicating matching assignments. */
	async page(
		workDate: string,
		target: WorkforceTimeTarget,
		afterEmploymentId?: string,
		limit = 25,
	): Promise<WorkforceTimeSubjectPage> {
		dateValue(workDate, 'workDate')
		intValue(limit, 'limit', 1, 100)
		if (afterEmploymentId !== undefined) idValue(afterEmploymentId, 'afterEmploymentId')
		const input = readBody(target, ['kind'], ['id'])
		const kind = enumValue(input['kind'], 'kind', [
			'Tenant',
			'LegalEntity',
			'OrgUnit',
			'Department',
			'Location',
			'Assignment',
			'Employment',
		] as const)
		let predicate: RawBuilder<unknown>
		if (kind === 'Tenant') {
			readBody(target, ['kind'])
			predicate = sql`true`
		} else {
			const id = idValue(input['id'], 'id')
			if (kind === 'Employment') predicate = sql`e.id=${id}`
			else if (kind === 'LegalEntity') predicate = sql`e.legal_entity_id=${id}`
			else {
				const columns = {
					OrgUnit: 'a.organisation_id',
					Department: 'a.department_id',
					Location: 'a.location_id',
					Assignment: 'a.id',
				} as const
				predicate = sql`EXISTS(SELECT 1 FROM hcm.assignment a WHERE a.tenant_id=e.tenant_id AND a.employment_id=e.id AND a.effective_period @> ${workDate}::date AND ${sql.ref(columns[kind])}=${id})`
			}
		}
		const rows = await sql<WorkforceTimeSubjectPage['items'][number]>`
SELECT e.id AS "employmentId",e.revision AS "employmentRevision" FROM hcm.employment e
WHERE e.tenant_id=${this.tenantId} AND e.tenant_id=hcm.current_tenant_id()
 AND (e.hire_date IS NULL OR e.hire_date<=${workDate}::date)
 AND (e.employment_end_date IS NULL OR e.employment_end_date>=${workDate}::date)
 AND ${predicate} AND ${afterEmploymentId === undefined ? sql`true` : sql`e.id COLLATE "C">${afterEmploymentId} COLLATE "C"`}
ORDER BY e.id COLLATE "C" LIMIT ${limit + 1}`.execute(this.transaction)
		const items = rows.rows.slice(0, limit)
		return {
			items,
			nextAfterEmploymentId: rows.rows.length > limit ? items[items.length - 1].employmentId : null,
		}
	}
}

/** Keep Workforce table ownership behind a minimal internal paging contract shared by authorized time-impact consumers. */
export class KyselyWorkforceTimeSubjectsBinder extends WorkforceTimeSubjectsBinder {
	/** Refuse a pool or absent tenant so internal continuations cannot escape transaction-local RLS. */
	bind(transaction: unknown, tenantId: string): WorkforceTimeSubjectsPort {
		idValue(tenantId, 'tenantId')
		const executor = transaction as Kysely<unknown>
		if (!executor?.isTransaction)
			throw new Error('Workforce time subjects require a tenant transaction')
		return new KyselyWorkforceTimeSubjects(executor, tenantId)
	}
}
