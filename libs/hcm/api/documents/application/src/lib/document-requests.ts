import {
	DocumentError,
	documentId,
	parseDocumentRequestCreate,
	parseDocumentRequestTransition,
	parseDocumentRequestSubmit,
	type DocumentRequest,
	type SelfDocumentRequest,
	type RequestView,
	type DocumentRequestScope,
	type DocumentRequestQuery,
	type DocumentRequestCreate,
	type DocumentRequestTransition,
	type DocumentRequestSubmit,
	type DocumentVersion,
	type DocumentPage,
	type VersionQuery,
	type WorkerQuery,
	type WorkerChoice,
	type DocumentTypeQuery,
} from '@empflowyee/hcm-documents-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import { DocumentFiles } from './document-files'
import { DocumentFileCommands, type FileRepository } from './document-file-commands'
import { authorizedDocumentDownload } from './document-download'
export type RequestIntent = {
	kind: 'request-submit'
	targetId: string
	value: DocumentRequestSubmit
}
export type RequestAction = 'accept' | 'replacement' | 'cancel'
export interface DocumentRequestRepository extends FileRepository<
	RequestIntent,
	SelfDocumentRequest
> {
	/** Read only the scope selected by the authorized unit. */ list(
		query: DocumentRequestQuery,
	): Promise<DocumentPage<RequestView>>
	/** Resolve an exact authorized request. */ get(id: string): Promise<RequestView>
	/** Read immutable submissions including prior replacement cycles. */ versions(
		id: string,
		query: VersionQuery,
	): Promise<DocumentPage<DocumentVersion>>
	/** Create a request, notification and audit in one transaction. */ create(
		value: DocumentRequestCreate,
		key: string,
		requestId: string,
	): Promise<DocumentRequest>
	/** Apply a revisioned manual transition and its transactional evidence. */ transition(
		id: string,
		action: RequestAction,
		value: DocumentRequestTransition,
		key: string,
		requestId: string,
	): Promise<DocumentRequest>
	/** Supply existing workforce identities, including workers without accounts. */ workers(
		query: WorkerQuery,
	): Promise<DocumentPage<WorkerChoice>>
	/** Supply enabled classification choices under request-management authority. */ types(
		query: DocumentTypeQuery,
	): Promise<DocumentPage<{ id: string; code: string; label: string }>>
}
export abstract class DocumentRequestUnit {
	/** Bind every operation to fresh persisted authority and an explicit self or HR adapter. */ abstract execute<
		T,
	>(
		context: AuthenticatedHcmContext,
		permission: string,
		write: boolean,
		work: (repo: DocumentRequestRepository) => Promise<T>,
	): Promise<T>
	/** Terminate only the actor's already reserved upload after a lifecycle conflict. */ abstract fail(
		context: AuthenticatedHcmContext,
		id: string,
	): Promise<void>
}
export class DocumentRequests extends DocumentFileCommands<
	RequestIntent,
	SelfDocumentRequest,
	DocumentRequestRepository
> {
	/** Share the file protocol while keeping request lifecycle ownership separate. */ constructor(
		unit: DocumentRequestUnit,
		private readonly requestFiles: DocumentFiles,
	) {
		super(unit, requestFiles, 'requests.self.submit', 'requests.self.download')
	}
	/** Query bounded requests using the explicit endpoint scope. */ list(
		context: AuthenticatedHcmContext,
		scope: DocumentRequestScope,
		query: DocumentRequestQuery,
	) {
		return this.unit.execute(
			context,
			this.permission(scope, 'read'),
			false,
			/** Keep queries in the authorized scope. */ (repo) => repo.list(query),
		)
	}
	/** Resolve a deep link with the same subject restrictions as its collection. */ get(
		context: AuthenticatedHcmContext,
		scope: DocumentRequestScope,
		id: string,
	) {
		documentId(id)
		return this.unit.execute(
			context,
			this.permission(scope, 'read'),
			false,
			/** Conceal inaccessible targets. */ (repo) => repo.get(id),
		)
	}
	/** List retained submissions for the selected request. */ versions(
		context: AuthenticatedHcmContext,
		scope: DocumentRequestScope,
		id: string,
		query: VersionQuery,
	) {
		documentId(id)
		return this.unit.execute(
			context,
			this.permission(scope, 'read'),
			false,
			/** Keep child pagination bound to its parent. */ (repo) => repo.versions(id, query),
		)
	}
	/** Create only a real worker/type request through the owning transaction. */ create(
		context: AuthenticatedHcmContext,
		body: unknown,
		key: string,
		requestId: string,
	) {
		const value = parseDocumentRequestCreate(body)
		return this.unit.execute(
			context,
			'requests.manage',
			true,
			/** Persist notification and evidence atomically. */ (repo) =>
				repo.create(value, key, requestId),
		)
	}
	/** Keep acceptance, replacement and cancellation revisioned and idempotent. */ transition(
		context: AuthenticatedHcmContext,
		id: string,
		action: RequestAction,
		body: unknown,
		key: string,
		requestId: string,
	) {
		documentId(id)
		const value = parseDocumentRequestTransition(body, action)
		return this.unit.execute(
			context,
			'requests.manage',
			true,
			/** Apply only the approved state transition. */ (repo) =>
				repo.transition(id, action, value, key, requestId),
		)
	}
	/** Validate metadata before transport streams any employee file. */ async prepare(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
	): Promise<RequestIntent> {
		const intent: RequestIntent = {
			kind: 'request-submit',
			targetId: documentId(id),
			value: parseDocumentRequestSubmit(body),
		}
		await this.unit.execute(
			context,
			'requests.self.submit',
			false,
			/** Permit actor-bound retries after the successful transition. */ async (repo) => {
				if (!(await repo.find(intent.kind, key))) await repo.validate(intent)
			},
		)
		return intent
	}
	/** Download through the exact HR or own endpoint, with current access audit. */ attachment(
		context: AuthenticatedHcmContext,
		scope: DocumentRequestScope,
		id: string,
		versionId: string,
		requestId: string,
	) {
		return authorizedDocumentDownload(
			this.unit,
			this.requestFiles,
			this.permission(scope, 'download'),
			context,
			id,
			versionId,
			requestId,
		)
	}
	/** Supply a bounded worker picker without exposing workforce mutation. */ workers(
		context: AuthenticatedHcmContext,
		query: WorkerQuery,
	) {
		return this.unit.execute(
			context,
			'requests.manage',
			false,
			/** Read real tenant identities. */ (repo) => repo.workers(query),
		)
	}
	/** Allow only enabled classifications for new requests. */ types(
		context: AuthenticatedHcmContext,
		query: DocumentTypeQuery,
	) {
		if (query.enabled !== true) throw new DocumentError('invalid-request')
		return this.unit.execute(
			context,
			'requests.manage',
			false,
			/** Project the approved picker fields. */ (repo) => repo.types(query),
		)
	}
	/** Keep endpoint scope independent from discovery visibility. */ private permission(
		scope: DocumentRequestScope,
		operation: 'read' | 'download',
	) {
		return 'requests.' + (scope === 'own' ? 'self.' : '') + operation
	}
}
