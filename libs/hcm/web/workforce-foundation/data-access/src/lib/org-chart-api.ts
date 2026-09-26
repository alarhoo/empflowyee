import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	OrgChartNodeDto,
	OrgChartPage,
	OrgChartPersonDto,
} from '@empflowyee/hcm-workforce-foundation-contract'

const limit = 15000

/** Read-only org chart client; every field the server omits stays omitted in the UI. */
@Injectable({ providedIn: 'root' })
export class OrgChartApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/workforce-foundation/org-chart'

	/** The path of one node. */
	private node(assignmentId: string): string {
		return `${this.base}/nodes/${encodeURIComponent(assignmentId)}`
	}

	/** Paging parameters. */
	private params(pageSize: number, cursor?: string | null): HttpParams {
		let params = new HttpParams().set('limit', pageSize)
		if (cursor) params = params.set('cursor', cursor)
		return params
	}

	/** One page of root nodes. */
	roots(cursor?: string | null, pageSize = 50) {
		return this.http
			.get<OrgChartPage>(`${this.base}/roots`, { params: this.params(pageSize, cursor) })
			.pipe(timeout(limit))
	}

	/** One page of a node's direct reports. */
	reports(assignmentId: string, cursor?: string | null, pageSize = 50) {
		return this.http
			.get<OrgChartPage>(`${this.node(assignmentId)}/reports`, {
				params: this.params(pageSize, cursor),
			})
			.pipe(timeout(limit))
	}

	/** One node with its Organization-visible details. */
	person(assignmentId: string) {
		return this.http.get<OrgChartPersonDto>(this.node(assignmentId)).pipe(timeout(limit))
	}

	/** The ancestor path from a root to the node. */
	path(assignmentId: string) {
		return this.http
			.get<{ items: OrgChartNodeDto[] }>(`${this.node(assignmentId)}/path`)
			.pipe(timeout(limit))
	}

	/** One page of search results by name or worker number prefix. */
	search(q: string, cursor?: string | null) {
		return this.http
			.get<OrgChartPage>(`${this.base}/search`, { params: this.params(25, cursor).set('q', q) })
			.pipe(timeout(limit))
	}
}
