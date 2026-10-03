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
	DatedConfigurationPreviewCommand,
	DatedConfigurationPreviewView,
	DatedConfigurationFamily,
} from '@empflowyee/hcm-attendance-contract'
import {
	evaluateDatedConfigurationImpact,
	type DatedConfigurationPublicationPort,
	type DatedConfigurationVersion,
	type AttendanceLeaveImpactBinder,
} from '@empflowyee/hcm-api-attendance-application'
import type { WorkforceTimeContextBinder } from '@empflowyee/hcm-api-workforce-foundation-application'
import { KyselyAttendanceConfigurationInputBinder } from './configuration-inputs'
import { KyselyAttendancePeriodFenceBinder } from './period-fences'
import { KyselyDatedSource } from './dated-source'

interface PreviewRow {
	id: string
	family: DatedConfigurationFamily
	actor: string
	rootId: string
	versionId: string
	revision: number
	sourceDigest: string
	input: DatedConfigurationPreviewCommand
	view: DatedConfigurationPreviewView
}

/** Read a minimal typed projection; callers independently enforce actor/source or workload authority. */
async function previewRow(
	transaction: Kysely<unknown>,
	tenant: string,
	id: string,
): Promise<PreviewRow | null> {
	const rows =
		await sql<PreviewRow>`SELECT p.id,c.family,p.actor_account_id AS actor,coalesce(s.schedule_id,v.shift_id) AS "rootId",coalesce(p.work_schedule_version_id,p.shift_version_id) AS "versionId",p.source_revision AS revision,p.source_digest AS "sourceDigest",
jsonb_build_object('expectedRevision',p.source_revision,'effectiveFrom',p.from_date::text,'effectiveTo',p.to_date::text,'employmentId',c.employment_id) AS input,
(CASE WHEN l.preview_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('leaveImpact',jsonb_build_object('digest',l.digest,'affectedRequestCount',l.affected_request_count,'changedRequestCount',l.changed_request_count,'unavailableRequestCount',l.unavailable_request_count)) END || jsonb_build_object('previewId',p.id,'state',CASE WHEN p.expires_at<=clock_timestamp() AND p.state IN ('Running','Ready') THEN 'Expired' ELSE p.state END,'digest',p.result_digest,'affectedEmploymentCount',p.affected_employment_count,'affectedWorkdayCount',p.affected_workday_count,'conflicts',p.conflict_count,'lockedImpact',p.locked_impact,'failureCode',p.safe_failure_code,'expiresAt',to_char(p.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) AS view
FROM hcm.time_configuration_impact_preview p JOIN hcm.dated_configuration_publication_context c ON c.tenant_id=p.tenant_id AND c.preview_id=p.id LEFT JOIN hcm.work_schedule_version s ON s.tenant_id=p.tenant_id AND s.id=p.work_schedule_version_id LEFT JOIN hcm.shift_version v ON v.tenant_id=p.tenant_id AND v.id=p.shift_version_id
LEFT JOIN hcm.attendance_configuration_leave_impact l ON l.tenant_id=p.tenant_id AND l.preview_id=p.id
WHERE p.tenant_id=${tenant} AND p.id=${id}`.execute(transaction)
	const row = rows.rows[0]
	if (!row) return null
	return {
		...row,
		view: {
			...row.view,
			operationId: row.id,
			statusUrl: `/api/v1/attendance/${row.family === 'Schedule' ? 'work-schedules' : 'shifts'}/${encodeURIComponent(row.rootId)}/versions/${encodeURIComponent(row.versionId)}/previews/${encodeURIComponent(row.id)}`,
		},
	}
}

/** Persist previews in the existing actor-authorized transaction and enqueue work without an API loop. */
export class KyselyDatedConfigurationPreviews implements DatedConfigurationPublicationPort {
	/** Compose only owner ports against the current tenant transaction. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenant: string,
		private readonly actor: string,
		private readonly workforce: WorkforceTimeContextBinder,
		private readonly family: DatedConfigurationFamily,
		private readonly leave: AttendanceLeaveImpactBinder,
	) {}
	/** Admit one durable explicit-context review with stable source evidence and expiry. */
	async start(
		source: DatedConfigurationVersion,
		input: DatedConfigurationPreviewCommand,
	): Promise<DatedConfigurationPreviewView> {
		const facts = await this.workforce
			.bind(this.transaction, this.tenant)
			.read(input.employmentId, input.effectiveFrom)
		if (facts.state !== 'Available') throw new HcmDomainError('record-incomplete')
		const id = randomUUID()
		await sql`INSERT INTO hcm.time_configuration_impact_preview(tenant_id,id,actor_account_id,${sql.ref(this.family === 'Schedule' ? 'work_schedule_version_id' : 'shift_version_id')},source_revision,source_digest,from_date,to_date,state,input_revisions,expires_at)
VALUES(${this.tenant},${id},${this.actor},${source.versionId},${source.revision},${commandHash('DatedConfigurationSource', source)},${input.effectiveFrom}::date,${input.effectiveTo}::date,'Running',${JSON.stringify([{ sourceType: this.family, id: source.versionId, revision: source.revision }])}::jsonb,clock_timestamp()+interval '15 minutes')`.execute(
	this.transaction,
)
		await sql`INSERT INTO hcm.dated_configuration_publication_context(tenant_id,preview_id,employment_id,family) VALUES(${this.tenant},${id},${input.employmentId},${this.family})`.execute(
			this.transaction,
		)
		await enqueueHcmWork(this.transaction as Transaction<unknown>, this.tenant, {
			workload: 'AttendanceResolve',
			kind: 'attendance.configuration.preview',
			schemaVersion: 1,
			businessKey: id,
			payload: { previewId: id },
		})
		return this.read(source, id)
	}
	/** Hide another actor's or source's review rather than disclosing its existence. */
	async read(
		source: DatedConfigurationVersion,
		id: string,
	): Promise<DatedConfigurationPreviewView> {
		const row = await previewRow(this.transaction, this.tenant, id)
		if (!row) throw new HcmDomainError('not-found')
		if (
			row.family !== this.family ||
			row.actor !== this.actor ||
			row.versionId !== source.versionId ||
			row.rootId !== source.id
		)
			throw new HcmDomainError('not-found')
		return row.view
	}
	/** Recompute exact input evidence under current period fences before consuming the immutable result. */
	async consume(source: DatedConfigurationVersion, id: string, digest: string): Promise<void> {
		const view = await this.read(source, id),
			row = await previewRow(this.transaction, this.tenant, id)
		if (!row) throw new Error('Dated configuration preview intent has no matching context')
		if (
			view.state !== 'Ready' ||
			view.digest !== digest ||
			row.sourceDigest !== commandHash('DatedConfigurationSource', source)
		)
			throw new HcmDomainError('preview-stale')
		const result = await evaluateDatedConfigurationImpact(
			source,
			this.family,
			row.input,
			new KyselyAttendanceConfigurationInputBinder(this.workforce).bind(
				this.transaction,
				this.tenant,
			),
			this.workforce.bind(this.transaction, this.tenant),
			new KyselyAttendancePeriodFenceBinder().bind(this.transaction, this.tenant),
			this.leave.bind(this.transaction, this.tenant),
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

/** Run real dated schedule/shift validation in the shared worker's lease-fenced transaction. */
export class KyselyDatedConfigurationPreviewHandler implements HcmWorkHandler<WorkloadAuditTables> {
	readonly kind = 'attendance.configuration.preview'
	readonly schemaVersion = 1
	/** Keep Workforce reads behind their owner binder. */
	constructor(
		private readonly workforce: WorkforceTimeContextBinder,
		private readonly leave: AttendanceLeaveImpactBinder,
	) {}
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
			throw new Error('Unsupported dated configuration preview intent')
		const row = await previewRow(transaction as unknown as Kysely<unknown>, scope.tenantId, id)
		if (!row) throw new Error('Dated configuration preview intent has no matching context')
		if (row.view.state === 'Consumed' || row.view.state === 'Ready' || row.view.state === 'Failed')
			return
		if (row.view.state === 'Expired') {
			await sql`UPDATE hcm.time_configuration_impact_preview SET state='Expired',revision=revision+1 WHERE tenant_id=${scope.tenantId} AND id=${id} AND state='Running'`.execute(
				transaction,
			)
			return
		}
		const source = await new KyselyDatedSource(
			transaction as unknown as Kysely<unknown>,
			scope.tenantId,
			row.actor,
			row.family,
		).read(row.rootId, row.versionId)
		if (
			!source ||
			source.state !== 'Draft' ||
			('isTemplate' in source && source.isTemplate) ||
			commandHash('DatedConfigurationSource', source) !== row.sourceDigest
		) {
			await sql`UPDATE hcm.time_configuration_impact_preview SET state='Failed',safe_failure_code='SourceChanged',revision=revision+1 WHERE tenant_id=${scope.tenantId} AND id=${id} AND state='Running'`.execute(
				transaction,
			)
			return
		}
		const result = await evaluateDatedConfigurationImpact(
			source,
			row.family,
			row.input,
			new KyselyAttendanceConfigurationInputBinder(this.workforce).bind(
				transaction,
				scope.tenantId,
			),
			this.workforce.bind(transaction, scope.tenantId),
			new KyselyAttendancePeriodFenceBinder().bind(transaction, scope.tenantId),
			this.leave.bind(transaction, scope.tenantId),
		)
		requireWorkloadScope(context, 'AttendanceResolve')
		await sql`INSERT INTO hcm.attendance_configuration_leave_impact(tenant_id,preview_id,digest,affected_request_count,changed_request_count,unavailable_request_count)
VALUES(${scope.tenantId},${id},${result.leaveImpact.digest},${result.leaveImpact.affectedRequestCount},${result.leaveImpact.changedRequestCount},${result.leaveImpact.unavailableRequestCount})`.execute(
	transaction,
)
		await sql`UPDATE hcm.time_configuration_impact_preview SET state=${result.failureCode ? 'Failed' : 'Ready'},revision=revision+1,result_digest=${result.digest},affected_employment_count=${result.affectedEmploymentCount},affected_workday_count=${result.affectedWorkdayCount},conflict_count=${result.conflicts},locked_impact=${result.lockedImpact},safe_failure_code=${result.failureCode} WHERE tenant_id=${scope.tenantId} AND id=${id} AND state='Running'`.execute(
			transaction,
		)
	}
}
