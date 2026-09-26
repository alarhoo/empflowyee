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
	}
	return typeof code === 'string' && messages[code]
		? messages[code]
		: 'The operation could not be completed. Retry safely with the same draft.'
}
