import type {
	EvidenceSubject,
	StagedEvidence,
	EvidenceFileView,
	EvidencePurpose,
} from '@empflowyee/hcm-documents-contract'
import type { DocumentFile, OpenDocumentFile } from './document-files'

/** Documents owns validation and immutable evidence binding; callers own current business and field authority. */
export interface DocumentEvidenceStore {
	/** Return bounded source metadata to its owner for current per-classification projection. */
	list(purpose: EvidencePurpose, subject: string, sourceId: string): Promise<EvidenceFileView[]>

	/** Validate and publish private bytes for an exact subject/uploader; return only a committed clean reference. */
	stage(
		subject: EvidenceSubject,
		key: string,
		bytes: AsyncIterable<Uint8Array>,
		filename: string,
		mediaType: string,
	): Promise<StagedEvidence & { created: boolean }>
	/** Attach the original uploader's clean reference once to the exact business source. */
	attach(subject: EvidenceSubject, id: string, sourceId: string): Promise<void>
	/** Resolve metadata only inside the caller's authorized source scope. */
	inspect(id: string): Promise<EvidenceSubject & { uploaderId: string; sourceId: string | null }>
	/** Open verified bytes after the source checks its independent field permission. */
	open(subject: EvidenceSubject, id: string): Promise<OpenDocumentFile & { file: DocumentFile }>
}
export abstract class DocumentEvidenceBinder {
	/** Bind an already authorized tenant transaction; never infer authority from the supplied actor. */
	abstract bind(
		transaction: unknown,
		actor: { tenantId: string; accountId: string },
	): DocumentEvidenceStore
}
