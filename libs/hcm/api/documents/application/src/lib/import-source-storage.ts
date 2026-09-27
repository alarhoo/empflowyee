import type { ImportSourceMediaType } from './import-source-reader'

/** A staged and published import source, identified by its blob. */
export interface StagedImportSource {
	blobId: string
	sha256: string
	sizeBytes: number
	contentType: ImportSourceMediaType
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
}

/** Bind the import source store to a caller's open, authorized transaction. */
export abstract class DocumentStoragePort {
	/** Return a store that writes inside the given transaction as the given actor. */
	abstract bind(
		transaction: unknown,
		actor: { tenantId: string; accountId: string },
	): ImportSourceStore
}
