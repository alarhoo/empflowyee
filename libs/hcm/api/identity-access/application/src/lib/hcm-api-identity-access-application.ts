import { createHash, randomUUID } from 'node:crypto'
import {
	IdentityError,
	identityId,
	parseCreateAccount,
	parseSetEnabled,
	type AccountSummary,
	type IdentityPage,
	type IdentityQuery,
	type PersonOption,
	type CreateAccount,
} from '@empflowyee/hcm-identity-access-contract'
import { requireAccountRevision } from '@empflowyee/hcm-api-identity-access-domain'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type { AppendAudit } from '@empflowyee/hcm-api-audit-application'
export interface IdentityRepository {
	/** Read one account, optionally locking its shared revision. */
	get(id: string, lock?: boolean): Promise<AccountSummary>
	/** Read a stable server-owned account page. */
	list(query: IdentityQuery): Promise<IdentityPage<AccountSummary>>
	/** Create only approved account fields for an existing person. */
	create(id: string, body: CreateAccount): Promise<void>
	/** Change enabled state with an optimistic revision, retaining identity and grants. */
	setEnabled(id: string, enabled: boolean, revision: number): Promise<void>
}
export interface IdentityPeople {
	/** Search only the approved tenant workforce display projection. */
	listPeople(query: IdentityQuery): Promise<IdentityPage<PersonOption>>
	/** Require a real tenant person without mutating workforce data. */
	requirePerson(id: string): Promise<void>
}
export interface IdentityReceipt {
	requestHash: string
	response: AccountSummary
}
export interface IdentityWork {
	accounts: IdentityRepository
	people: IdentityPeople
	audit: AppendAudit
	receipts: {
		/** Read an immutable tenant/actor/operation-scoped success. */
		get(operation: string, key: string): Promise<IdentityReceipt | null>
		/** Persist the response atomically with the account and audit. */
		save(operation: string, key: string, receipt: IdentityReceipt): Promise<void>
	}
}
export abstract class IdentityUnitOfWork {
	/** Reauthorize the actor under the shared administration lock and bind all domain ports. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		manage: boolean,
		write: boolean,
		work: (scope: IdentityWork) => Promise<T>,
	): Promise<T>
}
export class IdentityAdministration {
	/** Receive framework-independent ports from the module composition. */
	constructor(private readonly unit: IdentityUnitOfWork) {}
	/** Query real account records without synthesizing missing workforce accounts. */
	list(
		context: AuthenticatedHcmContext,
		query: IdentityQuery,
	): Promise<IdentityPage<AccountSummary>> {
		return this.unit.execute(
			context,
			false,
			false,
			/** Delegate only the approved query. */ (scope) => scope.accounts.list(query),
		)
	}
	/** Resolve a routed account through the tenant-scoped account port. */
	get(context: AuthenticatedHcmContext, id: string): Promise<AccountSummary> {
		return this.unit.execute(
			context,
			false,
			false,
			/** Keep object lookup inside verified authority. */ (scope) =>
				scope.accounts.get(identityId(id)),
		)
	}
	/** Offer bounded existing-person choices only to account managers. */
	people(
		context: AuthenticatedHcmContext,
		query: IdentityQuery,
	): Promise<IdentityPage<PersonOption>> {
		return this.unit.execute(
			context,
			true,
			false,
			/** Workforce retains ownership of the projection. */ (scope) =>
				scope.people.listPeople(query),
		)
	}
	/** Create an enabled local record without credentials, invitation, persona or permissions. */
	create(
		context: AuthenticatedHcmContext,
		value: unknown,
		key: string,
		requestId: string,
	): Promise<AccountSummary> {
		const body = parseCreateAccount(value)
		return this.command(
			context,
			'accounts.create',
			body,
			key,
			/** Keep creation and safe evidence atomic. */ async (scope) => {
				await scope.people.requirePerson(body.personId)
				const id = randomUUID()
				await scope.accounts.create(id, body)
				await scope.audit.append({
					action: 'account.created',
					targetId: id,
					requestId,
					summary: { reason: body.reason, enabled: true },
				})
				return scope.accounts.get(id)
			},
		)
	}
	/** Change only enablement under the invariant shared with access assignments. */
	enabled(
		context: AuthenticatedHcmContext,
		id: string,
		value: unknown,
		key: string,
		requestId: string,
	): Promise<AccountSummary> {
		identityId(id)
		const body = parseSetEnabled(value)
		return this.command(
			context,
			'accounts.enabled',
			[id, body],
			key,
			/** Preserve roles/history and reject stale account or grant revisions. */ async (scope) => {
				const current = await scope.accounts.get(id, true)
				requireAccountRevision(current.revision, body.expectedRevision)
				await scope.accounts.setEnabled(id, body.enabled, body.expectedRevision)
				await scope.audit.append({
					action: body.enabled ? 'account.enabled' : 'account.disabled',
					targetId: id,
					requestId,
					summary: { reason: body.reason, enabled: body.enabled },
				})
				return scope.accounts.get(id)
			},
		)
	}
	/** Recheck current authority before any successful receipt replay, then atomically persist new results. */
	private command(
		context: AuthenticatedHcmContext,
		operation: string,
		payload: unknown,
		key: string,
		work: (scope: IdentityWork) => Promise<AccountSummary>,
	): Promise<AccountSummary> {
		if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key))
			throw new IdentityError('invalid-request')
		const requestHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
		return this.unit.execute(
			context,
			true,
			true,
			/** Serialize mutation and receipt with all other tenant access changes. */ async (scope) => {
				const receipt = await scope.receipts.get(operation, key)
				if (receipt) {
					if (receipt.requestHash !== requestHash) throw new IdentityError('idempotency-conflict')
					return receipt.response
				}
				const response = await work(scope)
				await scope.receipts.save(operation, key, { requestHash, response })
				return response
			},
		)
	}
}
