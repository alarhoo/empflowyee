import { createHash, randomUUID } from 'node:crypto'
import {
	ReviewError,
	reviewId,
	parseReviewCreate,
	parseReviewCommand,
	type ReviewSummary,
	type ReviewItem,
	type ReviewQuery,
	type ReviewItemsQuery,
	type Page,
} from '@empflowyee/hcm-access-control-contract'
import {
	requireOpenReview,
	requireReviewRevision,
	requireReviewDecision,
	requireReviewRefresh,
	requireReviewClosure,
} from '@empflowyee/hcm-api-access-control-domain'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type { AppendAudit } from '@empflowyee/hcm-api-audit-application'
import { applyAssignmentChange, type AssignmentWork } from './access-assignments'
export interface ReviewSnapshot {
	accountId: string
	roleId: string
	grantId: string
	accountLabel: string
	roleLabel: string
	accountRevision: number
	roleRevision: number
}
export interface StoredReviewItem extends ReviewItem {
	accountRevision: number
	roleRevision: number
}
export interface ReviewRepository {
	/** Read a stable filtered review page. */
	list(query: ReviewQuery): Promise<Page<ReviewSummary>>
	/** Read one tenant review or throw safe not-found. */
	get(id: string): Promise<ReviewSummary>
	/** Insert the review and snapshot existing grant occurrences under the shared tenant lock. */
	create(id: string, label: string): Promise<ReviewSummary>
	/** Read bounded snapshot rows with current staleness indicators. */
	items(id: string, query: ReviewItemsQuery): Promise<Page<ReviewItem>>
	/** Load one snapshot with internal comparison revisions. */
	item(id: string, itemId: string): Promise<StoredReviewItem>
	/** Resolve the current occurrence and labels, or absence. */
	live(accountId: string, roleId: string): Promise<ReviewSnapshot | null>
	/** Persist a single decision and advance both item and parent revisions. */
	decide(
		id: string,
		item: StoredReviewItem,
		decision: 'Retain' | 'Revoke',
		reason: string,
	): Promise<ReviewItem>
	/** Replace outdated evidence or explicitly mark an absent assignment Removed. */
	refresh(
		id: string,
		item: StoredReviewItem,
		live: ReviewSnapshot | null,
		reason: string,
	): Promise<ReviewItem>
	/** Count pending items and retained snapshots that no longer match. */
	closure(id: string): Promise<{ pending: number; staleRetained: number }>
	/** Close the exact parent revision and return the resulting safe summary. */
	close(id: string, expectedRevision: number): Promise<ReviewSummary>
}
export type ReviewResponse = ReviewSummary | ReviewItem
export interface ReviewReceipt {
	requestHash: string
	response: ReviewResponse
}
export interface ReviewWork {
	reviews: ReviewRepository
	assignment: Pick<AssignmentWork, 'accounts' | 'assignments' | 'audit'>
	audit: AppendAudit
	receipts: {
		/** Read this actor's successful operation receipt. */
		get(operation: string, key: string): Promise<ReviewReceipt | null>
		/** Store a successful safe response in the same transaction. */
		save(operation: string, key: string, value: ReviewReceipt): Promise<void>
	}
}
export abstract class ReviewUnitOfWork {
	/** Reauthorize review read/manage and serialize every command with assignment writes. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		write: boolean,
		work: (scope: ReviewWork) => Promise<T>,
	): Promise<T>
}
/** Normalize only valid command receipt keys; caller-supplied IDs never confer authority. */
function receiptKey(key: string): void {
	if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key))
		throw new ReviewError('invalid-request')
}
/** Return a previous successful command only when its exact normalized target/payload matches. */
async function replay(
	scope: ReviewWork,
	operation: string,
	key: string,
	requestHash: string,
): Promise<ReviewResponse | null> {
	const receipt = await scope.receipts.get(operation, key)
	if (receipt && receipt.requestHash !== requestHash) throw new ReviewError('idempotency-conflict')
	return receipt?.response ?? null
}
export class AccessReviews {
	/** Receive persistence-neutral ports for snapshots and the assignment-owned command. */
	constructor(private readonly unit: ReviewUnitOfWork) {}
	/** Query safe summaries under explicit review-read authority. */
	list(context: AuthenticatedHcmContext, query: ReviewQuery): Promise<Page<ReviewSummary>> {
		return this.unit.execute(
			context,
			false,
			/** Keep SQL behind the owning repository port. */ (scope) => scope.reviews.list(query),
		)
	}
	/** Resolve a deep link independently from the current list page. */
	get(context: AuthenticatedHcmContext, id: string): Promise<ReviewSummary> {
		return this.unit.execute(
			context,
			false,
			/** Require same-tenant review identity. */ (scope) => scope.reviews.get(reviewId(id)),
		)
	}
	/** Read snapshot evidence without fetching an unbounded assignment collection. */
	items(
		context: AuthenticatedHcmContext,
		id: string,
		query: ReviewItemsQuery,
	): Promise<Page<ReviewItem>> {
		return this.unit.execute(
			context,
			false,
			/** Deny an inaccessible parent before reading its items. */ async (scope) => {
				await scope.reviews.get(reviewId(id))
				return scope.reviews.items(id, query)
			},
		)
	}
	/** Snapshot a consistent set of current occurrences without certifying future grants. */
	start(
		context: AuthenticatedHcmContext,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ReviewSummary> {
		const payload = parseReviewCreate(body)
		receiptKey(key)
		const operation = 'reviews.start',
			requestHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
		return this.unit.execute(
			context,
			true,
			/** Snapshot, audit and receipt commit or roll back together. */ async (scope) => {
				const previous = await replay(scope, operation, key, requestHash)
				if (previous) return previous as ReviewSummary
				const result = await scope.reviews.create(randomUUID(), payload.label)
				await scope.audit.append({
					action: 'review.started',
					targetId: result.id,
					requestId,
					summary: { reason: payload.reason, fromState: null, toState: 'Open' },
				})
				await scope.receipts.save(operation, key, { requestHash, response: result })
				return result
			},
		)
	}
	/** Execute one revisioned review decision, refresh or close in the tenant administration unit. */
	command(
		context: AuthenticatedHcmContext,
		operation: 'decide' | 'refresh' | 'close',
		id: string,
		itemId: string | undefined,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ReviewResponse> {
		reviewId(id)
		if (operation !== 'close') reviewId(itemId ?? '')
		receiptKey(key)
		const payload = parseReviewCommand(body, operation),
			command = 'reviews.' + operation,
			requestHash = createHash('sha256')
				.update(JSON.stringify([id, itemId ?? null, payload]))
				.digest('hex')
		return this.unit.execute(
			context,
			true,
			/** Use only verified snapshots and the shared assignment command. */ async (scope) => {
				const previous = await replay(scope, command, key, requestHash)
				if (previous) return previous
				const review = await scope.reviews.get(id)
				requireOpenReview(review)
				let result: ReviewResponse
				let fromState: string, toState: string
				if (operation === 'close') {
					requireReviewRevision(review.revision, payload.expectedRevision)
					const state = await scope.reviews.closure(id)
					requireReviewClosure(state.pending, state.staleRetained)
					result = await scope.reviews.close(id, review.revision)
					fromState = 'Open'
					toState = 'Closed'
				} else {
					const item = await scope.reviews.item(id, itemId ?? '')
					requireReviewRevision(item.revision, payload.expectedRevision)
					fromState = item.decision
					if (operation === 'refresh') {
						requireReviewRefresh(item)
						result = await scope.reviews.refresh(
							id,
							item,
							await scope.reviews.live(item.accountId, item.roleId),
							payload.reason,
						)
					} else {
						requireReviewDecision(item)
						if (payload.decision === 'Revoke')
							await applyAssignmentChange(
								scope.assignment,
								'revoke',
								item.accountId,
								{
									roleId: item.roleId,
									grantId: item.grantId,
									expectedRevision: item.accountRevision,
									reason: payload.reason,
								},
								requestId,
							)
						result = await scope.reviews.decide(
							id,
							item,
							payload.decision ?? 'Retain',
							payload.reason,
						)
					}
					toState = result.decision
				}
				const action = (
					{ close: 'review.closed', refresh: 'review.refreshed', decide: 'review.decided' } as const
				)[operation]
				await scope.audit.append({
					action,
					targetId: operation === 'close' ? id : (itemId ?? ''),
					requestId,
					summary: { reason: payload.reason, fromState, toState },
				})
				await scope.receipts.save(command, key, { requestHash, response: result })
				return result
			},
		)
	}
}
