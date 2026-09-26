import {
	boolValue,
	codeValue,
	enumValue,
	idValue,
	intValue,
	invalidField,
	optionalDate,
	optionalText,
	readBody,
	revisionValue,
	textValue,
} from '@empflowyee/hcm-runtime-contract'
import {
	PROFILE_VISIBILITIES,
	type CustomFieldDataType,
	type CustomFieldOwnerScope,
	type ProfileFieldRef,
	type ProfileSection,
	type ProfileVisibility,
	type SelfEditMode,
} from './profile-policy'
import { parseFieldRef } from './profile-configuration'

export const BLOOD_GROUP_VALUES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const
export type BloodGroupValue = (typeof BLOOD_GROUP_VALUES)[number]

/** Contact types a worker maintains directly; other types are HR-owned. */
export const SELF_CONTACT_TYPES = ['PersonalEmail', 'MobilePhone'] as const
export type SelfContactPointType = (typeof SELF_CONTACT_TYPES)[number]

/** Most emergency contacts and family members one person may keep. */
export const MAX_RELATIONSHIPS = 20

export const MY_PROFILE_OPTION_KINDS = ['relationship-types', 'genders'] as const
export type MyProfileOptionKind = (typeof MY_PROFILE_OPTION_KINDS)[number]

/** A custom value as the worker sees it; select values carry option ids. */
export type CustomValue = string | number | boolean | string[] | null

/** A worker's own visibility choice for a field that allows one. */
export interface MyVisibilityPreferenceDto {
	/** The worker's current choice, or null while the policy visibility applies. */
	visibility: ProfileVisibility | null
	/** The audiences the worker may choose: never wider than the policy. */
	options: ProfileVisibility[]
	/** Revision a replacing command quotes; null without a current choice. */
	revision: number | null
}

export interface MyCustomFieldOptionDto {
	id: string
	name: string
}

/** The custom definition and value of an additional-information field. */
export interface MyCustomFieldDto {
	dataType: CustomFieldDataType
	ownerScope: CustomFieldOwnerScope
	options: MyCustomFieldOptionDto[]
	value: CustomValue
	/** Revision of the value in force; null when nothing is recorded. */
	revision: number | null
	/** False for Sensitive and Restricted values until field encryption is available. */
	storable: boolean
}

/**
 * One field whose effective visibility includes the worker. Scalar person facts carry a display
 * value; collection fields (contacts, addresses, family) carry null and are listed separately.
 */
export interface MyProfileFieldDto {
	ref: ProfileFieldRef
	code: string
	name: string
	section: ProfileSection
	value: string | null
	editMode: SelfEditMode
	/** The field's effective visibility for this worker. */
	visibility: ProfileVisibility
	preference: MyVisibilityPreferenceDto | null
	custom: MyCustomFieldDto | null
}

export interface MyContactPointDto {
	id: string
	type: SelfContactPointType
	value: string
	primary: boolean
	verified: boolean
	revision: number
}

export interface MyAddressDto {
	id: string
	type: string
	line1: string
	line2: string
	locality: string
	city: string
	stateOrProvince: string
	postalCode: string
	countryName: string
	primary: boolean
}

export interface MyRelationshipDto {
	id: string
	relationshipType: string
	relationshipName: string
	fullName: string
	birthDate: string | null
	genderCode: string | null
	contactNumber: string
	dependent: boolean
	emergencyContact: boolean
	emergencyPriority: number | null
	revision: number
}

/** One placement of an employment; fields hidden by policy are omitted. */
export interface MyAssignmentDto {
	assignmentId: string
	primary: boolean
	designation?: string | null
	organisationUnit?: string | null
	department?: string | null
	location?: string | null
	manager?: { workerId: string; displayName: string } | null
	workMode?: string | null
	fullTimeEquivalent?: number | null
	standardHoursPerWeek?: number | null
	costCentre?: string | null
}

/** One current employment, read-only; fields hidden by policy are omitted. */
export interface MyEmploymentDto {
	employmentId: string
	primary: boolean
	legalEntity?: string | null
	workerType?: string | null
	employmentType?: string | null
	employmentStatus?: string | null
	hireDate?: string | null
	continuousServiceStartDate?: string | null
	probationStatus?: string | null
	probationEndDate?: string | null
	noticePeriodDays?: number | null
	eligibleForRehire?: boolean | null
	workEmail?: string | null
	assignments: MyAssignmentDto[]
}

/** The worker's own profile; an account without a linked worker reads `linked: false`. */
export interface MyProfileDto {
	linked: boolean
	displayName: string | null
	workerNumber: string | null
	/** Revision personal commands quote. */
	personRevision: number | null
	fields: MyProfileFieldDto[]
	/** Present only while personal email or mobile phone is visible to the worker. */
	contactPoints?: MyContactPointDto[]
	addresses?: MyAddressDto[]
	relationships?: MyRelationshipDto[]
	employments: MyEmploymentDto[]
	/** True once My HR Requests can receive a correction request. */
	correctionsAvailable: boolean
}

export interface MyReferenceItemDto {
	code: string
	name: string
	dependentEligible?: boolean
}

export interface MyReferencePage {
	items: MyReferenceItemDto[]
	nextCursor: null
}

export interface SelfPersonalCommand {
	/** Undefined leaves the value unchanged; '' clears the preferred name. */
	preferredName?: string
	/** Undefined leaves the value unchanged; null clears the blood group. */
	bloodGroup?: BloodGroupValue | null
	expectedRevision: number
}

export interface ContactPointCreateCommand {
	type: SelfContactPointType
	value: string
}

export interface ContactPointUpdateCommand {
	value: string
	primary: boolean
	expectedRevision: number
}

export interface RelationshipCommand {
	relationshipType: string
	fullName: string
	birthDate: string | null
	genderCode: string | null
	contactNumber: string
	dependent: boolean
	emergencyContact: boolean
	emergencyPriority: number | null
}

export interface CustomValueCommand {
	value: unknown
	expectedRevision: number | null
}

export interface VisibilityPreferenceCommand {
	ref: ProfileFieldRef
	visibility: ProfileVisibility | null
	expectedRevision: number | null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^\+?[0-9][0-9 ()-]{4,28}[0-9]$/

/** Validate a contact value for its type; emails and phone numbers have distinct shapes. */
export function contactValue(type: SelfContactPointType, value: unknown): string {
	const text = textValue(value, 'value', type === 'PersonalEmail' ? 254 : 40).trim()
	if (!(type === 'PersonalEmail' ? EMAIL : PHONE).test(text)) invalidField('value', 'format')
	return text
}

/** Parse a change to the preferred name or blood group. */
export function parseSelfPersonal(body: unknown): SelfPersonalCommand {
	const v = readBody(body, ['expectedRevision'], ['preferredName', 'bloodGroup'])
	const command: SelfPersonalCommand = { expectedRevision: revisionValue(v['expectedRevision']) }
	if (v['preferredName'] !== undefined)
		command.preferredName = optionalText(v['preferredName'], 'preferredName', 100).trim()
	if (v['bloodGroup'] !== undefined)
		command.bloodGroup =
			v['bloodGroup'] === null ? null : enumValue(v['bloodGroup'], 'bloodGroup', BLOOD_GROUP_VALUES)
	if (command.preferredName === undefined && command.bloodGroup === undefined)
		invalidField('preferredName', 'required')
	return command
}

/** Parse a new personal email or mobile number. */
export function parseContactPointCreate(body: unknown): ContactPointCreateCommand {
	const v = readBody(body, ['type', 'value'])
	const type = enumValue(v['type'], 'type', SELF_CONTACT_TYPES)
	return { type, value: contactValue(type, v['value']) }
}

/** Parse a contact change; the value is validated against the stored type by the command. */
export function parseContactPointUpdate(body: unknown): ContactPointUpdateCommand {
	const v = readBody(body, ['value', 'primary', 'expectedRevision'])
	return {
		value: textValue(v['value'], 'value', 254),
		primary: boolValue(v['primary'], 'primary'),
		expectedRevision: revisionValue(v['expectedRevision']),
	}
}

/** Parse a deactivation that quotes the expected revision. */
export function parseDeactivation(body: unknown): { expectedRevision: number } {
	const v = readBody(body, ['expectedRevision'])
	return { expectedRevision: revisionValue(v['expectedRevision']) }
}

/** Parse an emergency contact or family member; emergency contacts carry a priority. */
export function parseRelationship(
	body: unknown,
	update: boolean,
): RelationshipCommand & { expectedRevision: number | null } {
	const v = readBody(
		body,
		[
			'relationshipType',
			'fullName',
			'dependent',
			'emergencyContact',
			...(update ? ['expectedRevision'] : []),
		],
		['birthDate', 'gender', 'contactNumber', 'emergencyPriority'],
	)
	const emergencyContact = boolValue(v['emergencyContact'], 'emergencyContact')
	const priority = v['emergencyPriority']
	if (emergencyContact && (priority === undefined || priority === null))
		invalidField('emergencyPriority', 'required')
	const contactNumber = optionalText(v['contactNumber'], 'contactNumber', 40).trim()
	if (contactNumber && !PHONE.test(contactNumber)) invalidField('contactNumber', 'format')
	if (emergencyContact && !contactNumber) invalidField('contactNumber', 'required')
	const birthDate = optionalDate(v['birthDate'], 'birthDate')
	return {
		relationshipType: codeValue(v['relationshipType'], 'relationshipType'),
		fullName: textValue(v['fullName'], 'fullName', 150).trim(),
		birthDate,
		genderCode:
			v['gender'] === undefined || v['gender'] === null ? null : idValue(v['gender'], 'gender'),
		contactNumber,
		dependent: boolValue(v['dependent'], 'dependent'),
		emergencyContact,
		emergencyPriority: emergencyContact ? intValue(priority, 'emergencyPriority', 1, 99) : null,
		expectedRevision: update ? revisionValue(v['expectedRevision']) : null,
	}
}

/** Parse a custom value command; the value is checked against the definition by the command. */
export function parseCustomValue(body: unknown): CustomValueCommand {
	const v = readBody(body, ['value'], ['expectedRevision'])
	return {
		value: v['value'],
		expectedRevision:
			v['expectedRevision'] === undefined || v['expectedRevision'] === null
				? null
				: revisionValue(v['expectedRevision']),
	}
}

/** Validate a custom value for its data type and active options; null clears the value. */
export function customValue(
	dataType: CustomFieldDataType,
	value: unknown,
	optionIds: readonly string[],
): CustomValue {
	if (value === null || value === '') return null
	switch (dataType) {
		case 'Text':
			return textValue(value, 'value', 200).trim()
		case 'LongText':
			return textValue(value, 'value', 4000).trim()
		case 'Integer':
			return intValue(value, 'value', -9_007_199_254_740_991, 9_007_199_254_740_991)
		case 'Decimal':
			if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) >= 1e14)
				invalidField('value')
			return value
		case 'Date':
			return optionalDate(value, 'value')
		case 'Boolean':
			return boolValue(value, 'value')
		case 'SingleSelect':
			if (typeof value !== 'string' || !optionIds.includes(value)) invalidField('value', 'unknown')
			return value
		default:
			if (
				!Array.isArray(value) ||
				!value.length ||
				new Set(value).size !== value.length ||
				value.some(/** Unknown option. */ (id) => typeof id !== 'string' || !optionIds.includes(id))
			)
				invalidField('value', 'unknown')
			return value as string[]
	}
}

/** Parse a visibility preference; null returns the field to the policy visibility. */
export function parseVisibilityPreference(ref: string, body: unknown): VisibilityPreferenceCommand {
	const v = readBody(body, ['visibility'], ['expectedRevision'])
	return {
		ref: parseFieldRef(ref),
		visibility:
			v['visibility'] === null
				? null
				: enumValue(v['visibility'], 'visibility', PROFILE_VISIBILITIES),
		expectedRevision:
			v['expectedRevision'] === undefined || v['expectedRevision'] === null
				? null
				: revisionValue(v['expectedRevision']),
	}
}

/** Parse a reference option query. */
export function parseMyProfileOptions(
	kind: string,
	params: URLSearchParams,
): {
	kind: MyProfileOptionKind
	q: string
} {
	for (const key of params.keys()) if (key !== 'q') invalidField(key, 'not-allowed')
	return {
		kind: enumValue(kind, 'kind', MY_PROFILE_OPTION_KINDS),
		q: optionalText(params.get('q'), 'q', 100).trim(),
	}
}
