import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	CustomFieldDataType,
	CustomFieldOwnerScope,
	ProfileFieldDetailDto,
	ProfileFieldList,
	ProfileFieldPolicyDto,
	ProfileFieldRef,
	ProfileSection,
	ProfileSensitivity,
} from '@empflowyee/hcm-employee-contract'

export type TenantPolicyBody = ProfileFieldPolicyDto & { expectedRevision: number; reason: string }
export interface CustomFieldCreateBody {
	code: string
	name: string
	description: string
	ownerScope: CustomFieldOwnerScope
	dataType: CustomFieldDataType
	sensitivity: ProfileSensitivity
	section: ProfileSection
	searchable: boolean
	options?: { code: string; name: string; sortOrder: number }[]
	reason: string
}
export interface CustomFieldUpdateBody {
	name: string
	description: string
	section: ProfileSection
	sortOrder: number
	active: boolean
	expectedRevision: number
	reason: string
}
export interface OptionCreateBody {
	code: string
	name: string
	sortOrder: number
	expectedRevision: number
	reason: string
}
export interface OptionUpdateBody {
	name: string
	sortOrder: number
	active: boolean
	expectedRevision: number
	reason: string
}

const limit = 15000
const CONTEXT = 'WorkforceActivation'

/** Employee Profile Configuration API; the server remains the authority for every rule. */
@Injectable({ providedIn: 'root' })
export class ProfileConfigurationApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/employee'

	/** Attach the caller-retained idempotency key to one command. */
	private headers(key: string) {
		return { headers: { 'Idempotency-Key': key } }
	}

	/** The field path of a reference; the reference contains a colon and is encoded. */
	private field(ref: ProfileFieldRef): string {
		return `${this.base}/profile-fields/${encodeURIComponent(ref)}`
	}

	/** Read the bounded standard and custom field catalogue. */
	list() {
		return this.http.get<ProfileFieldList>(`${this.base}/profile-fields`).pipe(timeout(limit))
	}

	/** Read one field with its tenant policy, options and preview. */
	detail(ref: ProfileFieldRef) {
		return this.http.get<ProfileFieldDetailDto>(this.field(ref)).pipe(timeout(limit))
	}

	/** Narrow the tenant policy of a field. */
	setPolicy(ref: ProfileFieldRef, body: TenantPolicyBody, key: string) {
		return this.http
			.put<ProfileFieldDetailDto>(
				`${this.field(ref)}/tenant-policy/${CONTEXT}`,
				body,
				this.headers(key),
			)
			.pipe(timeout(limit))
	}

	/** Return a field to the product default. */
	resetPolicy(
		ref: ProfileFieldRef,
		body: { expectedRevision: number; reason: string },
		key: string,
	) {
		return this.http
			.post<ProfileFieldDetailDto>(
				`${this.field(ref)}/tenant-policy/${CONTEXT}/reset`,
				body,
				this.headers(key),
			)
			.pipe(timeout(limit))
	}

	/** Define a custom field. */
	createCustomField(body: CustomFieldCreateBody, key: string) {
		return this.http
			.post<ProfileFieldDetailDto>(`${this.base}/custom-fields`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Edit, retire or reactivate a custom field. */
	updateCustomField(id: string, body: CustomFieldUpdateBody, key: string) {
		return this.http
			.put<ProfileFieldDetailDto>(
				`${this.base}/custom-fields/${encodeURIComponent(id)}`,
				body,
				this.headers(key),
			)
			.pipe(timeout(limit))
	}

	/** Add an option to a select field. */
	addOption(id: string, body: OptionCreateBody, key: string) {
		return this.http
			.post<ProfileFieldDetailDto>(
				`${this.base}/custom-fields/${encodeURIComponent(id)}/options`,
				body,
				this.headers(key),
			)
			.pipe(timeout(limit))
	}

	/** Edit, retire or reactivate an option. */
	updateOption(id: string, optionId: string, body: OptionUpdateBody, key: string) {
		return this.http
			.put<ProfileFieldDetailDto>(
				`${this.base}/custom-fields/${encodeURIComponent(id)}/options/${encodeURIComponent(optionId)}`,
				body,
				this.headers(key),
			)
			.pipe(timeout(limit))
	}
}

/** Report whether a failure is an authorization denial rather than a transient fault. */
export function employeeDenied(error: unknown): boolean {
	return error instanceof HttpErrorResponse && [401, 403].includes(error.status)
}

/** Report whether the object is missing or outside the caller's tenant. */
export function employeeMissing(error: unknown): boolean {
	return error instanceof HttpErrorResponse && error.status === 404
}

const fieldLabels: Record<string, string> = {
	visibility: 'Visibility',
	selfEditMode: 'Employee edit',
	allowWorkerPreference: 'Worker preference',
	requiredness: 'Requiredness',
	code: 'Code',
	name: 'Name',
	options: 'Options',
	searchable: 'Searchable',
	preferredName: 'Preferred name',
	bloodGroup: 'Blood group',
	value: 'Value',
	type: 'Type',
	primary: 'Primary',
	relationshipType: 'Relationship',
	fullName: 'Full name',
	birthDate: 'Birth date',
	gender: 'Gender',
	contactNumber: 'Contact number',
	dependent: 'Dependant',
	emergencyContact: 'Emergency contact',
	emergencyPriority: 'Emergency priority',
}

/** Field-specific explanations of a rejected value. */
const fieldCodeMessages: Record<string, (label: string) => string> = {
	duplicate: /** Uniqueness. */ (label) => `${label} is already used. Choose another value.`,
	'not-eligible': /** Eligibility. */ (label) =>
		`${label} is not allowed for this relationship type.`,
	format: /** Shape. */ (label) => `${label} has an invalid format.`,
	'too-many': /** Bound. */ () => 'The maximum number of entries is reached.',
	'encryption-unavailable': /** Protected values. */ () => 'Protected values cannot be stored yet.',
}

/** Translate stable server classifications; never display arbitrary provider error bodies. */
export function employeeErrorMessage(error: unknown): string {
	const body = error instanceof HttpErrorResponse ? error.error : undefined
	const code = body?.code
	const field =
		Array.isArray(body?.fieldErrors) && typeof body.fieldErrors[0]?.field === 'string'
			? (body.fieldErrors[0].field as string)
			: ''
	const label = fieldLabels[field.split('.')[0] ?? ''] ?? field
	const fieldCode =
		Array.isArray(body?.fieldErrors) && typeof body.fieldErrors[0]?.code === 'string'
			? (body.fieldErrors[0].code as string)
			: ''
	const specific = fieldCodeMessages[fieldCode]
	if (specific && label) return specific(label)
	const messages: Record<string, string> = {
		'invalid-request': label ? `Check ${label}.` : 'Check the highlighted fields.',
		'visibility-ceiling-exceeded': `${label || 'This policy'} would widen the product baseline. Choose a narrower value.`,
		'duplicate-code': 'This code already exists. Choose another code.',
		'revision-conflict': 'This field changed. Your draft is preserved; reload before continuing.',
		'invalid-state': 'This field no longer allows that change. Reload its current state.',
		'idempotency-conflict': 'This retry belongs to another change. Reload before continuing.',
		forbidden: 'You no longer have permission for this operation.',
		unauthenticated: 'Your session is no longer available.',
		'not-found': 'This field is no longer available.',
		'field-not-editable': `${label || 'This field'} cannot be changed here. Reload your profile.`,
	}
	return typeof code === 'string' && messages[code]
		? messages[code]
		: 'The operation could not be completed. Retry safely with the same draft.'
}
