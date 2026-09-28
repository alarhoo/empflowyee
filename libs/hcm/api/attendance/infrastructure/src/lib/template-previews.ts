import { randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'
import { commandHash } from '@empflowyee/hcm-api-runtime-application'
import type {
	ConfigurationInputRevision,
	ConfigurationPreviewCommand,
	ConfigurationPreviewView,
	ScheduleVersionView,
} from '@empflowyee/hcm-attendance-contract'
import type { TemplatePreviewRepository } from '@empflowyee/hcm-api-attendance-application'

/** Actor-bound reusable pattern evidence; no dated workforce or live-assignment result is manufactured. */
export class KyselyTemplatePreviews implements TemplatePreviewRepository {
	/** Use only the authorized caller transaction and its established actor identity. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenantId: string,
		private readonly accountId: string,
	) {}

	/** Store a structurally validated template with a 15-minute technical preview lifetime. */
	async create(
		source: ScheduleVersionView,
		range: ConfigurationPreviewCommand,
		sourceDigest: string,
	): Promise<ConfigurationPreviewView> {
		if (!source.isTemplate || source.state !== 'Draft') throw new HcmDomainError('invalid-state')
		const previewId = randomUUID()
		const inputRevisions: ConfigurationInputRevision[] = [
			{ sourceType: 'Schedule', id: source.versionId, revision: source.revision },
		]
		const digest = commandHash('TemplatePreview', {
			tenant: this.tenantId,
			actor: this.accountId,
			previewId,
			sourceDigest,
			range,
			inputRevisions,
			affectedEmploymentCount: 0,
			affectedWorkdayCount: 0,
			conflicts: 0,
			lockedImpact: false,
		})
		const result = await sql<{ expiresAt: Date }>`
INSERT INTO hcm.time_configuration_impact_preview(tenant_id,id,actor_account_id,work_schedule_version_id,source_revision,source_digest,from_date,to_date,state,input_revisions,result_digest,affected_employment_count,affected_workday_count,conflict_count,locked_impact,expires_at)
VALUES(${this.tenantId},${previewId},${this.accountId},${source.versionId},${source.revision},${sourceDigest},${range.effectiveFrom}::date,${range.effectiveTo}::date,'Ready',${JSON.stringify(inputRevisions)}::jsonb,${digest},0,0,0,false,clock_timestamp()+interval '15 minutes')
RETURNING expires_at AS "expiresAt"
`.execute(this.transaction)
		return {
			previewId,
			digest,
			state: 'Ready',
			inputRevisions,
			affectedEmploymentCount: 0,
			affectedWorkdayCount: 0,
			conflicts: 0,
			lockedImpact: false,
			expiresAt: result.rows[0].expiresAt.toISOString(),
		}
	}

	/** Consume under the caller's source lock, matching every immutable input and rejecting expired or another actor's evidence uniformly. */
	async consume(
		previewId: string,
		source: ScheduleVersionView,
		sourceDigest: string,
		digest: string,
	): Promise<void> {
		if (!source.isTemplate || source.state !== 'Draft') throw new HcmDomainError('invalid-state')
		const inputs: ConfigurationInputRevision[] = [
			{ sourceType: 'Schedule', id: source.versionId, revision: source.revision },
		]
		try {
			const result = await sql<{ id: string }>`
UPDATE hcm.time_configuration_impact_preview SET state='Consumed',revision=revision+1,consumed_at=clock_timestamp()
WHERE tenant_id=${this.tenantId} AND id=${previewId} AND actor_account_id=${this.accountId}
  AND work_schedule_version_id=${source.versionId} AND source_revision=${source.revision} AND source_digest=${sourceDigest}
  AND result_digest=${digest} AND input_revisions=${JSON.stringify(inputs)}::jsonb
  AND state='Ready' AND expires_at>clock_timestamp() AND conflict_count=0 AND NOT locked_impact
  AND affected_employment_count=0 AND affected_workday_count=0
  AND from_date>=${source.effectiveFrom}::date AND (${source.effectiveTo ?? null}::date IS NULL OR to_date<=${source.effectiveTo ?? null}::date)
RETURNING id
`.execute(this.transaction)
			if (!result.rows.length) throw new HcmDomainError('preview-stale')
		} catch (error) {
			// The lifecycle trigger repeats expiry/source checks at the SQL boundary.
			if ((error as { code?: string })?.code === '23514') throw new HcmDomainError('preview-stale')
			throw error
		}
	}
}
