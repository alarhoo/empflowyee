/** Internal file evidence; never serialize storage keys into business DTOs. */
export interface DocumentFile {
	key: string
	sha256: string
	byteLength: number
	mediaType: 'application/pdf' | 'image/png' | 'image/jpeg'
	filename: string
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
	/** Publish an existing verified staging file, or verify an already published retry. */
	abstract publish(file: DocumentFile): Promise<void>
	/** Open and verify immutable bytes without disclosing their filesystem path. */
	abstract open(file: DocumentFile): Promise<OpenDocumentFile>
}
