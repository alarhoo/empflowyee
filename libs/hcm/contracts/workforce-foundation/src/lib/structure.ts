import {
	boolValue,
	codeValue,
	dateValue,
	decimalValue,
	enumValue,
	idValue,
	intValue,
	optionalDate,
	optionalId,
	optionalInt,
	optionalText,
	readBody,
	readListQuery,
	revisionValue,
	textValue,
	timeZoneValue,
	invalidField,
	type HcmListQuery,
	type HcmPage,
} from '@empflowyee/hcm-runtime-contract'

export const STRUCTURE_AREAS = [
	'legal-entities',
	'unit-types',
	'units',
	'departments',
	'designations',
	'locations',
] as const
export type StructureArea = (typeof STRUCTURE_AREAS)[number]
export const STRUCTURE_OPTION_KINDS = [
	...STRUCTURE_AREAS,
	'countries',
	'currencies',
	'workers',
] as const
export type StructureOptionKind = (typeof STRUCTURE_OPTION_KINDS)[number]
export const ENTITY_TYPES = [
	'PrivateLimited',
	'PublicLimited',
	'LimitedLiabilityPartnership',
	'Partnership',
	'SoleProprietorship',
	'Branch',
	'Other',
] as const
export type EntityType = (typeof ENTITY_TYPES)[number]
export const LOCATION_TYPES = [
	'HeadOffice',
	'BranchOffice',
	'RegisteredOffice',
	'Factory',
	'Warehouse',
	'ClientSite',
	'Remote',
] as const
export type LocationType = (typeof LOCATION_TYPES)[number]

export interface StructureRef {
	id: string
	code: string
	name: string
}
export interface ReferenceRef {
	code: string
	name: string
}
export interface WorkerRef {
	id: string
	displayName: string
	workerNumber: string
}
export interface StructureOption {
	id: string
	code: string
	name: string
	active: boolean
}

export interface OrganisationProfileDto {
	organisationName: string
	defaultTimeZone: string
	defaultLanguage: string
	defaultCurrency: ReferenceRef
	financialYearStartMonth: number
	financialYearStartDay: number
	headquartersLocation: StructureRef | null
	revision: number
}
export interface OrganisationProfileView {
	organisationName: string
	profile: OrganisationProfileDto | null
}
export interface LegalEntityDto {
	id: string
	code: string
	name: string
	registeredName: string
	entityType: EntityType
	country: ReferenceRef
	registrationNumber: string
	taxIdentificationNumber: string
	taxDeductionAccountNumber: string
	socialSecurityEmployerCode: string
	stateInsuranceEmployerCode: string
	registeredLocation: StructureRef | null
	reportingCurrency: ReferenceRef
	financialYearStartMonth: number | null
	financialYearStartDay: number | null
	incorporatedOn: string | null
	operationsStartedOn: string | null
	operationsClosedOn: string | null
	active: boolean
	revision: number
}
export interface UnitTypeDto {
	id: string
	code: string
	name: string
	pluralName: string
	parentType: StructureRef | null
	hierarchyLevel: number
	enabled: boolean
	allowMultiplePerParent: boolean
	legalEntityBearing: boolean
	sortOrder: number
	revision: number
}
export interface UnitVersionDto {
	id: string
	unitType: StructureRef
	parent: StructureRef | null
	name: string
	description: string
	legalEntity: StructureRef | null
	primaryLocation: StructureRef | null
	costCenterCode: string
	headWorker: WorkerRef | null
	effectiveFrom: string
	effectiveTo: string | null
}
export interface UnitSummaryDto {
	id: string
	code: string
	name: string
	unitType: StructureRef
	parent: StructureRef | null
	legalEntity: StructureRef | null
	legalEntityInherited: boolean
	active: boolean
	hasChildren: boolean
	effectiveFrom: string
	effectiveTo: string | null
}
export interface StructureUsageDto {
	currentAssignments: number
	childUnits: number
}
export interface UnitDetailDto extends UnitSummaryDto {
	revision: number
	supersededBy: StructureRef | null
	versions: UnitVersionDto[]
	usage: StructureUsageDto
}
export interface DepartmentDto {
	id: string
	code: string
	name: string
	description: string
	parent: StructureRef | null
	headWorker: WorkerRef | null
	costCenterCode: string
	targetHeadcount: number | null
	active: boolean
	sortOrder: number
	revision: number
}
export interface DesignationDto {
	id: string
	code: string
	name: string
	description: string
	parent: StructureRef | null
	sortOrder: number
	active: boolean
	revision: number
}
export interface LocationDto {
	id: string
	code: string | null
	name: string
	locationType: LocationType | null
	owningUnit: StructureRef
	addressLine1: string
	addressLine2: string
	locality: string
	city: string
	stateOrProvince: string
	postalCode: string
	country: ReferenceRef
	timeZone: string
	latitude: number | null
	longitude: number | null
	geofenceRadiusMeters: number | null
	contactPhone: string
	contactEmail: string
	virtual: boolean
	active: boolean
	revision: number
}
export type StructureItemDto =
	LegalEntityDto | UnitTypeDto | UnitSummaryDto | DepartmentDto | DesignationDto | LocationDto
export type StructurePage = HcmPage<StructureItemDto>

export interface StructureListQuery extends HcmListQuery {
	area: StructureArea
	active?: boolean
	parentId?: string
	asOf?: string
}

/** Parse a supported structure area route segment. */
export function parseStructureArea(value: string): StructureArea {
	return enumValue(value, 'area', STRUCTURE_AREAS)
}

/** Parse the bounded structure list query; units also accept parent and as-of controls. */
export function parseStructureListQuery(
	area: StructureArea,
	params: URLSearchParams,
): StructureListQuery {
	const filters = area === 'units' ? ['active', 'parentId', 'asOf'] : ['active']
	const query = readListQuery(params, ['name:asc', 'name:desc', 'code:asc'], filters)
	const active = query.filters['active']
	if (active !== undefined && !['true', 'false'].includes(active)) invalidField('active')
	return {
		area,
		q: query.q,
		limit: query.limit,
		sort: query.sort,
		...(query.cursor ? { cursor: query.cursor } : {}),
		...(active !== undefined ? { active: active === 'true' } : {}),
		...(query.filters['parentId']
			? { parentId: idValue(query.filters['parentId'], 'parentId') }
			: {}),
		...(query.filters['asOf'] ? { asOf: dateValue(query.filters['asOf'], 'asOf') } : {}),
	}
}

/** Validate a recurring financial-year start that is valid in every year. */
function financialYear(month: number | null, day: number | null): void {
	if ((month === null) !== (day === null)) invalidField('financialYearStartDay')
	if (month === null || day === null) return
	let max = 31
	if (month === 2) max = 28
	else if ([4, 6, 9, 11].includes(month)) max = 30
	if (day > max) invalidField('financialYearStartDay')
}

export interface OrganisationProfileUpdate {
	defaultTimeZone: string
	defaultLanguage: string
	defaultCurrencyCode: string
	financialYearStartMonth: number
	financialYearStartDay: number
	headquartersLocationId: string | null
	expectedRevision: number
	reason: string
}
/** Parse organisation HR defaults; expectedRevision 0 creates the first profile. */
export function parseOrganisationProfileUpdate(body: unknown): OrganisationProfileUpdate {
	const v = readBody(body, [
		'defaultTimeZone',
		'defaultLanguage',
		'defaultCurrencyCode',
		'financialYearStartMonth',
		'financialYearStartDay',
		'headquartersLocationId',
		'expectedRevision',
		'reason',
	])
	const language = textValue(v['defaultLanguage'], 'defaultLanguage', 35)
	try {
		Intl.getCanonicalLocales(language)
	} catch {
		invalidField('defaultLanguage')
	}
	if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(language)) invalidField('defaultLanguage')
	const month = intValue(v['financialYearStartMonth'], 'financialYearStartMonth', 1, 12)
	const day = intValue(v['financialYearStartDay'], 'financialYearStartDay', 1, 31)
	financialYear(month, day)
	return {
		defaultTimeZone: timeZoneValue(v['defaultTimeZone'], 'defaultTimeZone'),
		defaultLanguage: language,
		defaultCurrencyCode: codeValue(v['defaultCurrencyCode'], 'defaultCurrencyCode', /^[A-Z]{3}$/),
		financialYearStartMonth: month,
		financialYearStartDay: day,
		headquartersLocationId: optionalId(v['headquartersLocationId'], 'headquartersLocationId'),
		expectedRevision: intValue(v['expectedRevision'], 'expectedRevision', 0, 2_147_483_647),
		reason: textValue(v['reason'], 'reason', 500),
	}
}

export interface LegalEntityInput {
	name: string
	registeredName: string
	entityType: EntityType
	countryCode: string
	registrationNumber: string
	taxIdentificationNumber: string
	taxDeductionAccountNumber: string
	socialSecurityEmployerCode: string
	stateInsuranceEmployerCode: string
	registeredLocationId: string | null
	reportingCurrencyCode: string
	financialYearStartMonth: number | null
	financialYearStartDay: number | null
	incorporatedOn: string | null
	operationsStartedOn: string | null
	operationsClosedOn: string | null
}
const legalEntityFields = [
	'name',
	'registeredName',
	'entityType',
	'countryCode',
	'registrationNumber',
	'taxIdentificationNumber',
	'taxDeductionAccountNumber',
	'socialSecurityEmployerCode',
	'stateInsuranceEmployerCode',
	'registeredLocationId',
	'reportingCurrencyCode',
	'financialYearStartMonth',
	'financialYearStartDay',
	'incorporatedOn',
	'operationsStartedOn',
	'operationsClosedOn',
]
/** Parse the mutable legal-entity field set shared by create and update. */
function legalEntityInput(v: Record<string, unknown>): LegalEntityInput {
	const month = optionalInt(v['financialYearStartMonth'], 'financialYearStartMonth', 1, 12)
	const day = optionalInt(v['financialYearStartDay'], 'financialYearStartDay', 1, 31)
	financialYear(month, day)
	/** Parse one optional statutory employer identifier. */
	const statutory = (field: string) => optionalText(v[field], field, 50)
	return {
		name: textValue(v['name'], 'name', 150),
		registeredName: textValue(v['registeredName'], 'registeredName', 200),
		entityType: enumValue(v['entityType'], 'entityType', ENTITY_TYPES),
		countryCode: codeValue(v['countryCode'], 'countryCode', /^[A-Z]{2}$/),
		registrationNumber: statutory('registrationNumber'),
		taxIdentificationNumber: statutory('taxIdentificationNumber'),
		taxDeductionAccountNumber: statutory('taxDeductionAccountNumber'),
		socialSecurityEmployerCode: statutory('socialSecurityEmployerCode'),
		stateInsuranceEmployerCode: statutory('stateInsuranceEmployerCode'),
		registeredLocationId: optionalId(v['registeredLocationId'], 'registeredLocationId'),
		reportingCurrencyCode: codeValue(
			v['reportingCurrencyCode'],
			'reportingCurrencyCode',
			/^[A-Z]{3}$/,
		),
		financialYearStartMonth: month,
		financialYearStartDay: day,
		incorporatedOn: optionalDate(v['incorporatedOn'], 'incorporatedOn'),
		operationsStartedOn: optionalDate(v['operationsStartedOn'], 'operationsStartedOn'),
		operationsClosedOn: optionalDate(v['operationsClosedOn'], 'operationsClosedOn'),
	}
}

export interface UnitTypeInput {
	name: string
	pluralName: string
	allowMultiplePerParent: boolean
	sortOrder: number
}
/** Parse the mutable unit-type field set. */
function unitTypeInput(v: Record<string, unknown>): UnitTypeInput {
	return {
		name: textValue(v['name'], 'name', 100),
		pluralName: textValue(v['pluralName'], 'pluralName', 100),
		allowMultiplePerParent: boolValue(v['allowMultiplePerParent'], 'allowMultiplePerParent'),
		sortOrder: intValue(v['sortOrder'], 'sortOrder', 0, 9999),
	}
}

export interface UnitVersionInput {
	unitTypeId: string
	parentId: string | null
	name: string
	description: string
	legalEntityId: string | null
	primaryLocationId: string | null
	costCenterCode: string
	headWorkerId: string | null
	effectiveFrom: string
}
const unitVersionFields = [
	'unitTypeId',
	'parentId',
	'name',
	'description',
	'legalEntityId',
	'primaryLocationId',
	'costCenterCode',
	'headWorkerId',
	'effectiveFrom',
]
/** Parse one effective-dated unit placement. */
function unitVersionInput(v: Record<string, unknown>): UnitVersionInput {
	return {
		unitTypeId: idValue(v['unitTypeId'], 'unitTypeId'),
		parentId: optionalId(v['parentId'], 'parentId'),
		name: textValue(v['name'], 'name', 150),
		description: optionalText(v['description'], 'description', 500),
		legalEntityId: optionalId(v['legalEntityId'], 'legalEntityId'),
		primaryLocationId: optionalId(v['primaryLocationId'], 'primaryLocationId'),
		costCenterCode: optionalText(v['costCenterCode'], 'costCenterCode', 40),
		headWorkerId: optionalId(v['headWorkerId'], 'headWorkerId'),
		effectiveFrom: dateValue(v['effectiveFrom'], 'effectiveFrom'),
	}
}

export interface DepartmentInput {
	name: string
	description: string
	parentId: string | null
	headWorkerId: string | null
	costCenterCode: string
	targetHeadcount: number | null
	sortOrder: number
}
const departmentFields = [
	'name',
	'description',
	'parentId',
	'headWorkerId',
	'costCenterCode',
	'targetHeadcount',
	'sortOrder',
]
/** Parse the mutable department field set. */
function departmentInput(v: Record<string, unknown>): DepartmentInput {
	return {
		name: textValue(v['name'], 'name', 150),
		description: optionalText(v['description'], 'description', 500),
		parentId: optionalId(v['parentId'], 'parentId'),
		headWorkerId: optionalId(v['headWorkerId'], 'headWorkerId'),
		costCenterCode: optionalText(v['costCenterCode'], 'costCenterCode', 40),
		targetHeadcount: optionalInt(v['targetHeadcount'], 'targetHeadcount', 0, 1_000_000),
		sortOrder: intValue(v['sortOrder'], 'sortOrder', 0, 9999),
	}
}

export interface DesignationInput {
	name: string
	description: string
	parentId: string | null
	sortOrder: number
}
const designationFields = ['name', 'description', 'parentId', 'sortOrder']
/** Parse the mutable designation field set; designations carry no grade or authority. */
function designationInput(v: Record<string, unknown>): DesignationInput {
	return {
		name: textValue(v['name'], 'name', 150),
		description: optionalText(v['description'], 'description', 500),
		parentId: optionalId(v['parentId'], 'parentId'),
		sortOrder: intValue(v['sortOrder'], 'sortOrder', 0, 9999),
	}
}

export interface LocationInput {
	name: string
	locationType: LocationType
	owningUnitId: string
	addressLine1: string
	addressLine2: string
	locality: string
	city: string
	stateOrProvince: string
	postalCode: string
	countryCode: string
	timeZone: string
	latitude: number | null
	longitude: number | null
	geofenceRadiusMeters: number | null
	contactPhone: string
	contactEmail: string
	virtual: boolean
}
const locationFields = [
	'name',
	'locationType',
	'owningUnitId',
	'addressLine1',
	'addressLine2',
	'locality',
	'city',
	'stateOrProvince',
	'postalCode',
	'countryCode',
	'timeZone',
	'latitude',
	'longitude',
	'geofenceRadiusMeters',
	'contactPhone',
	'contactEmail',
	'virtual',
]
/** Parse the mutable location field set; coordinates are both present or both absent. */
function locationInput(v: Record<string, unknown>): LocationInput {
	const latitude =
		v['latitude'] === null ? null : decimalValue(v['latitude'], 'latitude', -90, 90, 6)
	const longitude =
		v['longitude'] === null ? null : decimalValue(v['longitude'], 'longitude', -180, 180, 6)
	if ((latitude === null) !== (longitude === null)) invalidField('longitude')
	const email = optionalText(v['contactEmail'], 'contactEmail', 254)
	if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalidField('contactEmail')
	const virtual = boolValue(v['virtual'], 'virtual')
	return {
		name: textValue(v['name'], 'name', 150),
		locationType: enumValue(v['locationType'], 'locationType', LOCATION_TYPES),
		owningUnitId: idValue(v['owningUnitId'], 'owningUnitId'),
		addressLine1: optionalText(v['addressLine1'], 'addressLine1', 200),
		addressLine2: optionalText(v['addressLine2'], 'addressLine2', 200),
		locality: optionalText(v['locality'], 'locality', 100),
		city: textValue(v['city'], 'city', 100),
		stateOrProvince: optionalText(v['stateOrProvince'], 'stateOrProvince', 100),
		postalCode: optionalText(v['postalCode'], 'postalCode', 20),
		countryCode: codeValue(v['countryCode'], 'countryCode', /^[A-Z]{2}$/),
		timeZone: timeZoneValue(v['timeZone'], 'timeZone'),
		latitude,
		longitude,
		geofenceRadiusMeters: optionalInt(
			v['geofenceRadiusMeters'],
			'geofenceRadiusMeters',
			1,
			100_000,
		),
		contactPhone: optionalText(v['contactPhone'], 'contactPhone', 40),
		contactEmail: email,
		virtual,
	}
}

export interface UnitTypeCreate {
	area: 'unit-types'
	code: string
	parentTypeId: string | null
	legalEntityBearing: boolean
	value: UnitTypeInput
	reason: string
}
export type StructureCreate =
	| { area: 'legal-entities'; code: string; value: LegalEntityInput; reason: string }
	| UnitTypeCreate
	| { area: 'units'; code: string; value: UnitVersionInput; reason: string }
	| { area: 'departments'; code: string; value: DepartmentInput; reason: string }
	| { area: 'designations'; code: string; value: DesignationInput; reason: string }
	| { area: 'locations'; code: string; value: LocationInput; reason: string }

export type StructureUpdate =
	| { area: 'legal-entities'; value: LegalEntityInput; expectedRevision: number; reason: string }
	| { area: 'unit-types'; value: UnitTypeInput; expectedRevision: number; reason: string }
	| { area: 'departments'; value: DepartmentInput; expectedRevision: number; reason: string }
	| { area: 'designations'; value: DesignationInput; expectedRevision: number; reason: string }
	| { area: 'locations'; value: LocationInput; expectedRevision: number; reason: string }

const structureCode = /^[A-Z][A-Z0-9_]{1,39}$/
const unitCode = /^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/
const locationCode = /^[A-Z0-9][A-Z0-9_-]{1,39}$/

/** Parse a create command for one structure area with an immutable code. */
export function parseStructureCreate(area: StructureArea, body: unknown): StructureCreate {
	if (area === 'legal-entities') {
		const v = readBody(body, ['code', 'reason', ...legalEntityFields])
		return {
			area,
			code: codeValue(v['code'], 'code', structureCode),
			value: legalEntityInput(v),
			reason: textValue(v['reason'], 'reason', 500),
		}
	}
	if (area === 'unit-types') {
		const v = readBody(body, [
			'code',
			'parentTypeId',
			'legalEntityBearing',
			'reason',
			'name',
			'pluralName',
			'allowMultiplePerParent',
			'sortOrder',
		])
		return {
			area,
			code: codeValue(v['code'], 'code', structureCode),
			parentTypeId: optionalId(v['parentTypeId'], 'parentTypeId'),
			legalEntityBearing: boolValue(v['legalEntityBearing'], 'legalEntityBearing'),
			value: unitTypeInput(v),
			reason: textValue(v['reason'], 'reason', 500),
		}
	}
	if (area === 'units') {
		const v = readBody(body, ['code', 'reason', ...unitVersionFields])
		return {
			area,
			code: codeValue(v['code'], 'code', unitCode),
			value: unitVersionInput(v),
			reason: textValue(v['reason'], 'reason', 500),
		}
	}
	if (area === 'departments') {
		const v = readBody(body, ['code', 'reason', ...departmentFields])
		return {
			area,
			code: codeValue(v['code'], 'code', structureCode),
			value: departmentInput(v),
			reason: textValue(v['reason'], 'reason', 500),
		}
	}
	if (area === 'designations') {
		const v = readBody(body, ['code', 'reason', ...designationFields])
		return {
			area,
			code: codeValue(v['code'], 'code', structureCode),
			value: designationInput(v),
			reason: textValue(v['reason'], 'reason', 500),
		}
	}
	const v = readBody(body, ['code', 'reason', ...locationFields])
	return {
		area,
		code: codeValue(v['code'], 'code', locationCode),
		value: locationInput(v),
		reason: textValue(v['reason'], 'reason', 500),
	}
}

/** Parse a revisioned update for one non-unit structure area; units change through versions. */
export function parseStructureUpdate(area: StructureArea, body: unknown): StructureUpdate {
	const tail = ['expectedRevision', 'reason']
	/** Parse the revision and reason shared by every update. */
	const common = (v: Record<string, unknown>) => ({
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: textValue(v['reason'], 'reason', 500),
	})
	if (area === 'legal-entities') {
		const v = readBody(body, [...legalEntityFields, ...tail])
		return { area, value: legalEntityInput(v), ...common(v) }
	}
	if (area === 'unit-types') {
		const v = readBody(body, ['name', 'pluralName', 'allowMultiplePerParent', 'sortOrder', ...tail])
		return { area, value: unitTypeInput(v), ...common(v) }
	}
	if (area === 'departments') {
		const v = readBody(body, [...departmentFields, ...tail])
		return { area, value: departmentInput(v), ...common(v) }
	}
	if (area === 'designations') {
		const v = readBody(body, [...designationFields, ...tail])
		return { area, value: designationInput(v), ...common(v) }
	}
	if (area === 'locations') {
		const v = readBody(body, [...locationFields, ...tail])
		return { area, value: locationInput(v), ...common(v) }
	}
	return invalidField('area', 'use-versions')
}

export interface StructureActiveChange {
	active: boolean
	expectedRevision: number
	reason: string
}
/** Parse a retire or reactivate command for a non-unit structure item. */
export function parseStructureActive(body: unknown): StructureActiveChange {
	const v = readBody(body, ['active', 'expectedRevision', 'reason'])
	return {
		active: boolValue(v['active'], 'active'),
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: textValue(v['reason'], 'reason', 500),
	}
}

export interface UnitVersionCommand {
	value: UnitVersionInput
	expectedRevision: number
	reason: string
}
/** Parse a new effective-dated unit version. */
export function parseUnitVersion(body: unknown): UnitVersionCommand {
	const v = readBody(body, [...unitVersionFields, 'expectedRevision', 'reason'])
	return {
		value: unitVersionInput(v),
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: textValue(v['reason'], 'reason', 500),
	}
}

export interface UnitRetireCommand {
	effectiveTo: string
	successorId: string | null
	expectedRevision: number
	reason: string
}
/** Parse a unit retirement from a date, optionally naming its successor. */
export function parseUnitRetire(body: unknown): UnitRetireCommand {
	const v = readBody(body, ['effectiveTo', 'successorId', 'expectedRevision', 'reason'])
	return {
		effectiveTo: dateValue(v['effectiveTo'], 'effectiveTo'),
		successorId: optionalId(v['successorId'], 'successorId'),
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: textValue(v['reason'], 'reason', 500),
	}
}

/** Parse a structure option kind route segment. */
export function parseStructureOptionKind(value: string): StructureOptionKind {
	return enumValue(value, 'kind', STRUCTURE_OPTION_KINDS)
}

/** Parse bounded option-picker queries. */
export function parseOptionQuery(params: URLSearchParams): HcmListQuery & { activeOnly: boolean } {
	const query = readListQuery(params, ['name:asc'], ['includeInactive'])
	const include = query.filters['includeInactive']
	if (include !== undefined && !['true', 'false'].includes(include)) invalidField('includeInactive')
	return {
		q: query.q,
		limit: query.limit,
		sort: query.sort,
		...(query.cursor ? { cursor: query.cursor } : {}),
		activeOnly: include !== 'true',
	}
}
