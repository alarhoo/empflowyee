/**
 * Employee profile field policy vocabulary (TDD-HCM-2-COMMON#auth, PROFILE-FIELD-POLICY).
 * Visibility audiences are cumulative and ordered narrowest first: a field visible at Manager is
 * also visible to Hr and Self, and Organization reaches every directory viewer.
 */
export const PROFILE_VISIBILITIES = ['Self', 'Hr', 'Manager', 'Organization'] as const
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number]

/** The relation of a viewer to the worker whose profile is read. */
export const VIEWER_RELATIONS = ['Self', 'Hr', 'Manager', 'Organization'] as const
export type ViewerRelation = (typeof VIEWER_RELATIONS)[number]

export const PROFILE_SENSITIVITIES = [
	'DirectorySafe',
	'Personal',
	'Sensitive',
	'Restricted',
] as const
export type ProfileSensitivity = (typeof PROFILE_SENSITIVITIES)[number]

/** Edit modes ordered narrowest first. */
export const SELF_EDIT_MODES = ['NotEditable', 'ServiceRequest', 'Direct'] as const
export type SelfEditMode = (typeof SELF_EDIT_MODES)[number]

export const REQUIREDNESS = ['Optional', 'Recommended', 'Required', 'Hidden'] as const
export type Requiredness = (typeof REQUIREDNESS)[number]

/** HCM-2 defines one product context; later domains add their own. */
export const REQUIREDNESS_CONTEXTS = ['WorkforceActivation'] as const
export type RequirednessContext = (typeof REQUIREDNESS_CONTEXTS)[number]

export const PROFILE_SECTIONS = [
	'Identity',
	'Personal',
	'Contact',
	'Employment',
	'Assignment',
	'Other',
] as const
export type ProfileSection = (typeof PROFILE_SECTIONS)[number]

export const CUSTOM_FIELD_OWNER_SCOPES = ['Person', 'Worker', 'Employment', 'Assignment'] as const
export type CustomFieldOwnerScope = (typeof CUSTOM_FIELD_OWNER_SCOPES)[number]

export const CUSTOM_FIELD_DATA_TYPES = [
	'Text',
	'LongText',
	'Integer',
	'Decimal',
	'Date',
	'Boolean',
	'SingleSelect',
	'MultiSelect',
] as const
export type CustomFieldDataType = (typeof CUSTOM_FIELD_DATA_TYPES)[number]

/** Standard field codes inserted by migration 000022 from the product field policy. */
export const STANDARD_PROFILE_FIELDS = [
	'display-name',
	'legal-given-name',
	'legal-middle-name',
	'legal-family-name',
	'preferred-name',
	'former-name',
	'worker-number',
	'birth-date',
	'gender',
	'marital-status',
	'nationality',
	'blood-group',
	'work-email',
	'personal-email',
	'mobile-phone',
	'home-address',
	'emergency-contacts',
	'family-members',
	'legal-entity',
	'worker-type',
	'employment-type',
	'employment-status',
	'hire-date',
	'continuous-service-start-date',
	'probation',
	'notice-period',
	'rehire-eligibility',
	'organisation-unit',
	'department',
	'designation',
	'location',
	'manager',
	'work-mode',
	'full-time-equivalent',
	'standard-hours',
	'cost-centre',
] as const
export type StandardProfileField = (typeof STANDARD_PROFILE_FIELDS)[number]

/** `standard:<code>` or `custom:<id>`. */
export type ProfileFieldRef = `standard:${string}` | `custom:${string}`

/** Product default or tenant policy of one field in one context. */
export interface ProfileFieldPolicyDto {
	requiredness: Requiredness
	visibility: ProfileVisibility
	selfEditMode: SelfEditMode
	allowWorkerPreference: boolean
}

/** One tenant policy row with its concurrency revision. */
export interface TenantProfileFieldPolicyDto extends ProfileFieldPolicyDto {
	id: string
	effectiveFromAt: string
	revision: number
}

/** A standard or custom field with its ceiling, product default and current tenant narrowing. */
export interface ProfileFieldDto {
	ref: ProfileFieldRef
	code: string
	name: string
	section: ProfileSection
	sensitivity: ProfileSensitivity
	ceiling: ProfileVisibility
	searchable: boolean
	active: boolean
	sortOrder: number
	productDefault: ProfileFieldPolicyDto | null
	tenantPolicy: TenantProfileFieldPolicyDto | null
	custom: boolean
}

export interface CustomFieldOptionDto {
	id: string
	code: string
	name: string
	active: boolean
	sortOrder: number
	revision: number
}

export interface CustomFieldDefinitionDto {
	id: string
	code: string
	name: string
	description: string
	ownerScope: CustomFieldOwnerScope
	dataType: CustomFieldDataType
	sensitivity: ProfileSensitivity
	section: ProfileSection
	searchable: boolean
	active: boolean
	sortOrder: number
	options: CustomFieldOptionDto[]
	revision: number
}
