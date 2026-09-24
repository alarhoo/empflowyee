import {
	DocumentError,
	documentId,
	parseWorkerDocumentCreate,
	parseWorkerDocumentAppend,
	type WorkerDocumentCreate,
	type WorkerDocumentAppend,
	type WorkerDocument,
	type WorkerDocumentVersion,
	type WorkerDocumentQuery,
	type WorkerChoice,
	type WorkerQuery,
	type VersionQuery,
	type DocumentPage,
	type WorkerUploadResult,
	type DocumentTypeQuery,
} from '@empflowyee/hcm-documents-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import { DocumentFiles, type DocumentFile } from './document-files'
import { DocumentFileCommands, type FileReservation } from './document-file-commands'

export type WorkerIntent =
	| { kind: 'worker-create'; targetId: string; value: WorkerDocumentCreate }
	| { kind: 'worker-append'; targetId: string; value: WorkerDocumentAppend }
export type WorkerReservation = FileReservation<WorkerUploadResult>
export interface WorkerFileRepository {
	/** Resolve real workforce choices through a read-only consumer port. */ workers(
		query: WorkerQuery,
	): Promise<DocumentPage<WorkerChoice>>
	/** Change one version sharing flag under its own revision and record receipt/audit atomically. */ share(
		id: string,
		versionId: string,
		value: WorkerDocumentAppend,
		key: string,
		requestId: string,
	): Promise<WorkerDocumentVersion>

	/** Query only worker document metadata under current read authority. */
	list(query: WorkerDocumentQuery): Promise<DocumentPage<WorkerDocument>>
	/** Read one exact tenant-owned worker document without revealing foreign records. */
	get(id: string): Promise<WorkerDocument>
	/** Project only committed Ready versions. */
	versions(id: string, query: VersionQuery): Promise<DocumentPage<WorkerDocumentVersion>>
	/** Supply enabled type choices under worker document-management authority. */
	types(
		query: DocumentTypeQuery,
	): Promise<DocumentPage<{ id: string; code: string; label: string }>>
	/** Revalidate enabled type or exact existing aggregate revision. */
	validate(intent: WorkerIntent): Promise<void>
	/** Inspect one actor/operation-bound reservation. */
	find(operation: string, key: string): Promise<WorkerReservation | null>
	/** Persist a staged file and enough safe intent for an authenticated retry. */
	reserve(
		intent: WorkerIntent,
		key: string,
		hash: string,
		file: DocumentFile,
	): Promise<WorkerReservation>
	/** Commit Ready bytes, version, audit and response receipt atomically. */
	finish(
		intent: WorkerIntent,
		key: string,
		reservation: WorkerReservation,
		requestId: string,
	): Promise<WorkerUploadResult>
	/** Read only a Ready file attached to the specified worker document/version. */
	download(id: string, versionId: string): Promise<DocumentFile>
	/** Append authorization before releasing bytes or record an observed related outcome. */
	auditDownload(
		id: string,
		requestId: string,
		phase: 'Authorized' | 'Completed' | 'Failed',
		relatedId?: string,
	): Promise<string>
}
export abstract class WorkerFileUnitOfWork {
	/** Authorize from persisted grants inside the tenant transaction. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		write: boolean,
		work: (repo: WorkerFileRepository) => Promise<T>,
	): Promise<T>
	/** Mark only a previously reserved actor-owned attempt failed; never perform a business mutation. */
	abstract fail(context: AuthenticatedHcmContext, reservationId: string): Promise<void>
}
export class WorkerFiles extends DocumentFileCommands<
	WorkerIntent,
	WorkerUploadResult,
	WorkerFileRepository
> {
	/** Compose authorized metadata transactions with durable private storage. */
	constructor(unit: WorkerFileUnitOfWork, files: DocumentFiles) {
		super(unit, files, 'worker.manage', 'worker.download')
	}
	/** Read a bounded worker document list through the owning query repository. */
	list(context: AuthenticatedHcmContext, query: WorkerDocumentQuery) {
		return this.unit.execute(
			context,
			'worker.read',
			false,
			/** Preserve server query ownership. */ (repo) => repo.list(query),
		)
	}
	/** Read a selected aggregate for the routed detail page. */
	get(context: AuthenticatedHcmContext, id: string) {
		documentId(id)
		return this.unit.execute(
			context,
			'worker.read',
			false,
			/** Resolve one tenant-owned target. */ (repo) => repo.get(id),
		)
	}
	/** Query the selected object's immutable versions. */
	versions(context: AuthenticatedHcmContext, id: string, query: VersionQuery) {
		documentId(id)
		return this.unit.execute(
			context,
			'worker.read',
			false,
			/** Scope children to the selected aggregate. */ (repo) => repo.versions(id, query),
		)
	}
	/** List enabled type choices without requiring classification-management permission. */
	types(context: AuthenticatedHcmContext, query: DocumentTypeQuery) {
		if (query.enabled !== true) throw new DocumentError('invalid-request')
		return this.unit.execute(
			context,
			'worker.manage',
			false,
			/** Return only bounded picker fields. */ (repo) => repo.types(query),
		)
	}
	/** Search tenant workers without requiring or creating login accounts. */
	workers(context: AuthenticatedHcmContext, query: WorkerQuery) {
		return this.unit.execute(
			context,
			'worker.read',
			false,
			/** Keep workforce projections read-only. */ (repo) => repo.workers(query),
		)
	}
	/** Share only the exact selected version; earlier and later versions remain unchanged. */
	share(
		context: AuthenticatedHcmContext,
		id: string,
		versionId: string,
		body: unknown,
		key: string,
		requestId: string,
	) {
		documentId(id)
		documentId(versionId)
		documentId(key)
		const value = parseWorkerDocumentAppend(body)
		return this.unit.execute(
			context,
			'worker.manage',
			true,
			/** Serialize visibility, audit and retry evidence. */ (repo) =>
				repo.share(id, versionId, value, key, requestId),
		)
	}
	/** Parse and authorize target metadata before transport starts streaming the file. */
	async prepare(
		context: AuthenticatedHcmContext,
		target: string | null,
		body: unknown,
		key: string,
	): Promise<WorkerIntent> {
		if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))
			throw new DocumentError('invalid-request')
		let intent: WorkerIntent
		if (target === null)
			intent = { kind: 'worker-create', targetId: '', value: parseWorkerDocumentCreate(body) }
		else
			intent = {
				kind: 'worker-append',
				targetId: documentId(target),
				value: parseWorkerDocumentAppend(body),
			}
		await this.unit.execute(
			context,
			'worker.manage',
			false,
			/** Existing receipt replay remains possible after its original revision changes. */ async (
				repo,
			) => {
				if (!(await repo.find(intent.kind, key))) await repo.validate(intent)
			},
		)
		return intent
	}
}
