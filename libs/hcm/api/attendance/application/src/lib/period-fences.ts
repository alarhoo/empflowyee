import { Temporal } from '@js-temporal/polyfill'
import { dateValue, invalidField } from '@empflowyee/hcm-runtime-contract'

export interface AttendancePeriodMonth {
	monthStart: string
	period: null | {
		id: string
		revision: number
		state: 'Planned' | 'Open' | 'Closing' | 'Locked' | 'Reopened'
		currentLockId: string | null
	}
}
export interface AttendancePeriodBasis {
	months: AttendancePeriodMonth[]
	digest: string
}
export interface AttendancePeriodFencePort {
	/** Snapshot every inclusive month, explicitly preserving absent periods for preview invalidation. */
	read(from: string, to: string): Promise<AttendancePeriodBasis>
	/** Hold shared monthly fences until the caller commits; re-read under the fence before publication. */
	fence(from: string, to: string): Promise<AttendancePeriodBasis>
}
export abstract class AttendancePeriodFenceBinder {
	/** Bind only the caller's authorized tenant transaction; period state never grants source permissions. */
	abstract bind(transaction: unknown, tenantId: string): AttendancePeriodFencePort
}

/** Enumerate ascending calendar months over the approved bounded preview range, independent of UTC offsets and server locale. */
export function attendancePeriodMonths(from: string, to: string): string[] {
	dateValue(from, 'from')
	dateValue(to, 'to')
	const start = Temporal.PlainDate.from(from),
		end = Temporal.PlainDate.from(to)
	if (Temporal.PlainDate.compare(start, end) > 0 || start.until(end).days > 365) invalidField('to')
	let month = start.with({ day: 1 })
	const result: string[] = []
	while (Temporal.PlainDate.compare(month, end) <= 0) {
		result.push(month.toString())
		if (month.year === 9999 && month.month === 12) break
		month = month.add({ months: 1 })
	}
	return result
}
