import type { ImportSourceMediaType } from './import-source-reader'
import type { OpenDocumentFile } from './document-files'

/** A staged and published import source, identified by its blob. */
export interface StagedImportSource {
	blobId: string
	sha256: string
	sizeBytes: number
	contentType: ImportSourceMediaType
}

/** A staged and published service attachment, identified by its blob. */
export interface StagedAttachment {
	blobId: string
	fileName: string
	mediaType: 'application/pdf' | 'image/png' | 'image/jpeg'
	sizeBytes: number
}

/** An opened service attachment; the caller closes it after streaming. */
export interface OpenedAttachment extends OpenDocumentFile {
	fileName: string
	mediaType: string
	sizeBytes: number
}

/**
 * Import source files in a caller's authorized transaction (documents IMPORT-SOURCE-FILES#CONTRACT).
 * Only Employee Import uses it; documents never exposes these files over HTTP.
 */
export interface ImportSourceStore {
	/** Inspect, stage and publish a CSV or XLSX file of at most 5 MiB for one import run. */
	stageImportSource(input: {
		runId: string
		fileName: string
		bytes: Buffer
	}): Promise<StagedImportSource>
	/** Read a Ready import source of the caller's tenant, bounded to 5 MiB. */
	openImportSource(blobId: string): Promise<{ contentType: ImportSourceMediaType; bytes: Buffer }>
	/**
	 * Stage and publish an HR service attachment: a verified PDF, PNG or JPEG of at most 10 MiB.
	 * Only the employee HR service reads it; documents never lists or serves it.
	 */
	stageAttachment(input: {
		fileName: string
		mediaType: string
		bytes: Buffer
	}): Promise<StagedAttachment>
	/** Open a Ready service attachment of the caller's tenant. */
	openAttachment(blobId: string): Promise<OpenedAttachment>
}

/** Bind the import source store to a caller's open, authorized transaction. */
export abstract class DocumentStoragePort {
	/** Return a store that writes inside the given transaction as the given actor. */
	abstract bind(
		transaction: unknown,
		actor: { tenantId: string; accountId: string },
	): ImportSourceStore
}
