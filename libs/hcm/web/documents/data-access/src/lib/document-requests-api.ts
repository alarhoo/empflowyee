import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { timeout, catchError } from 'rxjs'
import { rethrowDocumentDownloadError } from './document-download-error'
import type {
	DocumentRequestScope,
	DocumentRequestQuery,
	DocumentRequestCreate,
	DocumentRequestTransition,
	RequestView,
	DocumentRequest,
	SelfDocumentRequest,
	DocumentPage,
	DocumentVersion,
	WorkerChoice,
} from '@empflowyee/hcm-documents-contract'
@Injectable({ providedIn: 'root' })
export class DocumentRequestsApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/documents'
	/** Select an explicit endpoint without submitting actor or tenant overrides. */ private path(
		scope: DocumentRequestScope,
	) {
		return this.base + (scope === 'own' ? '/me/requests' : '/requests')
	}
	/** Keep all filtering, ordering and continuation server-owned. */ list(
		scope: DocumentRequestScope,
		query: DocumentRequestQuery,
	) {
		let params = new HttpParams()
			.set('q', query.q)
			.set('sort', query.sort)
			.set('limit', query.limit)
		if (query.status) params = params.set('status', query.status)
		if (query.typeId) params = params.set('typeId', query.typeId)
		if (query.workerId) params = params.set('workerId', query.workerId)
		if (query.cursor) params = params.set('cursor', query.cursor)
		return this.http
			.get<DocumentPage<RequestView>>(this.path(scope), { params })
			.pipe(timeout(15000))
	}
	/** Read an exact authorized deep link. */ get(scope: DocumentRequestScope, id: string) {
		return this.http
			.get<RequestView>(this.path(scope) + '/' + encodeURIComponent(id))
			.pipe(timeout(15000))
	}
	/** Read a bounded immutable submission collection. */ versions(
		scope: DocumentRequestScope,
		id: string,
		cursor?: string,
	) {
		let params = new HttpParams().set('limit', 25)
		if (cursor) params = params.set('cursor', cursor)
		return this.http
			.get<DocumentPage<DocumentVersion>>(
				this.path(scope) + '/' + encodeURIComponent(id) + '/submissions',
				{ params },
			)
			.pipe(timeout(15000))
	}
	/** Search enabled request classifications through the management-scoped picker. */ types(
		q: string,
		cursor?: string,
	) {
		let params = new HttpParams().set('q', q).set('enabled', 'true').set('limit', 25)
		if (cursor) params = params.set('cursor', cursor)
		return this.http
			.get<DocumentPage<{ id: string; code: string; label: string }>>(
				this.base + '/request-type-options',
				{ params },
			)
			.pipe(timeout(15000))
	}
	/** Search real workers without creating accounts or employee fixtures. */ workers(
		q: string,
		cursor?: string,
	) {
		let params = new HttpParams().set('q', q).set('limit', 25)
		if (cursor) params = params.set('cursor', cursor)
		return this.http
			.get<DocumentPage<WorkerChoice>>(this.base + '/request-worker-options', { params })
			.pipe(timeout(15000))
	}
	/** Create one attributed request with a stable retry identity. */ create(
		value: DocumentRequestCreate,
		key: string,
	) {
		return this.http
			.post<DocumentRequest>(this.path('hr'), value, { headers: { 'Idempotency-Key': key } })
			.pipe(timeout(15000))
	}
	/** Apply only an approved manual transition through the HR endpoint. */ transition(
		id: string,
		action: 'accept' | 'replacement' | 'cancel',
		value: DocumentRequestTransition,
		key: string,
	) {
		return this.http
			.post<DocumentRequest>(this.path('hr') + '/' + encodeURIComponent(id) + '/' + action, value, {
				headers: { 'Idempotency-Key': key },
			})
			.pipe(timeout(15000))
	}
	/** Upload metadata before bytes through the self-only submission endpoint. */ submit(
		id: string,
		revision: number,
		file: File,
		key: string,
	) {
		const body = new FormData()
		body.append('metadata', JSON.stringify({ expectedRevision: revision }))
		body.append('file', file, file.name)
		return this.http
			.post<SelfDocumentRequest>(
				this.path('own') + '/' + encodeURIComponent(id) + '/submit',
				body,
				{ headers: { 'Idempotency-Key': key } },
			)
			.pipe(timeout(60000))
	}
	/** Fetch private bytes with current persona context and bounded structured error decoding. */ download(
		scope: DocumentRequestScope,
		id: string,
		version: DocumentVersion,
	) {
		return this.http
			.get(
				this.path(scope) +
					'/' +
					encodeURIComponent(id) +
					'/submissions/' +
					encodeURIComponent(version.id) +
					'/download',
				{ responseType: 'blob' },
			)
			.pipe(timeout(60000), catchError(rethrowDocumentDownloadError))
	}
}
