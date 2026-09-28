import type { HcmPage } from '@empflowyee/hcm-runtime-contract'
import {
	parseHolidayListQuery,
	type HolidayListQuery,
	type HolidayVersionView,
} from '@empflowyee/hcm-attendance-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import { AttendanceHolidayUnitOfWork } from './holiday-commands'

export interface HolidayQueryRepository {
	/** Read latest versions before filters with actor/query/source-bound continuation. */
	list(query: HolidayListQuery): Promise<HcmPage<HolidayVersionView>>
}

/** Holiday list requests require the same fresh global read authority as exact-version reads. */
export class AttendanceHolidayQueries {
	/** Consume the owner transaction port, never database details. */
	constructor(private readonly unit: AttendanceHolidayUnitOfWork) {}
	/** Reject unsupported input before returning one server-ordered authorized page. */
	list(
		context: AuthenticatedHcmContext,
		params: URLSearchParams,
	): Promise<HcmPage<HolidayVersionView>> {
		const query = parseHolidayListQuery(params)
		return this.unit.execute(
			context,
			'read',
			false,
			/** Execute under current tenant-wide read authority. */ (work) => work.queries.list(query),
		)
	}
}
