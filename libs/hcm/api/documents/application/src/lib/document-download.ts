import { DocumentError, documentId } from '@empflowyee/hcm-documents-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import { DocumentFiles, type DocumentFile, type OpenDocumentFile } from './document-files'
export interface DocumentDownloadRepository {
	/** Resolve only the exact authorized Ready file. */ download(
		id: string,
		versionId: string,
	): Promise<DocumentFile>
	/** Append current authorization or an observed outcome through audit ownership. */ auditDownload(
		id: string,
		requestId: string,
		phase: 'Authorized' | 'Completed' | 'Failed',
		relatedId?: string,
	): Promise<string>
}
export interface DocumentReadUnit<P extends DocumentDownloadRepository> {
	/** Authorize each read or audit transaction against current persisted grants. */ execute<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		write: boolean,
		work: (repo: P) => Promise<T>,
	): Promise<T>
}
export interface TemplateDownload extends OpenDocumentFile {
	file: DocumentFile
	/** Record observable completion separately from authorization. */ complete(
		ok: boolean,
	): Promise<void>
}
/** Open and audit before exposing bytes; each repository supplies its own tenant/subject policy. */
export async function authorizedDocumentDownload<P extends DocumentDownloadRepository>(
	unit: DocumentReadUnit<P>,
	files: DocumentFiles,
	permission: string,
	context: AuthenticatedHcmContext,
	id: string,
	versionId: string,
	requestId: string,
): Promise<TemplateDownload> {
	documentId(id)
	documentId(versionId)
	let opened: OpenDocumentFile | undefined
	try {
		const authorized = await unit.execute(
			context,
			permission,
			true,
			/** Open verified bytes and append evidence within the authorized scope. */ async (repo) => {
				const file = await repo.download(id, versionId)
				opened = await files.open(file)
				const auditId = await repo.auditDownload(versionId, requestId, 'Authorized')
				return { file, auditId }
			},
		)
		if (!opened) throw new DocumentError('storage-unavailable')
		/** Record an observed stream result with a fresh authority check. */
		const complete = async (ok: boolean): Promise<void> => {
			await unit.execute(
				context,
				permission,
				true,
				/** Append one bounded completion event. */ (repo) =>
					repo.auditDownload(versionId, requestId, ok ? 'Completed' : 'Failed', authorized.auditId),
			)
		}
		return { ...opened, file: authorized.file, complete }
	} catch (error) {
		await opened?.close()
		throw error
	}
}
