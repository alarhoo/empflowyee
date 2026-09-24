import { sql } from 'kysely'
import {
	DocumentError,
	type WorkerQuery,
	type WorkerChoice,
} from '@empflowyee/hcm-documents-contract'
import type { DocumentWorkforceReader } from '@empflowyee/hcm-api-documents-application'
import type { AuthorizedAccessWork } from '@empflowyee/hcm-api-access-control-infrastructure'
import { queryKey, after, page } from './document-pages'
export class KyselyDocumentWorkforce implements DocumentWorkforceReader {
	/** Bind the consumer projection to the existing verified tenant executor. */ constructor(
		private readonly scope: AuthorizedAccessWork,
	) {}
	/** Search literal display names/codes; never synthesize employees or accounts. */
	async listWorkers(query: WorkerQuery) {
		const binding = queryKey(this.scope, query, 'workers'),
			position = after(query.cursor, binding),
			search = '%' + query.q.replace(/[\\%_]/g, '\\$&') + '%'
		if (position && typeof position.position !== 'string')
			throw new DocumentError('invalid-request')
		const rows = (
			await sql<WorkerChoice>`SELECT w.id,p.display_name AS "displayName",w.worker_code AS "workerCode" FROM hcm.worker w JOIN hcm.person p ON p.tenant_id=w.tenant_id AND p.id=w.person_id WHERE w.tenant_id=${this.scope.actor.tenantId} ${query.q ? sql`AND (p.display_name ILIKE ${search} OR w.worker_code ILIKE ${search})` : sql``} ${position ? sql`AND (p.display_name COLLATE "C",w.id COLLATE "C")>(${position.position} COLLATE "C",${position.id} COLLATE "C")` : sql``} ORDER BY p.display_name COLLATE "C",w.id COLLATE "C" LIMIT ${query.limit + 1}`.execute(
				this.scope.transaction,
			)
		).rows
		return page(
			rows,
			query.limit,
			binding,
			/** Continue from the last real identity. */ (row) => row.displayName,
		)
	}
	/** Require tenant ownership even for workers with no account. */
	async requireWorker(id: string) {
		const row = (
			await sql<{
				workerId: string
				personId: string
			}>`SELECT id AS "workerId",person_id AS "personId" FROM hcm.worker WHERE tenant_id=${this.scope.actor.tenantId} AND id=${id}`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (!row) throw new DocumentError('not-found')
		return row
	}
	/** Resolve only the authenticated account's workforce linkage. */
	async resolveOwnWorker() {
		return (
			(
				await sql<{
					workerId: string
					personId: string
				}>`SELECT w.id AS "workerId",w.person_id AS "personId" FROM hcm.worker w JOIN hcm.user_account a ON a.tenant_id=w.tenant_id AND a.person_id=w.person_id WHERE w.tenant_id=${this.scope.actor.tenantId} AND a.id=${this.scope.actor.accountId}`.execute(
					this.scope.transaction,
				)
			).rows[0] ?? null
		)
	}
}
