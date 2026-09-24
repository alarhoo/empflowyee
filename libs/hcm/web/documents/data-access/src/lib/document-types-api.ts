import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	DocumentType,
	DocumentTypePage,
	DocumentTypeQuery,
	DocumentTypeCreate,
	DocumentTypeUpdate,
} from '@empflowyee/hcm-documents-contract'
@Injectable({ providedIn: 'root' })
export class DocumentTypesApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/documents/types'
	/** Query one authorized server-owned classification page. */
	list(query: DocumentTypeQuery) {
		let params = new HttpParams()
			.set('q', query.q)
			.set('sort', query.sort)
			.set('limit', query.limit)
		if (query.enabled !== undefined) params = params.set('enabled', String(query.enabled))
		if (query.cursor) params = params.set('cursor', query.cursor)
		return this.http.get<DocumentTypePage>(this.base, { params }).pipe(timeout(15000))
	}
	/** Create one code using a stable receipt identity. */
	create(body: DocumentTypeCreate, key: string) {
		return this.http
			.post<DocumentType>(this.base, body, { headers: { 'Idempotency-Key': key } })
			.pipe(timeout(15000))
	}
	/** Edit mutable metadata only at the supplied revision. */
	update(id: string, body: DocumentTypeUpdate, key: string) {
		return this.http
			.put<DocumentType>(this.base + '/' + encodeURIComponent(id), body, {
				headers: { 'Idempotency-Key': key },
			})
			.pipe(timeout(15000))
	}
}
/** Present safe failures while preserving the operator's reviewable draft. */
export function documentErrorMessage(error: unknown): string {
	const code = error instanceof HttpErrorResponse ? error.error?.code : undefined
	const messages: Record<string, string> = {
		'invalid-request': 'Check the fields and filters.',
		'invalid-state':
			'This request no longer allows that action. Reload its current state before continuing.',
		'not-found': 'This document record is no longer available.',
		'storage-unavailable':
			'Private file storage is unavailable. Retry with the same file and draft.',
		'file-too-large': 'Choose a file no larger than 10 MiB.',
		'unsupported-file': 'Choose a PDF, PNG or JPEG whose file type and contents agree.',
		'upload-failed':
			'This upload reservation failed. Close and start a new upload after reviewing current data.',
		'type-disabled': 'This document type is disabled for new records.',
		'duplicate-code': 'This code already exists. Choose another code.',
		'revision-conflict': 'The record changed. Your draft is preserved; reload before continuing.',
		'idempotency-conflict': 'This retry belongs to another change. Reload before continuing.',
		forbidden: 'You no longer have permission for this operation.',
		unauthenticated: 'Your session is no longer available.',
	}
	return typeof code === 'string' && messages[code]
		? messages[code]
		: 'The operation could not be completed. Retry safely with the same draft.'
}
