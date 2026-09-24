import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type { AuditPage } from '@empflowyee/hcm-audit-contract'
@Injectable({ providedIn: 'root' })
export class AuditApi {
	private readonly http = inject(HttpClient)
	/** Submit only explicit server query controls through verified runtime HTTP context. */
	list(query: Record<string, string>) {
		let params = new HttpParams()
		for (const [key, value] of Object.entries(query)) if (value) params = params.set(key, value)
		return this.http.get<AuditPage>('/api/v1/audit/events', { params }).pipe(timeout(15000))
	}
}
