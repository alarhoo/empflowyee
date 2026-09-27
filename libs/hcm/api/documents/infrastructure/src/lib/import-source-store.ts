import { randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { DocumentError } from '@empflowyee/hcm-documents-contract'
import {
	DocumentFiles,
	DocumentStoragePort,
	IMPORT_SOURCE_MAX_BYTES,
	ImportSourceError,
	type ImportSourceFile,
	type ImportSourceMediaType,
	type DocumentFile,
	type ImportSourceStore,
	type OpenedAttachment,
	type StagedAttachment,
	type StagedImportSource,
} from '@empflowyee/hcm-api-documents-application'

/** Collect a bounded stream into memory; import sources are at most 5 MiB. */
async function collect(bytes: AsyncIterable<Uint8Array>): Promise<Buffer> {
	const chunks: Buffer[] = []
	let length = 0
	for await (const chunk of bytes) {
		length += chunk.byteLength
		if (length > IMPORT_SOURCE_MAX_BYTES) throw new ImportSourceError('file-too-large')
		chunks.push(Buffer.from(chunk))
	}
	return Buffer.concat(chunks)
}

/** Yield one buffer as a byte stream. */
async function* stream(bytes: Buffer): AsyncGenerator<Uint8Array> {
	yield bytes
}

/** Import sources in one authorized transaction. */
class KyselyImportSourceStore implements ImportSourceStore {
	/** Bind to the transaction, actor and private file store. */
	constructor(
		private readonly executor: Kysely<unknown>,
		private readonly actor: { tenantId: string; accountId: string },
		private readonly files: DocumentFiles,
	) {}

	/** Inspect, stage and publish the file, then record its Ready import-source blob. */
	async stageImportSource(input: {
		runId: string
		fileName: string
		bytes: Buffer
	}): Promise<StagedImportSource> {
		if (!input.runId) throw new DocumentError('invalid-request')
		const file = await this.files.stageImportSource(input.bytes, input.fileName)
		await this.files.publish(file)
		// A rolled-back transaction leaves only unreferenced bytes, never a Ready row.
		const blobId = randomUUID()
		const insert = sql`INSERT INTO hcm.document_blob(tenant_id,id,storage_key,sha256,byte_length,media_type,safe_filename,state,created_by_account_id,purpose)
			VALUES(${this.actor.tenantId},${blobId}::uuid,${file.key}::uuid,${file.sha256},${file.byteLength},${file.mediaType},${file.filename},'Ready',${this.actor.accountId},'import-source')`
		await insert.execute(this.executor)
		return { blobId, sha256: file.sha256, sizeBytes: file.byteLength, contentType: file.mediaType }
	}

	/** Read a Ready import source of the caller's tenant. */
	async openImportSource(
		blobId: string,
	): Promise<{ contentType: ImportSourceMediaType; bytes: Buffer }> {
		const file = (
			await sql<ImportSourceFile>`SELECT storage_key AS key,sha256,byte_length AS "byteLength",media_type AS "mediaType",safe_filename AS filename
				FROM hcm.document_blob WHERE tenant_id=${this.actor.tenantId} AND id=${blobId}::uuid AND purpose='import-source' AND state='Ready'`.execute(
				this.executor,
			)
		).rows[0]
		if (!file) throw new DocumentError('not-found')
		const opened = await this.files.open(file)
		try {
			return { contentType: file.mediaType, bytes: await collect(opened.bytes) }
		} finally {
			await opened.close()
		}
	}

	/** Verify, stage and publish an attachment, then record its Ready service-attachment blob. */
	async stageAttachment(input: {
		fileName: string
		mediaType: string
		bytes: Buffer
	}): Promise<StagedAttachment> {
		const file = await this.files.stage(stream(input.bytes), input.fileName, input.mediaType)
		await this.files.publish(file)
		const blobId = randomUUID()
		const insert = sql`INSERT INTO hcm.document_blob(tenant_id,id,storage_key,sha256,byte_length,media_type,safe_filename,state,created_by_account_id,purpose)
			VALUES(${this.actor.tenantId},${blobId}::uuid,${file.key}::uuid,${file.sha256},${file.byteLength},${file.mediaType},${file.filename},'Ready',${this.actor.accountId},'service-attachment')`
		await insert.execute(this.executor)
		return {
			blobId,
			fileName: file.filename,
			mediaType: file.mediaType,
			sizeBytes: file.byteLength,
		}
	}

	/** Open a Ready service attachment of the caller's tenant. */
	async openAttachment(blobId: string): Promise<OpenedAttachment> {
		const file = (
			await sql<DocumentFile>`SELECT storage_key AS key,sha256,byte_length AS "byteLength",media_type AS "mediaType",safe_filename AS filename
				FROM hcm.document_blob WHERE tenant_id=${this.actor.tenantId} AND id=${blobId}::uuid AND purpose='service-attachment' AND state='Ready'`.execute(
				this.executor,
			)
		).rows[0]
		if (!file) throw new DocumentError('not-found')
		const opened = await this.files.open(file)
		return {
			...opened,
			fileName: file.filename,
			mediaType: file.mediaType,
			sizeBytes: file.byteLength,
		}
	}
}

/** Binds import source stores to callers' transactions over the configured private file store. */
export class KyselyDocumentStoragePort extends DocumentStoragePort {
	/** Use the documents file store. */
	constructor(private readonly files: DocumentFiles) {
		super()
	}

	/** Return a store that writes inside the given transaction as the given actor. */
	bind(transaction: unknown, actor: { tenantId: string; accountId: string }): ImportSourceStore {
		return new KyselyImportSourceStore(transaction as Kysely<unknown>, actor, this.files)
	}
}
