import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type { TeamMemberDto, TeamPage } from '@empflowyee/hcm-employee-contract'

export interface TeamListQuery {
	q: string
	cursor?: string | null
	locationId?: string
	probationStatus?: string
}

const limit = 15000

/** Team Directory client; the server resolves the team from the verified actor. */
@Injectable({ providedIn: 'root' })
export class TeamDirectoryApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/employee/team'

	/** One page of the actor's team. */
	list(query: TeamListQuery) {
		let params = new HttpParams().set('limit', 25)
		if (query.q) params = params.set('q', query.q)
		if (query.cursor) params = params.set('cursor', query.cursor)
		if (query.locationId) params = params.set('locationId', query.locationId)
		if (query.probationStatus) params = params.set('probationStatus', query.probationStatus)
		return this.http.get<TeamPage>(this.base, { params }).pipe(timeout(limit))
	}

	/** One team member. */
	member(workerId: string) {
		return this.http
			.get<TeamMemberDto>(`${this.base}/${encodeURIComponent(workerId)}`)
			.pipe(timeout(limit))
	}
}
