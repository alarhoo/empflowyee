import { randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import {
	HcmActionAuthorizationBinder,
	HcmRuntimeError,
	requireAuthenticatedScope,
	validateHcmActionBinding,
	type AuthenticatedHcmContext,
	type HcmActionAuthorizationStore,
	type HcmActionBinding,
	type HcmActionAuthorityRecord,
} from '@empflowyee/hcm-api-runtime-application'

/** Keep durable actor references in Runtime-owned SQL with no update/delete authority. */
class SqlActionAuthorizationStore implements HcmActionAuthorizationStore {
	/** Retain only the existing transaction and its explicit tenant. */
	constructor(
		private readonly tx: Kysely<unknown>,
		private readonly tenantId: string,
	) {}
	/** Fail closed on pool binding or changed transaction-local tenant context. */
	private async assertTenant(): Promise<void> {
		if (!this.tx.isTransaction) throw new HcmRuntimeError('forbidden')
		const row = await sql<{
			tenant: string | null
		}>`SELECT hcm.current_tenant_id() AS tenant`.execute(this.tx)
		if (row.rows[0]?.tenant !== this.tenantId) throw new HcmRuntimeError('forbidden')
	}
	/** Capture the verified expiry once; an idempotent replay cannot renew it using a later login. */
	async issue(context: AuthenticatedHcmContext, binding: HcmActionBinding): Promise<string> {
		validateHcmActionBinding(binding)
		await this.assertTenant()
		const actor = requireAuthenticatedScope(context)
		if (actor.tenantId !== this.tenantId) throw new HcmRuntimeError('forbidden')
		const id = randomUUID()
		const inserted = await sql<{ id: string }>`INSERT INTO hcm.runtime_action_authorization
			(tenant_id,id,actor_account_id,expires_at,permission,scope_reference,intent_digest)
			VALUES(${this.tenantId},${id},${actor.accountId},${new Date(actor.expiresAt)},${binding.permission},${binding.scopeReference},${binding.intentDigest})
			ON CONFLICT(tenant_id,actor_account_id,intent_digest) DO NOTHING RETURNING id`.execute(this.tx)
		requireAuthenticatedScope(context)
		if (inserted.rows[0]) return inserted.rows[0].id
		const existing = await sql<{
			id: string
			permission: string
			scope_reference: string
		}>`SELECT id,permission,scope_reference
			FROM hcm.runtime_action_authorization WHERE tenant_id=${this.tenantId} AND actor_account_id=${actor.accountId} AND intent_digest=${binding.intentDigest}`.execute(
				this.tx,
			)
		const prior = existing.rows[0]
		if (
			!prior ||
			prior.permission !== binding.permission ||
			prior.scope_reference !== binding.scopeReference
		)
			throw new HcmRuntimeError('forbidden')
		return prior.id
	}
	/** Return an internal immutable-record projection; it is never an HTTP token or DTO. */
	async read(referenceId: string): Promise<HcmActionAuthorityRecord | null> {
		await this.assertTenant()
		const result = await sql<
			HcmActionAuthorityRecord & { expiresAt: number | string }
		>`SELECT id AS "referenceId",tenant_id AS "tenantId",actor_account_id AS "accountId",
			(extract(epoch FROM expires_at)*1000)::bigint AS "expiresAt",permission,scope_reference AS "scopeReference",intent_digest AS "intentDigest"
			FROM hcm.runtime_action_authorization WHERE tenant_id=${this.tenantId} AND id=${referenceId}`.execute(
				this.tx,
			)
		const row = result.rows[0]
		return row ? { ...row, expiresAt: Number(row.expiresAt) } : null
	}
}

export class KyselyHcmActionAuthorizationBinder extends HcmActionAuthorizationBinder {
	/** Reject non-transaction objects before touching durable authority data. */
	bind(transaction: unknown, tenantId: string): HcmActionAuthorizationStore {
		if (
			!transaction ||
			typeof transaction !== 'object' ||
			!('isTransaction' in transaction) ||
			!transaction.isTransaction
		)
			throw new HcmRuntimeError('forbidden')
		return new SqlActionAuthorizationStore(transaction as Kysely<unknown>, tenantId)
	}
}
