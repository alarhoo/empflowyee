import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { map, switchMap, timeout, type Observable } from 'rxjs'
import type {
	ScheduleDraft,
	ScheduleVersionView,
	ScheduleSeedDefaults,
	ScheduleListQuery,
	ShiftDraft,
	ShiftVersionView,
	AttendancePolicyDraft,
	AttendancePolicyVersionView,
	AttendanceVersionCommand,
	ConfigurationPreviewCommand,
	ConfigurationPreviewView,
	DatedConfigurationPreviewCommand,
	DatedConfigurationPreviewView,
	ConfigurationPublishCommand,
	ConfigurationReasonCommand,
	ConfigurationCommandResult,
	HolidayReferenceKind,
	HolidayReferenceOptions,
	HolidayEmploymentOptions,
	HolidayAssignmentOptions,
	AttendanceScopeTarget,
	WorkAssignmentCommand,
	WorkAssignmentResult,
	WorkAssignmentView,
	AttendanceWorkdayQuery,
	WorkdayPage,
} from '@empflowyee/hcm-attendance-contract'

export interface WorkConfigurationViews {
	Schedule: ScheduleVersionView
	Shift: ShiftVersionView
	Policy: AttendancePolicyVersionView
}
export interface WorkConfigurationDrafts {
	Schedule: ScheduleDraft
	Shift: ShiftDraft
	Policy: AttendancePolicyDraft
}
export type WorkConfigurationKind = keyof WorkConfigurationViews
export type WorkConfigurationView = WorkConfigurationViews[WorkConfigurationKind]
const paths = { Schedule: 'work-schedules', Shift: 'shifts', Policy: 'policies' } as const

/** Consume the three Attendance configuration families through exact version paths and retained retry keys. */
@Injectable({ providedIn: 'root' })
export class WorkSchedulesApi {
	private readonly http = inject(HttpClient)
	/** Inspect only stored dated evidence; this GET never starts resolution. */
	workdays(query: AttendanceWorkdayQuery) {
		return this.http
			.get<WorkdayPage>('/api/v1/attendance/workdays', {
				params: new HttpParams()
					.set('employmentId', query.employmentId)
					.set('from', query.from)
					.set('to', query.to),
			})
			.pipe(timeout(15000))
	}
	/** Preserve one closed family-to-route mapping for every source operation. */
	private base(family: WorkConfigurationKind): string {
		return `/api/v1/attendance/${paths[family]}`
	}
	/** Encode opaque version identity separately from the owning root. */
	private versionPath(
		source: Pick<WorkConfigurationView, 'id' | 'versionId'>,
		family: WorkConfigurationKind,
	): string {
		return `${this.base(family)}/${encodeURIComponent(source.id)}/versions/${encodeURIComponent(source.versionId)}`
	}
	/** Read the same persisted incomplete weekly proposal used by Templates. */
	defaults() {
		return this.http
			.get<ScheduleSeedDefaults>(`${this.base('Schedule')}/defaults`)
			.pipe(timeout(15000))
	}
	/** Read a server-owned page without sorting a partial collection in the browser. */
	list<F extends WorkConfigurationKind = 'Schedule'>(
		query: ScheduleListQuery,
		family: F = 'Schedule' as F,
	) {
		let params = new HttpParams()
			.set('limit', query.limit)
			.set('sort', `${query.sort}:${query.direction}`)
		for (const field of ['code', 'name', 'state', 'id', 'cursor'] as const)
			if (query[field]) params = params.set(field, query[field])
		return this.http
			.get<{ items: WorkConfigurationViews[F][]; nextCursor: string | null }>(this.base(family), {
				params,
			})
			.pipe(timeout(15000))
	}
	/** A missing version resolves only the authorized latest row before reading its exact version. */
	detail<F extends WorkConfigurationKind = 'Schedule'>(
		id: string,
		version?: string,
		family: F = 'Schedule' as F,
	): Observable<WorkConfigurationViews[F]> {
		if (version)
			return this.http
				.get<WorkConfigurationViews[F]>(this.versionPath({ id, versionId: version }, family))
				.pipe(timeout(15000))
		return this.list({ id, limit: 1, sort: 'id', direction: 'asc' }, family).pipe(
			switchMap(
				/** Refuse ambiguous or unavailable identities instead of guessing a version. */ (page) => {
					if (page.items.length !== 1) throw new Error('Configuration unavailable')
					return this.detail(id, page.items[0].versionId, family)
				},
			),
		)
	}
	/** Create a complete draft without publication or assignment side effects. */
	create<F extends WorkConfigurationKind = 'Schedule'>(
		body: WorkConfigurationDrafts[F],
		key: string,
		family: F = 'Schedule' as F,
	) {
		return this.http
			.post<WorkConfigurationViews[F]>(this.base(family), body, {
				headers: { 'Idempotency-Key': key },
			})
			.pipe(timeout(15000))
	}
	/** Replace only the loaded draft revision. */
	update<F extends WorkConfigurationKind = 'Schedule'>(
		source: WorkConfigurationViews[F],
		body: WorkConfigurationDrafts[F],
		key: string,
		family: F = 'Schedule' as F,
	) {
		return this.http
			.patch<WorkConfigurationViews[F]>(
				this.versionPath(source, family),
				{ ...body, expectedRevision: source.revision },
				{ headers: { 'Idempotency-Key': key } },
			)
			.pipe(timeout(15000))
	}
	/** Create an editable successor while preserving the immutable source. */
	version<F extends WorkConfigurationKind = 'Schedule'>(
		id: string,
		body: AttendanceVersionCommand,
		key: string,
		family: F = 'Schedule' as F,
	) {
		return this.http
			.post<WorkConfigurationViews[F]>(
				`${this.base(family)}/${encodeURIComponent(id)}/versions`,
				body,
				{ headers: { 'Idempotency-Key': key } },
			)
			.pipe(timeout(15000))
	}
	/** Queue proposed dated use validation against real employment facts. */
	preview(
		source: WorkConfigurationView,
		body: DatedConfigurationPreviewCommand,
		key: string,
		family: 'Schedule' | 'Shift' = 'Schedule',
	) {
		return this.command<DatedConfigurationPreviewView>(source, 'preview', body, key, family)
	}
	/** Review a complete unassigned policy without applying it to live workdays. */
	policyPreview(
		source: AttendancePolicyVersionView,
		body: ConfigurationPreviewCommand,
		key: string,
	) {
		return this.command<ConfigurationPreviewView<'Policy'>>(source, 'preview', body, key, 'Policy')
	}
	/** Refresh real durable validation status; a Running review cannot authorize publication. */
	previewStatus(
		source: WorkConfigurationView,
		previewId: string,
		family: 'Schedule' | 'Shift' = 'Schedule',
	) {
		return this.http
			.get<DatedConfigurationPreviewView>(
				`${this.versionPath(source, family)}/previews/${encodeURIComponent(previewId)}`,
			)
			.pipe(timeout(15000))
	}
	/** Publish only the exact reviewed source revision and digest. */
	publish(
		source: WorkConfigurationView,
		body: ConfigurationPublishCommand,
		key: string,
		family: WorkConfigurationKind = 'Schedule',
	) {
		return this.command<ConfigurationCommandResult>(source, 'publish', body, key, family)
	}
	/** Retire an exact source while retaining assigned and historical version identity. */
	retire(
		source: WorkConfigurationView,
		body: ConfigurationReasonCommand,
		key: string,
		family: WorkConfigurationKind = 'Schedule',
	) {
		return this.command<ConfigurationCommandResult>(source, 'retire', body, key, family)
	}
	/** Apply consistent retry and timeout handling to explicit source commands. */
	private command<T>(
		source: WorkConfigurationView,
		action: string,
		body: unknown,
		key: string,
		family: WorkConfigurationKind,
	) {
		return this.http
			.post<T>(`${this.versionPath(source, family)}/${action}`, body, {
				headers: { 'Idempotency-Key': key },
			})
			.pipe(timeout(30000))
	}
	/** Search minimal dated Workforce selectors under Work Schedules read authority. */
	referenceOptions(kind: HolidayReferenceKind, q: string, asOf: string) {
		return this.http
			.get<HolidayReferenceOptions>(`${this.base('Schedule')}/references/${kind}`, {
				params: new HttpParams().set('q', q).set('asOf', asOf),
			})
			.pipe(timeout(15000))
	}
	/** Reuse the same scoped options for assignment selection. */
	assignmentReferences(kind: HolidayReferenceKind, q: string, asOf: string) {
		return this.referenceOptions(kind, q, asOf)
	}
	/** Preserve distinct employments and dated assignments without exposing private HR facts. */
	assignmentContext(worker: string, asOf: string) {
		return this.http
			.get<HolidayAssignmentOptions>(
				`${this.base('Schedule')}/references/workers/${encodeURIComponent(worker)}/context`,
				{ params: new HttpParams().set('asOf', asOf) },
			)
			.pipe(timeout(15000))
	}
	/** Keep the publication picker limited to employment identity and legal-entity labels. */
	employmentOptions(worker: string, asOf: string) {
		return this.assignmentContext(worker, asOf).pipe(
			map(
				/** Omit assignment choices when only an employment is needed. */ (
					context,
				): HolidayEmploymentOptions => ({ employments: context.employments }),
			),
		)
	}
	/** Read the current exact scope/date assignment without scheduling background work. */
	currentAssignment(
		target: AttendanceScopeTarget,
		asOf: string,
		family: 'Schedule' | 'Policy' = 'Schedule',
	) {
		let params = new HttpParams().set('kind', target.kind).set('asOf', asOf)
		if (target.kind !== 'Tenant') params = params.set('id', target.id)
		return this.http
			.get<WorkAssignmentView | null>(
				`/api/v1/attendance/${family === 'Schedule' ? 'schedule' : 'policy'}-assignments`,
				{ params },
			)
			.pipe(timeout(15000))
	}
	/** Submit the explicit dated assignment and expose queued resolution separately from its result. */
	assign(
		body: import('@empflowyee/hcm-attendance-contract').ReviewedWorkAssignmentCommand,
		key: string,
		family: 'Schedule' | 'Policy' = 'Schedule',
	) {
		return this.http
			.post<WorkAssignmentResult>(
				`/api/v1/attendance/${family === 'Schedule' ? 'schedule' : 'policy'}-assignments`,
				body,
				{ headers: { 'Idempotency-Key': key } },
			)
			.pipe(timeout(30000))
	}
	/** Review an explicit assignment without persisting candidate coverage or workday intents. */
	previewAssignment(body: WorkAssignmentCommand, key: string, family: 'Schedule' | 'Policy') {
		return this.http
			.post<import('@empflowyee/hcm-attendance-contract').WorkAssignmentReview>(
				`/api/v1/attendance/${family === 'Schedule' ? 'schedule' : 'policy'}-assignments/preview`,
				body,
				{ headers: { 'Idempotency-Key': key } },
			)
			.pipe(timeout(30000))
	}
}
