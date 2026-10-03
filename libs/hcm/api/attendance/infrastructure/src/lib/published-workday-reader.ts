import { sql, type Kysely } from 'kysely'
import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'
import {
	parseWorkdayQuery,
	type AttendanceWorkdayQuery,
	type WorkdayPage,
	type WorkdayView,
} from '@empflowyee/hcm-attendance-contract'
import {
	AssignedWorkdayResolver,
	AttendancePublishedWorkdayBinder,
	type AttendancePublishedWorkdayPort,
	type AttendanceConfigurationInputBinder,
} from '@empflowyee/hcm-api-attendance-application'
import { readStoredWorkdays } from './workday-queries'

/** Export current persisted workday evidence through the Attendance owner, keeping SQL and resolution details out of Leave. */
export class KyselyAttendancePublishedWorkdayBinder extends AttendancePublishedWorkdayBinder {
	/** Reuse the installed dated configuration resolver for stale-evidence detection. */
	constructor(private readonly inputs: AttendanceConfigurationInputBinder) {
		super()
	}
	/** Reject pool handles and bind only the caller's explicit tenant transaction. */
	bind(transaction: unknown, tenantId: string): AttendancePublishedWorkdayPort {
		const tx = transaction as Kysely<unknown>
		if (!tx?.isTransaction) throw new Error('Published workdays require a tenant transaction')
		idValue(tenantId, 'tenantId')
		return {
			read: /** Read real immutable rows and check their current dated source basis without writing or enqueueing anything. */ async (
				query: AttendanceWorkdayQuery,
			): Promise<WorkdayPage> => {
				const current = await sql<{
					tenant: string | null
				}>`SELECT hcm.current_tenant_id() AS tenant`.execute(tx)
				if (current.rows[0]?.tenant !== tenantId) throw new HcmDomainError('forbidden')
				const parsed = parseWorkdayQuery(
					new URLSearchParams({ employmentId: query.employmentId, from: query.from, to: query.to }),
				)
				const page = await readStoredWorkdays(tx, tenantId, parsed)
				const published = page.items.filter(
					/** Unavailable rows cannot be upgraded by calculation alone. */ (row) =>
						row.state === 'Published',
				)
				if (!published.length) return page
				const references = await sql<{
					id: string
					inputDigest: string
				}>`SELECT id,input_digest AS "inputDigest" FROM hcm.published_workday
          WHERE tenant_id=${tenantId} AND id IN (${sql.join(published.map(/** Bind exact already-projected row identities. */ (row) => row.id))})`.execute(
				tx,
			)
				const digests = new Map(
					references.rows.map(
						/** Keep source digest private to the owner port. */ (row) => [row.id, row.inputDigest],
					),
				)
				const resolver = new AssignedWorkdayResolver(this.inputs.bind(tx, tenantId), 366)
				const items: WorkdayView[] = []
				for (const row of page.items) {
					if (row.state !== 'Published') {
						items.push(row)
						continue
					}
					const resolved = await resolver.resolve(parsed.employmentId, row.workDate)
					if (resolved.state !== 'Available' || resolved.inputDigest !== digests.get(row.id))
						items.push({
							state: 'Unavailable',
							employmentId: row.employmentId,
							workDate: row.workDate,
							unavailableCode: resolved.state === 'Unavailable' ? resolved.reason : 'SourceChanged',
						})
					else items.push(row)
				}
				return { items, nextCursor: null }
			},
		}
	}
}
