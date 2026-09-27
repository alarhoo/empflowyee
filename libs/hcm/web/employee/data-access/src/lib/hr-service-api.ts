import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	HrConfigKind,
	HrOptionPage,
	HrServiceConfigDto,
	HrServiceConfigPage,
	HrServiceMessagePage,
	HrServiceRequestDto,
	HrServiceRequestPage,
} from '@empflowyee/hcm-employee-contract'

const limit = 15000

/** HR service option kinds for pickers. */
export type HrOptionKind = 'workers' | 'teams' | 'agents' | 'types'

/** Query parameters from defined values. */
function params(values: object, size = '25'): HttpParams {
	let result = new HttpParams().set('limit', size)
	for (const [name, value] of Object.entries(values))
		if (value) result = result.set(name, String(value))
	return result
}

/** A multipart body: JSON metadata first, then the optional file. */
function multipart(metadata: object, file: File | null): FormData {
	const form = new FormData()
	form.append('metadata', JSON.stringify(metadata))
	if (file) form.append('file', file, file.name)
	return form
}

/** HR Service Desk API for agents; the server remains the authority for every rule. */
@Injectable({ providedIn: 'root' })
export class HrServiceDeskApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/employee/hr-service'

	/** An encoded request path. */
	private request(id: string): string {
		return `${this.base}/requests/${encodeURIComponent(id)}`
	}

	/** Idempotency headers of a command. */
	private headers(key: string) {
		return { headers: { 'Idempotency-Key': key } }
	}

	/** One page of the queue for a view and filters. */
	queue(query: {
		view?: string
		q?: string
		status?: string
		priority?: string
		slaState?: string
		cursor?: string
	}) {
		return this.http
			.get<HrServiceRequestPage>(`${this.base}/requests`, { params: params(query) })
			.pipe(timeout(limit))
	}

	/** One request. */
	read(id: string) {
		return this.http.get<HrServiceRequestDto>(this.request(id)).pipe(timeout(limit))
	}

	/** One page of the conversation, oldest first. */
	messages(id: string, cursor?: string) {
		return this.http
			.get<HrServiceMessagePage>(`${this.request(id)}/messages`, {
				params: params({ cursor }, '50'),
			})
			.pipe(timeout(limit))
	}

	/** Server-filtered options for pickers. */
	options(kind: HrOptionKind, q: string, cursor?: string) {
		return this.http
			.get<HrOptionPage>(`${this.base}/options/${kind}`, { params: params({ q, cursor }, '50') })
			.pipe(timeout(limit))
	}

	/** Raise a request on behalf of a worker. */
	create(body: Record<string, unknown>, key: string) {
		return this.http
			.post<HrServiceRequestDto>(`${this.base}/requests`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Reply or add an internal note with an optional attachment. */
	message(id: string, metadata: Record<string, unknown>, file: File | null, key: string) {
		return this.http
			.post<HrServiceRequestDto>(
				`${this.request(id)}/messages`,
				multipart(metadata, file),
				this.headers(key),
			)
			.pipe(timeout(60000))
	}

	/** Assign to a team and optionally an agent, or change the status. */
	command(
		id: string,
		operation: 'assignment' | 'status',
		body: Record<string, unknown>,
		key: string,
	) {
		return this.http
			.post<HrServiceRequestDto>(`${this.request(id)}/${operation}`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Download an attachment through authenticated HTTP. */
	attachment(id: string, attachmentId: string) {
		return this.http
			.get(`${this.request(id)}/attachments/${encodeURIComponent(attachmentId)}`, {
				responseType: 'blob',
			})
			.pipe(timeout(60000))
	}

	/** One page of a configuration kind. */
	configuration(kind: HrConfigKind, cursor?: string) {
		return this.http
			.get<HrServiceConfigPage>(`${this.base}/configuration/${kind}`, {
				params: params({ cursor }, '50'),
			})
			.pipe(timeout(limit))
	}

	/** Create or update a configuration item. */
	configure(kind: HrConfigKind, id: string | null, body: Record<string, unknown>, key: string) {
		const url = `${this.base}/configuration/${kind}${id ? '/' + encodeURIComponent(id) : ''}`
		const call = id
			? this.http.put<HrServiceConfigDto>(url, body, this.headers(key))
			: this.http.post<HrServiceConfigDto>(url, body, this.headers(key))
		return call.pipe(timeout(limit))
	}
}

/** Labels of HR service command fields, for field errors. */
const HR_FIELD_LABELS: Record<string, string> = {
	subjectWorkerId: 'Employee',
	typeId: 'Request type',
	priority: 'Priority',
	subject: 'Subject',
	description: 'Description',
	body: 'Message',
	visibility: 'Visibility',
	file: 'Attachment',
	teamId: 'Team',
	assigneeAccountId: 'Agent',
	status: 'Status',
	resolutionCode: 'Resolution',
	resolutionSummary: 'Resolution summary',
	reason: 'Reason',
	code: 'Code',
	name: 'Name',
	accountId: 'Person',
	memberRole: 'Role',
	defaultTeamId: 'Default team',
	serviceLevelCode: 'Service level',
	targets: 'Targets',
	reopenWindowDays: 'Reopen window',
}

/** Messages of field-level codes, with a `{label}` placeholder. */
const HR_FIELD_MESSAGES: Record<string, string> = {
	'not-agent': 'Choose a person who can handle HR requests.',
	'not-published': 'Publish this service level before using it.',
	'draft-exists': 'This service level already has a draft version; edit that draft.',
	'no-service-level': 'This request type has no published service level.',
	'before-first-response':
		'The resolution target cannot be shorter than the first response target.',
	'format-mismatch': 'Attach a PDF, PNG or JPEG file.',
	'unsupported-file': 'Attach a PDF, PNG or JPEG file.',
	unknown: 'Choose a valid {label}.',
	required: '{label} is required.',
	'not-allowed': '{label} applies to Resolved only.',
}

/** A safe, specific message for an HR service failure. */
export function hrServiceErrorMessage(error: unknown): string {
	const body = error instanceof HttpErrorResponse ? error.error : undefined
	const code = body?.code
	const first = Array.isArray(body?.fieldErrors) ? body.fieldErrors[0] : undefined
	const field = typeof first?.field === 'string' ? (first.field as string) : ''
	const label = HR_FIELD_LABELS[field.split('.')[0] ?? ''] ?? field
	const specific = typeof first?.code === 'string' ? HR_FIELD_MESSAGES[first.code] : undefined
	if (specific) return specific.replace('{label}', label.toLowerCase() || 'value')
	const messages: Record<string, string> = {
		'invalid-request': label ? `Check ${label}.` : 'Check the highlighted fields.',
		'revision-conflict': 'This item changed. Your draft is preserved; reload before continuing.',
		'invalid-state': 'This request no longer allows that action. Reload its current state.',
		'version-published': 'A published service level cannot change; create a new version.',
		'duplicate-code': 'This code is already used.',
		'idempotency-conflict': 'This retry belongs to another command. Reload before continuing.',
		'file-too-large': 'The attachment is larger than 10 MiB.',
		'unsupported-file': 'Attach a PDF, PNG or JPEG file.',
		forbidden: 'You do not have permission for this operation.',
		unauthenticated: 'Your session is no longer available.',
		'not-found': 'This request is no longer available.',
	}
	return typeof code === 'string' && messages[code]
		? messages[code]
		: 'The operation could not be completed. Retry safely with the same draft.'
}
