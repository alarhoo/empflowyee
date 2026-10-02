import { randomUUID } from 'node:crypto'
import { sql, type Kysely, type Transaction } from 'kysely'
import { HcmDomainError, idValue, readBody } from '@empflowyee/hcm-runtime-contract'
import {
	commandHash,
	requireWorkloadScope,
	type HcmWorkloadContext,
	type ClaimedHcmWork,
} from '@empflowyee/hcm-api-runtime-application'
import { enqueueHcmWork, type HcmWorkHandler } from '@empflowyee/hcm-api-runtime-infrastructure'
import type { WorkloadAuditTables } from '@empflowyee/hcm-api-audit-infrastructure'
import type {
	HolidayPreviewCommand,
	HolidayPreviewView,
	HolidayVersionView,
} from '@empflowyee/hcm-attendance-contract'
import {
	evaluateHolidayImpact,
	type HolidayPublicationPort,
} from '@empflowyee/hcm-api-attendance-application'
import type { WorkforceTimeContextBinder } from '@empflowyee/hcm-api-workforce-foundation-application'
import { KyselyAttendancePeriodFenceBinder } from './period-fences'
import { KyselyHolidayRepository } from './holiday-repository'

interface PreviewRow {
	id: string
	actor: string
	rootId: string
	versionId: string
	revision: number
	sourceDigest: string
	input: HolidayPreviewCommand
	view: HolidayPreviewView
}

/** Read a minimal typed projection; callers independently enforce actor/source or workload authority. */
async function previewRow(
	transaction: Kysely<unknown>,
	tenant: string,
	id: string,
): Promise<PreviewRow | null> {
	const rows =
		await sql<PreviewRow>`SELECT p.id,p.actor_account_id AS actor,v.calendar_id AS "rootId",p.holiday_calendar_version_id AS "versionId",p.source_revision AS revision,p.source_digest AS "sourceDigest",
jsonb_build_object('expectedRevision',p.source_revision,'effectiveFrom',p.from_date::text,'effectiveTo',p.to_date::text,'employmentId',c.employment_id,'timezone',c.timezone) AS input,
jsonb_build_object('previewId',p.id,'state',CASE WHEN p.expires_at<=clock_timestamp() AND p.state IN ('Running','Ready') THEN 'Expired' ELSE p.state END,'digest',p.result_digest,'affectedEmploymentCount',p.affected_employment_count,'affectedWorkdayCount',p.affected_workday_count,'conflicts',p.conflict_count,'lockedImpact',p.locked_impact,'failureCode',p.safe_failure_code,'expiresAt',to_char(p.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) AS view
FROM hcm.time_configuration_impact_preview p JOIN hcm.holiday_publication_context c ON c.tenant_id=p.tenant_id AND c.preview_id=p.id JOIN hcm.holiday_calendar_version v ON v.tenant_id=p.tenant_id AND v.id=p.holiday_calendar_version_id
WHERE p.tenant_id=${tenant} AND p.id=${id}`.execute(transaction)
	const row = rows.rows[0]
	if (!row) return null
	return {
		...row,
		view: {
			...row.view,
			operationId: row.id,
			statusUrl: `/api/v1/attendance/holiday-calendars/${encodeURIComponent(row.rootId)}/versions/${encodeURIComponent(row.versionId)}/previews/${encodeURIComponent(row.id)}`,
		},
	}
}

/** Persist previews in the existing actor-authorized transaction and enqueue work without an API loop. */
export class KyselyHolidayPreviews implements HolidayPublicationPort {
	/** Compose only owner ports against the current tenant transaction. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenant: string,
		private readonly actor: string,
		private readonly workforce: WorkforceTimeContextBinder,
	) {}
	/** Admit one durable explicit-context review with stable source evidence and expiry. */
	async start(
		source: HolidayVersionView,
		input: HolidayPreviewCommand,
	): Promise<HolidayPreviewView> {
		const facts = await this.workforce
			.bind(this.transaction, this.tenant)
			.read(input.employmentId, input.effectiveFrom)
		if (facts.state !== 'Available') throw new HcmDomainError('record-incomplete')
		const id = randomUUID()
		await sql`INSERT INTO hcm.time_configuration_impact_preview(tenant_id,id,actor_account_id,holiday_calendar_version_id,source_revision,source_digest,from_date,to_date,state,input_revisions,expires_at)
VALUES(${this.tenant},${id},${this.actor},${source.versionId},${source.revision},${commandHash('HolidaySource', source)},${input.effectiveFrom}::date,${input.effectiveTo}::date,'Running',${JSON.stringify([{ sourceType: 'Holiday', id: source.versionId, revision: source.revision }])}::jsonb,clock_timestamp()+interval '15 minutes')`.execute(
	this.transaction,
)
		await sql`INSERT INTO hcm.holiday_publication_context(tenant_id,preview_id,employment_id,timezone) VALUES(${this.tenant},${id},${input.employmentId},${input.timezone})`.execute(
			this.transaction,
		)
		await enqueueHcmWork(this.transaction as Transaction<unknown>, this.tenant, {
			workload: 'AttendanceResolve',
			kind: 'attendance.holiday.preview',
			schemaVersion: 1,
			businessKey: id,
			payload: { previewId: id },
		})
		return this.read(source, id)
	}
	/** Hide another actor's or source's review rather than disclosing its existence. */
	async read(source: HolidayVersionView, id: string): Promise<HolidayPreviewView> {
		const row = await previewRow(this.transaction, this.tenant, id)
		if (!row) throw new HcmDomainError('not-found')
		if (row.actor !== this.actor || row.versionId !== source.versionId || row.rootId !== source.id)
			throw new HcmDomainError('not-found')
		return row.view
	}
	/** Recompute exact input evidence under current period fences before consuming the immutable result. */
	async consume(source: HolidayVersionView, id: string, digest: string): Promise<void> {
		const view = await this.read(source, id),
			row = await previewRow(this.transaction, this.tenant, id)
		if (!row) throw new Error('Holiday preview intent has no matching context')
		if (
			view.state !== 'Ready' ||
			view.digest !== digest ||
			row.sourceDigest !== commandHash('HolidaySource', source)
		)
			throw new HcmDomainError('preview-stale')
		const result = await evaluateHolidayImpact(
			source,
			row.input,
			this.workforce.bind(this.transaction, this.tenant),
			new KyselyAttendancePeriodFenceBinder().bind(this.transaction, this.tenant),
		)
		if (result.digest !== digest || result.conflicts || result.failureCode || result.lockedImpact)
			throw new HcmDomainError('preview-stale')
		const updated = await sql<{
			id: string
		}>`UPDATE hcm.time_configuration_impact_preview SET state='Consumed',revision=revision+1,consumed_at=clock_timestamp() WHERE tenant_id=${this.tenant} AND id=${id} AND actor_account_id=${this.actor} AND state='Ready' AND expires_at>clock_timestamp() AND result_digest=${digest} RETURNING id`.execute(
			this.transaction,
		)
		if (!updated.rows.length) throw new HcmDomainError('preview-stale')
	}
}

/** Run real dated holiday validation in the shared worker's lease-fenced transaction. */
export class KyselyHolidayPreviewHandler implements HcmWorkHandler<WorkloadAuditTables> {
	readonly kind = 'attendance.holiday.preview'
	readonly schemaVersion = 1
	/** Keep Workforce reads behind their owner binder. */
	constructor(private readonly workforce: WorkforceTimeContextBinder) {}
	/** Complete a durable review or retain a named failure; no worker can publish a calendar. */
	async execute(
		transaction: Transaction<WorkloadAuditTables>,
		context: HcmWorkloadContext,
		work: ClaimedHcmWork,
	): Promise<void> {
		const scope = requireWorkloadScope(context, 'AttendanceResolve')
		const input = readBody(work.payload, ['previewId']),
			id = idValue(input['previewId'], 'previewId')
		if (work.kind !== this.kind || work.schemaVersion !== 1)
			throw new Error('Unsupported holiday preview intent')
		const row = await previewRow(transaction as unknown as Kysely<unknown>, scope.tenantId, id)
		if (!row) throw new Error('Holiday preview intent has no matching context')
		if (row.view.state === 'Consumed' || row.view.state === 'Ready' || row.view.state === 'Failed')
			return
		if (row.view.state === 'Expired') {
			await sql`UPDATE hcm.time_configuration_impact_preview SET state='Expired',revision=revision+1 WHERE tenant_id=${scope.tenantId} AND id=${id} AND state='Running'`.execute(
				transaction,
			)
			return
		}
		const source = await new KyselyHolidayRepository(
			transaction as unknown as Kysely<unknown>,
			scope.tenantId,
			row.actor,
		).read(row.rootId, row.versionId)
		if (
			!source ||
			source.state !== 'Draft' ||
			commandHash('HolidaySource', source) !== row.sourceDigest
		) {
			await sql`UPDATE hcm.time_configuration_impact_preview SET state='Failed',safe_failure_code='SourceChanged',revision=revision+1 WHERE tenant_id=${scope.tenantId} AND id=${id} AND state='Running'`.execute(
				transaction,
			)
			return
		}
		const result = await evaluateHolidayImpact(
			source,
			row.input,
			this.workforce.bind(transaction, scope.tenantId),
			new KyselyAttendancePeriodFenceBinder().bind(transaction, scope.tenantId),
		)
		requireWorkloadScope(context, 'AttendanceResolve')
		await sql`UPDATE hcm.time_configuration_impact_preview SET state=${result.failureCode ? 'Failed' : 'Ready'},revision=revision+1,result_digest=${result.digest},affected_employment_count=${result.affectedEmploymentCount},affected_workday_count=${result.affectedWorkdayCount},conflict_count=${result.conflicts},locked_impact=${result.lockedImpact},safe_failure_code=${result.failureCode} WHERE tenant_id=${scope.tenantId} AND id=${id} AND state='Running'`.execute(
			transaction,
		)
	}
}
