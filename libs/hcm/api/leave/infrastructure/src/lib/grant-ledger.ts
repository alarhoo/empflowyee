import { randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import {
	HcmDomainError,
	dateValue,
	enumValue,
	idValue,
	invalidField,
} from '@empflowyee/hcm-runtime-contract'
import { leaveUnits, type LeaveUnit } from '@empflowyee/hcm-leave-contract'
import { commandHash, requireIdempotencyKey } from '@empflowyee/hcm-api-runtime-application'
import type {
	LeaveGrantLedger,
	LeaveGrantPosting,
	LeavePostingReceipt,
} from '@empflowyee/hcm-api-leave-application'

/** Append authorized source grants using PostgreSQL's immutable evidence and account serialization; this adapter grants no human authority. */
export class KyselyLeaveGrantLedger implements LeaveGrantLedger {
	/** Reuse the caller's authorized transaction, verified tenant and actual acting account. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenantId: string,
		private readonly accountId: string,
	) {
		if (!transaction.isTransaction) throw new Error('Leave posting requires a tenant transaction')
		idValue(tenantId, 'tenantId')
		idValue(accountId, 'accountId')
	}

	/** Lock period before account, return original same-key results, and commit grant, posting and projection as one effect. */
	async postGrant(input: LeaveGrantPosting): Promise<LeavePostingReceipt> {
		const tenant = await sql<{
			tenant: string | null
		}>`SELECT hcm.current_tenant_id() AS tenant`.execute(this.transaction)
		if (tenant.rows[0]?.tenant !== this.tenantId) throw new HcmDomainError('forbidden')
		idValue(input.accountId, 'accountId')
		idValue(input.grantId, 'grantId')
		idValue(input.sourceReference, 'sourceReference')
		enumValue(input.grantType, 'grantType', [
			'Opening',
			'Annual',
			'Prorated',
			'CarryForward',
			'Statutory',
			'Event',
		])
		leaveUnits(input.units, 'units', 'positive')
		dateValue(input.effectiveDate, 'effectiveDate')
		if (input.expiresOn !== undefined) {
			dateValue(input.expiresOn, 'expiresOn')
			if (input.expiresOn < input.effectiveDate) invalidField('expiresOn', 'invalid-range')
		}
		requireIdempotencyKey(input.idempotencyKey)
		const digest = commandHash('LeaveGrant:1', {
			...input,
			idempotencyKey: input.idempotencyKey.toLowerCase(),
			actor: this.accountId,
		})
		const periods = await sql<{ id: string }>`SELECT p.id FROM hcm.leave_period p
      JOIN hcm.leave_enrollment e ON e.tenant_id=p.tenant_id AND e.period_id=p.id
      JOIN hcm.leave_balance_account a ON a.tenant_id=e.tenant_id AND a.enrollment_id=e.id
      WHERE a.tenant_id=${this.tenantId} AND a.id=${input.accountId} FOR SHARE OF p`.execute(
			this.transaction,
		)
		if (!periods.rows[0]) throw new HcmDomainError('not-found')
		const accounts = await sql<{
			enrollmentId: string
			unit: LeaveUnit
		}>`SELECT enrollment_id AS "enrollmentId",unit FROM hcm.leave_balance_account
      WHERE tenant_id=${this.tenantId} AND id=${input.accountId} FOR UPDATE`.execute(
			this.transaction,
		)
		const account = accounts.rows[0]
		if (!account) throw new HcmDomainError('not-found')
		const previous = await this.receipt(input.accountId, input.idempotencyKey)
		if (previous) {
			if (previous.digest !== digest) throw new HcmDomainError('idempotency-conflict')
			return previous.view
		}
		await sql`INSERT INTO hcm.leave_entitlement_grant(tenant_id,id,enrollment_id,unit,grant_type,granted_units,grant_date,expires_on,source_reference,input_digest,idempotency_key,created_by_account_id)
      VALUES(${this.tenantId},${input.grantId},${account.enrollmentId},${account.unit},${input.grantType},${input.units}::hcm.leave_units,${input.effectiveDate}::date,${input.expiresOn ?? null}::date,${input.sourceReference},${digest},${input.idempotencyKey}::uuid,${this.accountId})`.execute(
			this.transaction,
		)
		await sql`INSERT INTO hcm.leave_balance_transaction(tenant_id,id,account_id,unit,transaction_type,units_delta,effective_date,entitlement_grant_id,idempotency_key,input_digest,posted_by_account_id)
      VALUES(${this.tenantId},${randomUUID()},${input.accountId},${account.unit},'Grant',${input.units}::hcm.leave_units,${input.effectiveDate}::date,${input.grantId},${input.idempotencyKey}::uuid,${digest},${this.accountId})`.execute(
			this.transaction,
		)
		const stored = await this.receipt(input.accountId, input.idempotencyKey)
		if (!stored) throw new Error('Leave posting receipt unavailable in its transaction')
		return stored.view
	}

	/** Read only the immutable safe posting result, keeping internal digest checks out of response DTOs. */
	private async receipt(
		accountId: string,
		key: string,
	): Promise<{ digest: string; view: LeavePostingReceipt } | null> {
		const found = await sql<{
			digest: string
			view: LeavePostingReceipt
		}>`SELECT t.input_digest AS digest,
      jsonb_build_object('transactionId',t.id,'sequence',t.sequence_number::text,'date',t.effective_date::text,'type',t.transaction_type,
        'units',t.units_delta::text,'unit',t.unit,'sourceReference',g.source_reference,'runningUnits',t.balance_after_units::text) AS view
      FROM hcm.leave_balance_transaction t JOIN hcm.leave_entitlement_grant g ON g.tenant_id=t.tenant_id AND g.id=t.entitlement_grant_id
      WHERE t.tenant_id=${this.tenantId} AND t.account_id=${accountId} AND t.idempotency_key=${key}::uuid`.execute(
			this.transaction,
		)
		return found.rows[0] ?? null
	}
}
