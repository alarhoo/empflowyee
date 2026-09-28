import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	ScheduleDraft,
	ScheduleVersionView,
	ScheduleSeedDefaults,
	ScheduleListQuery,
	AttendanceVersionCommand,
	AttendanceCopyCommand,
	ConfigurationPreviewCommand,
	ConfigurationPreviewView,
	ConfigurationPublishCommand,
	ConfigurationReasonCommand,
	ConfigurationCommandResult,
} from '@empflowyee/hcm-attendance-contract'

/** Typed attendance transport; the server owns paging and lifecycle authorization. */
@Injectable({ providedIn: 'root' })
export class ScheduleTemplatesApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/attendance/schedule-templates'

	/** Read the persisted incomplete proposal without synthesizing business defaults. */
	defaults() {
		return this.http.get<ScheduleSeedDefaults>(`${this.base}/defaults`).pipe(timeout(15000))
	}
	/** Request one server-ordered page with its complete cursor binding. */
	list(query: ScheduleListQuery) {
		let params = new HttpParams()
			.set('limit', query.limit)
			.set('sort', `${query.sort}:${query.direction}`)
		for (const field of ['code', 'name', 'state', 'id', 'cursor'] as const)
			if (query[field]) params = params.set(field, query[field])
		return this.http
			.get<{ items: ScheduleVersionView[]; nextCursor: string | null }>(this.base, { params })
			.pipe(timeout(15000))
	}
	/** Read the latest or explicitly selected version. */
	detail(id: string, version?: string) {
		let params = new HttpParams()
		if (version) params = params.set('version', version)
		return this.http
			.get<ScheduleVersionView>(`${this.base}/${encodeURIComponent(id)}`, { params })
			.pipe(timeout(15000))
	}
	/** Create a complete template with a caller-retained retry key. */
	create(body: ScheduleDraft, key: string) {
		return this.http
			.post<ScheduleVersionView>(this.base, body, { headers: { 'Idempotency-Key': key } })
			.pipe(timeout(15000))
	}
	/** Replace only the loaded draft at its expected revision. */
	update(source: ScheduleVersionView, body: ScheduleDraft, key: string) {
		return this.http
			.patch<ScheduleVersionView>(
				`${this.base}/${encodeURIComponent(source.id)}`,
				{ ...body, expectedRevision: source.revision },
				{
					params: new HttpParams().set('version', source.versionId),
					headers: { 'Idempotency-Key': key },
				},
			)
			.pipe(timeout(15000))
	}
	/** Create a successor without changing the published source. */
	version(id: string, body: AttendanceVersionCommand, key: string) {
		return this.command<ScheduleVersionView>(id, 'versions', body, key)
	}
	/** Create an independent ordinary schedule draft with source attribution. */
	copy(id: string, body: AttendanceCopyCommand, key: string) {
		return this.command<ScheduleVersionView>(id, 'copy', body, key)
	}
	/** Obtain an actor-bound preview of the exact revision. */
	preview(source: ScheduleVersionView, body: ConfigurationPreviewCommand, key: string) {
		return this.command<ConfigurationPreviewView>(source.id, 'preview', body, key, source.versionId)
	}
	/** Publish using the preview and preserved private reason. */
	publish(source: ScheduleVersionView, body: ConfigurationPublishCommand, key: string) {
		return this.command<ConfigurationCommandResult>(
			source.id,
			'publish',
			body,
			key,
			source.versionId,
		)
	}
	/** Retire a template without altering independent copies. */
	retire(source: ScheduleVersionView, body: ConfigurationReasonCommand, key: string) {
		return this.command<ConfigurationCommandResult>(
			source.id,
			'retire',
			body,
			key,
			source.versionId,
		)
	}
	/** Preserve exact-version query syntax separately from copy/version body selectors. */
	private command<T>(id: string, action: string, body: unknown, key: string, version?: string) {
		let params = new HttpParams()
		if (version) params = params.set('version', version)
		return this.http
			.post<T>(`${this.base}/${encodeURIComponent(id)}/${action}`, body, {
				params,
				headers: { 'Idempotency-Key': key },
			})
			.pipe(timeout(15000))
	}
}

/** Translate safe classifications while preserving uncertainty after a failed write. */
export function attendanceErrorMessage(error: unknown): string {
	const code = error instanceof HttpErrorResponse ? error.error?.code : undefined
	if (error instanceof HttpErrorResponse && [401, 403].includes(error.status))
		return 'Your current session does not authorize this operation.'
	if (code === 'preview-stale')
		return 'The preview expired or its source changed. Request a new preview.'
	if (code === 'revision-conflict')
		return 'This version changed. Reload before submitting again; your draft is preserved.'
	if (code === 'record-incomplete')
		return 'The schedule defaults are incomplete. An administrator must configure them.'
	if (error instanceof HttpErrorResponse && error.status === 404)
		return 'This template or version is no longer available.'
	if (error instanceof HttpErrorResponse && error.status === 400)
		return 'Check the highlighted fields. If loading more results failed, refresh the list.'
	return 'The request could not be confirmed. Retry the unchanged command to recover its result safely.'
}

/** Distinguish denied and unavailable reads from transient failures. */
export function attendanceReadState(error: unknown): 'denied' | 'unavailable' | 'error' {
	if (error instanceof HttpErrorResponse && [401, 403].includes(error.status)) return 'denied'
	if (error instanceof HttpErrorResponse && [404, 409].includes(error.status)) return 'unavailable'
	return 'error'
}
