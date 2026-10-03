import {
	parseWorkdayQuery,
	type AttendanceWorkdayQuery,
	type WorkdayPage,
} from '@empflowyee/hcm-attendance-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'

export abstract class AttendanceWorkdayReadPort {
	/** Read only stored workday evidence after one current grant covers every dated subject. */
	abstract list(
		context: AuthenticatedHcmContext,
		query: AttendanceWorkdayQuery,
	): Promise<WorkdayPage>
}
/** Workday inspection is a read-only projection, never a hidden resolver or command producer. */
export class AttendanceWorkdayQueries {
	/** Consume the owning projection port without SQL or HTTP dependencies. */
	constructor(private readonly reads: AttendanceWorkdayReadPort) {}
	/** Require exact employment and bounded dates before reading any persisted evidence. */
	list(context: AuthenticatedHcmContext, params: URLSearchParams): Promise<WorkdayPage> {
		return this.reads.list(context, parseWorkdayQuery(params))
	}
}
