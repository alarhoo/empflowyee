import { createHash, randomUUID } from 'node:crypto'
import {
	AssignmentError,
	assignmentAccountId,
	parseAssignmentCommand,
	type AssignmentAccount,
	type AssignmentSummary,
	type AssignmentRole,
	type AssignmentRoleOption,
	type AssignmentQuery,
	type AssignmentPageQuery,
	type AssignmentOptionsQuery,
	type Page,
} from '@empflowyee/hcm-access-control-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type { AppendAudit } from '@empflowyee/hcm-api-audit-application'
import { requireAssignmentChange } from '@empflowyee/hcm-api-access-control-domain'

/** Consumer-owned projection of identity accounts; identity mutation remains outside assignment scope. */
export interface AssignmentAccounts {
	/** Read one tenant account, optionally holding its row lock for a command. */
	get(id: string, lock?: boolean): Promise<AssignmentAccount>
	/** Query bounded account identity projections under server-owned sorting. */
	list(query: AssignmentQuery): Promise<Page<AssignmentAccount>>
	/** Advance only the shared optimistic revision after an authorized assignment change. */
	advance(id: string, revision: number): Promise<void>
}
export interface AssignmentRepository {
	/** Read one bounded page of current grant occurrences. */
	roles(accountId: string, query: AssignmentPageQuery): Promise<Page<AssignmentRole>>
	/** Read existing role choices; no new role can be invented by a grant payload. */
	options(query: AssignmentOptionsQuery): Promise<Page<AssignmentRoleOption>>
	/** Require a same-tenant role before accepting a grant or revoke. */
	requireRole(roleId: string): Promise<void>
	/** Return the immutable occurrence ID for the current account/role pair. */
	occurrence(accountId: string, roleId: string): Promise<string | null>
	/** Persist one new occurrence under the transaction's verified actor. */
	grant(accountId: string, roleId: string, grantId: string): Promise<void>
	/** Remove only the expected grant occurrence, preventing stale revoke after regrant. */
	revoke(accountId: string, roleId: string, grantId: string): Promise<void>
}
export interface AssignmentReceipt {
	requestHash: string
	response: AssignmentSummary
}
export interface AssignmentWork {
	accounts: AssignmentAccounts
	assignments: AssignmentRepository
	audit: AppendAudit
	receipts: {
		/** Read an actor/tenant/operation-scoped successful receipt. */
		get(operation: string, key: string): Promise<AssignmentReceipt | null>
		/** Persist a safe receipt atomically with grant and audit. */
		save(operation: string, key: string, value: AssignmentReceipt): Promise<void>
	}
}
export abstract class AssignmentUnitOfWork {
	/** Bind all ports to one tenant transaction, reauthorizing after any administration lock. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		manage: boolean,
		write: boolean,
		work: (scope: AssignmentWork) => Promise<T>,
	): Promise<T>
}
/** Build the approved bounded nested projection without exposing persistence rows. */
async function summary(
	scope: AssignmentWork,
	account: AssignmentAccount,
): Promise<AssignmentSummary> {
	return { ...account, roles: await scope.assignments.roles(account.accountId, { limit: 25 }) }
}
export class AccessAssignments {
	/** Receive domain ports through composition, with no HTTP or database implementation dependency. */
	constructor(private readonly unit: AssignmentUnitOfWork) {}
	/** Combine a server page of accounts with bounded current-role projections. */
	list(context: AuthenticatedHcmContext, query: AssignmentQuery): Promise<Page<AssignmentSummary>> {
		return this.unit.execute(
			context,
			false,
			false,
			/** Map only the accounts authorized within this transaction. */ async (scope) => {
				const page = await scope.accounts.list(query)
				return {
					...page,
					items: await Promise.all(
						page.items.map(
							/** Attach the first bounded role page. */ (account) => summary(scope, account),
						),
					),
				}
			},
		)
	}
	/** Resolve an explicit deep link using the same account read authority as the collection. */
	get(context: AuthenticatedHcmContext, id: string): Promise<AssignmentSummary> {
		return this.unit.execute(
			context,
			false,
			false,
			/** Preserve tenant scoping in the projection port. */ async (scope) =>
				summary(scope, await scope.accounts.get(assignmentAccountId(id))),
		)
	}
	/** Continue an account's role collection without returning an unbounded grant array. */
	roles(
		context: AuthenticatedHcmContext,
		id: string,
		query: AssignmentPageQuery,
	): Promise<Page<AssignmentRole>> {
		return this.unit.execute(
			context,
			false,
			false,
			/** Require account existence before exposing membership. */ async (scope) => {
				await scope.accounts.get(assignmentAccountId(id))
				return scope.assignments.roles(id, query)
			},
		)
	}
	/** Role choices require assignment management authority, not role-management authority. */
	options(
		context: AuthenticatedHcmContext,
		query: AssignmentOptionsQuery,
	): Promise<Page<AssignmentRoleOption>> {
		return this.unit.execute(
			context,
			true,
			false,
			/** Delegate only the approved label search. */ (scope) => scope.assignments.options(query),
		)
	}
	/** Execute one attributable grant/revoke with optimistic revision and safe idempotent replay. */
	command(
		context: AuthenticatedHcmContext,
		operation: 'grant' | 'revoke',
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<AssignmentSummary> {
		assignmentAccountId(id)
		if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key))
			throw new AssignmentError('invalid-request')
		const payload = parseAssignmentCommand(body, operation)
		const command = `assignments.${operation}`
		const requestHash = createHash('sha256')
			.update(JSON.stringify([id, payload]))
			.digest('hex')
		return this.unit.execute(
			context,
			true,
			true,
			/** Keep receipt, revision, assignment and audit in the same locked unit. */ async (
				scope,
			) => {
				const receipt = await scope.receipts.get(command, key)
				if (receipt) {
					if (receipt.requestHash !== requestHash) throw new AssignmentError('idempotency-conflict')
					return receipt.response
				}
				const account = await scope.accounts.get(id, true)
				await scope.assignments.requireRole(payload.roleId)
				const current = await scope.assignments.occurrence(id, payload.roleId)
				requireAssignmentChange(account.revision, current, payload, operation)
				const grantId = operation === 'grant' ? randomUUID() : (payload.grantId ?? '')
				if (operation === 'grant') await scope.assignments.grant(id, payload.roleId, grantId)
				else await scope.assignments.revoke(id, payload.roleId, grantId)
				await scope.accounts.advance(id, account.revision)
				await scope.audit.append({
					action: operation === 'grant' ? 'role.granted' : 'role.revoked',
					targetId: id,
					requestId,
					summary: { reason: payload.reason, roleId: payload.roleId, grantId },
				})
				const response = await summary(scope, await scope.accounts.get(id))
				await scope.receipts.save(command, key, { requestHash, response })
				return response
			},
		)
	}
}
