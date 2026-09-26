import { sql, type RawBuilder } from 'kysely'
import {
	classifyConstraint,
	cursorBinding,
	decodeCursor,
	keysetPage,
	likePattern,
} from '@empflowyee/hcm-api-database-kysely'
import type {
	EndReasonAttributes,
	EventTypeAttributes,
	LookupSetKey,
	LookupValueCreate,
	LookupValueDto,
	LookupValueInput,
	LookupValuePage,
	LookupValueQuery,
	TenantLookupSet,
	WorkerTypeAttributes,
} from '@empflowyee/hcm-workforce-foundation-contract'
import type { LookupRepository } from '@empflowyee/hcm-api-workforce-foundation-application'
import type { WorkforceScope } from './structure-repository'

const tables: Record<TenantLookupSet, string> = {
	'worker-types': 'hcm.worker_type',
	'employment-end-reasons': 'hcm.employment_end_reason',
	'worker-event-types': 'hcm.worker_event_type',
}

/** Tenant lookups are maintained here; product lookups are read-only global tables. */
export class KyselyLookupRepository implements LookupRepository {
	/** Bind to the authorized transaction. */
	constructor(private readonly scope: WorkforceScope) {}

	/** Execute one query and classify integrity failures safely. */
	private async run<T>(query: RawBuilder<T>): Promise<T[]> {
		try {
			return (await query.execute(this.scope.executor)).rows
		} catch (error) {
			return classifyConstraint(error)
		}
	}

	/** One uniform value projection per set: id, code, name, description, active, order, attributes, revision. */
	private source(set: LookupSetKey): RawBuilder<unknown> {
		const t = this.scope.tenantId
		const sources: Record<LookupSetKey, RawBuilder<unknown>> = {
			'worker-types': sql`SELECT id,code,name,description,is_active AS active,sort_order,jsonb_build_object('statutoryClass',statutory_class,'payrollEligible',is_payroll_eligible,'benefitEligible',is_benefit_eligible) AS attributes,revision FROM hcm.worker_type WHERE tenant_id=${t}`,
			'employment-end-reasons': sql`SELECT id,code,name,description,is_active AS active,sort_order,jsonb_build_object('voluntary',is_voluntary,'regrettable',is_regrettable,'rehireEligible',is_eligible_for_rehire_by_default) AS attributes,revision FROM hcm.employment_end_reason WHERE tenant_id=${t}`,
			'worker-event-types': sql`SELECT id,code,name,description,is_active AS active,sort_order,jsonb_build_object('category',category,'requiresApproval',requires_approval) AS attributes,revision FROM hcm.worker_event_type WHERE tenant_id=${t}`,
			genders: sql`SELECT code AS id,code,name,'' AS description,active,sort_order,jsonb_build_object('statutoryClass',statutory_class) AS attributes,0 AS revision FROM hcm.gender`,
			'marital-statuses': sql`SELECT code AS id,code,name,'' AS description,active,sort_order,'{}'::jsonb AS attributes,0 AS revision FROM hcm.marital_status`,
			'relationship-types': sql`SELECT code AS id,code,name,'' AS description,active,sort_order,jsonb_build_object('inverseCode',inverse_code,'familyRelation',is_family_relation,'dependentEligible',is_eligible_as_dependent,'nomineeEligible',is_eligible_as_nominee) AS attributes,0 AS revision FROM hcm.relationship_type`,
			countries: sql`SELECT code AS id,code,name,'' AS description,active,sort_order,jsonb_build_object('supported',is_supported) AS attributes,0 AS revision FROM hcm.country`,
			currencies: sql`SELECT code AS id,code,name,'' AS description,active,0 AS sort_order,jsonb_build_object('symbol',symbol,'minorUnitDigits',minor_unit_digits) AS attributes,0 AS revision FROM hcm.currency`,
		}
		return sources[set]
	}

	/** Active value counts per set. */
	async counts(): Promise<Record<LookupSetKey, number>> {
		const t = this.scope.tenantId
		const rows = await this.run(
			sql<{
				key: LookupSetKey
				count: number
			}>`SELECT 'worker-types' AS key,count(*)::int AS count FROM hcm.worker_type WHERE tenant_id=${t} AND is_active
			UNION ALL SELECT 'employment-end-reasons',count(*)::int FROM hcm.employment_end_reason WHERE tenant_id=${t} AND is_active
			UNION ALL SELECT 'worker-event-types',count(*)::int FROM hcm.worker_event_type WHERE tenant_id=${t} AND is_active
			UNION ALL SELECT 'genders',count(*)::int FROM hcm.gender WHERE active
			UNION ALL SELECT 'marital-statuses',count(*)::int FROM hcm.marital_status WHERE active
			UNION ALL SELECT 'relationship-types',count(*)::int FROM hcm.relationship_type WHERE active
			UNION ALL SELECT 'countries',count(*)::int FROM hcm.country WHERE active
			UNION ALL SELECT 'currencies',count(*)::int FROM hcm.currency WHERE active`,
		)
		return Object.fromEntries(
			rows.map(/** Key to count. */ (row) => [row.key, row.count]),
		) as Record<LookupSetKey, number>
	}

	/** One page of values sorted by sort order, name and id. */
	async values(set: LookupSetKey, query: LookupValueQuery): Promise<LookupValuePage> {
		const binding = cursorBinding([
			this.scope.tenantId,
			this.scope.accountId,
			'lookups',
			set,
			query.q,
			query.active ?? null,
			query.limit,
		])
		const after = decodeCursor(query.cursor, binding, 3)
		const search = likePattern(query.q)
		const rows = await this.run(
			sql<
				LookupValueDto & { sortOrder: number }
			>`SELECT id,code,name,description,active,sort_order AS "sortOrder",attributes,revision FROM (${this.source(set)}) v WHERE true ${query.q ? sql`AND (code ILIKE ${search} OR name ILIKE ${search})` : sql``} ${query.active === undefined ? sql`` : sql`AND active=${query.active}`} ${after ? sql`AND (sort_order,name COLLATE "C",id COLLATE "C") > (${after[0]}::int,${after[1]} COLLATE "C",${after[2]} COLLATE "C")` : sql``} ORDER BY sort_order,name COLLATE "C",id COLLATE "C" LIMIT ${query.limit + 1}`,
		)
		return keysetPage(
			rows,
			query.limit,
			binding,
			/** Continue from the last value. */ (row) => [row.sortOrder, row.name, row.id],
		)
	}

	/** One value of a set. */
	async value(set: LookupSetKey, id: string): Promise<LookupValueDto | undefined> {
		return (
			await this.run(
				sql<LookupValueDto>`SELECT id,code,name,description,active,sort_order AS "sortOrder",attributes,revision FROM (${this.source(set)}) v WHERE id=${id}`,
			)
		)[0]
	}

	/** Lock a tenant value and return its revision. */
	async lockRevision(set: TenantLookupSet, id: string): Promise<number | undefined> {
		return (
			await this.run(
				sql<{
					revision: number
				}>`SELECT revision FROM ${sql.table(tables[set])} WHERE tenant_id=${this.scope.tenantId} AND id=${id} FOR UPDATE`,
			)
		)[0]?.revision
	}

	/** Insert a tenant value with its immutable code. */
	async create(id: string, command: LookupValueCreate): Promise<void> {
		const t = this.scope.tenantId
		const a = this.scope.accountId
		const v = command.value
		if (command.set === 'worker-types') {
			const x = v.attributes as WorkerTypeAttributes
			await this.run(
				sql`INSERT INTO hcm.worker_type(tenant_id,id,code,name,description,statutory_class,is_payroll_eligible,is_benefit_eligible,sort_order,created_by_account_id,updated_by_account_id) VALUES(${t},${id},${command.code},${v.name},${v.description},${x.statutoryClass},${x.payrollEligible},${x.benefitEligible},${v.sortOrder},${a},${a})`,
			)
		} else if (command.set === 'employment-end-reasons') {
			const x = v.attributes as EndReasonAttributes
			await this.run(
				sql`INSERT INTO hcm.employment_end_reason(tenant_id,id,code,name,description,is_voluntary,is_regrettable,is_eligible_for_rehire_by_default,sort_order,created_by_account_id,updated_by_account_id) VALUES(${t},${id},${command.code},${v.name},${v.description},${x.voluntary},${x.regrettable},${x.rehireEligible},${v.sortOrder},${a},${a})`,
			)
		} else {
			const x = v.attributes as EventTypeAttributes
			// requires_approval keeps its default; the approval policy owns it.
			await this.run(
				sql`INSERT INTO hcm.worker_event_type(tenant_id,id,code,name,description,category,sort_order,created_by_account_id,updated_by_account_id) VALUES(${t},${id},${command.code},${v.name},${v.description},${x.category},${v.sortOrder},${a},${a})`,
			)
		}
	}

	/** Update the mutable fields of a tenant value. */
	async update(set: TenantLookupSet, id: string, v: LookupValueInput): Promise<void> {
		const common = sql`name=${v.name},description=${v.description},sort_order=${v.sortOrder},revision=revision+1,updated_at=now(),updated_by_account_id=${this.scope.accountId}`
		const where = sql`WHERE tenant_id=${this.scope.tenantId} AND id=${id}`
		if (set === 'worker-types') {
			const x = v.attributes as WorkerTypeAttributes
			await this.run(
				sql`UPDATE hcm.worker_type SET ${common},statutory_class=${x.statutoryClass},is_payroll_eligible=${x.payrollEligible},is_benefit_eligible=${x.benefitEligible} ${where}`,
			)
		} else if (set === 'employment-end-reasons') {
			const x = v.attributes as EndReasonAttributes
			await this.run(
				sql`UPDATE hcm.employment_end_reason SET ${common},is_voluntary=${x.voluntary},is_regrettable=${x.regrettable},is_eligible_for_rehire_by_default=${x.rehireEligible} ${where}`,
			)
		} else {
			const x = v.attributes as EventTypeAttributes
			// requires_approval is display-only here; the approval policy owns it.
			await this.run(
				sql`UPDATE hcm.worker_event_type SET ${common},category=${x.category} ${where}`,
			)
		}
	}

	/** Retire or reactivate a tenant value. */
	async setActive(set: TenantLookupSet, id: string, active: boolean): Promise<void> {
		await this.run(
			sql`UPDATE ${sql.table(tables[set])} SET is_active=${active},revision=revision+1,updated_at=now(),updated_by_account_id=${this.scope.accountId} WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}
}
