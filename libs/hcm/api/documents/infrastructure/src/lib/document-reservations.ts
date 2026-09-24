import { randomUUID } from 'node:crypto'
import { sql } from 'kysely'
import { DocumentError } from '@empflowyee/hcm-documents-contract'
import type { AuthorizedAccessWork } from '@empflowyee/hcm-api-access-control-infrastructure'
import type {
	FileIntent,
	FileReservation,
	DocumentFile,
} from '@empflowyee/hcm-api-documents-application'
export class DocumentReservations<I extends FileIntent, R> {
	/** Use the caller's authorized transaction for every file reservation. */ constructor(
		private readonly scope: AuthorizedAccessWork,
	) {}
	/** Read reserved evidence and a completed response only for the original actor and command key. */
	async find(operation: string, key: string): Promise<FileReservation<R> | null> {
		const row = (
			await sql<
				FileReservation<R>
			>`SELECT a.id,a.aggregate_id AS "aggregateId",a.state,a.payload_hash AS "payloadHash",jsonb_build_object('key',b.storage_key,'sha256',b.sha256,'byteLength',b.byte_length,'mediaType',b.media_type,'filename',b.safe_filename) AS file,r.response AS result FROM hcm.document_upload_attempt a JOIN hcm.document_blob b ON b.tenant_id=a.tenant_id AND b.id=a.blob_id LEFT JOIN hcm.document_command_receipt r ON r.tenant_id=a.tenant_id AND r.actor_account_id=a.actor_account_id AND r.operation=a.operation AND r.idempotency_key=a.idempotency_key WHERE a.tenant_id=${this.scope.actor.tenantId} AND a.actor_account_id=${this.scope.actor.accountId} AND a.operation=${operation} AND a.idempotency_key=${key}::uuid`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (row?.state === 'Ready' && !row.result) throw new DocumentError('storage-unavailable')
		return row ?? null
	}
	/** Reserve immutable file evidence without exposing any template or version yet. */
	async reserve(
		intent: I,
		key: string,
		hash: string,
		file: DocumentFile,
	): Promise<FileReservation<R>> {
		const id = randomUUID(),
			blobId = randomUUID(),
			tenant = this.scope.actor.tenantId,
			actor = this.scope.actor.accountId
		await sql`INSERT INTO hcm.document_blob(tenant_id,id,storage_key,sha256,byte_length,media_type,safe_filename,state,created_by_account_id) VALUES(${tenant},${blobId}::uuid,${file.key}::uuid,${file.sha256},${file.byteLength},${file.mediaType},${file.filename},'Staged',${actor})`.execute(
			this.scope.transaction,
		)
		await sql`INSERT INTO hcm.document_upload_attempt(tenant_id,id,actor_account_id,operation,idempotency_key,payload_hash,blob_id,aggregate_id,expected_revision,safe_intent,state) VALUES(${tenant},${id}::uuid,${actor},${intent.kind},${key}::uuid,${hash},${blobId}::uuid,${intent.targetId},${intent.value.expectedRevision ?? null},${JSON.stringify(intent)}::jsonb,'Staged')`.execute(
			this.scope.transaction,
		)
		return {
			id,
			aggregateId: intent.targetId,
			state: 'Staged',
			payloadHash: hash,
			file,
			result: null,
		}
	}
}
