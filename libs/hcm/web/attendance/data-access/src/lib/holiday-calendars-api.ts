import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	AttendanceVersionCommand,
	HolidayDraft,
	HolidayListQuery,
	HolidayVersionView,
} from '@empflowyee/hcm-attendance-contract'

/** Consume the implemented holiday draft/read API with exact version identity and caller-retained retry keys. */
@Injectable({ providedIn: 'root' })
export class HolidayCalendarsApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/attendance/holiday-calendars'

	/** Read one server-owned latest-version page without locally sorting a partial result. */
	list(query: HolidayListQuery) {
		let params = new HttpParams()
			.set('limit', query.limit)
			.set('sort', `${query.sort}:${query.direction}`)
		for (const field of ['code', 'name', 'state', 'id', 'cursor'] as const)
			if (query[field]) params = params.set(field, query[field])
		return this.http
			.get<{ items: HolidayVersionView[]; nextCursor: string | null }>(this.base, { params })
			.pipe(timeout(15000))
	}
	/** Load an exact root/version path; calendar detail never substitutes a latest version or uses an undeclared query. */
	detail(id: string, versionId: string) {
		return this.http.get<HolidayVersionView>(this.versionPath(id, versionId)).pipe(timeout(15000))
	}
	/** Save an explicit draft without inventing observed dates or overwriting a previously attempted command key. */
	create(body: HolidayDraft, key: string) {
		return this.http
			.post<HolidayVersionView>(this.base, body, { headers: { 'Idempotency-Key': key } })
			.pipe(timeout(15000))
	}
	/** Replace only the loaded exact draft revision, preserving every supplied business field for server validation. */
	update(source: HolidayVersionView, body: HolidayDraft, key: string) {
		return this.http
			.patch<HolidayVersionView>(
				this.versionPath(source.id, source.versionId),
				{ ...body, expectedRevision: source.revision },
				{ headers: { 'Idempotency-Key': key } },
			)
			.pipe(timeout(15000))
	}
	/** Derive a new editable version from the explicit immutable source selected by the caller. */
	version(id: string, body: AttendanceVersionCommand, key: string) {
		return this.http
			.post<HolidayVersionView>(`${this.base}/${encodeURIComponent(id)}/versions`, body, {
				headers: { 'Idempotency-Key': key },
			})
			.pipe(timeout(15000))
	}
	/** Encode opaque root and version IDs as independent path segments. */
	private versionPath(id: string, versionId: string): string {
		return `${this.base}/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`
	}
}
