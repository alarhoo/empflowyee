import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	AttendanceVersionCommand,
	HolidayDraft,
	HolidayListQuery,
	HolidayVersionView,
	ConfigurationReasonCommand,
	HolidayPreviewCommand,
	HolidayPreviewView,
	ConfigurationPublishCommand,
	HolidayReferenceOptions,
	HolidayEmploymentOptions,
	HolidayReferenceKind,
	HolidayAssignmentOptions,
	AttendanceScopeTarget,
	HolidayAssignmentView,
	HolidayAssignmentCommand,
	HolidayAssignmentResult,
} from '@empflowyee/hcm-attendance-contract'

/** Consume the implemented holiday draft/read API with exact version identity and caller-retained retry keys. */
@Injectable({ providedIn: 'root' })
export class HolidayCalendarsApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/attendance/holiday-calendars'
	/** Search minimal assignment scope choices through the independently authorized endpoint. */
	assignmentReferences(kind: HolidayReferenceKind, q: string, asOf: string) {
		return this.http
			.get<HolidayReferenceOptions>(`${this.base}/assignment-references/${kind}`, {
				params: new HttpParams().set('q', q).set('asOf', asOf),
			})
			.pipe(timeout(15000))
	}
	/** Load explicit employment and dated assignment choices without private HR fields. */
	assignmentContext(worker: string, asOf: string) {
		return this.http
			.get<HolidayAssignmentOptions>(
				`${this.base}/assignment-references/workers/${encodeURIComponent(worker)}/context`,
				{ params: new HttpParams().set('asOf', asOf) },
			)
			.pipe(timeout(15000))
	}
	/** Read at most one exact target/date assignment; never schedules background work. */
	currentAssignment(target: AttendanceScopeTarget, asOf: string) {
		let params = new HttpParams().set('kind', target.kind).set('asOf', asOf)
		if (target.kind !== 'Tenant') params = params.set('id', target.id)
		return this.http
			.get<HolidayAssignmentView | null>('/api/v1/attendance/holiday-calendar-assignments', {
				params,
			})
			.pipe(timeout(15000))
	}
	/** Assign or explicitly supersede using a retained command key; queued work is not reported as completed. */
	assign(body: HolidayAssignmentCommand, key: string) {
		return this.http
			.post<HolidayAssignmentResult>('/api/v1/attendance/holiday-calendar-assignments', body, {
				headers: { 'Idempotency-Key': key },
			})
			.pipe(timeout(30000))
	}
	/** Search a bounded reference set under the calendar action's own authority. */
	referenceOptions(kind: 'workers' | 'locations', q: string, asOf: string) {
		return this.http
			.get<HolidayReferenceOptions>(`${this.base}/references/${kind}`, {
				params: new HttpParams().set('q', q).set('asOf', asOf),
			})
			.pipe(timeout(15000))
	}
	/** Select among distinct employments without consuming private HR change context. */
	employmentOptions(worker: string, asOf: string) {
		return this.http
			.get<HolidayEmploymentOptions>(
				`${this.base}/references/workers/${encodeURIComponent(worker)}/employments`,
				{ params: new HttpParams().set('asOf', asOf) },
			)
			.pipe(timeout(15000))
	}
	/** Start durable validation; the caller must wait for Ready before publication. */
	preview(source: HolidayVersionView, body: HolidayPreviewCommand, key: string) {
		return this.http
			.post<HolidayPreviewView>(`${this.versionPath(source.id, source.versionId)}/preview`, body, {
				headers: { 'Idempotency-Key': key },
			})
			.pipe(timeout(15000))
	}
	/** Read real worker progress for this actor's review. */
	previewStatus(source: HolidayVersionView, previewId: string) {
		return this.http
			.get<HolidayPreviewView>(
				`${this.versionPath(source.id, source.versionId)}/previews/${encodeURIComponent(previewId)}`,
			)
			.pipe(timeout(15000))
	}
	/** Publish only the loaded revision and its completed context review. */
	publish(source: HolidayVersionView, body: ConfigurationPublishCommand, key: string) {
		return this.http
			.post<HolidayVersionView>(`${this.versionPath(source.id, source.versionId)}/publish`, body, {
				headers: { 'Idempotency-Key': key },
			})
			.pipe(timeout(15000))
	}
	/** Retire one exact revision with a caller-retained retry key and preserved reason. */
	retire(source: HolidayVersionView, body: ConfigurationReasonCommand, key: string) {
		return this.http
			.post<HolidayVersionView>(`${this.versionPath(source.id, source.versionId)}/retire`, body, {
				headers: { 'Idempotency-Key': key },
			})
			.pipe(timeout(15000))
	}

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
