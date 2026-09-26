import {
	HcmDomainError,
	boolValue,
	codeValue,
	enumValue,
	intValue,
	invalidField,
	optionalText,
	readBody,
	readListQuery,
	revisionValue,
	textValue,
	type HcmListQuery,
	type HcmPage,
} from '@empflowyee/hcm-runtime-contract'

export const TENANT_LOOKUP_SETS = [
	'worker-types',
	'employment-end-reasons',
	'worker-event-types',
] as const
export const PRODUCT_LOOKUP_SETS = [
	'genders',
	'marital-statuses',
	'relationship-types',
	'countries',
	'currencies',
] as const
export const LOOKUP_SETS = [...TENANT_LOOKUP_SETS, ...PRODUCT_LOOKUP_SETS] as const
export type TenantLookupSet = (typeof TENANT_LOOKUP_SETS)[number]
export type LookupSetKey = (typeof LOOKUP_SETS)[number]

export const STATUTORY_CLASSES = [
	'Employee',
	'Contractor',
	'Apprentice',
	'Intern',
	'Consultant',
] as const
export const WORKER_EVENT_CATEGORIES = [
	'Hire',
	'Confirm',
	'Promote',
	'Transfer',
	'Demote',
	'CompensationChange',
	'Leave',
	'Suspend',
	'Exit',
	'Rehire',
	'Other',
] as const

/** Product-owned set metadata; the order is the display order. */
export const LOOKUP_SET_LABELS: Record<LookupSetKey, string> = {
	'worker-types': 'Worker types',
	'employment-end-reasons': 'Employment end reasons',
	'worker-event-types': 'Worker event types',
	genders: 'Genders',
	'marital-statuses': 'Marital statuses',
	'relationship-types': 'Relationship types',
	countries: 'Countries',
	currencies: 'Currencies',
}

export interface WorkerTypeAttributes {
	statutoryClass: (typeof STATUTORY_CLASSES)[number]
	payrollEligible: boolean
	benefitEligible: boolean
}
export interface EndReasonAttributes {
	voluntary: boolean
	regrettable: boolean
	rehireEligible: boolean
}
export interface EventTypeAttributes {
	category: (typeof WORKER_EVENT_CATEGORIES)[number]
	/** Display-only; the employment-change approval policy owns it. */
	requiresApproval: boolean
}
/** Read-only attributes of product relationship types. */
export interface RelationshipTypeAttributes {
	inverseCode: string | null
	familyRelation: boolean
	dependentEligible: boolean
	nomineeEligible: boolean
}
/** Read-only attributes of product sets, closed per set. */
export type ProductAttributes =
	| { statutoryClass: string }
	| RelationshipTypeAttributes
	| { supported: boolean }
	| { symbol: string; minorUnitDigits: number }
	| Record<string, never>
export type LookupAttributes =
	WorkerTypeAttributes | EndReasonAttributes | EventTypeAttributes | ProductAttributes

export interface LookupSetDto {
	key: LookupSetKey
	label: string
	ownership: 'Product' | 'Tenant'
	/** Active values in the set. */
	itemCount: number
}
export interface LookupValueDto {
	/** Tenant values have an opaque ID; product values use their code. */
	id: string
	code: string
	name: string
	description: string
	active: boolean
	sortOrder: number
	attributes: LookupAttributes
	/** 0 for product values, which have no revision. */
	revision: number
}
export type LookupValuePage = HcmPage<LookupValueDto>

export interface LookupValueQuery extends HcmListQuery {
	active?: boolean
}

/** Report whether a set is tenant-owned and therefore editable. */
export function isTenantLookupSet(key: LookupSetKey): key is TenantLookupSet {
	return (TENANT_LOOKUP_SETS as readonly string[]).includes(key)
}

/** Parse a supported set key. */
export function parseLookupSetKey(value: string): LookupSetKey {
	return enumValue(value, 'setKey', LOOKUP_SETS)
}

/** Parse the value list query: q on code and name, optional active filter. */
export function parseLookupValueQuery(params: URLSearchParams): LookupValueQuery {
	const query = readListQuery(params, ['sortOrder:asc'], ['active'])
	const active = query.filters['active']
	if (active !== undefined && !['true', 'false'].includes(active)) invalidField('active')
	return {
		q: query.q,
		limit: query.limit,
		sort: query.sort,
		...(query.cursor ? { cursor: query.cursor } : {}),
		...(active !== undefined ? { active: active === 'true' } : {}),
	}
}

/** Refuse writes to product sets before any lookup of the value. */
export function requireTenantSet(key: LookupSetKey): TenantLookupSet {
	if (!isTenantLookupSet(key)) throw new HcmDomainError('set-not-editable')
	return key
}

/** Parse the closed, per-set attribute object of a tenant value. */
function attributes(set: TenantLookupSet, value: unknown): LookupAttributes {
	if (set === 'worker-types') {
		const v = readBody(value, ['statutoryClass', 'payrollEligible', 'benefitEligible'])
		return {
			statutoryClass: enumValue(
				v['statutoryClass'],
				'attributes.statutoryClass',
				STATUTORY_CLASSES,
			),
			payrollEligible: boolValue(v['payrollEligible'], 'attributes.payrollEligible'),
			benefitEligible: boolValue(v['benefitEligible'], 'attributes.benefitEligible'),
		}
	}
	if (set === 'employment-end-reasons') {
		const v = readBody(value, ['voluntary', 'regrettable', 'rehireEligible'])
		return {
			voluntary: boolValue(v['voluntary'], 'attributes.voluntary'),
			regrettable: boolValue(v['regrettable'], 'attributes.regrettable'),
			rehireEligible: boolValue(v['rehireEligible'], 'attributes.rehireEligible'),
		}
	}
	const v = readBody(value, ['category'])
	return {
		category: enumValue(v['category'], 'attributes.category', WORKER_EVENT_CATEGORIES),
		requiresApproval: false,
	}
}

export interface LookupValueInput {
	name: string
	description: string
	sortOrder: number
	attributes: LookupAttributes
}
export interface LookupValueCreate {
	set: TenantLookupSet
	code: string
	value: LookupValueInput
	reason: string
}
export interface LookupValueUpdate {
	set: TenantLookupSet
	value: LookupValueInput
	expectedRevision: number
	reason: string
}
export interface LookupValueActive {
	set: TenantLookupSet
	active: boolean
	expectedRevision: number
	reason: string
}

/** Parse the mutable fields shared by create and update. */
function valueInput(set: TenantLookupSet, v: Record<string, unknown>): LookupValueInput {
	return {
		name: textValue(v['name'], 'name', 100),
		description: optionalText(v['description'], 'description', 500),
		sortOrder: intValue(v['sortOrder'], 'sortOrder', 0, 9999),
		attributes: attributes(set, v['attributes']),
	}
}

/** Parse a create command with its immutable code. */
export function parseLookupValueCreate(key: LookupSetKey, body: unknown): LookupValueCreate {
	const set = requireTenantSet(key)
	const v = readBody(body, ['code', 'name', 'description', 'sortOrder', 'attributes', 'reason'])
	return {
		set,
		code: codeValue(v['code'], 'code', /^[A-Z][A-Z0-9_]{1,39}$/),
		value: valueInput(set, v),
		reason: textValue(v['reason'], 'reason', 500),
	}
}

/** Parse a revisioned update; the code is not accepted. */
export function parseLookupValueUpdate(key: LookupSetKey, body: unknown): LookupValueUpdate {
	const set = requireTenantSet(key)
	const v = readBody(body, [
		'name',
		'description',
		'sortOrder',
		'attributes',
		'expectedRevision',
		'reason',
	])
	return {
		set,
		value: valueInput(set, v),
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: textValue(v['reason'], 'reason', 500),
	}
}

/** Parse a retire or reactivate command. */
export function parseLookupValueActive(key: LookupSetKey, body: unknown): LookupValueActive {
	const set = requireTenantSet(key)
	const v = readBody(body, ['active', 'expectedRevision', 'reason'])
	return {
		set,
		active: boolValue(v['active'], 'active'),
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: textValue(v['reason'], 'reason', 500),
	}
}
