import {
	parseIdentificationCountryQuery,
	parseIdentificationTypeQuery,
	type IdentificationTypeList,
	type ReferenceItemPage,
} from '@empflowyee/hcm-workforce-foundation-contract'
import type { HcmListQuery } from '@empflowyee/hcm-runtime-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type { WorkforceUnitOfWork } from './structure'

/** Read-only access to the global product identification-type catalogue. */
export interface IdentificationTypeRepository {
	/** Read the bounded catalogue sorted by name then code. */
	list(): Promise<IdentificationTypeList>
	/** Read one page of countries that issue at least one identification type. */
	countries(query: HcmListQuery): Promise<ReferenceItemPage>
}

const READ = 'identification-types.read'

/** Identification Types use cases; tenants view the product catalogue only (DEC-HCM2-016). */
export class IdentificationTypes {
	/** Bind the read use cases to the workforce unit of work. */
	constructor(private readonly unit: WorkforceUnitOfWork) {}

	/** Read the whole bounded product catalogue. */
	list(context: AuthenticatedHcmContext, params: URLSearchParams): Promise<IdentificationTypeList> {
		parseIdentificationTypeQuery(params)
		return this.unit.execute(context, READ, false, /** Read only. */ (w) => w.identification.list())
	}

	/** Read issuing countries for the country filter. */
	countries(context: AuthenticatedHcmContext, params: URLSearchParams): Promise<ReferenceItemPage> {
		const query = parseIdentificationCountryQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Read only. */ (w) => w.identification.countries(query),
		)
	}
}
