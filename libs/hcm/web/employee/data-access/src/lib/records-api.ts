import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	DuplicateCandidateDto,
	EmergencyInfoDto,
	RecordCollection,
	RecordOptionKind,
	RecordOptionPage,
	WorkerEventPage,
	WorkerRecordDto,
	WorkerRecordPage,
} from '@empflowyee/hcm-employee-contract'

export interface RecordListQuery {
	q?: string
	sort?: 'name:asc' | 'workerNumber:asc'
	status?: string
	legalEntityId?: string
	unitId?: string
	departmentId?: string
	locationId?: string
	workerTypeId?: string
	recordState?: string
	cursor?: string
}

const limit = 15000

/** Employee Records API; the server remains the authority for every rule. */
@Injectable({ providedIn: 'root' })
export class EmployeeRecordsApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/employee/records'

	/** Attach the caller-retained idempotency key to one command. */
	private headers(key: string) {
		return { headers: { 'Idempotency-Key': key } }
	}

	/** An encoded record path. */
	private record(id: string): string {
		return `${this.base}/${encodeURIComponent(id)}`
	}

	/** Query parameters from defined values. */
	private params(values: object, size = '25'): HttpParams {
		let params = new HttpParams().set('limit', size)
		for (const [name, value] of Object.entries(values))
			if (value) params = params.set(name, String(value))
		return params
	}

	/** One page of worker records. */
	records(query: RecordListQuery) {
		return this.http
			.get<WorkerRecordPage>(this.base, { params: this.params(query) })
			.pipe(timeout(limit))
	}

	/** One worker's record. */
	read(id: string) {
		return this.http.get<WorkerRecordDto>(this.record(id)).pipe(timeout(limit))
	}

	/** A worker's events. */
	events(id: string, cursor?: string) {
		return this.http
			.get<WorkerEventPage>(`${this.record(id)}/events`, { params: this.params({ cursor }) })
			.pipe(timeout(limit))
	}

	/** Options for corrections and creation, filtered on the server. */
	options(kind: RecordOptionKind, q: string, cursor?: string) {
		return this.http
			.get<RecordOptionPage>(`${this.base}/options/${kind}`, {
				params: this.params({ q, cursor }, '50'),
			})
			.pipe(timeout(limit))
	}

	/** Correct legal names and personal facts. */
	correctPerson(id: string, body: Record<string, unknown>, key: string) {
		return this.http
			.put<WorkerRecordDto>(`${this.record(id)}/person`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Add an address, contact point or relationship. */
	addItem(id: string, collection: RecordCollection, body: Record<string, unknown>, key: string) {
		return this.http
			.post<WorkerRecordDto>(`${this.record(id)}/${collection}`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Correct, end or deactivate a collection item. */
	updateItem(
		id: string,
		collection: RecordCollection,
		itemId: string,
		body: Record<string, unknown>,
		key: string,
	) {
		return this.http
			.put<WorkerRecordDto>(
				`${this.record(id)}/${collection}/${encodeURIComponent(itemId)}`,
				body,
				this.headers(key),
			)
			.pipe(timeout(limit))
	}

	/** Reveal emergency information for a stated purpose. */
	revealEmergency(id: string, purpose: string, key: string) {
		return this.http
			.post<EmergencyInfoDto>(`${this.record(id)}/emergency-reveal`, { purpose }, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Existing people matching the candidate facts. */
	duplicateCheck(body: Record<string, unknown>, key: string) {
		return this.http
			.post<{ candidates: DuplicateCandidateDto[] }>(
				`${this.base}/duplicate-check`,
				body,
				this.headers(key),
			)
			.pipe(timeout(limit))
	}

	/** Create a worker with employment, primary assignment and manager line. */
	create(body: Record<string, unknown>, key: string) {
		return this.http.post<WorkerRecordDto>(this.base, body, this.headers(key)).pipe(timeout(limit))
	}

	/** Merge a duplicate into a survivor. */
	merge(id: string, body: Record<string, unknown>, key: string) {
		return this.http
			.post<WorkerRecordDto>(`${this.record(id)}/merge`, body, this.headers(key))
			.pipe(timeout(limit))
	}
}

const recordLabels: Record<string, string> = {
	givenName: 'Given name',
	familyName: 'Family name',
	middleName: 'Middle name',
	preferredName: 'Preferred name',
	formerName: 'Former name',
	birthDate: 'Birth date',
	genderCode: 'Gender',
	maritalStatusCode: 'Marital status',
	nationalityCountryCode: 'Nationality',
	workerNumber: 'Worker number',
	workerTypeId: 'Worker type',
	legalEntityId: 'Legal entity',
	employmentType: 'Employment type',
	hireDate: 'Hire date',
	workEmail: 'Work email',
	unitId: 'Unit',
	departmentId: 'Department',
	designationId: 'Designation',
	locationId: 'Location',
	jobTitle: 'Job title',
	fullTimeEquivalent: 'FTE',
	standardHoursPerWeek: 'Weekly hours',
	managerWorkerId: 'Manager',
	survivorWorkerId: 'Surviving record',
	effectiveFrom: 'Effective from',
	effectiveTo: 'End date',
	city: 'City',
	countryCode: 'Country',
	primary: 'Primary',
	value: 'Value',
	relationshipType: 'Relationship',
	fullName: 'Full name',
	contactNumber: 'Contact number',
	emergencyPriority: 'Emergency priority',
	purpose: 'Purpose',
	reason: 'Reason for change',
}

const recordFieldMessages: Record<string, (label: string) => string> = {
	required: /** Presence. */ (label) => `${label} is required.`,
	format: /** Shape. */ (label) => `${label} has an invalid format.`,
	unknown: /** Reference. */ (label) => `${label} is not available.`,
	duplicate: /** Uniqueness. */ (label) => `${label} is already used.`,
	'not-after-current': /** Dates. */ () =>
		'The correction must take effect after the current address started.',
	overlap: /** Primary. */ () => 'Another primary address already starts on or after that date.',
	'no-assignment': /** Manager. */ () => 'The manager has no assignment on the hire date.',
	same: /** Merge. */ () => 'Choose a different record to keep.',
}

/** Translate stable server classifications for Employee Records. */
export function recordsErrorMessage(error: unknown): string {
	const body = error instanceof HttpErrorResponse ? error.error : undefined
	const code = body?.code
	const first = Array.isArray(body?.fieldErrors) ? body.fieldErrors[0] : undefined
	const field = typeof first?.field === 'string' ? (first.field as string) : ''
	const label = recordLabels[field.split('.').at(-1) ?? ''] ?? field
	const specific = typeof first?.code === 'string' ? recordFieldMessages[first.code] : undefined
	if (specific && label) return specific(label)
	const messages: Record<string, string> = {
		'invalid-request': label ? `Check ${label}.` : 'Check the highlighted fields.',
		'duplicate-code': 'This worker number is already used. Choose another number.',
		'duplicate-candidate':
			'Possible duplicates were found. Resolve them in the duplicate check before creating.',
		'merge-requires-correction':
			'This record has an established employment and cannot be merged here.',
		'revision-conflict': 'This record changed. Your draft is preserved; reload before continuing.',
		'invalid-state': 'This record no longer allows that change. Reload its current state.',
		'idempotency-conflict': 'This retry belongs to another change. Reload before continuing.',
		forbidden: 'You do not have permission for this operation.',
		unauthenticated: 'Your session is no longer available.',
		'not-found': 'This record is no longer available.',
	}
	return typeof code === 'string' && messages[code]
		? messages[code]
		: 'The operation could not be completed. Retry safely with the same draft.'
}
