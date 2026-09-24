import { createHash, randomUUID } from 'node:crypto'
import {
	DocumentError,
	documentId,
	parseDocumentTypeCreate,
	parseDocumentTypeUpdate,
	type DocumentType,
	type DocumentTypePage,
	type DocumentTypeQuery,
	type DocumentTypeCreate,
} from '@empflowyee/hcm-documents-contract'
import { requireDocumentRevision } from '@empflowyee/hcm-api-documents-domain'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type { AppendAudit } from '@empflowyee/hcm-api-audit-application'
export interface DocumentTypeRepository {
	/** Query one bounded tenant-owned classification page. */
	list(query: DocumentTypeQuery): Promise<DocumentTypePage>
	/** Read one tenant-owned type without exposing a foreign record. */
	get(id: string): Promise<DocumentType>
	/** Create an immutable classification code. */
	create(id: string, value: DocumentTypeCreate): Promise<DocumentType>
	/** Update only mutable fields at the supplied current revision. */
	update(value: DocumentType): Promise<DocumentType>
}
export interface DocumentReceipt {
	requestHash: string
	response: DocumentType
}
export interface DocumentWork {
	types: DocumentTypeRepository
	audit: AppendAudit
	receipts: {
		/** Read actor/operation-bound successful retry evidence. */
		get(operation: string, key: string): Promise<DocumentReceipt | null>
		/** Commit a safe response atomically with classification and audit. */
		save(operation: string, key: string, value: DocumentReceipt): Promise<void>
	}
}
export abstract class DocumentUnitOfWork {
	/** Reauthorize current authority and bind repositories to one tenant transaction. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		write: boolean,
		work: (scope: DocumentWork) => Promise<T>,
	): Promise<T>
}
export class DocumentTypes {
	/** Bind classification operations to domain-owned persistence ports. */
	constructor(private readonly unit: DocumentUnitOfWork) {}
	/** Read classifications including disabled types for authorized HR callers. */
	list(context: AuthenticatedHcmContext, query: DocumentTypeQuery): Promise<DocumentTypePage> {
		return this.unit.execute(
			context,
			'types.read',
			false,
			/** Keep all filter/query ownership in data access. */ (scope) => scope.types.list(query),
		)
	}
	/** Create a unique type without inventing retention or mandatory-document policy. */
	create(
		context: AuthenticatedHcmContext,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<DocumentType> {
		const value = parseDocumentTypeCreate(body)
		return this.command(
			context,
			'type.create',
			'',
			value,
			key,
			/** Persist safe classification and attributed evidence. */ async (scope) => {
				const result = await scope.types.create(randomUUID(), value)
				await scope.audit.append({
					action: 'document.type-created',
					targetId: result.id,
					requestId,
					summary: {
						reason: value.reason,
						changedFields: ['code', 'label', 'description', 'enabled'],
					},
				})
				return result
			},
		)
	}
	/** Edit one current revision, preserving immutable code and historical references. */
	update(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<DocumentType> {
		documentId(id)
		const value = parseDocumentTypeUpdate(body)
		return this.command(
			context,
			'type.update',
			id,
			value,
			key,
			/** Commit changed metadata and evidence together. */ async (scope) => {
				const current = await scope.types.get(id)
				requireDocumentRevision(current.revision, value.expectedRevision)
				const result = await scope.types.update({
					...current,
					label: value.label,
					description: value.description,
					enabled: value.enabled,
				})
				const changedFields: ('label' | 'description' | 'enabled')[] = []
				if (current.label !== value.label) changedFields.push('label')
				if (current.description !== value.description) changedFields.push('description')
				if (current.enabled !== value.enabled) changedFields.push('enabled')
				await scope.audit.append({
					action: 'document.type-updated',
					targetId: id,
					requestId,
					summary: { reason: value.reason, changedFields },
				})
				return result
			},
		)
	}
	/** Serialize writes and reauthorize before replaying an actor-bound receipt. */
	private command(
		context: AuthenticatedHcmContext,
		operation: string,
		target: string,
		payload: unknown,
		key: string,
		work: (scope: DocumentWork) => Promise<DocumentType>,
	): Promise<DocumentType> {
		if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))
			throw new DocumentError('invalid-request')
		const requestHash = createHash('sha256')
			.update(JSON.stringify([target, payload]))
			.digest('hex')
		return this.unit.execute(
			context,
			'types.manage',
			true,
			/** Keep receipts inside the same business transaction. */ async (scope) => {
				const prior = await scope.receipts.get(operation, key)
				if (prior) {
					if (prior.requestHash !== requestHash) throw new DocumentError('idempotency-conflict')
					return prior.response
				}
				const response = await work(scope)
				await scope.receipts.save(operation, key, { requestHash, response })
				return response
			},
		)
	}
}
