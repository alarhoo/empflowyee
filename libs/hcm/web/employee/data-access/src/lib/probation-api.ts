import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	ProbationCasePage,
	ProbationOptionKind,
	ProbationOptionPage,
	ProbationReviewDto,
	ProbationReviewPage,
	ReviewerReviewDto,
	ReviewerReviewPage,
} from '@empflowyee/hcm-employee-contract'

const limit = 15000

/** Query parameters from defined values. */
function params(values: object, size = '25'): HttpParams {
	let result = new HttpParams().set('limit', size)
	for (const [name, value] of Object.entries(values))
		if (value) result = result.set(name, String(value))
	return result
}

/** Probation Management API for HR; the server remains the authority for every rule. */
@Injectable({ providedIn: 'root' })
export class ProbationManagementApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/employee/probation'

	/** An encoded review path. */
	private review(id: string): string {
		return `${this.base}/reviews/${encodeURIComponent(id)}`
	}

	/** One page of probation cases for a view. */
	cases(query: { view?: string; q?: string; cursor?: string }) {
		return this.http
			.get<ProbationCasePage>(`${this.base}/cases`, { params: params(query) })
			.pipe(timeout(limit))
	}

	/** One page of reviews. */
	reviews(query: { status?: string; reviewType?: string; cursor?: string }) {
		return this.http
			.get<ProbationReviewPage>(`${this.base}/reviews`, { params: params(query) })
			.pipe(timeout(limit))
	}

	/** One review. */
	read(id: string) {
		return this.http.get<ProbationReviewDto>(this.review(id)).pipe(timeout(limit))
	}

	/** Server-filtered options for scheduling and reviewer assignment. */
	options(kind: ProbationOptionKind, q: string, cursor?: string) {
		return this.http
			.get<ProbationOptionPage>(`${this.base}/options/${kind}`, {
				params: params({ q, cursor }, '50'),
			})
			.pipe(timeout(limit))
	}

	/** Schedule a review. */
	schedule(body: Record<string, unknown>, key: string) {
		return this.http
			.post<ProbationReviewDto>(`${this.base}/reviews`, body, {
				headers: { 'Idempotency-Key': key },
			})
			.pipe(timeout(limit))
	}

	/** Assign the reviewer, cancel, or decide a review. */
	command(
		id: string,
		operation: 'reviewer' | 'cancel' | 'decision',
		body: Record<string, unknown>,
		key: string,
	) {
		return this.http
			.post<ProbationReviewDto>(`${this.review(id)}/${operation}`, body, {
				headers: { 'Idempotency-Key': key },
			})
			.pipe(timeout(limit))
	}
}

/** Probation Review API for the assigned reviewer. */
@Injectable({ providedIn: 'root' })
export class ProbationReviewApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/employee/me/probation-reviews'

	/** One page of the reviewer's own reviews. */
	list(query: { status?: string; cursor?: string }) {
		return this.http
			.get<ReviewerReviewPage>(this.base, { params: params(query) })
			.pipe(timeout(limit))
	}

	/** One assigned review. */
	read(id: string) {
		return this.http
			.get<ReviewerReviewDto>(`${this.base}/${encodeURIComponent(id)}`)
			.pipe(timeout(limit))
	}

	/** Submit an assessment, superseding the current one. */
	assess(id: string, body: Record<string, unknown>, key: string) {
		return this.http
			.post<ReviewerReviewDto>(`${this.base}/${encodeURIComponent(id)}/assessments`, body, {
				headers: { 'Idempotency-Key': key },
			})
			.pipe(timeout(limit))
	}
}

/** Labels of probation command fields, for field errors. */
const PROBATION_FIELD_LABELS: Record<string, string> = {
	employmentId: 'Employee',
	reviewType: 'Review type',
	periodStart: 'Period start',
	periodEnd: 'Period end',
	dueDate: 'Due date',
	reviewerAccountId: 'Reviewer',
	outcome: 'Outcome',
	effectiveDate: 'Effective date',
	extendedProbationEndDate: 'Extended end date',
	evidenceReference: 'Evidence reference',
	reason: 'Reason',
	recommendation: 'Recommendation',
	overallRating: 'Overall rating',
	strengths: 'Strengths',
	concerns: 'Concerns',
	recommendationReason: 'Recommendation reason',
}

/** Messages of field-level codes, with a `{label}` placeholder. */
const PROBATION_FIELD_MESSAGES: Record<string, string> = {
	'too-long': 'An extension may end at most 90 days after the original probation end date.',
	'already-extended': 'This probation was already extended once; choose another outcome.',
	'not-later': 'The extended end date must be after the current probation end date.',
	'not-reviewer': 'Choose a person who can review probation.',
	unchanged: 'This person is already the reviewer.',
	duplicate: 'This employment already has an open Final review.',
	'not-in-probation': 'This employment is no longer in probation.',
	'before-hire': '{label} cannot be before the hire date.',
	'before-start': '{label} cannot be before the period start.',
	required: '{label} is required.',
	'not-allowed': '{label} applies to Extend only.',
}

/** A safe, specific message for a probation failure. */
export function probationErrorMessage(error: unknown): string {
	const body = error instanceof HttpErrorResponse ? error.error : undefined
	const code = body?.code
	const first = Array.isArray(body?.fieldErrors) ? body.fieldErrors[0] : undefined
	const field = typeof first?.field === 'string' ? (first.field as string) : ''
	const label = PROBATION_FIELD_LABELS[field] ?? field
	const specific =
		typeof first?.code === 'string' ? PROBATION_FIELD_MESSAGES[first.code] : undefined
	if (specific) return specific.replace('{label}', label || 'This value')
	const messages: Record<string, string> = {
		'invalid-request': label ? `Check ${label}.` : 'Check the highlighted fields.',
		'revision-conflict': 'This review changed. Your draft is preserved; reload before continuing.',
		'invalid-state': 'This review no longer allows that action. Reload its current state.',
		'idempotency-conflict': 'This retry belongs to another command. Reload before continuing.',
		forbidden: 'You do not have permission for this operation.',
		unauthenticated: 'Your session is no longer available.',
		'not-found': 'This review is no longer available.',
	}
	return typeof code === 'string' && messages[code]
		? messages[code]
		: 'The operation could not be completed. Retry safely with the same draft.'
}
