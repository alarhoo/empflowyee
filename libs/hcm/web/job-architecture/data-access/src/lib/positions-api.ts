import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	IncumbentPage,
	PositionChangeRequestDto,
	PositionChangeRequestPage,
	PositionDecision,
	PositionDetailDto,
	PositionLifecycle,
	PositionOptionKind,
	PositionOptionPage,
	PositionPage,
	PositionProposal,
	PositionRequestStatus,
	PositionVersionPage,
	LifecycleRequestType,
} from '@empflowyee/hcm-job-architecture-contract'

export interface PositionListQuery {
	q?: string
	sort?: 'code:asc' | 'name:asc'
	status?: PositionLifecycle
	unitId?: string
	departmentId?: string
	locationId?: string
	profileId?: string
	hasVacancy?: 'true' | 'false'
	cursor?: string
}

export interface PositionRequestListQuery {
	status?: PositionRequestStatus
	positionId?: string
	view?: 'mine' | 'awaiting-my-decision'
	cursor?: string
}

export type PositionRequestBody =
	| { requestType: 'Create'; code: string; proposed: PositionProposal; reason: string }
	| { requestType: 'Change'; positionId: string; proposed: PositionProposal; reason: string }
	| { requestType: LifecycleRequestType; positionId: string; reason: string }

const limit = 15000

/** Positions API; the server remains the authority for every rule. */
@Injectable({ providedIn: 'root' })
export class PositionsApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/job-architecture'

	/** Attach the caller-retained idempotency key to one command. */
	private headers(key: string) {
		return { headers: { 'Idempotency-Key': key } }
	}

	/** An encoded position path. */
	private position(id: string): string {
		return `${this.base}/positions/${encodeURIComponent(id)}`
	}

	/** An encoded change request path. */
	private request(id: string): string {
		return `${this.base}/position-change-requests/${encodeURIComponent(id)}`
	}

	/** Query parameters from defined values. */
	private params(values: object, size = '25'): HttpParams {
		let params = new HttpParams().set('limit', size)
		for (const [name, value] of Object.entries(values))
			if (value) params = params.set(name, String(value))
		return params
	}

	/** One page of positions. */
	positions(query: PositionListQuery) {
		return this.http
			.get<PositionPage>(`${this.base}/positions`, { params: this.params(query) })
			.pipe(timeout(limit))
	}

	/** One position. */
	readPosition(id: string) {
		return this.http.get<PositionDetailDto>(this.position(id)).pipe(timeout(limit))
	}

	/** Incumbents of a position. */
	incumbents(id: string, cursor?: string) {
		return this.http
			.get<IncumbentPage>(`${this.position(id)}/incumbents`, {
				params: this.params({ cursor }),
			})
			.pipe(timeout(limit))
	}

	/** Published versions of a position. */
	versions(id: string, cursor?: string) {
		return this.http
			.get<PositionVersionPage>(`${this.position(id)}/versions`, {
				params: this.params({ cursor }),
			})
			.pipe(timeout(limit))
	}

	/** One page of change requests. */
	requests(query: PositionRequestListQuery) {
		return this.http
			.get<PositionChangeRequestPage>(`${this.base}/position-change-requests`, {
				params: this.params(query),
			})
			.pipe(timeout(limit))
	}

	/** One change request. */
	readRequest(id: string) {
		return this.http.get<PositionChangeRequestDto>(this.request(id)).pipe(timeout(limit))
	}

	/** Options for a proposal reference, filtered on the server. */
	options(kind: PositionOptionKind, q: string, cursor?: string) {
		return this.http
			.get<PositionOptionPage>(`${this.base}/position-options/${kind}`, {
				params: this.params({ q, cursor }, '50'),
			})
			.pipe(timeout(limit))
	}

	/** Raise a change request. */
	createRequest(body: PositionRequestBody, key: string) {
		return this.http
			.post<PositionChangeRequestDto>(
				`${this.base}/position-change-requests`,
				body,
				this.headers(key),
			)
			.pipe(timeout(limit))
	}

	/** Replace a draft proposal. */
	updateRequest(
		id: string,
		body: { proposed: PositionProposal; reason: string; expectedRevision: number },
		key: string,
	) {
		return this.http
			.put<PositionChangeRequestDto>(this.request(id), body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Calculate the impact preview. */
	preview(id: string, body: { expectedRevision: number }, key: string) {
		return this.http
			.post<PositionChangeRequestDto>(`${this.request(id)}/preview`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Submit with a valid preview. */
	submit(id: string, body: { previewId: string; expectedRevision: number }, key: string) {
		return this.http
			.post<PositionChangeRequestDto>(`${this.request(id)}/submit`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Withdraw an open request. */
	withdraw(id: string, body: { expectedRevision: number; reason: string }, key: string) {
		return this.http
			.post<PositionChangeRequestDto>(`${this.request(id)}/withdraw`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Approve or reject. */
	decide(
		id: string,
		body: { decision: PositionDecision; comment: string; expectedRevision: number },
		key: string,
	) {
		return this.http
			.post<PositionChangeRequestDto>(`${this.request(id)}/decide`, body, this.headers(key))
			.pipe(timeout(limit))
	}
}
