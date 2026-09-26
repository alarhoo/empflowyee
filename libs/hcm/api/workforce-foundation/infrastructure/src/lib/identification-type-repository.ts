import { sql, type RawBuilder } from 'kysely'
import type { HcmListQuery } from '@empflowyee/hcm-runtime-contract'
import {
	classifyConstraint,
	cursorBinding,
	decodeCursor,
	keysetPage,
	likePattern,
} from '@empflowyee/hcm-api-database-kysely'
import {
	IDENTIFICATION_TYPE_LIMIT,
	type IdentificationTypeDto,
	type IdentificationTypeList,
	type ReferenceItemDto,
	type ReferenceItemPage,
} from '@empflowyee/hcm-workforce-foundation-contract'
import type { IdentificationTypeRepository } from '@empflowyee/hcm-api-workforce-foundation-application'
import type { WorkforceScope } from './structure-repository'

/** Global product catalogue reads; the runtime role has SELECT only on these tables. */
export class KyselyIdentificationTypeRepository implements IdentificationTypeRepository {
	/** Bind reads to the authorized transaction. */
	constructor(private readonly scope: WorkforceScope) {}

	/** Execute one query and classify database failures safely. */
	private async run<T>(query: RawBuilder<T>): Promise<T[]> {
		try {
			return (await query.execute(this.scope.executor)).rows
		} catch (error) {
			return classifyConstraint(error)
		}
	}

	/** Read the bounded catalogue; the validation pattern column is never selected. */
	async list(): Promise<IdentificationTypeList> {
		const items = await this.run(
			sql<IdentificationTypeDto>`SELECT code,name,country_code AS "countryCode",validation_description AS "validationDescription",is_unique_per_person AS "uniquePerPerson",requires_masking AS "requiresMasking",is_required_for_payroll AS "requiredForPayroll",active FROM hcm.identification_type ORDER BY name COLLATE "C",code COLLATE "C" LIMIT ${IDENTIFICATION_TYPE_LIMIT}`,
		)
		return { items }
	}

	/** Read one page of countries that issue at least one identification type. */
	async countries(query: HcmListQuery): Promise<ReferenceItemPage> {
		const binding = cursorBinding([
			this.scope.tenantId,
			this.scope.accountId,
			'identification-countries',
			query.q,
			query.limit,
		])
		const after = decodeCursor(query.cursor, binding, 2)
		const search = likePattern(query.q)
		const rows = await this.run(
			sql<ReferenceItemDto>`SELECT c.code,c.name,c.active,c.sort_order AS "sortOrder" FROM hcm.country c WHERE EXISTS(SELECT 1 FROM hcm.identification_type t WHERE t.country_code=c.code) ${query.q ? sql`AND (c.name ILIKE ${search} OR c.code ILIKE ${search})` : sql``} ${after ? sql`AND (c.name COLLATE "C",c.code COLLATE "C") > (${after[0]} COLLATE "C",${after[1]} COLLATE "C")` : sql``} ORDER BY c.name COLLATE "C",c.code COLLATE "C" LIMIT ${query.limit + 1}`,
		)
		return keysetPage(
			rows,
			query.limit,
			binding,
			/** Continue from the last country. */ (row) => [row.name, row.code],
		)
	}
}
