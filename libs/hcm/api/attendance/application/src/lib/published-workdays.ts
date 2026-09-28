import type { DatedWorkdayIntervals } from '@empflowyee/hcm-api-attendance-domain'

/** Internal resolved source evidence; authorization and input/lease revalidation belong to the owning workload handler. */
export interface PublishedWorkdayInput {
	employmentId: string
	scheduleVersionId: string
	policyVersionId: string | null
	holidayCalendarVersionIds: readonly string[]
	inputDigest: string
	previous: null | { id: string; revision: number }
	resolution: DatedWorkdayIntervals
}
export interface PublishedWorkdayReference {
	id: string
	revision: number
	digest: string
	replayed: boolean
}
export interface PublishedWorkdayWriter {
	/** Append complete immutable evidence once under the caller's verified AttendanceResolve transaction. */
	append(input: PublishedWorkdayInput): Promise<PublishedWorkdayReference>
}
