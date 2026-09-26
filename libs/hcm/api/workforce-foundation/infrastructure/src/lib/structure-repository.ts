import { sql, type RawBuilder, type Kysely } from 'kysely'
import {
	HcmDomainError,
	invalidField,
	type HcmListQuery,
	type HcmPage,
} from '@empflowyee/hcm-runtime-contract'
import {
	classifyConstraint,
	cursorBinding,
	decodeCursor,
	keysetPage,
	likePattern,
} from '@empflowyee/hcm-api-database-kysely'
import type {
	OrganisationProfileUpdate,
	OrganisationProfileView,
	StructureArea,
	StructureCreate,
	StructureItemDto,
	StructureListQuery,
	StructureOption,
	StructureOptionKind,
	StructurePage,
	StructureUpdate,
	UnitDetailDto,
	UnitVersionDto,
	UnitVersionInput,
} from '@empflowyee/hcm-workforce-foundation-contract'
import type {
	HierarchyArea,
	StructureRepository,
	UnitVersionRow,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import type { UnitTypeRule } from '@empflowyee/hcm-api-workforce-foundation-domain'

/** Verified tenant and actor bound to one authorized transaction. */
export interface WorkforceScope {
	executor: Kysely<unknown>
	tenantId: string
	accountId: string
}

type SimpleArea = Exclude<StructureArea, 'units'>
interface AreaMap {
	table: string
	activeColumn: string
	codeColumn: string
	fields: Record<string, string>
}
const areas: Record<SimpleArea, AreaMap> = {
	'legal-entities': {
		table: 'hcm.legal_entity',
		activeColumn: 'is_active',
		codeColumn: 'code',
		fields: {
			name: 'name',
			registeredName: 'registered_name',
			entityType: 'entity_type',
			countryCode: 'country_code',
			registrationNumber: 'registration_number',
			taxIdentificationNumber: 'tax_identification_number',
			taxDeductionAccountNumber: 'tax_deduction_account_number',
			socialSecurityEmployerCode: 'social_security_employer_code',
			stateInsuranceEmployerCode: 'state_insurance_employer_code',
			registeredLocationId: 'registered_location_id',
			reportingCurrencyCode: 'reporting_currency_code',
			financialYearStartMonth: 'financial_year_start_month',
			financialYearStartDay: 'financial_year_start_day',
			incorporatedOn: 'incorporated_on',
			operationsStartedOn: 'operations_started_on',
			operationsClosedOn: 'operations_closed_on',
		},
	},
	'unit-types': {
		table: 'hcm.organisation_unit_type',
		activeColumn: 'is_enabled',
		codeColumn: 'code',
		fields: {
			name: 'name',
			pluralName: 'plural_name',
			allowMultiplePerParent: 'allow_multiple_per_parent',
			sortOrder: 'sort_order',
		},
	},
	departments: {
		table: 'hcm.department',
		activeColumn: 'is_active',
		codeColumn: 'code',
		fields: {
			name: 'name',
			description: 'description',
			parentId: 'parent_department_id',
			headWorkerId: 'head_worker_id',
			costCenterCode: 'cost_center_code',
			targetHeadcount: 'target_headcount',
			sortOrder: 'sort_order',
		},
	},
	designations: {
		table: 'hcm.designation',
		activeColumn: 'is_active',
		codeColumn: 'code',
		fields: {
			name: 'name',
			description: 'description',
			parentId: 'parent_designation_id',
			sortOrder: 'sort_order',
		},
	},
	locations: {
		table: 'hcm.location',
		activeColumn: 'is_active',
		codeColumn: 'code',
		fields: {
			name: 'name',
			locationType: 'location_type',
			owningUnitId: 'organisation_id',
			addressLine1: 'address_line1',
			addressLine2: 'address_line2',
			locality: 'locality',
			city: 'city',
			stateOrProvince: 'state_or_province',
			postalCode: 'postal_code',
			countryCode: 'country_code',
			timeZone: 'timezone',
			latitude: 'latitude',
			longitude: 'longitude',
			geofenceRadiusMeters: 'geofence_radius_meters',
			contactPhone: 'contact_phone',
			contactEmail: 'contact_email',
			virtual: 'is_virtual',
		},
	},
}

/** Format a date column as a timezone-free ISO date. */
const day = (column: string) => sql.raw(`to_char(${column},'YYYY-MM-DD')`)
/** Project a nullable joined row as an {id, code, name} reference. */
const ref = (alias: string, name = `${alias}.name`, code = `${alias}.code`) =>
	sql.raw(
		`CASE WHEN ${alias}.id IS NULL THEN NULL ELSE json_build_object('id',${alias}.id,'code',coalesce(${code},''),'name',${name}) END`,
	)

/** SQL projections that map rows to public DTOs; no persistence row is serialized directly. */
function projection(area: SimpleArea): RawBuilder<unknown> {
	if (area === 'legal-entities')
		return sql`SELECT x.id,x.code,x.name,x.registered_name AS "registeredName",x.entity_type AS "entityType",json_build_object('code',c.code,'name',c.name) AS country,x.registration_number AS "registrationNumber",x.tax_identification_number AS "taxIdentificationNumber",x.tax_deduction_account_number AS "taxDeductionAccountNumber",x.social_security_employer_code AS "socialSecurityEmployerCode",x.state_insurance_employer_code AS "stateInsuranceEmployerCode",${ref('l')} AS "registeredLocation",json_build_object('code',cu.code,'name',cu.name) AS "reportingCurrency",x.financial_year_start_month AS "financialYearStartMonth",x.financial_year_start_day AS "financialYearStartDay",${day('x.incorporated_on')} AS "incorporatedOn",${day('x.operations_started_on')} AS "operationsStartedOn",${day('x.operations_closed_on')} AS "operationsClosedOn",x.is_active AS active,x.revision,x.name AS sort_name FROM hcm.legal_entity x JOIN hcm.country c ON c.code=x.country_code JOIN hcm.currency cu ON cu.code=x.reporting_currency_code LEFT JOIN hcm.location l ON l.tenant_id=x.tenant_id AND l.id=x.registered_location_id`
	if (area === 'unit-types')
		return sql`SELECT x.id,x.code,x.name,x.plural_name AS "pluralName",${ref('p')} AS "parentType",x.hierarchy_level AS "hierarchyLevel",x.is_enabled AS enabled,x.allow_multiple_per_parent AS "allowMultiplePerParent",x.is_legal_entity_bearing AS "legalEntityBearing",x.sort_order AS "sortOrder",x.revision,x.name AS sort_name,x.is_enabled AS active_flag FROM hcm.organisation_unit_type x LEFT JOIN hcm.organisation_unit_type p ON p.tenant_id=x.tenant_id AND p.id=x.parent_type_id`
	if (area === 'departments')
		return sql`SELECT x.id,x.code,x.name,x.description,${ref('p')} AS parent,CASE WHEN w.id IS NULL THEN NULL ELSE json_build_object('id',w.id,'displayName',pe.display_name,'workerNumber',w.worker_code) END AS "headWorker",x.cost_center_code AS "costCenterCode",x.target_headcount AS "targetHeadcount",x.is_active AS active,x.sort_order AS "sortOrder",x.revision,x.name AS sort_name FROM hcm.department x LEFT JOIN hcm.department p ON p.tenant_id=x.tenant_id AND p.id=x.parent_department_id LEFT JOIN hcm.worker w ON w.tenant_id=x.tenant_id AND w.id=x.head_worker_id LEFT JOIN hcm.person pe ON pe.tenant_id=w.tenant_id AND pe.id=w.person_id`
	if (area === 'designations')
		return sql`SELECT x.id,x.code,x.name,x.description,${ref('p')} AS parent,x.sort_order AS "sortOrder",x.is_active AS active,x.revision,x.name AS sort_name FROM hcm.designation x LEFT JOIN hcm.designation p ON p.tenant_id=x.tenant_id AND p.id=x.parent_designation_id`
	return sql`SELECT x.id,x.code,x.name,x.location_type AS "locationType",json_build_object('id',o.id,'code',o.code,'name',o.name) AS "owningUnit",x.address_line1 AS "addressLine1",x.address_line2 AS "addressLine2",x.locality,x.city,x.state_or_province AS "stateOrProvince",x.postal_code AS "postalCode",json_build_object('code',c.code,'name',c.name) AS country,x.timezone AS "timeZone",x.latitude::float8 AS latitude,x.longitude::float8 AS longitude,x.geofence_radius_meters AS "geofenceRadiusMeters",x.contact_phone AS "contactPhone",x.contact_email AS "contactEmail",x.is_virtual AS virtual,x.is_active AS active,x.revision,x.name AS sort_name FROM hcm.location x JOIN hcm.organisation o ON o.tenant_id=x.tenant_id AND o.id=x.organisation_id JOIN hcm.country c ON c.code=x.country_code`
}

/** Unit projection at one as-of date, including the inherited legal entity. */
function unitProjection(tenantId: string, asOf: string): RawBuilder<unknown> {
	return sql`SELECT o.id,o.code,v.name,json_build_object('id',t.id,'code',t.code,'name',t.name) AS "unitType",CASE WHEN p.id IS NULL THEN NULL ELSE json_build_object('id',p.id,'code',p.code,'name',coalesce(pv.name,p.name)) END AS parent,CASE WHEN le.id IS NULL THEN NULL ELSE json_build_object('id',le.id,'code',le.code,'name',le.name) END AS "legalEntity",(v.legal_entity_id IS NULL AND le.id IS NOT NULL) AS "legalEntityInherited",o.is_active AS active,EXISTS(SELECT 1 FROM hcm.organisation_version c WHERE c.tenant_id=o.tenant_id AND c.parent_organisation_id=o.id AND c.effective_period @> ${asOf}::date) AS "hasChildren",to_char(v.effective_from,'YYYY-MM-DD') AS "effectiveFrom",to_char(v.effective_to,'YYYY-MM-DD') AS "effectiveTo",v.name AS sort_name,v.parent_organisation_id AS parent_id,o.revision
	FROM hcm.organisation o
	JOIN hcm.organisation_version v ON v.tenant_id=o.tenant_id AND v.organisation_id=o.id AND v.effective_period @> ${asOf}::date
	JOIN hcm.organisation_unit_type t ON t.tenant_id=v.tenant_id AND t.id=v.unit_type_id
	LEFT JOIN hcm.organisation p ON p.tenant_id=v.tenant_id AND p.id=v.parent_organisation_id
	LEFT JOIN hcm.organisation_version pv ON pv.tenant_id=p.tenant_id AND pv.organisation_id=p.id AND pv.effective_period @> ${asOf}::date
	LEFT JOIN LATERAL (
		WITH RECURSIVE chain(unit_id,parent_id,legal_entity_id,depth) AS (
			SELECT v.organisation_id,v.parent_organisation_id,v.legal_entity_id,0
			UNION ALL
			SELECT cv.organisation_id,cv.parent_organisation_id,cv.legal_entity_id,chain.depth+1 FROM chain JOIN hcm.organisation_version cv ON cv.tenant_id=${tenantId} AND cv.organisation_id=chain.parent_id AND cv.effective_period @> ${asOf}::date WHERE chain.legal_entity_id IS NULL AND chain.depth<20
		) SELECT legal_entity_id FROM chain WHERE legal_entity_id IS NOT NULL ORDER BY depth LIMIT 1
	) inherited ON true
	LEFT JOIN hcm.legal_entity le ON le.tenant_id=o.tenant_id AND le.id=inherited.legal_entity_id
	WHERE o.tenant_id=${tenantId}`
}

/** Strip internal sort helpers from a projected row. */
function publicRow<T>(row: Record<string, unknown>): T {
	const rest = { ...row }
	for (const key of ['sort_name', 'parent_id', 'active_flag']) delete rest[key]
	return rest as T
}

export class KyselyStructureRepository implements StructureRepository {
	/** Bind structure SQL to the authorized tenant transaction. */
	constructor(private readonly scope: WorkforceScope) {}

	/** Execute a statement, translating integrity violations into safe domain codes. */
	private async run<T>(query: RawBuilder<T>): Promise<T[]> {
		try {
			return (await query.execute(this.scope.executor)).rows
		} catch (error) {
			return classifyConstraint(error)
		}
	}

	/** Read the Account-owned display name and HCM profile. */
	async profile(): Promise<OrganisationProfileView> {
		const t = this.scope.tenantId
		const [row] = await this.run(
			sql<{
				organisationName: string
				profile: OrganisationProfileView['profile']
			}>`SELECT tn.display_name AS "organisationName",CASE WHEN p.tenant_id IS NULL THEN NULL ELSE json_build_object('organisationName',tn.display_name,'defaultTimeZone',p.default_time_zone,'defaultLanguage',p.default_language,'defaultCurrency',json_build_object('code',cu.code,'name',cu.name),'financialYearStartMonth',p.financial_year_start_month,'financialYearStartDay',p.financial_year_start_day,'headquartersLocation',${ref('l')},'revision',p.revision) END AS profile FROM hcm.tenant tn LEFT JOIN hcm.organisation_profile p ON p.tenant_id=tn.id LEFT JOIN hcm.currency cu ON cu.code=p.default_currency_code LEFT JOIN hcm.location l ON l.tenant_id=p.tenant_id AND l.id=p.headquarters_location_id WHERE tn.id=${t}`,
		)
		if (!row) throw new HcmDomainError('not-found')
		return row
	}

	/** Insert or update the profile at the expected revision. */
	async saveProfile(v: OrganisationProfileUpdate): Promise<void> {
		const { tenantId: t, accountId: a } = this.scope
		let statement = sql`UPDATE hcm.organisation_profile SET default_time_zone=${v.defaultTimeZone},default_language=${v.defaultLanguage},default_currency_code=${v.defaultCurrencyCode},financial_year_start_month=${v.financialYearStartMonth},financial_year_start_day=${v.financialYearStartDay},headquarters_location_id=${v.headquartersLocationId},revision=revision+1,updated_at=now(),updated_by_account_id=${a} WHERE tenant_id=${t} AND revision=${v.expectedRevision} RETURNING tenant_id`
		if (v.expectedRevision === 0)
			statement = sql`INSERT INTO hcm.organisation_profile(tenant_id,default_time_zone,default_language,default_currency_code,financial_year_start_month,financial_year_start_day,headquarters_location_id,created_by_account_id,updated_by_account_id) VALUES(${t},${v.defaultTimeZone},${v.defaultLanguage},${v.defaultCurrencyCode},${v.financialYearStartMonth},${v.financialYearStartDay},${v.headquartersLocationId},${a},${a}) ON CONFLICT (tenant_id) DO NOTHING RETURNING tenant_id`
		const rows = await this.run(statement)
		if (!rows.length) throw new HcmDomainError('revision-conflict')
	}

	/** Read one keyset page of an area. */
	async list(query: StructureListQuery, asOf: string): Promise<StructurePage> {
		const t = this.scope.tenantId
		const binding = cursorBinding([
			t,
			this.scope.accountId,
			query.area,
			query.q,
			query.sort,
			query.active ?? null,
			query.parentId ?? null,
			asOf,
			query.limit,
		])
		const after = decodeCursor(query.cursor, binding, 2)
		const desc = query.sort === 'name:desc'
		const byCode = query.sort === 'code:asc'
		const sortExpr = byCode ? sql.raw("coalesce(code,'')") : sql.raw('sort_name')
		const order = desc ? sql.raw('DESC') : sql.raw('ASC')
		const compare = desc ? sql.raw('<') : sql.raw('>')
		const search = likePattern(query.q)
		const base =
			query.area === 'units'
				? sql`SELECT * FROM (${unitProjection(t, asOf)}) u WHERE true ${this.unitParentFilter(query)}`
				: sql`SELECT * FROM (${projection(query.area)} WHERE x.tenant_id=${t}) u WHERE true`
		const activeColumn = query.area === 'unit-types' ? sql.raw('enabled') : sql.raw('active')
		const rows = await this.run(
			sql<
				Record<string, unknown>
			>`${base} ${query.q ? sql`AND (sort_name ILIKE ${search} OR coalesce(code,'') ILIKE ${search})` : sql``} ${query.active === undefined ? sql`` : sql`AND ${activeColumn}=${query.active}`} ${after ? sql`AND (${sortExpr} COLLATE "C",id COLLATE "C") ${compare} (${after[0]} COLLATE "C",${after[1]} COLLATE "C")` : sql``} ORDER BY ${sortExpr} COLLATE "C" ${order},id COLLATE "C" ${order} LIMIT ${query.limit + 1}`,
		)
		const page = keysetPage(
			rows,
			query.limit,
			binding,
			/** Continue from the last visible tuple. */ (row) => [
				String(byCode ? (row['code'] ?? '') : row['sort_name']),
				String(row['id']),
			],
		)
		return {
			items: page.items.map(/** Remove sort helpers. */ (row) => publicRow<StructureItemDto>(row)),
			nextCursor: page.nextCursor,
		}
	}

	/** Children of a parent, roots when browsing, or all units when searching. */
	private unitParentFilter(query: StructureListQuery): RawBuilder<unknown> {
		if (query.parentId) return sql`AND parent_id=${query.parentId}`
		if (query.q) return sql``
		return sql`AND parent_id IS NULL`
	}

	/** Read one item; units include versions and usage. */
	async detail(
		area: StructureArea,
		id: string,
		asOf: string,
	): Promise<StructureItemDto | UnitDetailDto> {
		const t = this.scope.tenantId
		if (area !== 'units') {
			const [row] = await this.run(
				sql<
					Record<string, unknown>
				>`SELECT * FROM (${projection(area)} WHERE x.tenant_id=${t} AND x.id=${id}) u`,
			)
			if (!row) throw new HcmDomainError('not-found')
			return publicRow<StructureItemDto>(row)
		}
		const [unit] = await this.run(
			sql<
				Record<string, unknown>
			>`SELECT o.id,o.code,o.name,o.is_active AS active,o.revision,${ref('s')} AS "supersededBy" FROM hcm.organisation o LEFT JOIN hcm.organisation s ON s.tenant_id=o.tenant_id AND s.id=o.superseded_by_id WHERE o.tenant_id=${t} AND o.id=${id}`,
		)
		if (!unit) throw new HcmDomainError('not-found')
		const versions = await this.run(
			sql<UnitVersionDto>`SELECT v.id,json_build_object('id',t.id,'code',t.code,'name',t.name) AS "unitType",${ref('p')} AS parent,v.name,v.description,${ref('le')} AS "legalEntity",${ref('l')} AS "primaryLocation",v.cost_center_code AS "costCenterCode",CASE WHEN w.id IS NULL THEN NULL ELSE json_build_object('id',w.id,'displayName',pe.display_name,'workerNumber',w.worker_code) END AS "headWorker",to_char(v.effective_from,'YYYY-MM-DD') AS "effectiveFrom",to_char(v.effective_to,'YYYY-MM-DD') AS "effectiveTo" FROM hcm.organisation_version v JOIN hcm.organisation_unit_type t ON t.tenant_id=v.tenant_id AND t.id=v.unit_type_id LEFT JOIN hcm.organisation p ON p.tenant_id=v.tenant_id AND p.id=v.parent_organisation_id LEFT JOIN hcm.legal_entity le ON le.tenant_id=v.tenant_id AND le.id=v.legal_entity_id LEFT JOIN hcm.location l ON l.tenant_id=v.tenant_id AND l.id=v.primary_location_id LEFT JOIN hcm.worker w ON w.tenant_id=v.tenant_id AND w.id=v.head_worker_id LEFT JOIN hcm.person pe ON pe.tenant_id=w.tenant_id AND pe.id=w.person_id WHERE v.tenant_id=${t} AND v.organisation_id=${id} ORDER BY v.effective_from DESC LIMIT 100`,
		)
		const [summary] = await this.run(
			sql<Record<string, unknown>>`SELECT * FROM (${unitProjection(t, asOf)} AND o.id=${id}) u`,
		)
		let fallback = summary
		if (!fallback) {
			const latestDate = versions[0]?.effectiveFrom ?? asOf
			;[fallback] = await this.run(
				sql<
					Record<string, unknown>
				>`SELECT * FROM (${unitProjection(t, latestDate)} AND o.id=${id}) u`,
			)
		}
		const [usage] = await this.run(
			sql<{
				currentAssignments: number
				childUnits: number
			}>`SELECT (SELECT count(*)::int FROM hcm.assignment a WHERE a.tenant_id=${t} AND a.organisation_id=${id}) AS "currentAssignments",(SELECT count(DISTINCT c.organisation_id)::int FROM hcm.organisation_version c WHERE c.tenant_id=${t} AND c.parent_organisation_id=${id} AND c.effective_period @> ${asOf}::date) AS "childUnits"`,
		)
		let base: Record<string, unknown> = {
			id: String(unit['id']),
			code: String(unit['code']),
			name: String(unit['name']),
			unitType: null,
			parent: null,
			legalEntity: null,
			legalEntityInherited: false,
			active: Boolean(unit['active']),
			hasChildren: false,
			effectiveFrom: '',
			effectiveTo: null,
		}
		if (fallback) base = publicRow<Record<string, unknown>>(fallback)
		return {
			...(base as unknown as UnitDetailDto),
			revision: Number(unit['revision']),
			supersededBy: unit['supersededBy'] as UnitDetailDto['supersededBy'],
			versions,
			usage: usage ?? { currentAssignments: 0, childUnits: 0 },
		}
	}

	/** Read picker options for one reference kind. */
	async options(
		kind: StructureOptionKind,
		query: HcmListQuery & { activeOnly: boolean },
		asOf: string,
	): Promise<HcmPage<StructureOption>> {
		const binding = cursorBinding([
			this.scope.tenantId,
			this.scope.accountId,
			'options',
			kind,
			query.q,
			query.activeOnly,
			asOf,
			query.limit,
		])
		const after = decodeCursor(query.cursor, binding, 2)
		const search = likePattern(query.q)
		const rows = await this.run(
			sql<StructureOption>`SELECT * FROM (${this.optionSource(kind, asOf)}) o WHERE true ${query.activeOnly ? sql`AND active` : sql``} ${query.q ? sql`AND (name ILIKE ${search} OR code ILIKE ${search})` : sql``} ${after ? sql`AND (name COLLATE "C",id COLLATE "C") > (${after[0]} COLLATE "C",${after[1]} COLLATE "C")` : sql``} ORDER BY name COLLATE "C",id COLLATE "C" LIMIT ${query.limit + 1}`,
		)
		return keysetPage(
			rows,
			query.limit,
			binding,
			/** Continue from the last option. */ (row) => [row.name, row.id],
		)
	}

	/** Build the id/code/name/active source for one reference kind. */
	private optionSource(kind: StructureOptionKind, asOf: string): RawBuilder<unknown> {
		const t = this.scope.tenantId
		if (kind === 'countries') return sql`SELECT code AS id,code,name,active FROM hcm.country`
		if (kind === 'currencies') return sql`SELECT code AS id,code,name,active FROM hcm.currency`
		if (kind === 'workers')
			return sql`SELECT w.id,w.worker_code AS code,p.display_name AS name,true AS active FROM hcm.worker w JOIN hcm.person p ON p.tenant_id=w.tenant_id AND p.id=w.person_id WHERE w.tenant_id=${t}`
		if (kind === 'units')
			return sql`SELECT o.id,o.code,v.name,o.is_active AS active FROM hcm.organisation o JOIN hcm.organisation_version v ON v.tenant_id=o.tenant_id AND v.organisation_id=o.id AND v.effective_period @> ${asOf}::date WHERE o.tenant_id=${t}`
		if (kind === 'locations')
			return sql`SELECT id,coalesce(code,'') AS code,name,is_active AS active FROM hcm.location WHERE tenant_id=${t}`
		const map = areas[kind]
		return sql`SELECT id,${sql.raw(map.codeColumn)} AS code,name,${sql.raw(map.activeColumn)} AS active FROM ${sql.table(map.table)} WHERE tenant_id=${t}`
	}

	/** Require one existing active reference. */
	async requireReference(
		kind: StructureOptionKind,
		id: string,
		field: string,
		asOf: string,
	): Promise<void> {
		const [row] = await this.run(
			sql<{
				id: string
			}>`SELECT id FROM (${this.optionSource(kind, asOf)}) o WHERE id=${id} AND active`,
		)
		if (!row) invalidField(field, 'unknown')
	}

	/** Code and name of the given ids on a date; unknown ids are absent. */
	async labels(
		kind: StructureOptionKind,
		ids: readonly string[],
		asOf: string,
	): Promise<Map<string, StructureOption>> {
		if (!ids.length) return new Map()
		const rows = await this.run(
			sql<StructureOption>`SELECT * FROM (${this.optionSource(kind, asOf)}) o WHERE id = ANY(${[...new Set(ids)]}::text[])`,
		)
		return new Map(rows.map(/** Key by id. */ (row) => [row.id, row]))
	}

	/** Lock one item row and return its revision. */
	async lockRevision(area: StructureArea, id: string): Promise<number> {
		const table = area === 'units' ? 'hcm.organisation' : areas[area].table
		const [row] = await this.run(
			sql<{
				revision: number
			}>`SELECT revision FROM ${sql.table(table)} WHERE tenant_id=${this.scope.tenantId} AND id=${id} FOR UPDATE`,
		)
		if (!row) throw new HcmDomainError('not-found')
		return row.revision
	}

	/** Read one unit type's chain rule. */
	async unitType(id: string): Promise<UnitTypeRule & { hierarchyLevel: number }> {
		const [row] = await this.run(
			sql<
				UnitTypeRule & { hierarchyLevel: number }
			>`SELECT id,parent_type_id AS "parentTypeId",is_enabled AS enabled,is_legal_entity_bearing AS "legalEntityBearing",allow_multiple_per_parent AS "allowMultiplePerParent",hierarchy_level AS "hierarchyLevel" FROM hcm.organisation_unit_type WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
		if (!row) invalidField('unitTypeId', 'unknown')
		return row
	}

	/** Select the version columns used by placement rules. */
	private versionColumns(): RawBuilder<unknown> {
		return sql`id,organisation_id AS "unitId",unit_type_id AS "unitTypeId",parent_organisation_id AS "parentId",to_char(effective_from,'YYYY-MM-DD') AS "effectiveFrom",to_char(effective_to,'YYYY-MM-DD') AS "effectiveTo"`
	}

	/** Read the version effective on one date. */
	async unitVersionAt(unitId: string, date: string): Promise<UnitVersionRow | null> {
		const [row] = await this.run(
			sql<UnitVersionRow>`SELECT ${this.versionColumns()} FROM hcm.organisation_version WHERE tenant_id=${this.scope.tenantId} AND organisation_id=${unitId} AND effective_period @> ${date}::date`,
		)
		return row ?? null
	}

	/** Lock and read the most recent version. */
	async latestUnitVersion(unitId: string): Promise<UnitVersionRow> {
		const [row] = await this.run(
			sql<UnitVersionRow>`SELECT ${this.versionColumns()} FROM hcm.organisation_version WHERE tenant_id=${this.scope.tenantId} AND organisation_id=${unitId} ORDER BY effective_from DESC LIMIT 1 FOR UPDATE`,
		)
		if (!row) throw new HcmDomainError('record-incomplete')
		return row
	}

	/** Walk the ancestor chain nearest first, bounded to twenty levels. */
	async ancestors(area: HierarchyArea, id: string, asOf: string): Promise<string[]> {
		const t = this.scope.tenantId
		const steps: Record<HierarchyArea, RawBuilder<unknown>> = {
			units: sql`SELECT v.parent_organisation_id,chain.depth+1 FROM chain JOIN hcm.organisation_version v ON v.tenant_id=${t} AND v.organisation_id=chain.id AND v.effective_period @> ${asOf}::date`,
			departments: sql`SELECT d.parent_department_id,chain.depth+1 FROM chain JOIN hcm.department d ON d.tenant_id=${t} AND d.id=chain.id`,
			designations: sql`SELECT d.parent_designation_id,chain.depth+1 FROM chain JOIN hcm.designation d ON d.tenant_id=${t} AND d.id=chain.id`,
		}
		const step = steps[area]
		const rows = await this.run(
			sql<{
				id: string
			}>`WITH RECURSIVE chain(id,depth) AS (SELECT ${id}::text,0 UNION ALL ${step} WHERE chain.depth<20) SELECT id FROM chain WHERE id IS NOT NULL ORDER BY depth`,
		)
		return rows.map(/** Keep identifiers. */ (row) => row.id)
	}

	/** Report whether another unit of the type already sits under the parent. */
	async siblingOfTypeExists(
		parentId: string,
		unitTypeId: string,
		date: string,
		excludeUnitId: string | null,
	): Promise<boolean> {
		const [row] = await this.run(
			sql<{
				exists: boolean
			}>`SELECT EXISTS(SELECT 1 FROM hcm.organisation_version WHERE tenant_id=${this.scope.tenantId} AND parent_organisation_id=${parentId} AND unit_type_id=${unitTypeId} AND effective_period @> ${date}::date ${excludeUnitId ? sql`AND organisation_id<>${excludeUnitId}` : sql``}) AS exists`,
		)
		return Boolean(row?.exists)
	}

	/** Report current or future dependants of one item from a date. */
	async inUse(area: StructureArea, id: string, from: string): Promise<boolean> {
		const t = this.scope.tenantId
		const future = sql`effective_period && daterange(${from}::date,NULL,'[)')`
		const checks: Record<StructureArea, RawBuilder<unknown>> = {
			units: sql`EXISTS(SELECT 1 FROM hcm.organisation_version WHERE tenant_id=${t} AND parent_organisation_id=${id} AND ${future}) OR EXISTS(SELECT 1 FROM hcm.assignment WHERE tenant_id=${t} AND organisation_id=${id}) OR EXISTS(SELECT 1 FROM hcm.location WHERE tenant_id=${t} AND organisation_id=${id} AND is_active)`,
			locations: sql`EXISTS(SELECT 1 FROM hcm.assignment WHERE tenant_id=${t} AND location_id=${id}) OR EXISTS(SELECT 1 FROM hcm.organisation_version WHERE tenant_id=${t} AND primary_location_id=${id} AND ${future}) OR EXISTS(SELECT 1 FROM hcm.legal_entity WHERE tenant_id=${t} AND registered_location_id=${id} AND is_active) OR EXISTS(SELECT 1 FROM hcm.organisation_profile WHERE tenant_id=${t} AND headquarters_location_id=${id})`,
			departments: sql`EXISTS(SELECT 1 FROM hcm.department WHERE tenant_id=${t} AND parent_department_id=${id} AND is_active)`,
			designations: sql`EXISTS(SELECT 1 FROM hcm.designation WHERE tenant_id=${t} AND parent_designation_id=${id} AND is_active)`,
			'legal-entities': sql`EXISTS(SELECT 1 FROM hcm.organisation_version WHERE tenant_id=${t} AND legal_entity_id=${id} AND ${future})`,
			'unit-types': sql`EXISTS(SELECT 1 FROM hcm.organisation_version WHERE tenant_id=${t} AND unit_type_id=${id} AND ${future}) OR EXISTS(SELECT 1 FROM hcm.organisation_unit_type WHERE tenant_id=${t} AND parent_type_id=${id} AND is_enabled)`,
		}
		const [row] = await this.run(sql<{ used: boolean }>`SELECT (${checks[area]}) AS used`)
		return Boolean(row?.used)
	}

	/** Insert a new structure item; units also insert their first version. */
	async create(id: string, command: StructureCreate, hierarchyLevel: number | null): Promise<void> {
		const { tenantId: t, accountId: a } = this.scope
		if (command.area === 'units') {
			await this.run(
				sql`INSERT INTO hcm.organisation(tenant_id,id,code,name,created_by_account_id,updated_by_account_id) VALUES(${t},${id},${command.code},${command.value.name},${a},${a})`,
			)
			await this.insertVersion(id, command.value)
			return
		}
		const map = areas[command.area]
		const values: Record<string, unknown> = {}
		for (const [field, column] of Object.entries(map.fields))
			values[column] = (command.value as unknown as Record<string, unknown>)[field]
		if (command.area === 'unit-types') {
			values['parent_type_id'] = command.parentTypeId
			values['hierarchy_level'] = hierarchyLevel
			values['is_legal_entity_bearing'] = command.legalEntityBearing
		}
		if (command.area === 'legal-entities' && command.value.operationsClosedOn !== null)
			values['is_active'] = false
		const columns = [
			'tenant_id',
			'id',
			map.codeColumn,
			...Object.keys(values),
			'created_by_account_id',
			'updated_by_account_id',
		]
		const params = [t, id, command.code, ...Object.values(values), a, a]
		await this.run(
			sql`INSERT INTO ${sql.table(map.table)}(${sql.join(columns.map(/** Quote fixed identifiers. */ (c) => sql.ref(c)))}) VALUES(${sql.join(params)})`,
		)
	}

	/** Update mutable columns of one non-unit item. */
	async update(area: SimpleArea, id: string, command: StructureUpdate): Promise<void> {
		const map = areas[area]
		const assignments = Object.entries(map.fields).map(
			/** Bind each mapped field. */ ([field, column]) =>
				sql`${sql.ref(column)}=${(command.value as unknown as Record<string, unknown>)[field]}`,
		)
		if (command.area === 'legal-entities' && command.value.operationsClosedOn !== null)
			assignments.push(sql`is_active=false`)
		await this.run(
			sql`UPDATE ${sql.table(map.table)} SET ${sql.join(assignments)},revision=revision+1,updated_at=now(),updated_by_account_id=${this.scope.accountId} WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** Retire or reactivate a non-unit item. */
	async setActive(area: SimpleArea, id: string, active: boolean): Promise<void> {
		const map = areas[area]
		if (area === 'legal-entities' && active) {
			const [row] = await this.run(
				sql<{
					closed: boolean
				}>`SELECT operations_closed_on IS NOT NULL AS closed FROM hcm.legal_entity WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
			)
			if (row?.closed) throw new HcmDomainError('invalid-state')
		}
		await this.run(
			sql`UPDATE ${sql.table(map.table)} SET ${sql.ref(map.activeColumn)}=${active},revision=revision+1,updated_at=now(),updated_by_account_id=${this.scope.accountId} WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** Insert one dated unit version. */
	private async insertVersion(unitId: string, v: UnitVersionInput): Promise<void> {
		await this.run(
			sql`INSERT INTO hcm.organisation_version(tenant_id,id,organisation_id,unit_type_id,parent_organisation_id,name,description,legal_entity_id,primary_location_id,cost_center_code,head_worker_id,effective_from,created_by_account_id) VALUES(${this.scope.tenantId},gen_random_uuid()::text,${unitId},${v.unitTypeId},${v.parentId},${v.name},${v.description},${v.legalEntityId},${v.primaryLocationId},${v.costCenterCode},${v.headWorkerId},${v.effectiveFrom}::date,${this.scope.accountId})`,
		)
	}

	/** Close the latest version and open its successor. */
	async addUnitVersion(
		unitId: string,
		input: UnitVersionInput,
		closeLatestOn: string,
	): Promise<void> {
		const t = this.scope.tenantId
		await this.run(
			sql`UPDATE hcm.organisation_version SET effective_to=${closeLatestOn}::date WHERE tenant_id=${t} AND organisation_id=${unitId} AND effective_to IS NULL`,
		)
		await this.insertVersion(unitId, input)
		await this.run(
			sql`UPDATE hcm.organisation SET name=${input.name},revision=revision+1,updated_at=now(),updated_by_account_id=${this.scope.accountId} WHERE tenant_id=${t} AND id=${unitId}`,
		)
	}

	/** Close the latest version, deactivate the unit and record its successor. */
	async retireUnit(unitId: string, effectiveTo: string, successorId: string | null): Promise<void> {
		const t = this.scope.tenantId
		await this.run(
			sql`UPDATE hcm.organisation_version SET effective_to=${effectiveTo}::date WHERE tenant_id=${t} AND organisation_id=${unitId} AND effective_to IS NULL`,
		)
		await this.run(
			sql`UPDATE hcm.organisation SET is_active=false,superseded_by_id=${successorId},revision=revision+1,updated_at=now(),updated_by_account_id=${this.scope.accountId} WHERE tenant_id=${t} AND id=${unitId}`,
		)
	}
}
