import type { EvidencePurpose } from '@empflowyee/hcm-documents-contract'
import { EVIDENCE_MAX_ATTACHMENTS, type EvidenceFileView } from '@empflowyee/hcm-documents-contract'
import { randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { commandHash, requireIdempotencyKey } from '@empflowyee/hcm-api-runtime-application'
import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'
import {
	parseEvidenceSubject,
	type EvidenceSubject,
	type StagedEvidence,
} from '@empflowyee/hcm-documents-contract'
import {
	DocumentEvidenceBinder,
	DocumentFiles,
	type DocumentEvidenceStore,
	type DocumentFile,
} from '@empflowyee/hcm-api-documents-application'

interface EvidenceRow extends EvidenceSubject {
	id: string
	uploaderId: string
	sourceId: string | null
	validation: 'Pending' | 'Clean' | 'Blocked'
	fileState: string
	file: DocumentFile
}

class SqlDocumentEvidence implements DocumentEvidenceStore {
	/** Use only the caller's existing authorized transaction and private file adapter. */
	constructor(
		private readonly tx: Kysely<unknown>,
		private readonly actor: { tenantId: string; accountId: string },
		private readonly files: DocumentFiles,
	) {}
	/** Reject forged tenant bindings before reading or storing any bytes. */
	private async tenantBound(): Promise<void> {
		const result = await sql<{
			tenant: string | null
		}>`SELECT hcm.current_tenant_id() AS tenant`.execute(this.tx)
		if (!this.tx.isTransaction || result.rows[0]?.tenant !== this.actor.tenantId)
			throw new HcmDomainError('forbidden')
	}
	/** Retain a closed immutable subject and inspect exact tenant-owned evidence only. */
	private async row(id: string): Promise<EvidenceRow> {
		await this.tenantBound()
		idValue(id, 'evidenceId')
		const result =
			await sql<EvidenceRow>`SELECT e.id,e.purpose,e.subject,e.classification,e.uploader_account_id AS "uploaderId",e.validation,a.source_id AS "sourceId",b.state AS "fileState",jsonb_build_object('key',b.storage_key,'sha256',b.sha256,'byteLength',b.byte_length,'mediaType',b.media_type,'filename',b.safe_filename) AS file FROM hcm.document_business_evidence e JOIN hcm.document_blob b ON b.tenant_id=e.tenant_id AND b.id=e.blob_id LEFT JOIN hcm.document_evidence_attachment a ON a.tenant_id=e.tenant_id AND a.evidence_id=e.id WHERE e.tenant_id=${this.actor.tenantId} AND e.id::text=${id}`.execute(
				this.tx,
			)
		if (!result.rows[0]) throw new HcmDomainError('not-found')
		return result.rows[0]
	}
	/** Apply the existing file checks before clean admission; same-key retries compare immutable content and metadata. */
	async stage(
		subject: EvidenceSubject,
		key: string,
		bytes: AsyncIterable<Uint8Array>,
		filename: string,
		mediaType: string,
	): Promise<StagedEvidence & { created: boolean }> {
		await this.tenantBound()
		const target = parseEvidenceSubject(subject)
		requireIdempotencyKey(key)
		await sql`SELECT pg_advisory_xact_lock(hashtextextended(${this.actor.tenantId + ':evidence:' + this.actor.accountId + ':' + key},0))`.execute(
			this.tx,
		)
		const file = await this.files.stage(bytes, filename, mediaType)
		const digest = commandHash('DocumentEvidence:1', [
			target.purpose,
			target.subject,
			target.classification,
			file.sha256,
			file.byteLength,
			file.mediaType,
			file.filename,
		])
		const prior = (
			await sql<{
				id: string
				digest: string
				validation: string
			}>`SELECT id,payload_hash AS digest,validation FROM hcm.document_business_evidence WHERE tenant_id=${this.actor.tenantId} AND uploader_account_id=${this.actor.accountId} AND command_key=${key}::uuid`.execute(
				this.tx,
			)
		).rows[0]
		if (prior) {
			if (prior.digest !== digest) throw new HcmDomainError('idempotency-conflict')
			if (prior.validation !== 'Clean') throw new HcmDomainError('record-incomplete')
			return {
				created: false,
				id: prior.id,
				validation: 'Clean',
				classification: target.classification,
			}
		}
		await this.files.publish(file)
		const verified = await this.files.open(file)
		await verified.close()
		const id = randomUUID(),
			blobId = randomUUID()
		await sql`INSERT INTO hcm.document_blob(tenant_id,id,storage_key,sha256,byte_length,media_type,safe_filename,state,created_by_account_id,purpose) VALUES(${this.actor.tenantId},${blobId}::uuid,${file.key}::uuid,${file.sha256},${file.byteLength},${file.mediaType},${file.filename},'Ready',${this.actor.accountId},${target.purpose})`.execute(
			this.tx,
		)
		await sql`INSERT INTO hcm.document_business_evidence(tenant_id,id,blob_id,purpose,subject,classification,uploader_account_id,command_key,payload_hash,validation) VALUES(${this.actor.tenantId},${id}::uuid,${blobId}::uuid,${target.purpose},${target.subject},${target.classification},${this.actor.accountId},${key}::uuid,${digest},'Clean')`.execute(
			this.tx,
		)
		return { created: true, id, validation: 'Clean', classification: target.classification }
	}
	/** Keep the subject, classification and uploader exact; attachment is append-only and cannot move to another source. */
	async attach(subject: EvidenceSubject, id: string, sourceId: string): Promise<void> {
		const target = parseEvidenceSubject(subject),
			row = await this.row(id)
		idValue(sourceId, 'sourceId')
		this.match(row, target)
		if (row.uploaderId !== this.actor.accountId) throw new HcmDomainError('forbidden')
		if (row.sourceId && row.sourceId !== sourceId) throw new HcmDomainError('invalid-state')
		await sql`INSERT INTO hcm.document_evidence_attachment(tenant_id,evidence_id,source_id) VALUES(${this.actor.tenantId},${id}::uuid,${sourceId}) ON CONFLICT DO NOTHING`.execute(
			this.tx,
		)
		const current = await this.row(id)
		if (current.sourceId !== sourceId) throw new HcmDomainError('invalid-state')
	}
	/** Read only clean attached metadata for the exact source; the caller must apply current field authority before returning it. */
	async list(
		purpose: EvidencePurpose,
		subject: string,
		sourceId: string,
	): Promise<EvidenceFileView[]> {
		await this.tenantBound()
		idValue(sourceId, 'sourceId')
		const rows = (
			await sql<EvidenceFileView>`SELECT e.id,e.classification,e.validation,b.safe_filename AS filename,b.byte_length AS "sizeBytes" FROM hcm.document_business_evidence e JOIN hcm.document_blob b ON b.tenant_id=e.tenant_id AND b.id=e.blob_id JOIN hcm.document_evidence_attachment a ON a.tenant_id=e.tenant_id AND a.evidence_id=e.id WHERE e.tenant_id=${this.actor.tenantId} AND e.purpose=${purpose} AND e.subject=${subject} AND a.source_id=${sourceId} AND e.validation='Clean' AND b.state='Ready' ORDER BY e.created_at,e.id LIMIT ${EVIDENCE_MAX_ATTACHMENTS + 1}`.execute(
				this.tx,
			)
		).rows
		if (rows.length > EVIDENCE_MAX_ATTACHMENTS) throw new HcmDomainError('record-incomplete')
		return rows
	}

	/** Expose only the binding needed by an owning source's independent authority check. */
	async inspect(
		id: string,
	): Promise<EvidenceSubject & { uploaderId: string; sourceId: string | null }> {
		const row = await this.row(id)
		return {
			purpose: row.purpose,
			subject: row.subject,
			classification: row.classification,
			uploaderId: row.uploaderId,
			sourceId: row.sourceId,
		}
	}
	/** Refuse pending, blocked, wrong-purpose or rebound evidence before opening verified private bytes. */
	private match(row: EvidenceRow, subject: EvidenceSubject): void {
		if (
			row.purpose !== subject.purpose ||
			row.subject !== subject.subject ||
			row.classification !== subject.classification
		)
			throw new HcmDomainError('not-found')
		if (row.validation !== 'Clean' || row.fileState !== 'Ready')
			throw new HcmDomainError('record-incomplete')
	}
	/** Return a verified private stream only after the owner supplied the exact authorized binding. */
	async open(subject: EvidenceSubject, id: string) {
		const row = await this.row(id)
		this.match(row, parseEvidenceSubject(subject))
		return { ...(await this.files.open(row.file)), file: row.file }
	}
}

export class KyselyDocumentEvidenceBinder extends DocumentEvidenceBinder {
	/** Reuse Documents' configured private file store without creating a new upload framework. */
	constructor(private readonly files: DocumentFiles) {
		super()
	}
	/** Preserve the caller's tenant transaction; each operation verifies its actual RLS binding. */
	bind(
		transaction: unknown,
		actor: { tenantId: string; accountId: string },
	): DocumentEvidenceStore {
		return new SqlDocumentEvidence(transaction as Kysely<unknown>, actor, this.files)
	}
}
