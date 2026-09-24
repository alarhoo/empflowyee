import {
	documentId,
	type SelfDocument,
	type DocumentVersion,
	type DocumentPage,
	type TemplateQuery,
	type VersionQuery,
} from '@empflowyee/hcm-documents-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import { DocumentFiles } from './document-files'
import { authorizedDocumentDownload, type DocumentDownloadRepository } from './document-download'
export interface SelfDocumentRepository extends DocumentDownloadRepository {
	/** Return only own aggregates with visible Ready versions. */ list(
		query: TemplateQuery,
	): Promise<DocumentPage<SelfDocument>>
	/** Conceal hidden or another worker's aggregate at the object boundary. */ get(
		id: string,
	): Promise<SelfDocument>
	/** Omit hidden versions and their metadata from pagination. */ versions(
		id: string,
		query: VersionQuery,
	): Promise<DocumentPage<DocumentVersion>>
}
export abstract class SelfDocumentUnit {
	/** Bind self projections and access audit to current persisted authority. */ abstract execute<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		write: boolean,
		work: (repo: SelfDocumentRepository) => Promise<T>,
	): Promise<T>
}
export class SelfDocuments {
	/** Expose a read-only document application with no mutation or worker-selector port. */ constructor(
		private readonly unit: SelfDocumentUnit,
		private readonly files: DocumentFiles,
	) {}
	/** Query only the authenticated account's currently shared documents. */ list(
		context: AuthenticatedHcmContext,
		query: TemplateQuery,
	) {
		return this.unit.execute(
			context,
			'self.read',
			false,
			/** Keep filtering server-owned. */ (repo) => repo.list(query),
		)
	}
	/** Resolve a routed object only while at least one version remains shared. */ get(
		context: AuthenticatedHcmContext,
		id: string,
	) {
		documentId(id)
		return this.unit.execute(
			context,
			'self.read',
			false,
			/** Apply current ownership and sharing before returning metadata. */ (repo) => repo.get(id),
		)
	}
	/** Query visible versions without aggregate revisions or hidden counts. */ versions(
		context: AuthenticatedHcmContext,
		id: string,
		query: VersionQuery,
	) {
		documentId(id)
		return this.unit.execute(
			context,
			'self.read',
			false,
			/** Recheck the current self relationship. */ (repo) => repo.versions(id, query),
		)
	}
	/** Recheck sharing at download start, then release only verified audited bytes. */ download(
		context: AuthenticatedHcmContext,
		id: string,
		versionId: string,
		requestId: string,
	) {
		return authorizedDocumentDownload(
			this.unit,
			this.files,
			'self.download',
			context,
			id,
			versionId,
			requestId,
		)
	}
}
