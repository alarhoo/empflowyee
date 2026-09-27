import type { ImportSourceMediaType } from './import-source-reader'

/** Internal file evidence; never serialize storage keys into business DTOs. */
export interface DocumentFile {
	key: string
	sha256: string
	byteLength: number
	mediaType: 'application/pdf' | 'image/png' | 'image/jpeg'
	filename: string
}
/** Internal evidence of a staged import source; it never becomes a document. */
export interface ImportSourceFile extends Omit<DocumentFile, 'mediaType'> {
	mediaType: ImportSourceMediaType
}
export interface OpenDocumentFile {
	bytes: AsyncIterable<Uint8Array>
	/** Release the verified descriptor even when the HTTP client disconnects. */
	close(): Promise<void>
}
export abstract class DocumentFiles {
	/** Stream bounded, verified bytes to private durable staging after business authorization. */
	abstract stage(
		bytes: AsyncIterable<Uint8Array>,
		filename: string,
		mediaType: string,
	): Promise<DocumentFile>
	/** Stage an import source after inspecting its content; see IMPORT-SOURCE-FILES#POLICY. */
	abstract stageImportSource(bytes: Buffer, filename: string): Promise<ImportSourceFile>
	/** Publish an existing verified staging file, or verify an already published retry. */
	abstract publish(file: DocumentFile | ImportSourceFile): Promise<void>
	/** Open and verify immutable bytes without disclosing their filesystem path. */
	abstract open(file: DocumentFile | ImportSourceFile): Promise<OpenDocumentFile>
}
