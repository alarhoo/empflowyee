import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	DocumentTemplate,
	DocumentVersion,
	DocumentPage,
	TemplateQuery,
	TemplateCreate,
	TemplateAppend,
	TemplateUploadResult,
} from '@empflowyee/hcm-documents-contract'
@Injectable({ providedIn: 'root' })
export class DocumentTemplatesApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/documents'
	/** Query server-owned filters and continuations for HR reference templates. */
	list(query: TemplateQuery) {
		let params = new HttpParams()
			.set('q', query.q)
			.set('sort', query.sort)
			.set('limit', query.limit)
		if (query.typeId) params = params.set('typeId', query.typeId)
		if (query.cursor) params = params.set('cursor', query.cursor)
		return this.http
			.get<DocumentPage<DocumentTemplate>>(this.base + '/templates', { params })
			.pipe(timeout(15000))
	}
	/** Resolve a selected deep link through the same template read permission. */
	get(id: string) {
		return this.http
			.get<DocumentTemplate>(this.base + '/templates/' + encodeURIComponent(id))
			.pipe(timeout(15000))
	}
	/** Query one bounded page of committed immutable versions. */
	versions(id: string, cursor?: string) {
		let params = new HttpParams().set('limit', 25)
		if (cursor) params = params.set('cursor', cursor)
		return this.http
			.get<DocumentPage<DocumentVersion>>(
				this.base + '/templates/' + encodeURIComponent(id) + '/versions',
				{ params },
			)
			.pipe(timeout(15000))
	}
	/** Search only enabled classifications using template-management authority. */
	types(q: string, cursor?: string) {
		let params = new HttpParams().set('q', q).set('enabled', 'true').set('limit', 25)
		if (cursor) params = params.set('cursor', cursor)
		return this.http
			.get<DocumentPage<{ id: string; code: string; label: string }>>(
				this.base + '/template-type-options',
				{ params },
			)
			.pipe(timeout(15000))
	}
	/** Submit the approved bounded metadata before bytes, retaining the caller's retry identity. */
	upload(id: string | null, value: TemplateCreate | TemplateAppend, file: File, key: string) {
		const form = new FormData()
		form.append('metadata', JSON.stringify(value))
		form.append('file', file, file.name)
		const url = this.base + '/templates' + (id ? '/' + encodeURIComponent(id) + '/versions' : '')
		return this.http
			.post<TemplateUploadResult>(url, form, { headers: { 'Idempotency-Key': key } })
			.pipe(timeout(60000))
	}
	/** Download through authenticated HTTP rather than exposing a static file or bypassing persona context. */
	download(id: string, version: DocumentVersion) {
		return this.http
			.get(
				this.base +
					'/templates/' +
					encodeURIComponent(id) +
					'/versions/' +
					encodeURIComponent(version.id) +
					'/download',
				{ responseType: 'blob' },
			)
			.pipe(timeout(60000))
	}
}
