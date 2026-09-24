import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	AccountSummary,
	SecuritySummary,
	SecurityRoles,
	DomainProjection,
	IdentityPage,
	PersonOption,
	CreateAccount,
	SetAccountEnabled,
} from '@empflowyee/hcm-identity-access-contract'
@Injectable({ providedIn: 'root' })
export class IdentityApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/identity-access'
	/** Read verified own-account fields without accepting an account selector. */
	security() {
		return this.http.get<SecuritySummary>(`${this.base}/me/security`).pipe(timeout(15000))
	}
	/** Query own role labels using server-owned search and continuation. */
	securityRoles(q: string, cursor?: string) {
		return this.http
			.get<SecurityRoles>(`${this.base}/me/security/roles`, {
				params: { q, ...(cursor ? { cursor } : {}) },
			})
			.pipe(timeout(15000))
	}
	/** Read the current tenant hostname projection without accepting a tenant override. */
	domains() {
		return this.http.get<DomainProjection>(`${this.base}/domains`).pipe(timeout(15000))
	}
	/** Fetch only server-filtered persisted accounts in the verified runtime context. */
	list(query: { q: string; enabled: string; sort: string; cursor?: string }) {
		let params = new HttpParams().set('q', query.q).set('sort', query.sort)
		if (query.enabled) params = params.set('enabled', query.enabled)
		if (query.cursor) params = params.set('cursor', query.cursor)
		return this.http
			.get<IdentityPage<AccountSummary>>(`${this.base}/accounts`, { params })
			.pipe(timeout(15000))
	}
	/** Read the selected account and latest shared revision. */
	get(id: string) {
		return this.http
			.get<AccountSummary>(`${this.base}/accounts/${encodeURIComponent(id)}`)
			.pipe(timeout(15000))
	}
	/** Query the approved read-only workforce person projection. */
	people(q: string, cursor?: string) {
		return this.http
			.get<IdentityPage<PersonOption>>(`${this.base}/account-person-options`, {
				params: { q, ...(cursor ? { cursor } : {}) },
			})
			.pipe(timeout(15000))
	}
	/** Create a credential-free account; role assignment remains a separate domain action. */
	create(body: CreateAccount, key: string) {
		return this.http
			.post<AccountSummary>(`${this.base}/accounts`, body, { headers: { 'Idempotency-Key': key } })
			.pipe(timeout(15000))
	}
	/** Enable or disable an account without changing its identity or roles. */
	enabled(id: string, body: SetAccountEnabled, key: string) {
		return this.http
			.post<AccountSummary>(`${this.base}/accounts/${encodeURIComponent(id)}/enabled`, body, {
				headers: { 'Idempotency-Key': key },
			})
			.pipe(timeout(15000))
	}
}
/** Show safe business classifications while keeping provider diagnostics out of the browser. */
export function identityErrorMessage(error: unknown): string {
	const code = error instanceof HttpErrorResponse ? error.error?.code : undefined
	const messages: Record<string, string> = {
		'invalid-request': 'Choose an existing person, a valid email and a reason of 1–500 characters.',
		'duplicate-email': 'An account already uses this email. Enter another email.',
		'revision-conflict':
			'This account changed. Your draft is preserved; cancel and reopen to load its current revision.',
		'protected-access': 'At least one enabled protected tenant administrator must remain.',
		'not-found': 'The account or person is no longer available.',
		forbidden: 'You no longer have permission for this operation.',
		unauthenticated: 'Your session is no longer available.',
		'idempotency-conflict':
			'This retry key belongs to another command. Cancel and reopen the action.',
	}
	return typeof code === 'string' && messages[code]
		? messages[code]
		: 'The operation could not be completed. Retry safely with the same draft.'
}
