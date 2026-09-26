import type {
	CustomFieldDataType,
	CustomFieldOwnerScope,
	ProfileFieldDto,
	ProfileSensitivity,
	ProfileVisibility,
	Requiredness,
	SelfEditMode,
} from '@empflowyee/hcm-employee-contract'

export const MANAGE_PERMISSION = 'hcm.employee.profile-configuration.manage'

export const VISIBILITY_LABELS: Record<ProfileVisibility, string> = {
	Self: 'Employee only',
	Hr: 'Employee and HR',
	Manager: 'Employee, HR and manager',
	Organization: 'Whole organisation',
}
export const EDIT_MODE_LABELS: Record<SelfEditMode, string> = {
	NotEditable: 'Not editable',
	ServiceRequest: 'Through a correction request',
	Direct: 'Directly',
}
export const REQUIREDNESS_LABELS: Record<Requiredness, string> = {
	Optional: 'Optional',
	Recommended: 'Recommended',
	Required: 'Required',
	Hidden: 'Not collected',
}
export const SENSITIVITY_LABELS: Record<ProfileSensitivity, string> = {
	DirectorySafe: 'Directory safe',
	Personal: 'Personal',
	Sensitive: 'Sensitive',
	Restricted: 'Restricted',
}
export const OWNER_SCOPE_LABELS: Record<CustomFieldOwnerScope, string> = {
	Person: 'Person',
	Worker: 'Worker',
	Employment: 'Employment',
	Assignment: 'Assignment',
}
export const DATA_TYPE_LABELS: Record<CustomFieldDataType, string> = {
	Text: 'Text',
	LongText: 'Long text',
	Integer: 'Whole number',
	Decimal: 'Decimal number',
	Date: 'Date',
	Boolean: 'Yes or no',
	SingleSelect: 'Single choice',
	MultiSelect: 'Multiple choice',
}
export const RELATION_LABELS = {
	Self: 'The employee',
	Hr: 'HR',
	Manager: 'Manager',
	Organization: 'Everyone in the organisation',
} as const

/** Semantic status of a sensitivity, never relying on colour alone. */
export function sensitivityStatus(
	sensitivity: ProfileSensitivity,
): 'positive' | 'informative' | 'critical' | 'negative' {
	if (sensitivity === 'DirectorySafe') return 'positive'
	if (sensitivity === 'Personal') return 'informative'
	if (sensitivity === 'Sensitive') return 'critical'
	return 'negative'
}

/** The policy currently in force: the tenant narrowing, else the product default. */
export function currentPolicy(field: ProfileFieldDto) {
	return field.tenantPolicy ?? field.productDefault
}
