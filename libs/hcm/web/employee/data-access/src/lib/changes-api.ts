import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	ChangeOptionKind,
	ChangeOptionPage,
	EmploymentChangePage,
	EmploymentChangeRequestDto,
	WorkerChangeContextDto,
} from '@empflowyee/hcm-employee-contract'

export interface ChangeListQuery {
	view?: 'all' | 'mine' | 'awaiting-my-decision'
	q?: string
	changeType?: string
	status?: string
	from?: string
	to?: string
	sort?: 'effectiveDate:desc' | 'createdAt:desc'
	cursor?: string
}

const limit = 15000

/** Employment Changes API; the server remains the authority for every rule. */
@Injectable({ providedIn: 'root' })
export class EmploymentChangesApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/employee/changes'

	/** Attach the caller-retained idempotency key to one command. */
	private headers(key: string) {
		return { headers: { 'Idempotency-Key': key } }
	}

	/** An encoded request path. */
	private request(id: string): string {
		return `${this.base}/${encodeURIComponent(id)}`
	}

	/** Query parameters from defined values. */
	private params(values: object, size = '25'): HttpParams {
		let params = new HttpParams().set('limit', size)
		for (const [name, value] of Object.entries(values))
			if (value) params = params.set(name, String(value))
		return params
	}

	/** One page of requests. */
	list(query: ChangeListQuery) {
		return this.http
			.get<EmploymentChangePage>(this.base, { params: this.params(query) })
			.pipe(timeout(limit))
	}

	/** One request. */
	read(id: string) {
		return this.http.get<EmploymentChangeRequestDto>(this.request(id)).pipe(timeout(limit))
	}

	/** A worker's current facts for a new request. */
	context(workerId: string) {
		return this.http
			.get<WorkerChangeContextDto>(`${this.base}/context/${encodeURIComponent(workerId)}`)
			.pipe(timeout(limit))
	}

	/** Options for the request wizard, filtered on the server and effective on a date. */
	options(kind: ChangeOptionKind, q: string, asOf?: string, cursor?: string) {
		return this.http
			.get<ChangeOptionPage>(`${this.base}/options/${kind}`, {
				params: this.params({ q, asOf, cursor }, '50'),
			})
			.pipe(timeout(limit))
	}

	/** Create a draft request. */
	create(body: Record<string, unknown>, key: string) {
		return this.http
			.post<EmploymentChangeRequestDto>(this.base, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Replace a draft's facts. */
	update(id: string, body: Record<string, unknown>, key: string) {
		return this.http
			.put<EmploymentChangeRequestDto>(this.request(id), body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Submit, decide, apply or cancel a request. */
	command(
		id: string,
		operation: 'submit' | 'decide' | 'apply' | 'cancel',
		body: Record<string, unknown>,
		key: string,
	) {
		return this.http
			.post<EmploymentChangeRequestDto>(`${this.request(id)}/${operation}`, body, this.headers(key))
			.pipe(timeout(limit))
	}
}

/** Labels of change target fields, for field errors and comparisons. */
export const CHANGE_FIELD_LABELS: Record<string, string> = {
	workerId: 'Worker',
	employmentId: 'Employment',
	assignmentId: 'Assignment',
	changeType: 'Change type',
	effectiveDate: 'Effective date',
	reasonCode: 'Reason',
	reasonDetail: 'Reason details',
	evidenceReference: 'Evidence reference',
	legalEntityId: 'Legal entity',
	workerTypeId: 'Worker type',
	employmentType: 'Employment type',
	employmentStatus: 'Employment status',
	continuousServiceStartDate: 'Continuous service start',
	probationEndDate: 'Probation end',
	noticePeriodDays: 'Notice period in days',
	unitId: 'Unit',
	departmentId: 'Department',
	designationId: 'Designation',
	locationId: 'Location',
	positionId: 'Position',
	jobTitle: 'Job title',
	workMode: 'Work mode',
	fullTimeEquivalent: 'FTE',
	standardHoursPerWeek: 'Weekly hours',
	costCenterCode: 'Cost centre',
	managerWorkerId: 'Manager',
	targets: 'Proposed changes',
	reason: 'Reason',
	slotCode: 'Approval slot',
}

const changeFieldMessages: Record<string, (label: string) => string> = {
	required: /** Presence. */ (label) => `${label} is required.`,
	unknown: /** Reference. */ (label) => `${label} is not available for this change.`,
	'not-effective': /** Dates. */ (label) => `${label} is not in effect on the effective date.`,
	'not-open': /** Positions. */ () => 'The position is not open on the effective date.',
	'no-assignment': /** Manager. */ () => 'The manager has no assignment on the effective date.',
	self: /** Manager. */ () => 'A worker cannot be their own manager.',
	engaged: /** Rehire. */ () =>
		'This worker is still employed; a rehire needs every employment to have ended.',
	'status-mismatch': /** Status. */ () => 'The employment status does not allow this change.',
	ended: /** Status. */ () => 'This employment has ended.',
	'not-yet-effective': /** Apply. */ () =>
		'This change can be applied on or after its effective date.',
	'out-of-range': /** Dates. */ () =>
		'The effective date is too far in the past: 30 days at most, 90 for a correction.',
	'before-from': /** Dates. */ () => 'The end of the date range is before its start.',
}

/** Safe failure codes an execution records. */
export const CHANGE_FAILURE_MESSAGES: Record<string, string> = {
	'capacity-exceeded': 'The position has no free headcount or FTE on the effective date.',
	'occupancy-unknown': 'The position occupancy is not complete, so capacity cannot be confirmed.',
	'facts-changed': 'The employment or assignment changed after the request was made.',
	'invalid-target': 'A proposed fact is no longer valid on the effective date.',
	'reference-missing': 'A referenced record is no longer available.',
	'record-incomplete': 'The record is incomplete; only a correction can establish it.',
	'invalid-state': 'The employment no longer allows this change.',
	'execution-refused': 'The change could not be executed.',
}

/** Translate stable server classifications for Employment Changes. */
export function changesErrorMessage(error: unknown): string {
	const body = error instanceof HttpErrorResponse ? error.error : undefined
	const code = body?.code
	const first = Array.isArray(body?.fieldErrors) ? body.fieldErrors[0] : undefined
	const field = typeof first?.field === 'string' ? (first.field as string) : ''
	const label = CHANGE_FIELD_LABELS[field.split('.').at(-1) ?? ''] ?? field
	const specific = typeof first?.code === 'string' ? changeFieldMessages[first.code] : undefined
	if (specific) return specific(label)
	const messages: Record<string, string> = {
		'invalid-request': label ? `Check ${label}.` : 'Check the highlighted fields.',
		'duplicate-code':
			'Another open request already changes this employment on that date. Cancel or finish it first.',
		'effective-date-out-of-range':
			'The effective date is too far in the past: 30 days at most, 90 for a correction.',
		'self-approval-forbidden': 'You cannot decide a request you raised.',
		'capacity-exceeded': CHANGE_FAILURE_MESSAGES['capacity-exceeded'] as string,
		'occupancy-unknown': CHANGE_FAILURE_MESSAGES['occupancy-unknown'] as string,
		'revision-conflict': 'This request changed. Your draft is preserved; reload before continuing.',
		'invalid-state': 'This request no longer allows that action. Reload its current state.',
		'idempotency-conflict': 'This retry belongs to another change. Reload before continuing.',
		forbidden: 'You do not have permission for this operation.',
		unauthenticated: 'Your session is no longer available.',
		'not-found': 'This request is no longer available.',
	}
	return typeof code === 'string' && messages[code]
		? messages[code]
		: 'The operation could not be completed. Retry safely with the same draft.'
}
