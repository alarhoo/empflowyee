import {
	HcmDomainError,
	boolValue,
	codeValue,
	enumValue,
	idValue,
	intValue,
	invalidField,
	optionalText,
	readBody,
	revisionValue,
	textValue,
} from '@empflowyee/hcm-runtime-contract'
import {
	CUSTOM_FIELD_DATA_TYPES,
	CUSTOM_FIELD_OWNER_SCOPES,
	PROFILE_SECTIONS,
	PROFILE_SENSITIVITIES,
	PROFILE_VISIBILITIES,
	REQUIREDNESS,
	REQUIREDNESS_CONTEXTS,
	SELF_EDIT_MODES,
	VIEWER_RELATIONS,
	type CustomFieldDataType,
	type CustomFieldDefinitionDto,
	type CustomFieldOwnerScope,
	type ProfileFieldDto,
	type ProfileFieldPolicyDto,
	type ProfileFieldRef,
	type ProfileSection,
	type ProfileSensitivity,
	type ProfileVisibility,
	type RequirednessContext,
	type SelfEditMode,
	type ViewerRelation,
} from './profile-policy'

/** What one viewer relation receives for a field under the current policy. */
export interface ProfileFieldPreviewDto {
	relation: ViewerRelation
	visible: boolean
	/** Only the worker edits their own profile; other relations never edit here. */
	editMode: SelfEditMode | null
}

/** A field with description, its custom definition, whether values exist, and the preview. */
export interface ProfileFieldDetailDto extends ProfileFieldDto {
	description: string
	customField: CustomFieldDefinitionDto | null
	hasValues: boolean
	/** Revision a tenant policy command must quote; 0 while the product default applies. */
	policyRevision: number
	effectiveVisibility: ProfileVisibility | null
	preview: ProfileFieldPreviewDto[]
}

export interface ProfileFieldList {
	items: ProfileFieldDto[]
}

export interface TenantPolicyCommand {
	ref: ProfileFieldRef
	context: RequirednessContext
	policy: ProfileFieldPolicyDto
	/** 0 when no tenant policy exists yet. */
	expectedRevision: number
	reason: string
}

export interface TenantPolicyReset {
	ref: ProfileFieldRef
	context: RequirednessContext
	expectedRevision: number
	reason: string
}

export interface CustomFieldOptionInput {
	code: string
	name: string
	sortOrder: number
}

export interface CustomFieldCreate {
	code: string
	name: string
	description: string
	ownerScope: CustomFieldOwnerScope
	dataType: CustomFieldDataType
	sensitivity: ProfileSensitivity
	section: ProfileSection
	searchable: boolean
	options: CustomFieldOptionInput[]
	reason: string
}

export interface CustomFieldUpdate {
	name: string
	description: string
	section: ProfileSection
	sortOrder: number
	active: boolean
	expectedRevision: number
	reason: string
}

export interface CustomFieldOptionCreate extends CustomFieldOptionInput {
	expectedRevision: number
	reason: string
}

export interface CustomFieldOptionUpdate {
	name: string
	sortOrder: number
	active: boolean
	expectedRevision: number
	reason: string
}

const OPTION_CODE = /^[A-Z][A-Z0-9_]{0,39}$/
export const SELECT_DATA_TYPES: readonly CustomFieldDataType[] = ['SingleSelect', 'MultiSelect']
export { VIEWER_RELATIONS as PREVIEW_RELATIONS }

/** Parse `standard:<code>` or `custom:<id>`. */
export function parseFieldRef(value: string): ProfileFieldRef {
	const match = /^(standard|custom):(.+)$/.exec(value)
	if (!match) invalidField('fieldRef')
	if (match[1] === 'standard' && !/^[a-z][a-z0-9-]{1,59}$/.test(match[2])) invalidField('fieldRef')
	idValue(match[2], 'fieldRef')
	return value as ProfileFieldRef
}

/** Parse a requiredness context path segment. */
export function parseContext(value: string): RequirednessContext {
	return enumValue(value, 'context', REQUIREDNESS_CONTEXTS)
}

/** Parse an explicit reason for change. */
function reasonValue(value: unknown): string {
	return textValue(value, 'reason', 500)
}

/** Parse a tenant policy that narrows the product default. */
export function parseTenantPolicy(
	ref: string,
	context: string,
	body: unknown,
): TenantPolicyCommand {
	const v = readBody(body, [
		'requiredness',
		'visibility',
		'selfEditMode',
		'allowWorkerPreference',
		'expectedRevision',
		'reason',
	])
	return {
		ref: parseFieldRef(ref),
		context: parseContext(context),
		policy: {
			requiredness: enumValue(v['requiredness'], 'requiredness', REQUIREDNESS),
			visibility: enumValue(v['visibility'], 'visibility', PROFILE_VISIBILITIES),
			selfEditMode: enumValue(v['selfEditMode'], 'selfEditMode', SELF_EDIT_MODES),
			allowWorkerPreference: boolValue(v['allowWorkerPreference'], 'allowWorkerPreference'),
		},
		expectedRevision: intValue(v['expectedRevision'], 'expectedRevision', 0, 2_147_483_647),
		reason: reasonValue(v['reason']),
	}
}

/** Parse a reset to the product default. */
export function parseTenantPolicyReset(
	ref: string,
	context: string,
	body: unknown,
): TenantPolicyReset {
	const v = readBody(body, ['expectedRevision', 'reason'])
	return {
		ref: parseFieldRef(ref),
		context: parseContext(context),
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: reasonValue(v['reason']),
	}
}

/** Parse one option of a select field. */
function optionInput(value: unknown, field: string): CustomFieldOptionInput {
	const v = readBody(value, ['code', 'name'], ['sortOrder'])
	return {
		code: codeValue(v['code'], `${field}.code`, OPTION_CODE),
		name: textValue(v['name'], `${field}.name`, 100),
		sortOrder:
			v['sortOrder'] === undefined ? 0 : intValue(v['sortOrder'], `${field}.sortOrder`, 0, 9999),
	}
}

/** Parse a custom field definition; select types need at least one uniquely coded option. */
export function parseCustomFieldCreate(body: unknown): CustomFieldCreate {
	const v = readBody(
		body,
		['code', 'name', 'ownerScope', 'dataType', 'sensitivity', 'section', 'searchable', 'reason'],
		['description', 'options'],
	)
	const dataType = enumValue(v['dataType'], 'dataType', CUSTOM_FIELD_DATA_TYPES)
	const sensitivity = enumValue(v['sensitivity'], 'sensitivity', PROFILE_SENSITIVITIES)
	const searchable = boolValue(v['searchable'], 'searchable')
	if (searchable && sensitivity !== 'DirectorySafe') invalidField('searchable', 'not-allowed')
	const raw = v['options'] ?? []
	if (!Array.isArray(raw) || raw.length > 200) invalidField('options')
	const options = raw.map(
		/** One option. */ (option, index) => optionInput(option, `options.${index}`),
	)
	const select = SELECT_DATA_TYPES.includes(dataType)
	if (select && !options.length) invalidField('options', 'required')
	if (!select && options.length) invalidField('options', 'not-allowed')
	if (new Set(options.map(/** Code. */ (option) => option.code)).size !== options.length)
		invalidField('options', 'duplicate')
	return {
		code: codeValue(v['code'], 'code'),
		name: textValue(v['name'], 'name', 100),
		description: optionalText(v['description'], 'description', 500),
		ownerScope: enumValue(v['ownerScope'], 'ownerScope', CUSTOM_FIELD_OWNER_SCOPES),
		dataType,
		sensitivity,
		section: enumValue(v['section'], 'section', PROFILE_SECTIONS),
		searchable,
		options,
		reason: reasonValue(v['reason']),
	}
}

/** Parse a custom field edit; code, owner scope, data type and sensitivity never change. */
export function parseCustomFieldUpdate(body: unknown): CustomFieldUpdate {
	const v = readBody(body, [
		'name',
		'description',
		'section',
		'sortOrder',
		'active',
		'expectedRevision',
		'reason',
	])
	return {
		name: textValue(v['name'], 'name', 100),
		description: optionalText(v['description'], 'description', 500),
		section: enumValue(v['section'], 'section', PROFILE_SECTIONS),
		sortOrder: intValue(v['sortOrder'], 'sortOrder', 0, 9999),
		active: boolValue(v['active'], 'active'),
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: reasonValue(v['reason']),
	}
}

/** Parse a new option; the expected revision is the field's. */
export function parseCustomFieldOptionCreate(body: unknown): CustomFieldOptionCreate {
	const v = readBody(body, ['code', 'name', 'sortOrder', 'expectedRevision', 'reason'])
	return {
		...optionInput({ code: v['code'], name: v['name'], sortOrder: v['sortOrder'] }, 'option'),
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: reasonValue(v['reason']),
	}
}

/** Parse an option edit or retirement; the expected revision is the field's. */
export function parseCustomFieldOptionUpdate(body: unknown): CustomFieldOptionUpdate {
	const v = readBody(body, ['name', 'sortOrder', 'active', 'expectedRevision', 'reason'])
	return {
		name: textValue(v['name'], 'name', 100),
		sortOrder: intValue(v['sortOrder'], 'sortOrder', 0, 9999),
		active: boolValue(v['active'], 'active'),
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: reasonValue(v['reason']),
	}
}

/** Refuse commands on a field reference that does not exist or is foreign. */
export function missingField(): never {
	throw new HcmDomainError('not-found')
}
