import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	AssignmentSummary,
	AssignmentRole,
	AssignmentRoleOption,
	AssignmentCommand,
	Page,
} from '@empflowyee/hcm-access-control-contract'
@Injectable({ providedIn: 'root' })
export class AssignmentApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/access-control'
	/** Fetch a server-owned account page; browser fixtures and cached tenant inventories are not used. */
	list(query: { q: string; enabled: string; sort: string; cursor?: string }) {
		let params = new HttpParams().set('q', query.q).set('sort', query.sort)
		if (query.enabled) params = params.set('enabled', query.enabled)
		if (query.cursor) params = params.set('cursor', query.cursor)
		return this.http
			.get<Page<AssignmentSummary>>(`${this.base}/assignments`, { params })
			.pipe(timeout(15000))
	}
	/** Resolve fresh account details and the current optimistic revision. */
	get(id: string) {
		return this.http
			.get<AssignmentSummary>(`${this.base}/assignments/${encodeURIComponent(id)}`)
			.pipe(timeout(15000))
	}
	/** Continue the selected account's bounded role collection. */
	roles(id: string, cursor: string) {
		return this.http
			.get<Page<AssignmentRole>>(`${this.base}/assignments/${encodeURIComponent(id)}/roles`, {
				params: { cursor },
			})
			.pipe(timeout(15000))
	}
	/** Query role choices on the server under assignment-management authority. */
	options(q: string, cursor?: string) {
		return this.http
			.get<Page<AssignmentRoleOption>>(`${this.base}/assignment-role-options`, {
				params: { q, ...(cursor ? { cursor } : {}) },
			})
			.pipe(timeout(15000))
	}
	/** Send exactly one grant/revoke; verified persona headers remain runtime infrastructure's responsibility. */
	command(id: string, operation: 'grant' | 'revoke', body: AssignmentCommand, key: string) {
		return this.http
			.post<AssignmentSummary>(
				`${this.base}/assignments/${encodeURIComponent(id)}/${operation}`,
				body,
				{ headers: { 'Idempotency-Key': key } },
			)
			.pipe(timeout(15000))
	}
}
/** Render stable business classifications without displaying arbitrary provider diagnostics. */
export function assignmentErrorMessage(error: unknown): string {
	const code = error instanceof HttpErrorResponse ? error.error?.code : undefined
	const messages: Record<string, string> = {
		'invalid-request': 'Choose a registered role and enter a reason of 1–500 characters.',
		'revision-conflict':
			'This account changed. Your draft is preserved; cancel and reopen the action to load its current revision.',
		'duplicate-grant': 'This account already has that role.',
		'grant-conflict': 'This assignment changed. Cancel and reload the account before continuing.',
		'protected-access': 'At least one enabled protected tenant administrator must remain.',
		'not-found': 'The account or role is no longer available.',
		forbidden: 'You no longer have permission for this operation.',
		unauthenticated: 'Your session is no longer available.',
		'idempotency-conflict':
			'This retry key belongs to a different command. Cancel and reopen the action.',
	}
	return typeof code === 'string' && messages[code]
		? messages[code]
		: 'The operation could not be completed. Retry safely with the same draft.'
}
