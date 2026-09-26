import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	IdentificationTypeList,
	ReferenceItemPage,
} from '@empflowyee/hcm-workforce-foundation-contract'

/** Read-only client for the product identification-type catalogue. */
@Injectable({ providedIn: 'root' })
export class IdentificationTypesApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/workforce-foundation/identification-types'

	/** Read the whole bounded catalogue; filtering happens in the browser. */
	list() {
		return this.http.get<IdentificationTypeList>(this.base).pipe(timeout(15000))
	}

	/** Read issuing countries (at most 100) for the country filter and display names. */
	countries() {
		return this.http
			.get<ReferenceItemPage>(`${this.base}/options/countries`, { params: { limit: 100 } })
			.pipe(timeout(15000))
	}
}
