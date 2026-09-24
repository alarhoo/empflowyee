import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	CatalogueEntry,
	CatalogueAccount,
	CatalogueDiscovery,
	Page,
} from '@empflowyee/hcm-access-control-contract'
@Injectable({ providedIn: 'root' })
export class CatalogueApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/access-control/catalogue'
	/** Load the explicitly bounded canonical inventory and verified tenant projection. */
	list() {
		return this.http.get<{ items: CatalogueEntry[] }>(this.base).pipe(timeout(15000))
	}
	/** Search real tenant account choices without downloading an unbounded business inventory. */
	accounts(q: string, cursor?: string) {
		return this.http
			.get<Page<CatalogueAccount>>(`${this.base}/accounts`, {
				params: { q, ...(cursor ? { cursor } : {}) },
			})
			.pipe(timeout(15000))
	}
	/** Select an explanation subject while retaining the current administrator session. */
	discovery(id: string) {
		return this.http
			.get<CatalogueDiscovery>(`${this.base}/accounts/${encodeURIComponent(id)}/discovery`)
			.pipe(timeout(15000))
	}
}
