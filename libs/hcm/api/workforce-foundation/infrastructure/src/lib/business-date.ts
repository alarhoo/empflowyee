import { sql, type Kysely } from 'kysely'
import { todayIn } from '@empflowyee/hcm-api-workforce-foundation-domain'

/** Resolve today's business date from the organisation profile, then the tenant default, then UTC. */
export async function organisationToday(
	executor: Kysely<unknown>,
	tenantId: string,
): Promise<string> {
	const row = (
		await sql<{
			zone: string | null
		}>`SELECT coalesce((SELECT default_time_zone FROM hcm.organisation_profile WHERE tenant_id=${tenantId}),(SELECT defaults->>'timezone' FROM hcm.tenant WHERE id=${tenantId})) AS zone`.execute(
			executor,
		)
	).rows[0]
	try {
		return todayIn(row?.zone ?? 'UTC')
	} catch {
		return todayIn('UTC')
	}
}
