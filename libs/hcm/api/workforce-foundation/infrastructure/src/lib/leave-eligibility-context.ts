import { createHash } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'
import {
	WorkforceLeaveEligibilityBinder,
	type WorkforceLeaveEligibilityPort,
	type WorkforceTimeContextBinder,
} from '@empflowyee/hcm-api-workforce-foundation-application'

/** Keep private eligibility facts in Workforce ownership rather than letting Leave query person rows or broad employee profiles. */
export class KyselyWorkforceLeaveEligibilityBinder extends WorkforceLeaveEligibilityBinder {
	/** Reuse the established dated employment projection and its complete revision digest. */
	constructor(private readonly time: WorkforceTimeContextBinder) {
		super()
	}
	/** Limit reads to an existing tenant transaction with a closed, purpose-specific field projection. */
	bind(transaction: unknown, tenantId: string): WorkforceLeaveEligibilityPort {
		const tx = transaction as Kysely<unknown>
		if (!tx?.isTransaction) throw new Error('Leave eligibility facts require a tenant transaction')
		idValue(tenantId, 'tenantId')
		const dates = this.time.bind(tx, tenantId)
		return {
			read: /** Bind person revision to the dated employment basis without exposing identity labels or unrelated protected fields. */ async (
				employmentId,
				workDate,
			) => {
				const current = await sql<{
					tenant: string | null
				}>`SELECT hcm.current_tenant_id() AS tenant`.execute(tx)
				if (current.rows[0]?.tenant !== tenantId) throw new HcmDomainError('forbidden')
				const dated = await dates.read(employmentId, workDate)
				if (dated.state === 'Unavailable') return dated
				const person = (
					await sql<{
						personRevision: number
						genderCode: string | null
					}>`SELECT p.revision AS "personRevision",p.gender_code AS "genderCode"
          FROM hcm.worker w JOIN hcm.person p ON p.tenant_id=w.tenant_id AND p.id=w.person_id
          WHERE w.tenant_id=${tenantId} AND w.id=${dated.context.workerId}`.execute(tx)
				).rows[0]
				if (!person) return { state: 'Unavailable', reason: 'incomplete-facts' }
				const inputDigest = createHash('sha256')
					.update(
						JSON.stringify({
							schemaVersion: 1,
							tenantId,
							workforceDigest: dated.context.inputDigest,
							...person,
						}),
					)
					.digest('hex')
				return { state: 'Available', context: { workforce: dated.context, ...person, inputDigest } }
			},
		}
	}
}
