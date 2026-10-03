import { randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import {
	HcmAccessDatabase,
	TransactionalAccessPolicy,
} from '@empflowyee/hcm-api-access-control-infrastructure'
import { classifyConstraint } from '@empflowyee/hcm-api-database-kysely'
import {
	requireAuthenticatedTenant,
	requireIdempotencyKey,
	type AuthenticatedHcmContext,
	type BoundFieldCipher,
	type CommandReceipt,
	type FieldCipher,
} from '@empflowyee/hcm-api-runtime-application'
import { idValue, preservedTextValue, revisionValue } from '@empflowyee/hcm-runtime-contract'
import {
	LeavePolicyUnit,
	type LeavePolicyEvidence,
	type LeavePolicyReceipts,
	type LeavePolicyWork,
} from '@empflowyee/hcm-api-leave-application'
import { KyselyLeavePolicyRepository } from './hcm-api-leave-infrastructure'
import { KyselyLeavePolicyQueries } from './policy-queries'

/** Retain actor-scoped policy retries and encrypted narrative in the command's own transaction. */
class SqlLeavePolicyReceipts implements LeavePolicyReceipts {
	private evidence: LeavePolicyEvidence | undefined
	/** Receive only the current unit's verified tenant, actor and bound cipher. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenantId: string,
		private readonly accountId: string,
		private readonly cipher: BoundFieldCipher,
	) {}

	/** Attach exact immutable source evidence once, without putting narrative in shared audit. */
	setEvidence(evidence: LeavePolicyEvidence): void {
		if (this.evidence) throw new Error('Leave command evidence already established')
		idValue(evidence.versionId, 'versionId')
		revisionValue(evidence.revision, 'revision')
		if (evidence.reason !== null) preservedTextValue(evidence.reason, 'reason', 2000)
		this.evidence = { ...evidence }
	}

	/** Serialize concurrent retries by the original tenant/actor/operation/key identity. */
	async get(operation: string, key: string): Promise<CommandReceipt | null> {
		requireIdempotencyKey(key)
		await sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([this.tenantId, this.accountId, operation, key.toLowerCase()])},60))`.execute(
			this.transaction,
		)
		const rows =
			await sql<CommandReceipt>`SELECT request_hash AS "requestHash",response FROM hcm.leave_command_receipt WHERE tenant_id=${this.tenantId} AND actor_account_id=${this.accountId} AND operation=${operation} AND idempotency_key=${key}::uuid`.execute(
				this.transaction,
			)
		return rows.rows[0] ?? null
	}

	/** Encrypt the original reason against its actual receipt identity and save the response atomically. */
	async save(operation: string, key: string, receipt: CommandReceipt): Promise<void> {
		if (!this.evidence) throw new Error('Leave command source evidence required')
		const id = randomUUID(),
			evidence = this.evidence
		const sealed =
			evidence.reason === null
				? null
				: await this.cipher.encrypt(
					{ table: 'leave_command_receipt', column: 'encrypted_reason', rowId: id },
					evidence.reason,
				)
		await sql`INSERT INTO hcm.leave_command_receipt(tenant_id,id,actor_account_id,operation,idempotency_key,request_hash,policy_version_id,source_revision,response,encrypted_reason,reason_key_version)
VALUES(${this.tenantId},${id},${this.accountId},${operation},${key}::uuid,${receipt.requestHash},${evidence.versionId},${evidence.revision},${JSON.stringify(receipt.response)}::jsonb,${sealed?.ciphertext ?? null},${sealed?.keyVersion ?? null})`.execute(
	this.transaction,
)
	}
}

/** Bind global policy configuration to exact current grants, entitlement, tenant locks and one SQL transaction. */
export class KyselyLeavePolicyUnit extends LeavePolicyUnit {
	/** Reuse Access's existing revocation-safe transaction and Runtime's field cipher. */
	constructor(
		private readonly database: HcmAccessDatabase | null,
		private readonly cipher: FieldCipher,
	) {
		super()
	}

	/** Require tenant-wide policy authority; reference selectors do not shrink or manufacture the operation grant. */
	async execute<T>(
		context: AuthenticatedHcmContext,
		operation: 'read' | 'draft',
		write: boolean,
		work: (scope: LeavePolicyWork) => Promise<T>,
	): Promise<T> {
		if (!this.database) throw new Error('Leave runtime unavailable')
		try {
			return await this.database.execute(
				context,
				{ permission: `hcm.leave.leave-policies.${operation}`, entitlement: 'hcm.leave' },
				write,
				/** All private evidence and writes share current tenant and actor authority. */ async (
					access,
				) => {
					const transaction = access.transaction as unknown as Kysely<unknown>
					const { tenantId, accountId } = access.actor
					if (!access.actor.grantId) throw new Error('Verified Leave policy grant unavailable')
					const result = await work({
						policies: new KyselyLeavePolicyRepository(transaction, tenantId, accountId),
						queries: new KyselyLeavePolicyQueries(
							transaction,
							tenantId,
							accountId,
							access.actor.grantId,
						),
						receipts: new SqlLeavePolicyReceipts(
							transaction,
							tenantId,
							accountId,
							this.cipher.bind(transaction, tenantId),
						),
						audit: access.audit,
						requireRead:
						/** A prior response remains private after a read grant is revoked. */ async () => {
							await new TransactionalAccessPolicy(access.transaction, context).require({
								permission: 'hcm.leave.leave-policies.read',
								entitlement: 'hcm.leave',
							})
						},
					})
					requireAuthenticatedTenant(context)
					return result
				},
			)
		} catch (error) {
			return classifyConstraint(error)
		}
	}
}
