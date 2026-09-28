import { HcmDomainError, idValue, type HcmPage } from '@empflowyee/hcm-runtime-contract'
import {
	parseScheduleListQuery,
	parseScheduleVersionQuery,
	type ScheduleListQuery,
	type ScheduleVersionView,
} from '@empflowyee/hcm-attendance-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import { AttendanceScheduleUnitOfWork, type ScheduleApplication } from './schedule-commands'

export interface ScheduleQueryRepository {
	/** Read latest versions with current source/authority-bound continuation. */
	list(app: ScheduleApplication, query: ScheduleListQuery): Promise<HcmPage<ScheduleVersionView>>
	/** Read a selected root's exact version, or its latest version when explicitly omitted on GET. */
	detail(
		app: ScheduleApplication,
		ownerId: string,
		versionId?: string,
	): Promise<ScheduleVersionView | null>
}

/** Read use cases establish current authority before any row selection, pagination or count. */
export class AttendanceScheduleQueries {
	/** Consume the same tenant authorization boundary as configuration commands. */
	constructor(private readonly unit: AttendanceScheduleUnitOfWork) {}

	/** Parse the exact server-owned list contract and return an authorized continuation page. */
	list(
		context: AuthenticatedHcmContext,
		app: ScheduleApplication,
		params: URLSearchParams,
	): Promise<HcmPage<ScheduleVersionView>> {
		const query = parseScheduleListQuery(params)
		return this.unit.execute(
			context,
			app,
			'read',
			false,
			/** Read only within the current tenant-wide operation grant. */ (work) =>
				work.queries.list(app, query),
		)
	}

	/** Hide missing, foreign-tenant and wrong-family identities uniformly. */
	detail(
		context: AuthenticatedHcmContext,
		app: ScheduleApplication,
		ownerId: string,
		params: URLSearchParams,
	): Promise<ScheduleVersionView> {
		idValue(ownerId, 'id')
		const versionId = parseScheduleVersionQuery(params)
		return this.unit.execute(
			context,
			app,
			'read',
			false,
			/** Select the requested version after fresh read authorization. */ async (work) => {
				const result = await work.queries.detail(app, ownerId, versionId)
				if (!result) throw new HcmDomainError('not-found')
				return result
			},
		)
	}
}
