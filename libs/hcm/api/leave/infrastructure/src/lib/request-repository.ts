import { randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { Temporal } from '@js-temporal/polyfill'
import type { BoundFieldCipher } from '@empflowyee/hcm-api-runtime-application'
import type { LeaveRequestDraftEvidence } from '@empflowyee/hcm-api-leave-application'
import {
	readLeaveRequestDay,
	type LeaveRequestView,
	type LeaveRequestDayInput,
} from '@empflowyee/hcm-leave-contract'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'

/** Format a persisted numeric endpoint offset without selecting an occurrence or depending on machine locale. */
function offsetText(seconds: number): string {
	const magnitude = Math.abs(seconds),
		hours = Math.floor(magnitude / 3600),
		minutes = Math.floor((magnitude % 3600) / 60),
		remainder = magnitude % 60
	return `${seconds < 0 ? '-' : '+'}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}${remainder ? ':' + String(remainder).padStart(2, '0') : ''}`
}

/** Persist and project only Leave-owned request rows inside the source-authorized tenant transaction. */
export class KyselyLeaveRequestRepository {
	/** Retain verified ownership and field encryption; this repository cannot authorize a person or create a session. */
	constructor(
		private readonly tx: Kysely<unknown>,
		private readonly tenant: string,
		private readonly actor: string,
		private readonly cipher: BoundFieldCipher,
	) {
		if (!tx.isTransaction) throw new Error('Leave requests require a tenant transaction')
	}
	/** Reject accidental reuse after the caller changes the transaction tenant. */
	private async requireTenant(): Promise<void> {
		const current = (
			await sql<{ tenant: string | null }>`SELECT hcm.current_tenant_id() AS tenant`.execute(
				this.tx,
			)
		).rows[0]
		if (current?.tenant !== this.tenant) throw new HcmDomainError('forbidden')
	}
	/** Reconstruct the safe contract without returning narrative, document IDs or encrypted eligibility evidence. */
	async read(id: string): Promise<LeaveRequestView | null> {
		await this.requireTenant()
		const root = (
			await sql<
				Omit<LeaveRequestView, 'days' | 'approvalProgress' | 'allowedActions'>
			>`SELECT id,revision,state,employment_id AS "employmentId",enrollment_id AS "enrollmentId",policy_version_id AS "policyVersionId",period_id AS "periodId",tracking_mode AS "trackingMode",total_units::text AS "totalUnits" FROM hcm.leave_request WHERE tenant_id=${this.tenant} AND id=${id}`.execute(
				this.tx,
			)
		).rows[0]
		if (!root) return null
		const rows = (
			await sql<{
				workDate: string
				portion: LeaveRequestDayInput['portion']
				startTime: string | null
				endTime: string | null
				startDayOffset: number | null
				endDayOffset: number | null
				startOffsetSeconds: number | null
				endOffsetSeconds: number | null
				workdayRevision: number
				zone: string
				scheduledMilliseconds: string
				requestedMilliseconds: string
				units: string
			}>`SELECT work_date::text AS "workDate",portion,to_char(work_date+start_time,'HH24:MI:SS.MS') AS "startTime",to_char(work_date+end_time,'HH24:MI:SS.MS') AS "endTime",start_day_offset AS "startDayOffset",end_day_offset AS "endDayOffset",start_offset_seconds AS "startOffsetSeconds",end_offset_seconds AS "endOffsetSeconds",workday_revision AS "workdayRevision",zone,scheduled_milliseconds::text AS "scheduledMilliseconds",requested_milliseconds::text AS "requestedMilliseconds",units::text FROM hcm.leave_request_day WHERE tenant_id=${this.tenant} AND request_id=${id} ORDER BY work_date`.execute(
				this.tx,
			)
		).rows
		return {
			...root,
			approvalProgress: null,
			allowedActions: [],
			days: rows.map(
				/** Map the explicit safe day fields and retain optional DST choices. */ (row) => {
					const offset = {
						...(row.startOffsetSeconds !== null
							? { start: offsetText(row.startOffsetSeconds) }
							: {}),
						...(row.endOffsetSeconds !== null ? { end: offsetText(row.endOffsetSeconds) } : {}),
					}
					return {
						input: readLeaveRequestDay({
							workDate: row.workDate,
							portion: row.portion,
							...(row.portion === 'Hourly'
								? {
									startTime: row.startTime,
									endTime: row.endTime,
									startDayOffset: row.startDayOffset,
									endDayOffset: row.endDayOffset,
									...(Object.keys(offset).length ? { offset } : {}),
								}
								: {}),
						}),
						workdayRevision: row.workdayRevision,
						zone: row.zone,
						scheduledMilliseconds: row.scheduledMilliseconds,
						requestedMilliseconds: row.requestedMilliseconds,
						units: row.units,
					}
				},
			),
		}
	}
	/** Write one immutable Draft and all calculated intervals; database constraints reject partial or mixed-tenant evidence. */
	async insert(evidence: LeaveRequestDraftEvidence): Promise<LeaveRequestView> {
		await this.requireTenant()
		const { input, admission, calculation, id } = evidence
		const reason = await this.cipher.encrypt(
			{ table: 'leave_request', column: 'encrypted_reason', rowId: id },
			input.reason,
		)
		const basis = await this.cipher.encrypt(
			{ table: 'leave_request', column: 'encrypted_basis', rowId: id },
			JSON.stringify({
				admission,
				calculation,
				resolved: evidence.resolved,
				eligibility: evidence.eligibility,
			}),
		)
		const dates = input.days
			.map(
				/** Persist the inclusive bounds of the submitted explicit local dates. */ (day) =>
					day.workDate,
			)
			.sort()
		await sql`INSERT INTO hcm.leave_request(tenant_id,id,enrollment_id,employment_id,policy_version_id,period_id,tracking_mode,unit,start_date,end_date,total_units,calculation_digest,encrypted_reason,reason_key_version,encrypted_basis,basis_key_version,created_by_account_id)
VALUES(${this.tenant},${id},${input.enrollmentId},${input.employmentId},${admission.policy.versionId},${admission.period.id},${admission.policy.trackingMode},${admission.policy.unit},${dates[0]}::date,${dates[dates.length - 1]}::date,${calculation.units}::numeric,${calculation.digest},${reason.ciphertext},${reason.keyVersion},${basis.ciphertext},${basis.keyVersion},${this.actor})`.execute(
	this.tx,
)
		for (const day of input.days) {
			const source = evidence.sources.find(
				/** Match the exact source row used by the calculation. */ (row) =>
					row.workDate === day.workDate,
			)
			const calculated = calculation.days.find(
				/** Retain the corresponding rounded row without recomputation. */ (row) =>
					row.workDate === day.workDate,
			)
			const resolved = evidence.resolved.find(
				/** Recover the validated UTC window for an hourly row. */ (row) =>
					row.workDate === day.workDate,
			)?.request
			if (!source || !calculated || calculated.quantity.state !== 'Available' || !resolved)
				throw new HcmDomainError('record-incomplete')
			const quantity = calculated.quantity,
				dayId = randomUUID()
			const hourly =
				day.portion === 'Hourly' && resolved.portion === 'Hourly' ? { input: day, resolved } : null
			const startOffset =
				hourly?.input.offset?.start === undefined
					? null
					: Temporal.Instant.from(hourly.resolved.startInstant).toZonedDateTimeISO(source.zone)
						.offsetNanoseconds / 1_000_000_000
			const endOffset =
				hourly?.input.offset?.end === undefined
					? null
					: Temporal.Instant.from(hourly.resolved.endInstant).toZonedDateTimeISO(source.zone)
						.offsetNanoseconds / 1_000_000_000
			await sql`INSERT INTO hcm.leave_request_day(tenant_id,id,request_id,employment_id,work_date,portion,workday_id,workday_revision,workday_digest,zone,start_time,end_time,start_day_offset,end_day_offset,start_offset_seconds,end_offset_seconds,requested_start_at,requested_end_at,scheduled_milliseconds,requested_milliseconds,units)
VALUES(${this.tenant},${dayId},${id},${input.employmentId},${day.workDate}::date,${day.portion},${source.id},${source.revision},${source.digest},${source.zone},${hourly?.input.startTime ?? null}::time,${hourly?.input.endTime ?? null}::time,${hourly?.input.startDayOffset ?? null},${hourly?.input.endDayOffset ?? null},${startOffset},${endOffset},${hourly?.resolved.startInstant ?? null}::timestamptz,${hourly?.resolved.endInstant ?? null}::timestamptz,${quantity.scheduledMilliseconds}::bigint,${quantity.requestedMilliseconds}::bigint,${quantity.units}::numeric)`.execute(
	this.tx,
)
			for (const [index, interval] of quantity.intervals.entries())
				await sql`INSERT INTO hcm.leave_request_day_interval(tenant_id,day_id,request_id,ordinal,start_at,end_at) VALUES(${this.tenant},${dayId},${id},${index + 1},${interval.startInstant}::timestamptz,${interval.endInstant}::timestamptz)`.execute(
					this.tx,
				)
		}
		const result = await this.read(id)
		if (!result) throw new Error('Created Leave request unavailable')
		return result
	}
}
