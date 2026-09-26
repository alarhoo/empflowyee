import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	LookupAttributes,
	LookupSetDto,
	LookupSetKey,
	LookupValueDto,
	LookupValuePage,
} from '@empflowyee/hcm-workforce-foundation-contract'
import { structureErrorMessage } from './structure-api'

export interface LookupValueListQuery {
	q: string
	limit: number
	cursor?: string
	active?: boolean
}
export interface LookupValueFields {
	name: string
	description: string
	sortOrder: number
	attributes: LookupAttributes
	reason: string
}
export type LookupValueCreateBody = LookupValueFields & { code: string }
export type LookupValueUpdateBody = LookupValueFields & { expectedRevision: number }
export interface LookupValueActiveBody {
	active: boolean
	expectedRevision: number
	reason: string
}

const limit = 15000

/** Workforce-owned lookup set API; product sets are read-only on the server. */
@Injectable({ providedIn: 'root' })
export class LookupValuesApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/workforce-foundation/lookup-sets'

	/** Build a value path without trusting identifiers as URL syntax. */
	private path(set: LookupSetKey, id?: string): string {
		return `${this.base}/${set}/values${id === undefined ? '' : '/' + encodeURIComponent(id)}`
	}

	/** Attach the caller-retained idempotency key to one command. */
	private headers(key: string) {
		return { headers: { 'Idempotency-Key': key } }
	}

	/** Read the eight sets with ownership and active value counts. */
	sets() {
		return this.http.get<{ items: LookupSetDto[] }>(this.base).pipe(timeout(limit))
	}

	/** Read one server page of a set's values in sort order. */
	values(set: LookupSetKey, query: LookupValueListQuery) {
		let params = new HttpParams().set('sort', 'sortOrder:asc').set('limit', query.limit)
		if (query.q) params = params.set('q', query.q)
		if (query.cursor) params = params.set('cursor', query.cursor)
		if (query.active !== undefined) params = params.set('active', String(query.active))
		return this.http.get<LookupValuePage>(this.path(set), { params }).pipe(timeout(limit))
	}

	/** Create a tenant value with its immutable code. */
	create(set: LookupSetKey, body: LookupValueCreateBody, key: string) {
		return this.http
			.post<LookupValueDto>(this.path(set), body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Update a tenant value's mutable fields at its loaded revision. */
	update(set: LookupSetKey, id: string, body: LookupValueUpdateBody, key: string) {
		return this.http
			.put<LookupValueDto>(this.path(set, id), body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Retire or reactivate a tenant value. */
	setActive(set: LookupSetKey, id: string, body: LookupValueActiveBody, key: string) {
		return this.http
			.post<LookupValueDto>(`${this.path(set, id)}/active`, body, this.headers(key))
			.pipe(timeout(limit))
	}
}

/** Translate stable server classifications for lookup commands and reads. */
export function lookupErrorMessage(error: unknown): string {
	const code = error instanceof HttpErrorResponse ? error.error?.code : undefined
	if (code === 'set-not-editable') return 'This list is maintained by the product and is read-only.'
	if (code === 'revision-conflict')
		return 'This value changed. Your draft is preserved; reload the list before continuing.'
	return structureErrorMessage(error)
}
