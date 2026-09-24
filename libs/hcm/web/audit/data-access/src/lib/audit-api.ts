import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	AuditPage,
	MyActivityPage,
	ExportPage,
	SensitiveAccessPage,
} from '@empflowyee/hcm-audit-contract'
@Injectable({ providedIn: 'root' })
export class AuditApi {
	private readonly http = inject(HttpClient)
	/** Query only the current account; the self endpoint rejects actor and tenant selectors. */
	activity(query: Record<string, string>) {
		let params = new HttpParams()
		for (const [key, value] of Object.entries(query)) if (value) params = params.set(key, value)
		return this.http
			.get<MyActivityPage>('/api/v1/audit/me/activity', { params })
			.pipe(timeout(15000))
	}

	/** Request current tenant export metadata through the verified runtime interceptor. */
	exports(query: Record<string, string>) {
		let params = new HttpParams()
		for (const [key, value] of Object.entries(query)) if (value) params = params.set(key, value)
		return this.http.get<ExportPage>('/api/v1/audit/exports', { params }).pipe(timeout(15000))
	}

	/** Read stream metadata with current verified tenant/persona context and bounded transport time. */
	sensitive(query: Record<string, string>) {
		let params = new HttpParams()
		for (const [key, value] of Object.entries(query)) if (value) params = params.set(key, value)
		return this.http
			.get<SensitiveAccessPage>('/api/v1/audit/sensitive-access', { params })
			.pipe(timeout(15000))
	}

	/** Submit only explicit server query controls through verified runtime HTTP context. */
	list(query: Record<string, string>) {
		let params = new HttpParams()
		for (const [key, value] of Object.entries(query)) if (value) params = params.set(key, value)
		return this.http.get<AuditPage>('/api/v1/audit/events', { params }).pipe(timeout(15000))
	}
}
