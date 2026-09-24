import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	WorkerDocument,
	WorkerChoice,
	WorkerDocumentVersion,
	DocumentPage,
	WorkerDocumentQuery,
	WorkerDocumentCreate,
	WorkerDocumentAppend,
	WorkerUploadResult,
} from '@empflowyee/hcm-documents-contract'
@Injectable({ providedIn: 'root' })
export class EmployeeDocumentsApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/documents'
	/** Query server-owned filters and continuations for HR reference worker documents. */
	list(query: WorkerDocumentQuery) {
		let params = new HttpParams()
			.set('q', query.q)
			.set('sort', query.sort)
			.set('limit', query.limit)
		if (query.workerId) params = params.set('workerId', query.workerId)
		if (query.typeId) params = params.set('typeId', query.typeId)
		if (query.cursor) params = params.set('cursor', query.cursor)
		return this.http
			.get<DocumentPage<WorkerDocument>>(this.base + '/worker-documents', { params })
			.pipe(timeout(15000))
	}
	/** Resolve a selected deep link through the same worker document read permission. */
	get(id: string) {
		return this.http
			.get<WorkerDocument>(this.base + '/worker-documents/' + encodeURIComponent(id))
			.pipe(timeout(15000))
	}
	/** Query one bounded page of committed immutable versions. */
	versions(id: string, cursor?: string) {
		let params = new HttpParams().set('limit', 25)
		if (cursor) params = params.set('cursor', cursor)
		return this.http
			.get<DocumentPage<WorkerDocumentVersion>>(
				this.base + '/worker-documents/' + encodeURIComponent(id) + '/versions',
				{ params },
			)
			.pipe(timeout(15000))
	}
	/** Search only enabled classifications using worker document-management authority. */
	types(q: string, cursor?: string) {
		let params = new HttpParams().set('q', q).set('enabled', 'true').set('limit', 25)
		if (cursor) params = params.set('cursor', cursor)
		return this.http
			.get<DocumentPage<{ id: string; code: string; label: string }>>(
				this.base + '/worker-document-type-options',
				{ params },
			)
			.pipe(timeout(15000))
	}
	/** Submit the approved bounded metadata before bytes, retaining the caller's retry identity. */
	upload(
		id: string | null,
		value: WorkerDocumentCreate | WorkerDocumentAppend,
		file: File,
		key: string,
	) {
		const form = new FormData()
		form.append('metadata', JSON.stringify(value))
		form.append('file', file, file.name)
		const url =
			this.base + '/worker-documents' + (id ? '/' + encodeURIComponent(id) + '/versions' : '')
		return this.http
			.post<WorkerUploadResult>(url, form, { headers: { 'Idempotency-Key': key } })
			.pipe(timeout(60000))
	}
	/** Download through authenticated HTTP rather than exposing a static file or bypassing persona context. */
	download(id: string, version: WorkerDocumentVersion) {
		return this.http
			.get(
				this.base +
					'/worker-documents/' +
					encodeURIComponent(id) +
					'/versions/' +
					encodeURIComponent(version.id) +
					'/download',
				{ responseType: 'blob' },
			)
			.pipe(timeout(60000))
	} /** Search real worker identities, including workers without login accounts. */
	workers(q: string, cursor?: string) {
		let params = new HttpParams().set('q', q).set('limit', 25)
		if (cursor) params = params.set('cursor', cursor)
		return this.http
			.get<DocumentPage<WorkerChoice>>(this.base + '/workers', { params })
			.pipe(timeout(15000))
	}
	/** Apply one version's visibility through the document-owned API. */
	share(id: string, versionId: string, value: WorkerDocumentAppend, key: string) {
		return this.http
			.put<WorkerDocumentVersion>(
				this.base +
					'/worker-documents/' +
					encodeURIComponent(id) +
					'/versions/' +
					encodeURIComponent(versionId) +
					'/visibility',
				value,
				{ headers: { 'Idempotency-Key': key } },
			)
			.pipe(timeout(15000))
	}
}
