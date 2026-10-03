import {
	boolValue,
	codeValue,
	dateValue,
	enumValue,
	idValue,
	intValue,
	invalidField,
	preservedTextValue,
	readBody,
	type HcmFieldError,
} from '@empflowyee/hcm-runtime-contract'
import {
	leaveUnits,
	leaveUnitsScaled,
	type LeaveRounding,
	type LeaveTrackingMode,
	type LeaveUnit,
	type LeaveUnits,
} from './hcm-leave-contract'

export interface LeaveEffectiveRange {
	effectiveFrom: string
	effectiveTo?: string
}
export interface LeaveEligibilityRule extends LeaveEffectiveRange {
	id: string
	priority: number
	effect: 'Include' | 'Exclude'
	legalEntityId?: string
	orgUnitId?: string
	departmentId?: string
	locationId?: string
	workerTypeId?: string
	employmentType?: string
	genderCode?: string
	minimumServiceDays?: number
	statutoryFloorReference?: string
}
export interface LeavePolicyAssignment extends LeaveEffectiveRange {
	id: string
	employmentId: string
	effect: 'Include' | 'Exclude'
}
export interface LeaveApprovalRule {
	id: string
	stage: number
	roleCode: string
	subjectType: 'Leave' | 'Cancellation' | 'Adjustment'
	independent: boolean
	source?: 'LineManager' | 'ManagerLevel' | 'Function' | 'NamedUser'
	managerLevel?: number
	functionCode?: 'LEAVE_APPROVAL_ACT'
	accountId?: string
	minimumUnits?: LeaveUnits
	maximumUnits?: LeaveUnits
}
export interface LeaveAccrualRule {
	enabled: boolean
	unitsPerYear?: LeaveUnits
	unitsPerMonth?: LeaveUnits
	unitsPerOccurrence?: LeaveUnits
	frequency?: 'OnJoin' | 'Monthly' | 'Quarterly' | 'Annual' | 'ServiceAnniversary'
	timing?: 'Advance' | 'Arrears'
	proration?: 'None' | 'CalendarDays' | 'WorkingDays'
	waitingPeriodDays?: number
	maximumAccruedBalanceUnits?: LeaveUnits
}
export interface LeaveCarryForwardRule {
	enabled: boolean
	capUnits?: LeaveUnits
	expiryDays?: number
	expiryBasis?: 'PeriodStart' | 'PeriodEnd' | 'GrantDate'
}
export interface LeaveCompOffRule {
	enabled: boolean
	halfUnitMinutes?: number
	unitMinutes?: number
	maxUnitsPerDate?: LeaveUnits
	claimWindowDays?: number
	expiryDays?: number
}
export interface LeaveEncashmentRule {
	configured: boolean
	annualOnly: true
	maxUnits?: LeaveUnits
	minimumRetainedUnits?: LeaveUnits
}
export interface LeavePolicyDraft extends LeaveEffectiveRange {
	code: string
	name: string
	description?: string
	leaveTypeId: string
	trackingMode: LeaveTrackingMode
	unit: LeaveUnit
	eligibility: { workerTypes: string[]; legalEntityIds: string[]; minimumServiceDays?: number }
	eligibilityRules: LeaveEligibilityRule[]
	datedAssignments: LeavePolicyAssignment[]
	standardDayMinutes?: number
	hourlyIncrementMinutes?: number
	rounding: LeaveRounding
	allowHalfDay?: boolean
	allowHourly?: boolean
	maximumBackdatedDays?: number
	maximumAdvanceDays?: number
	minimumRequestUnits?: LeaveUnits
	maximumRequestUnits?: LeaveUnits
	accrual: LeaveAccrualRule
	carryForward: LeaveCarryForwardRule
	noticeDays?: number
	noticeMode: 'Warning' | 'Block'
	evidenceAfterConsecutiveDays?: number
	approvalRules: LeaveApprovalRule[]
	compOff: LeaveCompOffRule
	encashment: LeaveEncashmentRule
	bridgeRule: 'None' | 'CountIntervening'
	blackoutDates: string[]
	allowOverlap: false
	negativeBalanceAllowed: false
	postingPoint: 'OnApproval'
}
export interface LeavePolicyVersionView extends LeavePolicyDraft {
	id: string
	versionId: string
	version: number
	revision: number
	state: 'Draft' | 'Published' | 'Retired'
	validation: HcmFieldError[]
}
const MAX_INTEGER = 2_147_483_647

/** Parse a bounded collection without sorting or silently removing duplicates. */
function rows<T>(
	value: unknown,
	field: string,
	parse: (row: unknown, field: string) => T,
	maximum = 100,
): T[] {
	if (!Array.isArray(value) || value.length > maximum) invalidField(field)
	return value.map(
		/** Retain the precise nested control path on errors. */ (row, index) =>
			parse(row, `${field}.${index}`),
	)
}
/** Reject duplicate explicit identities while preserving submitted order. */
function unique<T>(values: T[], field: string, identity: (value: T) => string): T[] {
	if (new Set(values.map(identity)).size !== values.length) invalidField(field, 'duplicate')
	return values
}
/** Validate nested shapes and prefix their field errors for native form binding. */
function object(
	value: unknown,
	field: string,
	required: string[],
	optional: string[] = [],
): Record<string, unknown> {
	try {
		return readBody(value, required, optional)
	} catch (error) {
		if (
			error &&
			typeof error === 'object' &&
			'fieldErrors' in error &&
			Array.isArray(error.fieldErrors)
		) {
			for (const entry of error.fieldErrors) entry.field = `${field}.${entry.field}`
		}
		throw error
	}
}
/** Retain optional values only when explicitly supplied and syntactically valid. */
function option<T, K extends string>(
	body: Record<string, unknown>,
	key: K,
	field: string,
	parse: (value: unknown, field: string) => T,
): Partial<Record<K, T>> {
	return key in body
		? ({ [key]: parse(body[key], field ? `${field}.${key}` : key) } as Partial<Record<K, T>>)
		: {}
}
/** Parse nonnegative day counters in the SQL integer range. */
function days(value: unknown, field: string): number {
	return intValue(value, field, 0, MAX_INTEGER)
}
/** Parse strictly positive intervals in the SQL integer range. */
function positiveInteger(value: unknown, field: string): number {
	return intValue(value, field, 1, MAX_INTEGER)
}
/** Parse an exact positive funding or request quantity. */
function positiveUnits(value: unknown, field: string): LeaveUnits {
	return leaveUnits(value, field, 'positive')
}
/** Parse an exact nonnegative retained balance or approval threshold. */
function nonnegativeUnits(value: unknown, field: string): LeaveUnits {
	return leaveUnits(value, field, 'nonnegative')
}
/** Validate an inclusive local-date range with no inferred end date. */
function range(body: Record<string, unknown>, field: string): LeaveEffectiveRange {
	const effectiveFrom = dateValue(body['effectiveFrom'], `${field}.effectiveFrom`)
	const effectiveTo =
		'effectiveTo' in body ? dateValue(body['effectiveTo'], `${field}.effectiveTo`) : undefined
	if (effectiveTo && effectiveTo < effectiveFrom)
		invalidField(`${field}.effectiveTo`, 'before-start')
	return { effectiveFrom, ...(effectiveTo ? { effectiveTo } : {}) }
}
/** Parse one typed eligibility rule without accepting an expression or arbitrary predicate. */
function eligibilityRule(value: unknown, field: string): LeaveEligibilityRule {
	const ids = [
		'legalEntityId',
		'orgUnitId',
		'departmentId',
		'locationId',
		'workerTypeId',
		'employmentType',
		'genderCode',
		'statutoryFloorReference',
	]
	const body = object(
		value,
		field,
		['id', 'priority', 'effect', 'effectiveFrom'],
		[...ids, 'minimumServiceDays', 'effectiveTo'],
	)
	const result: LeaveEligibilityRule = {
		id: idValue(body['id'], `${field}.id`),
		priority: days(body['priority'], `${field}.priority`),
		effect: enumValue(body['effect'], `${field}.effect`, ['Include', 'Exclude']),
		...range(body, field),
		...option(body, 'minimumServiceDays', field, days),
	}
	for (const key of ids) Object.assign(result, option(body, key, field, idValue))
	return result
}
/** Parse one explicit dated employment assignment. */
function assignment(value: unknown, field: string): LeavePolicyAssignment {
	const body = object(
		value,
		field,
		['id', 'employmentId', 'effect', 'effectiveFrom'],
		['effectiveTo'],
	)
	return {
		id: idValue(body['id'], `${field}.id`),
		employmentId: idValue(body['employmentId'], `${field}.employmentId`),
		effect: enumValue(body['effect'], `${field}.effect`, ['Include', 'Exclude']),
		...range(body, field),
	}
}
/** Parse a required slot with explicit routing and no client-authority switches. */
function approvalRule(value: unknown, field: string): LeaveApprovalRule {
	const body = object(
		value,
		field,
		['id', 'stage', 'roleCode', 'subjectType', 'independent'],
		['source', 'managerLevel', 'functionCode', 'accountId', 'minimumUnits', 'maximumUnits'],
	)
	const result: LeaveApprovalRule = {
		id: idValue(body['id'], `${field}.id`),
		stage: intValue(body['stage'], `${field}.stage`, 1, 5),
		roleCode: codeValue(body['roleCode'], `${field}.roleCode`, /^[A-Z][A-Z0-9_-]{0,39}$/),
		subjectType: enumValue(body['subjectType'], `${field}.subjectType`, [
			'Leave',
			'Cancellation',
			'Adjustment',
		]),
		independent: boolValue(body['independent'], `${field}.independent`),
		...option(
			body,
			'source',
			field,
			/** Admit only the existing source routing choices. */ (v, f) =>
				enumValue(v, f, ['LineManager', 'ManagerLevel', 'Function', 'NamedUser'] as const),
		),
		...option(body, 'managerLevel', field, positiveInteger),
		...option(
			body,
			'functionCode',
			field,
			/** Function names do not bypass current Access grants. */ (v, f) =>
				enumValue(v, f, ['LEAVE_APPROVAL_ACT'] as const),
		),
		...option(body, 'accountId', field, idValue),
		...option(body, 'minimumUnits', field, nonnegativeUnits),
		...option(body, 'maximumUnits', field, positiveUnits),
	}
	if (result.subjectType === 'Adjustment' && !result.independent)
		invalidField(`${field}.independent`)
	if (result.managerLevel !== undefined && result.source !== 'ManagerLevel')
		invalidField(`${field}.managerLevel`)
	if (result.functionCode !== undefined && result.source !== 'Function')
		invalidField(`${field}.functionCode`)
	if (result.accountId !== undefined && result.source !== 'NamedUser')
		invalidField(`${field}.accountId`)
	if (
		result.minimumUnits !== undefined &&
		result.maximumUnits !== undefined &&
		leaveUnitsScaled(result.minimumUnits) >= leaveUnitsScaled(result.maximumUnits)
	)
		invalidField(`${field}.maximumUnits`)
	return result
}
/** Parse accrual configuration without granting an implied monthly or annual credit. */
function accrual(value: unknown): LeaveAccrualRule {
	const field = 'accrual'
	const body = object(
		value,
		field,
		['enabled'],
		[
			'unitsPerYear',
			'unitsPerMonth',
			'unitsPerOccurrence',
			'frequency',
			'timing',
			'proration',
			'waitingPeriodDays',
			'maximumAccruedBalanceUnits',
		],
	)
	return {
		enabled: boolValue(body['enabled'], `${field}.enabled`),
		...option(body, 'unitsPerYear', field, positiveUnits),
		...option(body, 'unitsPerMonth', field, positiveUnits),
		...option(body, 'unitsPerOccurrence', field, positiveUnits),
		...option(body, 'maximumAccruedBalanceUnits', field, positiveUnits),
		...option(body, 'waitingPeriodDays', field, days),
		...option(
			body,
			'frequency',
			field,
			/** Use the approved logical accrual frequencies. */ (v, f) =>
				enumValue(v, f, [
					'OnJoin',
					'Monthly',
					'Quarterly',
					'Annual',
					'ServiceAnniversary',
				] as const),
		),
		...option(
			body,
			'timing',
			field,
			/** Never default the credit's business-date timing. */ (v, f) =>
				enumValue(v, f, ['Advance', 'Arrears'] as const),
		),
		...option(
			body,
			'proration',
			field,
			/** Keep the tenant's explicit proration basis. */ (v, f) =>
				enumValue(v, f, ['None', 'CalendarDays', 'WorkingDays'] as const),
		),
	}
}
/** Parse carry-forward expiry settings without inventing an expiry basis. */
function carryForward(value: unknown): LeaveCarryForwardRule {
	const body = object(value, 'carryForward', ['enabled'], ['capUnits', 'expiryDays', 'expiryBasis'])
	return {
		enabled: boolValue(body['enabled'], 'carryForward.enabled'),
		...option(body, 'capUnits', 'carryForward', positiveUnits),
		...option(body, 'expiryDays', 'carryForward', positiveInteger),
		...option(
			body,
			'expiryBasis',
			'carryForward',
			/** Preserve the configured expiry anchor. */ (v, f) =>
				enumValue(v, f, ['PeriodStart', 'PeriodEnd', 'GrantDate'] as const),
		),
	}
}
/** Parse explicitly configured comp-off conversion while leaving incomplete drafts editable. */
function compOff(value: unknown): LeaveCompOffRule {
	const body = object(
		value,
		'compOff',
		['enabled'],
		['halfUnitMinutes', 'unitMinutes', 'maxUnitsPerDate', 'claimWindowDays', 'expiryDays'],
	)
	const result = {
		enabled: boolValue(body['enabled'], 'compOff.enabled'),
		...option(body, 'halfUnitMinutes', 'compOff', positiveInteger),
		...option(body, 'unitMinutes', 'compOff', positiveInteger),
		...option(body, 'maxUnitsPerDate', 'compOff', positiveUnits),
		...option(body, 'claimWindowDays', 'compOff', positiveInteger),
		...option(body, 'expiryDays', 'compOff', positiveInteger),
	}
	if (
		result.halfUnitMinutes !== undefined &&
		result.unitMinutes !== undefined &&
		result.halfUnitMinutes >= result.unitMinutes
	)
		invalidField('compOff.unitMinutes')
	return result
}
/** Parse units-only encashment intent; this shape cannot admit a payment consumer. */
function encashment(value: unknown): LeaveEncashmentRule {
	const body = object(
		value,
		'encashment',
		['configured', 'annualOnly'],
		['maxUnits', 'minimumRetainedUnits'],
	)
	if (body['annualOnly'] !== true) invalidField('encashment.annualOnly')
	return {
		configured: boolValue(body['configured'], 'encashment.configured'),
		annualOnly: true,
		...option(body, 'maxUnits', 'encashment', positiveUnits),
		...option(body, 'minimumRetainedUnits', 'encashment', nonnegativeUnits),
	}
}

/** Validate the complete draft shape shared by native Signal Forms and authoritative API commands. */
export function readLeavePolicyDraft(value: unknown): LeavePolicyDraft {
	const body = readBody(
		value,
		[
			'code',
			'name',
			'leaveTypeId',
			'effectiveFrom',
			'trackingMode',
			'unit',
			'eligibility',
			'eligibilityRules',
			'datedAssignments',
			'rounding',
			'accrual',
			'carryForward',
			'noticeMode',
			'approvalRules',
			'compOff',
			'encashment',
			'bridgeRule',
			'blackoutDates',
			'allowOverlap',
			'negativeBalanceAllowed',
			'postingPoint',
		],
		[
			'description',
			'effectiveTo',
			'standardDayMinutes',
			'hourlyIncrementMinutes',
			'allowHalfDay',
			'allowHourly',
			'maximumBackdatedDays',
			'maximumAdvanceDays',
			'minimumRequestUnits',
			'maximumRequestUnits',
			'noticeDays',
			'evidenceAfterConsecutiveDays',
		],
	)
	const eligibility = object(
		body['eligibility'],
		'eligibility',
		['workerTypes', 'legalEntityIds'],
		['minimumServiceDays'],
	)
	const rounding = object(body['rounding'], 'rounding', ['scale', 'mode'])
	if (body['allowOverlap'] !== false) invalidField('allowOverlap')
	if (body['negativeBalanceAllowed'] !== false) invalidField('negativeBalanceAllowed')
	if (body['postingPoint'] !== 'OnApproval') invalidField('postingPoint')
	const result: LeavePolicyDraft = {
		code: codeValue(body['code'], 'code', /^[A-Z][A-Z0-9_-]{0,39}$/),
		name: preservedTextValue(body['name'], 'name', 120),
		...('description' in body
			? { description: preservedTextValue(body['description'], 'description', 2000, false) }
			: {}),
		leaveTypeId: idValue(body['leaveTypeId'], 'leaveTypeId'),
		...range(body, 'policy'),
		trackingMode: enumValue(body['trackingMode'], 'trackingMode', ['Balance', 'Unpaid']),
		unit: enumValue(body['unit'], 'unit', ['Day', 'Hour']),
		eligibility: {
			workerTypes: unique(
				rows(eligibility['workerTypes'], 'eligibility.workerTypes', idValue),
				'eligibility.workerTypes',
				/** IDs are already validated opaque values. */ (v) => v,
			),
			legalEntityIds: unique(
				rows(eligibility['legalEntityIds'], 'eligibility.legalEntityIds', idValue),
				'eligibility.legalEntityIds',
				/** Detect duplicate legal entities. */ (v) => v,
			),
			...option(eligibility, 'minimumServiceDays', 'eligibility', days),
		},
		eligibilityRules: unique(
			rows(body['eligibilityRules'], 'eligibilityRules', eligibilityRule),
			'eligibilityRules',
			/** Rule identities survive draft replacement. */ (v) => v.id,
		),
		datedAssignments: unique(
			rows(body['datedAssignments'], 'datedAssignments', assignment),
			'datedAssignments',
			/** Assignment identities are unique within a policy version. */ (v) => v.id,
		),
		rounding: {
			scale: intValue(rounding['scale'], 'rounding.scale', 0, 6),
			mode: enumValue(rounding['mode'], 'rounding.mode', ['Up', 'Down', 'Nearest']),
		},
		accrual: accrual(body['accrual']),
		carryForward: carryForward(body['carryForward']),
		noticeMode: enumValue(body['noticeMode'], 'noticeMode', ['Warning', 'Block']),
		approvalRules: unique(
			rows(body['approvalRules'], 'approvalRules', approvalRule, 75),
			'approvalRules',
			/** Slot IDs remain unique across subject types. */ (v) => v.id,
		),
		compOff: compOff(body['compOff']),
		encashment: encashment(body['encashment']),
		bridgeRule: enumValue(body['bridgeRule'], 'bridgeRule', ['None', 'CountIntervening']),
		blackoutDates: unique(
			rows(body['blackoutDates'], 'blackoutDates', dateValue, 366),
			'blackoutDates',
			/** A date is configured once. */ (v) => v,
		),
		allowOverlap: false,
		negativeBalanceAllowed: false,
		postingPoint: 'OnApproval',
	}
	for (const key of [
		'standardDayMinutes',
		'hourlyIncrementMinutes',
		'evidenceAfterConsecutiveDays',
	])
		Object.assign(result, option(body, key, '', positiveInteger))
	for (const key of ['noticeDays', 'maximumBackdatedDays', 'maximumAdvanceDays'])
		Object.assign(result, option(body, key, '', days))
	for (const key of ['allowHalfDay', 'allowHourly'])
		Object.assign(result, option(body, key, '', boolValue))
	for (const key of ['minimumRequestUnits', 'maximumRequestUnits'])
		Object.assign(result, option(body, key, '', positiveUnits))
	if (
		result.minimumRequestUnits &&
		result.maximumRequestUnits &&
		leaveUnitsScaled(result.minimumRequestUnits) > leaveUnitsScaled(result.maximumRequestUnits)
	)
		invalidField('maximumRequestUnits')
	if (result.trackingMode === 'Unpaid')
		for (const [field, enabled] of [
			['accrual', result.accrual.enabled],
			['carryForward', result.carryForward.enabled],
			['compOff', result.compOff.enabled],
			['encashment', result.encashment.configured],
		] as const)
			if (enabled) invalidField(field, 'unpaid-funding')
	for (const subject of ['Leave', 'Cancellation', 'Adjustment'])
		for (let stage = 1; stage <= 5; stage++)
			if (
				result.approvalRules.filter(
					/** Bound every possible source graph without truncating conditional slots. */ (rule) =>
						rule.subjectType === subject && rule.stage === stage,
				).length > 5
			)
				invalidField('approvalRules', 'too-many-slots')
	return result
}

/** Report incomplete enabled configuration without silently filling tenant business choices. */
export function leavePolicyPublicationErrors(draft: LeavePolicyDraft): HcmFieldError[] {
	const errors: HcmFieldError[] = []
	for (const field of [
		'allowHalfDay',
		'allowHourly',
		'maximumBackdatedDays',
		'maximumAdvanceDays',
	] as const)
		if (draft[field] === undefined) errors.push({ field, code: 'required' })
	if (draft.allowHourly && draft.hourlyIncrementMinutes === undefined)
		errors.push({ field: 'hourlyIncrementMinutes', code: 'required' })
	const groups = [
		[
			'accrual',
			draft.accrual.enabled,
			draft.accrual,
			['frequency', 'timing', 'proration', 'unitsPerOccurrence', 'waitingPeriodDays'],
		],
		[
			'carryForward',
			draft.carryForward.enabled,
			draft.carryForward,
			['capUnits', 'expiryDays', 'expiryBasis'],
		],
		[
			'compOff',
			draft.compOff.enabled,
			draft.compOff,
			['halfUnitMinutes', 'unitMinutes', 'maxUnitsPerDate', 'claimWindowDays', 'expiryDays'],
		],
		[
			'encashment',
			draft.encashment.configured,
			draft.encashment,
			['maxUnits', 'minimumRetainedUnits'],
		],
	] as const
	for (const [prefix, enabled, rule, fields] of groups)
		if (enabled)
			for (const field of fields)
				if (!(field in rule)) errors.push({ field: `${prefix}.${field}`, code: 'required' })
	draft.approvalRules.forEach(
		/** Bind every required slot to an explicit routing selector before publication. */ (
			rule,
			index,
		) => {
			const prefix = `approvalRules.${index}`
			if (!rule.source) errors.push({ field: `${prefix}.source`, code: 'required' })
			if (rule.source === 'ManagerLevel' && rule.managerLevel === undefined)
				errors.push({ field: `${prefix}.managerLevel`, code: 'required' })
			if (rule.source === 'Function' && rule.functionCode === undefined)
				errors.push({ field: `${prefix}.functionCode`, code: 'required' })
			if (rule.source === 'NamedUser' && rule.accountId === undefined)
				errors.push({ field: `${prefix}.accountId`, code: 'required' })
		},
	)
	return errors
}
