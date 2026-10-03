import { randomUUID } from 'node:crypto'
import {
	readLeavePolicyDraft,
	readLeavePolicyListQuery,
	readLeavePolicyOptionsQuery,
	type LeavePolicyOptionsQuery,
	type LeavePolicyOptions,
	type LeavePolicyListQuery,
	type LeavePolicyDraft,
	type LeavePolicyVersionView,
} from '@empflowyee/hcm-leave-contract'
import {
	HcmDomainError,
	idValue,
	preservedTextValue,
	readBody,
	revisionValue,
	type HcmPage,
} from '@empflowyee/hcm-runtime-contract'
import {
	commandHash,
	runIdempotent,
	type AuthenticatedHcmContext,
	type CommandReceiptStore,
} from '@empflowyee/hcm-api-runtime-application'
import type { AppendAudit } from '@empflowyee/hcm-api-audit-application'
import type { LeavePolicyRepository } from './hcm-api-leave-application'

export interface LeavePolicyEvidence {
	versionId: string
	revision: number
	reason: string | null
}
export interface LeavePolicyReceipts extends CommandReceiptStore {
	/** Bind immutable source revision and private narrative to the subsequent response receipt. */
	setEvidence(evidence: LeavePolicyEvidence): void
}
export interface LeavePolicyWork {
	policies: LeavePolicyRepository
	queries: {
		/** Return a bounded server-owned latest-version page under current source authority. */
		list(query: LeavePolicyListQuery): Promise<HcmPage<LeavePolicyVersionView>>
		/** Return current tenant type options with explicit units and no entitlement defaults. */
		options(query: LeavePolicyOptionsQuery): Promise<LeavePolicyOptions>
	}
	receipts: LeavePolicyReceipts
	audit: AppendAudit
	/** Recovering a stored response requires the actor's current source read permission. */
	requireRead(): Promise<void>
}
export abstract class LeavePolicyUnit {
	/** Establish current authorization and one revocation-safe tenant transaction. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		operation: 'read' | 'draft',
		write: boolean,
		work: (scope: LeavePolicyWork) => Promise<T>,
	): Promise<T>
}

/** Strip only explicit read metadata before copying immutable source configuration. */
export function leavePolicyDraftOf(view: LeavePolicyVersionView): LeavePolicyDraft {
	const { id, versionId, version, revision, state, validation, ...draft } = view
	void [id, versionId, version, revision, state, validation]
	return readLeavePolicyDraft(draft)
}

/** Coordinate real policy drafts, exact optimistic revisions and durable actor-bound retries. */
export class LeavePolicyCommands {
	/** Consume current-authority transaction ports without SQL or HTTP dependencies. */
	constructor(private readonly unit: LeavePolicyUnit) {}

	/** Read authorized type references from PostgreSQL for the native policy picker. */
	options(context: AuthenticatedHcmContext, params: URLSearchParams): Promise<LeavePolicyOptions> {
		const query = readLeavePolicyOptionsQuery(params)
		return this.unit.execute(
			context,
			'read',
			false,
			/** Options retain the independent source read boundary. */ (work) =>
				work.queries.options(query),
		)
	}

	/** Read a current-authority server page rather than sorting an incomplete browser collection. */
	list(
		context: AuthenticatedHcmContext,
		params: URLSearchParams,
	): Promise<HcmPage<LeavePolicyVersionView>> {
		const query = readLeavePolicyListQuery(params)
		return this.unit.execute(
			context,
			'read',
			false,
			/** Cursor binding and filtering remain inside the authorized transaction. */ (work) =>
				work.queries.list(query),
		)
	}

	/** Return an exact version only after current source read authorization. */
	detail(
		context: AuthenticatedHcmContext,
		policyId: string,
		versionId: string,
	): Promise<LeavePolicyVersionView> {
		idValue(policyId, 'id')
		idValue(versionId, 'version')
		return this.unit.execute(
			context,
			'read',
			false,
			/** Do not reveal foreign/missing resource distinctions. */ async (work) => {
				const view = await work.policies.read(policyId, versionId)
				if (!view) throw new HcmDomainError('not-found')
				return view
			},
		)
	}

	/** Create one stable policy and its initial complete or incomplete draft atomically. */
	create(
		context: AuthenticatedHcmContext,
		key: string,
		value: unknown,
	): Promise<LeavePolicyVersionView> {
		const draft = readLeavePolicyDraft(value)
		return this.unit.execute(
			context,
			'draft',
			true,
			/** Establish write authority before reading any prior result. */ (work) =>
				this.replay(
					work,
					'Policy.create',
					key,
					'Policy',
					draft,
					/** A retry cannot create a second root. */ async () => {
						const id = randomUUID(),
							versionId = randomUUID()
						await work.policies.createPolicy(id, draft)
						await work.policies.insertVersion({
							id: versionId,
							policyId: id,
							version: 1,
							supersedesId: null,
							draft,
						})
						return this.finish(work, id, versionId, key, 'leave.policy-created', null, null)
					},
				),
		)
	}

	/** Replace the whole draft at its expected revision, never accepting client state or publication fields. */
	update(
		context: AuthenticatedHcmContext,
		policyId: string,
		versionId: string,
		key: string,
		value: unknown,
	): Promise<LeavePolicyVersionView> {
		idValue(policyId, 'id')
		idValue(versionId, 'version')
		if (!value || typeof value !== 'object' || Array.isArray(value))
			throw new HcmDomainError('invalid-request')
		const { expectedRevision, ...body } = value as Record<string, unknown>
		const revision = revisionValue(expectedRevision),
			draft = readLeavePolicyDraft(body)
		return this.unit.execute(
			context,
			'draft',
			true,
			/** Replays are bound to both source identities and the complete replacement. */ (work) =>
				this.replay(
					work,
					'Policy.update',
					key,
					`${policyId}/${versionId}`,
					{ expectedRevision: revision, draft },
					/** Let the owner enforce immutable root fields and stale revisions. */ async () => {
						await work.policies.replace(policyId, versionId, revision, draft)
						return this.finish(
							work,
							policyId,
							versionId,
							key,
							'leave.policy-updated',
							'Draft',
							null,
						)
					},
				),
		)
	}

	/** Copy a published or retired source into a separate draft without rewriting historical rules. */
	version(
		context: AuthenticatedHcmContext,
		policyId: string,
		key: string,
		value: unknown,
	): Promise<LeavePolicyVersionView> {
		idValue(policyId, 'id')
		const body = readBody(value, ['sourceVersionId', 'expectedRevision', 'reason'])
		const input = {
			sourceVersionId: idValue(body['sourceVersionId'], 'sourceVersionId'),
			expectedRevision: revisionValue(body['expectedRevision']),
			reason: preservedTextValue(body['reason'], 'reason', 2000),
		}
		return this.unit.execute(
			context,
			'draft',
			true,
			/** Keep source lock, copied rules, audit and response receipt atomic. */ (work) =>
				this.replay(
					work,
					'Policy.version',
					key,
					policyId,
					input,
					/** Allocate a successor only after validating the immutable source. */ async () => {
						const source = await work.policies.lock(policyId, input.sourceVersionId)
						if (!source) throw new HcmDomainError('not-found')
						if (source.revision !== input.expectedRevision)
							throw new HcmDomainError('revision-conflict')
						if (source.state === 'Draft') throw new HcmDomainError('invalid-state')
						const id = randomUUID(),
							ordinal = await work.policies.nextVersion(policyId)
						await work.policies.insertVersion({
							id,
							policyId,
							version: ordinal,
							supersedesId: source.versionId,
							draft: leavePolicyDraftOf(source),
						})
						return this.finish(
							work,
							policyId,
							id,
							key,
							'leave.policy-versioned',
							null,
							input.reason,
						)
					},
				),
		)
	}

	/** Reuse Runtime's idempotency protocol while rechecking private read access on recovery. */
	private replay<T>(
		work: LeavePolicyWork,
		operation: string,
		key: string,
		target: string,
		input: unknown,
		mutate: () => Promise<T>,
	): Promise<T> {
		return runIdempotent(
			{
				get: /** A receipt is not a permanent grant to read its result. */ async (
					operation,
					key,
				) => {
					const prior = await work.receipts.get(operation, key)
					if (prior) await work.requireRead()
					return prior
				},
				save: /** Retain the original result in the caller's business transaction. */ (
					operation,
					key,
					receipt,
				) => work.receipts.save(operation, key, receipt),
			},
			operation,
			key,
			commandHash(target, input),
			mutate,
		)
	}

	/** Retain source-bound private reason separately from safe human-attributed audit metadata. */
	private async finish(
		work: LeavePolicyWork,
		policyId: string,
		versionId: string,
		key: string,
		action: string,
		fromState: string | null,
		reason: string | null,
	): Promise<LeavePolicyVersionView> {
		const view = await work.policies.read(policyId, versionId)
		if (!view) throw new Error('Created Leave policy unavailable')
		work.receipts.setEvidence({ versionId, revision: view.revision, reason })
		await work.audit.append({
			action,
			category: 'business',
			targetType: 'leave-policy-version',
			targetId: versionId,
			requestId: key,
			summary: { reason: null, changedFields: ['configuration'], fromState, toState: view.state },
		})
		return view
	}
}
