import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { timeout, catchError } from 'rxjs'
import { rethrowDocumentDownloadError } from './document-download-error'
import type {
	SelfDocument,
	DocumentVersion,
	DocumentPage,
	TemplateQuery,
} from '@empflowyee/hcm-documents-contract'
@Injectable({ providedIn: 'root' })
export class MyDocumentsApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/documents'
	/** Query server-owned filters and continuations for own shared documents. */
	list(query: TemplateQuery) {
		let params = new HttpParams()
			.set('q', query.q)
			.set('sort', query.sort)
			.set('limit', query.limit)
		if (query.typeId) params = params.set('typeId', query.typeId)
		if (query.cursor) params = params.set('cursor', query.cursor)
		return this.http
			.get<DocumentPage<SelfDocument>>(this.base + '/me/documents', { params })
			.pipe(timeout(15000))
	}
	/** Resolve a selected deep link through the same self-document read permission. */
	get(id: string) {
		return this.http
			.get<SelfDocument>(this.base + '/me/documents/' + encodeURIComponent(id))
			.pipe(timeout(15000))
	}
	/** Query one bounded page of committed immutable versions. */
	versions(id: string, cursor?: string) {
		let params = new HttpParams().set('limit', 25)
		if (cursor) params = params.set('cursor', cursor)
		return this.http
			.get<DocumentPage<DocumentVersion>>(
				this.base + '/me/documents/' + encodeURIComponent(id) + '/versions',
				{ params },
			)
			.pipe(timeout(15000))
	}
	/** Download through authenticated HTTP rather than exposing a static file or bypassing persona context. */
	download(id: string, version: DocumentVersion) {
		return this.http
			.get(
				this.base +
					'/me/documents/' +
					encodeURIComponent(id) +
					'/versions/' +
					encodeURIComponent(version.id) +
					'/download',
				{ responseType: 'blob' },
			)
			.pipe(timeout(60000), catchError(rethrowDocumentDownloadError))
	}
}
