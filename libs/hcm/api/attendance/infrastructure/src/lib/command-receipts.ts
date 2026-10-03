import { randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { idValue, revisionValue } from '@empflowyee/hcm-runtime-contract'
import {
	requireIdempotencyKey,
	type BoundFieldCipher,
	type CommandReceipt,
} from '@empflowyee/hcm-api-runtime-application'
import type {
	AttendanceCommandReceiptStore,
	AttendanceConfigurationEvidence,
} from '@empflowyee/hcm-api-attendance-application'

/** Durable human command receipts with owner-encrypted reasons and per-key concurrent replay serialization. */
export class SqlAttendanceCommandReceipts implements AttendanceCommandReceiptStore {
	private evidence: AttendanceConfigurationEvidence | undefined

	/** Bind verified identity, cipher and SQL to one already authorized Attendance transaction. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenantId: string,
		private readonly accountId: string,
		private readonly cipher: BoundFieldCipher,
	) {
		idValue(tenantId, 'tenantId')
		idValue(accountId, 'accountId')
		if (!transaction.isTransaction)
			throw new Error('Attendance receipts require a tenant transaction')
	}

	/** Retain only validated source identity and a bounded reason, without placing its plaintext in shared audit. */
	setEvidence(evidence: AttendanceConfigurationEvidence): void {
		if (this.evidence) throw new Error('Command evidence already established')
		if (!['Schedule', 'Shift', 'Policy', 'Holiday', 'Override'].includes(evidence.owner))
			throw new Error('Unsupported configuration owner')
		idValue(evidence.versionId, 'versionId')
		revisionValue(evidence.revision, 'revision')
		if (
			evidence.reason !== null &&
			(typeof evidence.reason !== 'string' ||
				!evidence.reason.trim() ||
				evidence.reason.length > 2000)
		)
			throw new Error('Invalid configuration reason')
		this.evidence = { ...evidence }
	}

	/** Lock the actor/operation/key before reading so racing identical retries observe the first durable result. */
	async get(operation: string, key: string): Promise<CommandReceipt | null> {
		requireIdempotencyKey(key)
		const identity = JSON.stringify([this.tenantId, this.accountId, operation, key.toLowerCase()])
		await sql`SELECT pg_advisory_xact_lock(hashtextextended(${identity},40))`.execute(
			this.transaction,
		)
		const result = await sql<CommandReceipt>`
SELECT request_hash AS "requestHash",response FROM hcm.attendance_command_receipt
WHERE tenant_id=${this.tenantId} AND actor_kind='Human' AND actor_account_id=${this.accountId}
  AND operation=${operation} AND idempotency_key=${key}::uuid
`.execute(this.transaction)
		return result.rows[0] ?? null
	}

	/** Seal the private reason against the actual receipt ID and append source/result evidence atomically with business writes. */
	async save(operation: string, key: string, receipt: CommandReceipt): Promise<void> {
		const evidence = this.evidence
		if (!evidence) throw new Error('Command source evidence required')
		const id = randomUUID()
		const target = { table: 'attendance_command_receipt', column: 'encrypted_reason', rowId: id }
		const sealed =
			evidence.reason === null ? null : await this.cipher.encrypt(target, evidence.reason)
		const schedule = evidence.owner === 'Schedule' ? evidence.versionId : null
		const shift = evidence.owner === 'Shift' ? evidence.versionId : null
		const policy = evidence.owner === 'Policy' ? evidence.versionId : null
		const holiday = evidence.owner === 'Holiday' ? evidence.versionId : null
		const override = evidence.owner === 'Override' ? evidence.versionId : null
		await sql`
INSERT INTO hcm.attendance_command_receipt(tenant_id,id,actor_account_id,operation,idempotency_key,request_hash,response,source_revision,
  work_schedule_version_id,shift_version_id,attendance_policy_version_id,holiday_calendar_version_id,schedule_override_id,encrypted_reason,reason_key_version)
VALUES(${this.tenantId},${id},${this.accountId},${operation},${key}::uuid,${receipt.requestHash},${JSON.stringify(receipt.response)}::jsonb,${evidence.revision},
  ${schedule},${shift},${policy},${holiday},${override},${sealed?.ciphertext ?? null},${sealed?.keyVersion ?? null})
`.execute(this.transaction)
	}
}
