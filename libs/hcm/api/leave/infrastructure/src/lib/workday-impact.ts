import { sql, type Kysely } from 'kysely'
import { Temporal } from '@js-temporal/polyfill'
import {
	AttendanceLeaveImpactBinder,
	type AttendanceLeaveImpactPort,
	type AttendanceLeaveImpactProposal,
} from '@empflowyee/hcm-api-attendance-application'
import {
	calculateLeaveDayBasis,
	resolveLeaveRequestPortion,
} from '@empflowyee/hcm-api-leave-domain'
import { commandHash } from '@empflowyee/hcm-api-runtime-application'
import {
	leaveUnitsScaled,
	type LeavePolicyDraft,
	type LeaveRequestDayInput,
} from '@empflowyee/hcm-leave-contract'
import { HcmDomainError, dateValue, idValue, invalidField } from '@empflowyee/hcm-runtime-contract'

interface ImpactRow {
	requestId: string
	revision: number
	state: string
	calculationDigest: string
	workDate: string
	zone: string
	portion: LeaveRequestDayInput['portion']
	startTime: string | null
	endTime: string | null
	startDayOffset: number | null
	endDayOffset: number | null
	startOffset: number | null
	endOffset: number | null
	units: string
	scheduled: string
	requested: string
	intervals: { startInstant: string; endInstant: string }[]
	unit: LeavePolicyDraft['unit']
	rounding: LeavePolicyDraft['rounding']
	allowHourly: boolean
	hourlyIncrementMinutes: number | null
}

/** Retain an explicitly recorded numeric UTC occurrence without selecting a replacement offset. */
function offset(seconds: number): string {
	const magnitude = Math.abs(seconds)
	return `${seconds < 0 ? '-' : '+'}${String(Math.floor(magnitude / 3600)).padStart(2, '0')}:${String(Math.floor((magnitude % 3600) / 60)).padStart(2, '0')}:${String(magnitude % 60).padStart(2, '0')}`
}

/** Compare semantic instants independently of PostgreSQL/Temporal textual UTC formatting. */
function intervalDigest(intervals: ImpactRow['intervals']): string {
	return commandHash(
		'LeaveImpactIntervals:1',
		intervals.map(
			/** Preserve exact ordered consumed intervals. */ (interval) => [
				Temporal.Instant.from(interval.startInstant).epochNanoseconds.toString(),
				Temporal.Instant.from(interval.endInstant).epochNanoseconds.toString(),
			],
		),
	)
}

/** Leave owns recalculation of its private request rows; Attendance receives counts and an opaque digest only. */
export class KyselyLeaveWorkdayImpactBinder extends AttendanceLeaveImpactBinder {
	/** Require a transaction with the exact tenant selected by the already authorized publication command. */
	bind(transaction: unknown, tenantId: string): AttendanceLeaveImpactPort {
		const tx = transaction as Kysely<unknown>
		if (!tx?.isTransaction) throw new Error('Leave impact requires a tenant transaction')
		idValue(tenantId, 'tenantId')
		return {
			review:
			/** Read and calculate actual retained Leave evidence without changing a request, reservation or ledger. */ async (
				proposal: AttendanceLeaveImpactProposal,
			) => {
				const current = await sql<{
					tenant: string | null
				}>`SELECT hcm.current_tenant_id() AS tenant`.execute(tx)
				if (current.rows[0]?.tenant !== tenantId) throw new HcmDomainError('forbidden')
				idValue(proposal.employmentId, 'employmentId')
				if (!proposal.days.length || proposal.days.length > 366) invalidField('days')
				const dates = proposal.days.map(
					/** Validate every explicit local date before SQL. */ (day) =>
						dateValue(day.workDate, 'workDate'),
				)
				if (new Set(dates).size !== dates.length) invalidField('days', 'duplicate')
				const rows = (
					await sql<ImpactRow>`
SELECT r.id AS "requestId",r.revision,r.state,r.calculation_digest AS "calculationDigest",
d.work_date::text AS "workDate",d.zone,d.portion,to_char(d.work_date+d.start_time,'HH24:MI:SS.MS') AS "startTime",to_char(d.work_date+d.end_time,'HH24:MI:SS.MS') AS "endTime",
d.start_day_offset AS "startDayOffset",d.end_day_offset AS "endDayOffset",d.start_offset_seconds AS "startOffset",d.end_offset_seconds AS "endOffset",
d.units::text,d.scheduled_milliseconds::text AS scheduled,d.requested_milliseconds::text AS requested,
(SELECT coalesce(jsonb_agg(jsonb_build_object('startInstant',i.start_at,'endInstant',i.end_at) ORDER BY i.ordinal),'[]'::jsonb) FROM hcm.leave_request_day_interval i WHERE i.tenant_id=d.tenant_id AND i.day_id=d.id) AS intervals,
p.unit,jsonb_build_object('scale',p.rounding_scale,'mode',p.rounding_mode) AS rounding,p.allow_hourly AS "allowHourly",p.hourly_increment_minutes AS "hourlyIncrementMinutes"
FROM hcm.leave_request r JOIN hcm.leave_request_day d ON d.tenant_id=r.tenant_id AND d.request_id=r.id
JOIN hcm.leave_policy_version p ON p.tenant_id=r.tenant_id AND p.id=r.policy_version_id
WHERE r.tenant_id=${tenantId} AND r.employment_id=${proposal.employmentId} AND d.work_date IN (${sql.join(dates.map(/** Bind dates as typed SQL parameters. */ (date) => sql`${date}::date`))})
ORDER BY r.id,d.work_date FOR SHARE OF p`.execute(tx)
				).rows
				const affected = new Set<string>(),
					changed = new Set<string>(),
					unavailable = new Set<string>()
				const evidence = []
				for (const row of rows) {
					affected.add(row.requestId)
					const proposed = proposal.days.find(
						/** Match this request's exact dated candidate. */ (day) =>
							day.workDate === row.workDate,
					)
					if (!proposed) throw new HcmDomainError('record-incomplete')
					let result: unknown = { state: 'Unavailable' }
					try {
						// Only Draft storage is currently admitted. Future lifecycle storage must supply its own impact disposition before publication.
						if (row.state !== 'Draft') throw new HcmDomainError('record-incomplete')
						const input =
							row.portion === 'Hourly'
								? {
									workDate: row.workDate,
									portion: 'Hourly' as const,
									startTime: row.startTime ?? '',
									endTime: row.endTime ?? '',
									startDayOffset: row.startDayOffset as 0 | 1,
									endDayOffset: row.endDayOffset as 0 | 1,
									...(row.startOffset !== null || row.endOffset !== null
										? {
											offset: {
												...(row.startOffset !== null
													? { start: offset(row.startOffset) }
													: {}),
												...(row.endOffset !== null ? { end: offset(row.endOffset) } : {}),
											},
										}
										: {}),
								}
								: { workDate: row.workDate, portion: row.portion }
						const portion = resolveLeaveRequestPortion(input, proposed.zone)
						if (portion.state !== 'Available') throw new HcmDomainError('record-incomplete')
						const quantity = calculateLeaveDayBasis(proposed.basis, portion.request, {
							unit: row.unit,
							rounding: row.rounding,
							allowHourly: row.allowHourly,
							...(row.hourlyIncrementMinutes !== null
								? { hourlyIncrementMinutes: row.hourlyIncrementMinutes }
								: {}),
						})
						result = quantity
						if (quantity.state !== 'Available') unavailable.add(row.requestId)
						else if (
							leaveUnitsScaled(quantity.units) !== leaveUnitsScaled(row.units) ||
								quantity.scheduledMilliseconds !== row.scheduled ||
								quantity.requestedMilliseconds !== row.requested ||
								proposed.zone !== row.zone ||
								intervalDigest(quantity.intervals) !== intervalDigest(row.intervals)
						)
							changed.add(row.requestId)
					} catch (error) {
						if (!(error instanceof HcmDomainError)) throw error
						unavailable.add(row.requestId)
					}
					evidence.push({
						requestId: row.requestId,
						revision: row.revision,
						state: row.state,
						calculationDigest: row.calculationDigest,
						workDate: row.workDate,
						result,
					})
				}
				return {
					digest: commandHash('LeaveWorkdayImpact:1', { proposal, evidence }),
					affectedRequestCount: affected.size,
					changedRequestCount: changed.size,
					unavailableRequestCount: unavailable.size,
				}
			},
		}
	}
}
