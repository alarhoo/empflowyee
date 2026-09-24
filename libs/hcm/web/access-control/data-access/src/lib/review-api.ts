import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	ReviewSummary,
	ReviewItem,
	ReviewCommand,
	ReviewCreate,
	Page,
} from '@empflowyee/hcm-access-control-contract'
@Injectable({ providedIn: 'root' })
export class ReviewApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/access-control/reviews'
	/** Fetch server-filtered review summaries without tenant-controlled browser parameters. */
	list(query: { q: string; status: string; sort: string; cursor?: string }) {
		let params = new HttpParams().set('q', query.q).set('sort', query.sort)
		if (query.status) params = params.set('status', query.status)
		if (query.cursor) params = params.set('cursor', query.cursor)
		return this.http.get<Page<ReviewSummary>>(this.base, { params }).pipe(timeout(15000))
	}
	/** Resolve the selected deep link independently from list pagination. */
	get(id: string) {
		return this.http
			.get<ReviewSummary>(`${this.base}/${encodeURIComponent(id)}`)
			.pipe(timeout(15000))
	}
	/** Load bounded historical snapshots with server-computed staleness. */
	items(id: string, decision: string, cursor?: string) {
		let params = new HttpParams()
		if (decision) params = params.set('decision', decision)
		if (cursor) params = params.set('cursor', cursor)
		return this.http
			.get<Page<ReviewItem>>(`${this.base}/${encodeURIComponent(id)}/items`, { params })
			.pipe(timeout(15000))
	}
	/** Create a real snapshot with a stable retry receipt key. */
	start(body: ReviewCreate, key: string) {
		return this.http
			.post<ReviewSummary>(this.base, body, { headers: { 'Idempotency-Key': key } })
			.pipe(timeout(15000))
	}
	/** Send one focused command; the server owns grant policy and all state transitions. */
	command(
		id: string,
		operation: 'decide' | 'refresh' | 'close',
		itemId: string | undefined,
		body: ReviewCommand,
		key: string,
	) {
		const target =
			operation === 'close' ? 'close' : `items/${encodeURIComponent(itemId ?? '')}/${operation}`
		return this.http
			.post<ReviewSummary | ReviewItem>(`${this.base}/${encodeURIComponent(id)}/${target}`, body, {
				headers: { 'Idempotency-Key': key },
			})
			.pipe(timeout(15000))
	}
}
/** Explain safe classifications without exposing provider diagnostics or discarding a draft. */
export function reviewErrorMessage(error: unknown): string {
	const code = error instanceof HttpErrorResponse ? error.error?.code : undefined
	const messages: Record<string, string> = {
		'invalid-request': 'Check the required fields and their limits.',
		'not-found': 'This review or snapshot is no longer available.',
		'revision-conflict':
			'The evidence changed. Your draft is preserved; cancel and reload before continuing.',
		'stale-snapshot':
			'The assignment changed. Refresh its snapshot and review the current evidence.',
		'pending-items': 'Decide every snapshot item before closing the review.',
		'closed-review': 'This review is closed and read-only.',
		'already-decided': 'This snapshot already has a decision. Reload to inspect current evidence.',
		'protected-access': 'At least one enabled protected tenant administrator must remain.',
		'grant-conflict': 'The assignment occurrence changed. Refresh the snapshot before deciding.',
		'idempotency-conflict':
			'This retry key belongs to another command. Cancel and reopen the action.',
		forbidden: 'You no longer have permission for this operation.',
		unauthenticated: 'Your session is no longer available.',
	}
	return typeof code === 'string' && messages[code]
		? messages[code]
		: 'The operation could not be completed. Retry safely with the same draft.'
}
