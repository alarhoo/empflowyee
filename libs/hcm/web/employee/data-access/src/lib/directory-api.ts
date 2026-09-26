import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	DirectoryOptionKindKey,
	DirectoryOptionPage,
	DirectoryPage,
	DirectoryPersonDto,
} from '@empflowyee/hcm-employee-contract'

export interface DirectorySearchQuery {
	q: string
	descending: boolean
	cursor?: string | null
	unitId?: string
	departmentId?: string
	locationId?: string
	designationId?: string
}

const limit = 15000

/** Employee Directory client; fields the server omits stay omitted in the UI. */
@Injectable({ providedIn: 'root' })
export class EmployeeDirectoryApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/employee/directory'

	/** One page of colleagues. */
	search(query: DirectorySearchQuery, pageSize = 25) {
		let params = new HttpParams()
			.set('limit', pageSize)
			.set('sort', query.descending ? 'name:desc' : 'name:asc')
		if (query.q) params = params.set('q', query.q)
		if (query.cursor) params = params.set('cursor', query.cursor)
		for (const key of ['unitId', 'departmentId', 'locationId', 'designationId'] as const) {
			const value = query[key]
			if (value) params = params.set(key, value)
		}
		return this.http.get<DirectoryPage>(this.base, { params }).pipe(timeout(limit))
	}

	/** One colleague. */
	person(workerId: string) {
		return this.http
			.get<DirectoryPersonDto>(`${this.base}/${encodeURIComponent(workerId)}`)
			.pipe(timeout(limit))
	}

	/** One page of a colleague's direct reports. */
	reports(workerId: string, cursor?: string | null) {
		let params = new HttpParams().set('limit', 25)
		if (cursor) params = params.set('cursor', cursor)
		return this.http
			.get<DirectoryPage>(`${this.base}/${encodeURIComponent(workerId)}/reports`, { params })
			.pipe(timeout(limit))
	}

	/** One page of filter options of a kind. */
	options(kind: DirectoryOptionKindKey, q: string) {
		let params = new HttpParams().set('limit', 25)
		if (q) params = params.set('q', q)
		return this.http
			.get<DirectoryOptionPage>(`${this.base}/options/${kind}`, { params })
			.pipe(timeout(limit))
	}
}
