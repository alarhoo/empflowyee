import {
	HcmDomainError,
	idValue,
	invalidField,
	type HcmPage,
} from '@empflowyee/hcm-runtime-contract'
import {
	parseScheduleListQuery,
	parseScheduleVersionQuery,
	type ScheduleListQuery,
	type ScheduleVersionView,
	type ScheduleSeedDefaults,
} from '@empflowyee/hcm-attendance-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import { AttendanceScheduleUnitOfWork, type ScheduleApplication } from './schedule-commands'

export interface ScheduleQueryRepository {
	/** Read the persisted incomplete draft proposal without treating it as a complete schedule. */
	defaults(): Promise<ScheduleSeedDefaults | null>
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

	/** Expose explicit database seed defaults with no browser fallback or invented placement/zone. */
	defaults(
		context: AuthenticatedHcmContext,
		params: URLSearchParams,
		app: ScheduleApplication = 'Templates',
	): Promise<ScheduleSeedDefaults> {
		for (const field of params.keys()) invalidField(field, 'unknown')
		return this.unit.execute(
			context,
			app,
			'read',
			false,
			/** Read and validate the authorized proposal's seven explicit weekdays. */ async (work) => {
				const value = await work.queries.defaults()
				if (!value || value.days.length !== 7) throw new HcmDomainError('record-incomplete')
				return value
			},
		)
	}

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
