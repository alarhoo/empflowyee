import { sql } from 'kysely'
import {
	ReviewError,
	type ReviewSummary,
	type ReviewItem,
	type ReviewQuery,
	type ReviewItemsQuery,
	type Page,
} from '@empflowyee/hcm-access-control-contract'
import {
	ReviewUnitOfWork,
	type ReviewRepository,
	type ReviewSnapshot,
	type StoredReviewItem,
	type ReviewWork,
	type ReviewReceipt,
} from '@empflowyee/hcm-api-access-control-application'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	HcmAccessDatabase,
	type AuthorizedAccessWork,
} from './hcm-api-access-control-infrastructure'
import { KyselyAssignments, KyselyAssignmentAccounts } from './assignment-repository'
import { contextCursor, readContextCursor } from './context-cursor'
const reviewColumns = sql`r.id,r.label,r.status,r.revision,to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",to_char(r.closed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "closedAt"`
const stale = sql`(i.decision IN ('Pending','Retain') AND (g.grant_id IS NULL OR g.grant_id<>i.grant_id OR ar.revision IS DISTINCT FROM i.role_revision OR ua.revision IS DISTINCT FROM i.account_revision))`
const itemJoins = sql`LEFT JOIN hcm.account_role g ON g.tenant_id=i.tenant_id AND g.account_id=i.account_id AND g.role_id=i.role_id LEFT JOIN hcm.access_role ar ON ar.tenant_id=i.tenant_id AND ar.id=i.role_id LEFT JOIN hcm.user_account ua ON ua.tenant_id=i.tenant_id AND ua.id=i.account_id`
const itemColumns = sql`i.id,i.account_id AS "accountId",i.role_id AS "roleId",i.grant_id AS "grantId",i.account_label AS "accountLabel",i.role_label AS "roleLabel",i.decision,i.decision_reason AS reason,i.revision,${stale} AS stale,i.account_revision AS "accountRevision",i.role_revision AS "roleRevision"`
/** Explicit public projection keeps snapshot comparison revisions internal. */
function itemDto(item: StoredReviewItem): ReviewItem {
	return {
		id: item.id,
		accountId: item.accountId,
		roleId: item.roleId,
		grantId: item.grantId,
		accountLabel: item.accountLabel,
		roleLabel: item.roleLabel,
		decision: item.decision,
		reason: item.reason,
		revision: item.revision,
		stale: item.stale,
	}
}
/** Escape label filters for literal substring semantics. */
function search(value: string): string {
	return '%' + value.replace(/[\\%_]/g, '\\$&') + '%'
}
export class KyselyReviews implements ReviewRepository {
	/** Bind all snapshot SQL to the authorized tenant transaction. */
	constructor(private readonly scope: AuthorizedAccessWork) {}
	/** Query stable creation-time pages with every control bound into continuation. */
	async list(query: ReviewQuery): Promise<Page<ReviewSummary>> {
		const binding = JSON.stringify([this.scope.actor.tenantId, query.q, query.status ?? null]),
			after = readContextCursor(query.cursor, 'review:' + query.sort, binding, query.limit, 2)
		if (
			after &&
			(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(after[0]) ||
				!Number.isFinite(Date.parse(after[0])) ||
				new Date(after[0]).toISOString().slice(0, 10) !== after[0].slice(0, 10))
		)
			throw new ReviewError('invalid-request')
		const asc = query.sort === 'createdAt:asc',
			order = asc ? sql`ASC` : sql`DESC`,
			compare = asc ? sql`>` : sql`<`
		const rows = (
			await sql<ReviewSummary>`SELECT ${reviewColumns} FROM hcm.access_review r WHERE r.tenant_id=${this.scope.actor.tenantId}
   ${query.q ? sql`AND r.label ILIKE ${search(query.q)}` : sql``}
   ${query.status ? sql`AND r.status=${query.status}` : sql``}
   ${after ? sql`AND (r.created_at,r.id) ${compare} (${after[0]}::timestamptz,${after[1]})` : sql``}
   ORDER BY r.created_at ${order},r.id ${order} LIMIT ${query.limit + 1}`.execute(
				this.scope.transaction,
			)
		).rows
		const items = rows.slice(0, query.limit),
			last = items.at(-1)
		return {
			items,
			nextCursor:
				rows.length > query.limit && last
					? contextCursor('review:' + query.sort, binding, query.limit, [last.createdAt, last.id])
					: null,
		}
	}
	/** Read one parent by explicit tenant identity without leaking foreign existence. */
	async get(id: string): Promise<ReviewSummary> {
		const result = (
			await sql<ReviewSummary>`SELECT ${reviewColumns} FROM hcm.access_review r WHERE r.tenant_id=${this.scope.actor.tenantId} AND r.id=${id}`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (!result) throw new ReviewError('not-found')
		return result
	}
	/** Insert the parent and all current grant occurrences in the already locked transaction. */
	async create(id: string, label: string): Promise<ReviewSummary> {
		await sql`INSERT INTO hcm.access_review(tenant_id,id,label,created_by_account_id) VALUES(${this.scope.actor.tenantId},${id},${label},${this.scope.actor.accountId})`.execute(
			this.scope.transaction,
		)
		await sql`INSERT INTO hcm.access_review_item(tenant_id,id,review_id,account_id,role_id,grant_id,account_revision,role_revision,account_label,role_label)
   SELECT g.tenant_id,gen_random_uuid()::text,${id},g.account_id,g.role_id,g.grant_id,a.revision,r.revision,coalesce(p.display_name,a.email),r.label
   FROM hcm.account_role g JOIN hcm.user_account a ON a.tenant_id=g.tenant_id AND a.id=g.account_id JOIN hcm.access_role r ON r.tenant_id=g.tenant_id AND r.id=g.role_id LEFT JOIN hcm.person p ON p.tenant_id=a.tenant_id AND p.id=a.person_id
   WHERE g.tenant_id=${this.scope.actor.tenantId}`.execute(this.scope.transaction)
		return this.get(id)
	}
	/** Page historical rows while deriving drift only for unresolved or retained evidence. */
	async items(id: string, query: ReviewItemsQuery): Promise<Page<ReviewItem>> {
		const binding = JSON.stringify([this.scope.actor.tenantId, id, query.decision ?? null]),
			after = readContextCursor(query.cursor, 'review-item:asc', binding, query.limit, 1)?.[0] ?? ''
		const rows = (
			await sql<StoredReviewItem>`SELECT ${itemColumns} FROM hcm.access_review_item i ${itemJoins} WHERE i.tenant_id=${this.scope.actor.tenantId} AND i.review_id=${id} AND i.id>${after} ${query.decision ? sql`AND i.decision=${query.decision}` : sql``} ORDER BY i.id LIMIT ${query.limit + 1}`.execute(
				this.scope.transaction,
			)
		).rows
		const items = rows.slice(0, query.limit).map(itemDto),
			last = items.at(-1)
		return {
			items,
			nextCursor:
				rows.length > query.limit && last
					? contextCursor('review-item:asc', binding, query.limit, [last.id])
					: null,
		}
	}
	/** Load internal comparison revisions for exactly one item in its parent. */
	async item(id: string, itemId: string): Promise<StoredReviewItem> {
		const row = (
			await sql<StoredReviewItem>`SELECT ${itemColumns} FROM hcm.access_review_item i ${itemJoins} WHERE i.tenant_id=${this.scope.actor.tenantId} AND i.review_id=${id} AND i.id=${itemId}`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (!row) throw new ReviewError('not-found')
		return row
	}
	/** Read current labels and revisions only through tenant-composite joins. */
	async live(accountId: string, roleId: string): Promise<ReviewSnapshot | null> {
		return (
			(
				await sql<ReviewSnapshot>`SELECT g.account_id AS "accountId",g.role_id AS "roleId",g.grant_id AS "grantId",a.revision AS "accountRevision",r.revision AS "roleRevision",coalesce(p.display_name,a.email) AS "accountLabel",r.label AS "roleLabel" FROM hcm.account_role g JOIN hcm.user_account a ON a.tenant_id=g.tenant_id AND a.id=g.account_id JOIN hcm.access_role r ON r.tenant_id=g.tenant_id AND r.id=g.role_id LEFT JOIN hcm.person p ON p.tenant_id=a.tenant_id AND p.id=a.person_id WHERE g.tenant_id=${this.scope.actor.tenantId} AND g.account_id=${accountId} AND g.role_id=${roleId}`.execute(
					this.scope.transaction,
				)
			).rows[0] ?? null
		)
	}
	/** Record a decision only after any shared grant command has succeeded. */
	async decide(
		id: string,
		item: StoredReviewItem,
		decision: 'Retain' | 'Revoke',
		reason: string,
	): Promise<ReviewItem> {
		const result =
			await sql`UPDATE hcm.access_review_item SET decision=${decision},decision_reason=${reason},decided_by_account_id=${this.scope.actor.accountId},decided_at=now(),revision=revision+1 WHERE tenant_id=${this.scope.actor.tenantId} AND review_id=${id} AND id=${item.id} AND revision=${item.revision}`.execute(
				this.scope.transaction,
			)
		if (result.numAffectedRows !== 1n) throw new ReviewError('revision-conflict')
		await this.advance(id)
		return itemDto(await this.item(id, item.id))
	}
	/** Replace stale evidence and reset its decision, or explicitly record absence with the supplied reason. */
	async refresh(
		id: string,
		item: StoredReviewItem,
		live: ReviewSnapshot | null,
		reason: string,
	): Promise<ReviewItem> {
		const changes = live
			? sql`grant_id=${live.grantId},role_revision=${live.roleRevision},account_revision=${live.accountRevision},account_label=${live.accountLabel},role_label=${live.roleLabel},decision='Pending',decision_reason=NULL,decided_by_account_id=NULL,decided_at=NULL`
			: sql`decision='Removed',decision_reason=${reason},decided_by_account_id=${this.scope.actor.accountId},decided_at=now()`
		const result =
			await sql`UPDATE hcm.access_review_item SET ${changes},revision=revision+1 WHERE tenant_id=${this.scope.actor.tenantId} AND review_id=${id} AND id=${item.id} AND revision=${item.revision}`.execute(
				this.scope.transaction,
			)
		if (result.numAffectedRows !== 1n) throw new ReviewError('revision-conflict')
		await this.advance(id)
		return itemDto(await this.item(id, item.id))
	}
	/** Check closure with an aggregate instead of loading unbounded snapshots into application memory. */
	async closure(id: string): Promise<{ pending: number; staleRetained: number }> {
		return (
			await sql<{
				pending: number
				staleRetained: number
			}>`SELECT count(*) FILTER (WHERE i.decision='Pending')::int AS pending,count(*) FILTER (WHERE i.decision='Retain' AND ${stale})::int AS "staleRetained" FROM hcm.access_review_item i ${itemJoins} WHERE i.tenant_id=${this.scope.actor.tenantId} AND i.review_id=${id}`.execute(
				this.scope.transaction,
			)
		).rows[0]
	}
	/** Close exactly the expected Open parent revision. */
	async close(id: string, expectedRevision: number): Promise<ReviewSummary> {
		const result =
			await sql`UPDATE hcm.access_review SET status='Closed',closed_at=now(),revision=revision+1 WHERE tenant_id=${this.scope.actor.tenantId} AND id=${id} AND status='Open' AND revision=${expectedRevision}`.execute(
				this.scope.transaction,
			)
		if (result.numAffectedRows !== 1n) throw new ReviewError('revision-conflict')
		return this.get(id)
	}
	/** Advance parent concurrency whenever one snapshot is changed. */
	private async advance(id: string): Promise<void> {
		await sql`UPDATE hcm.access_review SET revision=revision+1 WHERE tenant_id=${this.scope.actor.tenantId} AND id=${id} AND status='Open'`.execute(
			this.scope.transaction,
		)
	}
	/** Read successful receipts scoped to the exact verified actor and operation. */
	async receipt(operation: string, key: string): Promise<ReviewReceipt | null> {
		return (
			(
				await sql<ReviewReceipt>`SELECT request_hash AS "requestHash",response FROM hcm.access_command_receipt WHERE tenant_id=${this.scope.actor.tenantId} AND actor_account_id=${this.scope.actor.accountId} AND operation=${operation} AND idempotency_key=${key}::uuid`.execute(
					this.scope.transaction,
				)
			).rows[0] ?? null
		)
	}
	/** Persist only the safe command response atomically with its snapshot/audit changes. */
	async save(operation: string, key: string, value: ReviewReceipt): Promise<void> {
		await sql`INSERT INTO hcm.access_command_receipt(tenant_id,actor_account_id,operation,idempotency_key,request_hash,response) VALUES(${this.scope.actor.tenantId},${this.scope.actor.accountId},${operation},${key}::uuid,${value.requestHash},${JSON.stringify(value.response)}::jsonb)`.execute(
			this.scope.transaction,
		)
	}
}
export class KyselyReviewUnitOfWork extends ReviewUnitOfWork {
	/** Reuse the existing tenant authorization and protected-administrator transaction boundary. */
	constructor(private readonly database: HcmAccessDatabase | null) {
		super()
	}
	/** Reauthorize after acquiring the shared administration lock before any command can replay or mutate. */
	async execute<T>(
		context: AuthenticatedHcmContext,
		write: boolean,
		work: (scope: ReviewWork) => Promise<T>,
	): Promise<T> {
		if (!this.database) throw new Error('Business runtime unavailable')
		return this.database.execute(
			context,
			{
				permission: 'hcm.access-control.reviews.' + (write ? 'manage' : 'read'),
				entitlement: 'hcm.access-control',
			},
			write,
			/** Compose reviewed domain ports on the identical SQL transaction. */ (scope) => {
				const reviews = new KyselyReviews(scope),
					assignments = new KyselyAssignments(scope)
				return work({
					reviews,
					assignment: {
						accounts: new KyselyAssignmentAccounts(scope),
						assignments,
						audit: scope.audit,
					},
					audit: scope.audit,
					receipts: { get: reviews.receipt.bind(reviews), save: reviews.save.bind(reviews) },
				})
			},
		)
	}
}
