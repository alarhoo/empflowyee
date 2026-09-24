import { sql } from 'kysely'
import { randomUUID, createHash } from 'node:crypto'
import {
	DocumentError,
	type DocumentRequest,
	type SelfDocumentRequest,
	type RequestView,
	type DocumentRequestQuery,
	type DocumentRequestCreate,
	type DocumentRequestTransition,
	type DocumentVersion,
	type VersionQuery,
	type WorkerQuery,
	type DocumentTypeQuery,
} from '@empflowyee/hcm-documents-contract'
import {
	DocumentRequestUnit,
	TemplateFileUnitOfWork,
	type DocumentRequestRepository,
	type RequestIntent,
	type RequestAction,
	type FileReservation,
	type DocumentFile,
} from '@empflowyee/hcm-api-documents-application'
import {
	requireDocumentRevision,
	requireEnabledDocumentType,
	documentRequestTransition,
} from '@empflowyee/hcm-api-documents-domain'
import {
	HcmAccessDatabase,
	type AuthorizedAccessWork,
} from '@empflowyee/hcm-api-access-control-infrastructure'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import { documentNotificationWriter } from '@empflowyee/hcm-api-notifications-infrastructure'
import type { DocumentRequestAuditEvent } from '@empflowyee/hcm-api-audit-application'
import { KyselyDocumentWorkforce } from './workforce-reader'
import { KyselyDocumentTypes } from './hcm-api-documents-infrastructure'
import { DocumentReservations } from './document-reservations'
import { queryKey, after, page } from './document-pages'
import { appendDocumentDownloadAudit } from './document-download-audit'
const fields = sql`r.id,r.type_id AS "typeId",r.status,r.due_date::text AS "dueDate",r.instructions,r.revision,to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",r.accepted_version_id AS "acceptedVersionId"`
const hrFields = sql`${fields},r.worker_id AS "workerId",r.requested_by_account_id AS "requestedByAccountId"`
const ownFields = sql`${fields},(SELECT COALESCE(p.display_name,'Requesting account') FROM hcm.user_account a LEFT JOIN hcm.person p ON p.tenant_id=a.tenant_id AND p.id=a.person_id WHERE a.tenant_id=r.tenant_id AND a.id=r.requested_by_account_id) AS "requesterDisplayName"`
const versionFields = sql`v.id,v.version_number AS "versionNumber",b.safe_filename AS filename,b.media_type AS "mediaType",b.byte_length AS "byteLength",to_char(v.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"`
class RequestRepository implements DocumentRequestRepository {
	/** Derive own-scope only from the permission selected by the endpoint, never from request data. */ constructor(
		private readonly scope: AuthorizedAccessWork,
		private readonly own: boolean,
	) {}
	/** Resolve the current account subject before any self query. */ private async subject() {
		if (!this.own) return null
		return (await new KyselyDocumentWorkforce(this.scope).resolveOwnWorker())?.workerId ?? null
	}
	/** Query stable created-at/id pages with literal request-ID search and explicit subject ownership. */ async list(
		query: DocumentRequestQuery,
	) {
		const subject = await this.subject(),
			binding = queryKey(this.scope, query, 'requests:' + this.own + ':' + subject),
			position = after(query.cursor, binding),
			ascending = query.sort === 'createdAt:asc',
			order = ascending ? sql`ASC` : sql`DESC`,
			compare = ascending ? sql`>` : sql`<`,
			search = '%' + query.q.replace(/[\\%_]/g, '\\$&') + '%'
		if (
			position &&
			(typeof position.position !== 'string' ||
				!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(position.position) ||
				!Number.isFinite(Date.parse(position.position)))
		)
			throw new DocumentError('invalid-request')
		if (this.own && !subject) return { items: [], nextCursor: null }
		const rows = (
			await sql<RequestView>`SELECT ${this.own ? ownFields : hrFields} FROM hcm.document_request r WHERE r.tenant_id=${this.scope.actor.tenantId} ${this.own ? sql`AND r.worker_id=${subject}` : sql``} ${query.q ? sql`AND r.id ILIKE ${search}` : sql``} ${query.status ? sql`AND r.status=${query.status}` : sql``} ${query.workerId ? sql`AND r.worker_id=${query.workerId}` : sql``} ${query.typeId ? sql`AND r.type_id=${query.typeId}` : sql``} ${position ? sql`AND (r.created_at,r.id COLLATE "C") ${compare} (${position.position}::timestamptz,${position.id} COLLATE "C")` : sql``} ORDER BY r.created_at ${order},r.id COLLATE "C" ${order} LIMIT ${query.limit + 1}`.execute(
				this.scope.transaction,
			)
		).rows
		return page(
			rows,
			query.limit,
			binding,
			/** Continue from the final authorized timestamp/id. */ (row) => row.createdAt,
		)
	}
	/** Project only the approved HR or own DTO, concealing unrelated workers. */ async get(
		id: string,
	): Promise<RequestView> {
		const subject = await this.subject()
		if (this.own && !subject) throw new DocumentError('not-found')
		const row = (
			await sql<RequestView>`SELECT ${this.own ? ownFields : hrFields} FROM hcm.document_request r WHERE r.tenant_id=${this.scope.actor.tenantId} AND r.id=${id} ${this.own ? sql`AND r.worker_id=${subject}` : sql``}`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (!row) throw new DocumentError('not-found')
		return row
	}
	/** List Ready submissions from all retained cycles without exposing storage metadata. */ async versions(
		id: string,
		query: VersionQuery,
	) {
		await this.get(id)
		const binding = queryKey(this.scope, query, 'request-submissions:' + this.own + ':' + id),
			position = after(query.cursor, binding)
		if (position && typeof position.position !== 'number')
			throw new DocumentError('invalid-request')
		const rows = (
			await sql<DocumentVersion>`SELECT ${versionFields} FROM hcm.document_request_submission v JOIN hcm.document_blob b ON b.tenant_id=v.tenant_id AND b.id=v.blob_id WHERE v.tenant_id=${this.scope.actor.tenantId} AND v.request_id=${id} AND b.state='Ready' ${position ? sql`AND (v.version_number,v.id)<(${position.position},${position.id})` : sql``} ORDER BY v.version_number DESC,v.id DESC LIMIT ${query.limit + 1}`.execute(
				this.scope.transaction,
			)
		).rows
		return page(
			rows,
			query.limit,
			binding,
			/** Continue from the final immutable version. */ (row) => row.versionNumber,
		)
	}
	/** Return real workforce choices under request-management permission. */ workers(
		query: WorkerQuery,
	) {
		return new KyselyDocumentWorkforce(this.scope).listWorkers(query)
	}
	/** Project enabled types without granting classification management. */ async types(
		query: DocumentTypeQuery,
	) {
		const result = await new KyselyDocumentTypes(this.scope).list({ ...query, enabled: true })
		return {
			...result,
			items: result.items.map(
				/** Omit classification internals. */ (row) => ({
					id: row.id,
					code: row.code,
					label: row.label,
				}),
			),
		}
	}
	/** Read actor-bound command receipts before revisiting a changed revision. */ private async prior(
		operation: string,
		key: string,
		hash: string,
	) {
		const row = (
			await sql<{
				hash: string
				response: DocumentRequest
			}>`SELECT request_hash AS hash,response FROM hcm.document_command_receipt WHERE tenant_id=${this.scope.actor.tenantId} AND actor_account_id=${this.scope.actor.accountId} AND operation=${operation} AND idempotency_key=${key}::uuid`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (row && row.hash !== hash) throw new DocumentError('idempotency-conflict')
		return row?.response
	}
	/** Record a successful response in the same business transaction. */ private async receipt(
		operation: string,
		key: string,
		hash: string,
		result: RequestView,
	) {
		await sql`INSERT INTO hcm.document_command_receipt(tenant_id,actor_account_id,operation,idempotency_key,request_hash,response) VALUES(${this.scope.actor.tenantId},${this.scope.actor.accountId},${operation},${key}::uuid,${hash},${JSON.stringify(result)}::jsonb)`.execute(
			this.scope.transaction,
		)
	}
	/** Persist notification outcomes synchronously through their owning domain service. */ private async notify(
		row: DocumentRequest,
		eventType: 'document.requested' | 'document.submitted' | 'document.replacement-requested',
	) {
		const worker = await new KyselyDocumentWorkforce(this.scope).requireWorker(row.workerId)
		await documentNotificationWriter(this.scope).execute({
			eventId: randomUUID(),
			eventType,
			requestId: row.id,
			dueDate: row.dueDate,
			workerPersonId: worker.personId,
			requesterAccountId: row.requestedByAccountId,
		})
	}
	/** Create one Open request with attributed audit, recipient snapshot and replay evidence. */ async create(
		value: DocumentRequestCreate,
		key: string,
		requestId: string,
	) {
		const operation = 'request-create',
			hash = createHash('sha256').update(JSON.stringify(value)).digest('hex'),
			prior = await this.prior(operation, key, hash)
		if (prior) return prior
		await new KyselyDocumentWorkforce(this.scope).requireWorker(value.workerId)
		requireEnabledDocumentType(await new KyselyDocumentTypes(this.scope).get(value.typeId))
		const id = randomUUID()
		await sql`INSERT INTO hcm.document_request(tenant_id,id,worker_id,type_id,requested_by_account_id,instructions,due_date,status,revision) VALUES(${this.scope.actor.tenantId},${id},${value.workerId},${value.typeId},${this.scope.actor.accountId},${value.instructions},${value.dueDate}::date,'Open',1)`.execute(
			this.scope.transaction,
		)
		const result = (await this.get(id)) as DocumentRequest
		await this.scope.audit.append({
			action: 'document.request-created',
			targetId: id,
			requestId,
			summary: { reason: value.reason, fromState: null, toState: 'Open' },
		})
		await this.notify(result, 'document.requested')
		await this.receipt(operation, key, hash, result)
		return result
	}
	/** Serialize exact current-cycle acceptance, replacement or cancellation against submissions. */ async transition(
		id: string,
		action: RequestAction,
		value: DocumentRequestTransition,
		key: string,
		requestId: string,
	) {
		const operation = 'request-' + action,
			hash = createHash('sha256')
				.update(JSON.stringify([id, value]))
				.digest('hex'),
			prior = await this.prior(operation, key, hash)
		if (prior) return prior
		const current = (await this.get(id)) as DocumentRequest
		requireDocumentRevision(current.revision, value.expectedRevision)
		const status = documentRequestTransition(current.status, action)
		if (action === 'accept') {
			const latest = (await this.versions(id, { sort: 'versionNumber:desc', limit: 1 })).items[0]
			if (!latest || latest.id !== value.submissionId) throw new DocumentError('invalid-state')
		}
		await sql`UPDATE hcm.document_request SET status=${status},revision=revision+1,updated_at=now(),accepted_version_id=${action === 'accept' ? value.submissionId : null} WHERE tenant_id=${this.scope.actor.tenantId} AND id=${id} AND revision=${value.expectedRevision}`.execute(
			this.scope.transaction,
		)
		const result = (await this.get(id)) as DocumentRequest
		const actions: Record<RequestAction, DocumentRequestAuditEvent['action']> = {
			accept: 'document.request-accepted',
			replacement: 'document.request-replacement',
			cancel: 'document.request-cancelled',
		}
		await this.scope.audit.append({
			action: actions[action],
			targetId: id,
			requestId,
			summary: { reason: value.reason, fromState: current.status, toState: status },
		})
		if (action === 'replacement') await this.notify(result, 'document.replacement-requested')
		await this.receipt(operation, key, hash, result)
		return result
	}
	/** Only the addressed employee may submit while the exact request revision remains Open. */ async validate(
		intent: RequestIntent,
	) {
		const current = await this.get(intent.targetId)
		if (!this.own) throw new DocumentError('not-found')
		requireDocumentRevision(current.revision, intent.value.expectedRevision)
		documentRequestTransition(current.status, 'submit')
	}
	/** Read actor-bound reservation evidence for safe retries. */ find(
		operation: string,
		key: string,
	) {
		return new DocumentReservations<RequestIntent, SelfDocumentRequest>(this.scope).find(
			operation,
			key,
		)
	}
	/** Reserve immutable bytes without publishing business state. */ reserve(
		intent: RequestIntent,
		key: string,
		hash: string,
		file: DocumentFile,
	) {
		return new DocumentReservations<RequestIntent, SelfDocumentRequest>(this.scope).reserve(
			intent,
			key,
			hash,
			file,
		)
	}
	/** Publish one immutable submission and state transition with audit, notification and receipt. */ async finish(
		intent: RequestIntent,
		key: string,
		reservation: FileReservation<SelfDocumentRequest>,
		requestId: string,
	) {
		const tenant = this.scope.actor.tenantId,
			id = intent.targetId,
			actor = this.scope.actor.accountId
		const blob = (
			await sql<{
				id: string
			}>`UPDATE hcm.document_blob SET state='Ready' WHERE tenant_id=${tenant} AND storage_key=${reservation.file.key}::uuid AND state='Staged' RETURNING id`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (!blob) throw new DocumentError('upload-failed')
		const versionId = randomUUID()
		await sql`INSERT INTO hcm.document_request_submission(tenant_id,id,request_id,version_number,blob_id,submitted_by_account_id) SELECT ${tenant},${versionId},${id},COALESCE(MAX(version_number),0)+1,${blob.id}::uuid,${actor} FROM hcm.document_request_submission WHERE tenant_id=${tenant} AND request_id=${id}`.execute(
			this.scope.transaction,
		)
		const updated =
			await sql`UPDATE hcm.document_request SET status='Submitted',revision=revision+1,updated_at=now() WHERE tenant_id=${tenant} AND id=${id} AND revision=${intent.value.expectedRevision} AND status='Open'`.execute(
				this.scope.transaction,
			)
		if (updated.numAffectedRows !== 1n) throw new DocumentError('revision-conflict')
		await this.scope.audit.append({
			action: 'document.request-submitted',
			targetId: id,
			requestId,
			summary: { reason: null, fromState: 'Open', toState: 'Submitted' },
		})
		const internal = (
			await sql<DocumentRequest>`SELECT ${hrFields} FROM hcm.document_request r WHERE r.tenant_id=${tenant} AND r.id=${id}`.execute(
				this.scope.transaction,
			)
		).rows[0]
		await this.notify(internal, 'document.submitted')
		const result = (await this.get(id)) as SelfDocumentRequest
		await this.receipt(intent.kind, key, reservation.payloadHash, result)
		await sql`UPDATE hcm.document_upload_attempt SET state='Ready' WHERE tenant_id=${tenant} AND id=${reservation.id}::uuid AND state='Staged'`.execute(
			this.scope.transaction,
		)
		return result
	}
	/** Recheck parent ownership before opening any historical submission bytes. */ async download(
		id: string,
		versionId: string,
	): Promise<DocumentFile> {
		await this.get(id)
		const row = (
			await sql<DocumentFile>`SELECT b.storage_key AS key,b.sha256,b.byte_length AS "byteLength",b.media_type AS "mediaType",b.safe_filename AS filename FROM hcm.document_request_submission v JOIN hcm.document_blob b ON b.tenant_id=v.tenant_id AND b.id=v.blob_id WHERE v.tenant_id=${this.scope.actor.tenantId} AND v.request_id=${id} AND v.id=${versionId} AND b.state='Ready'`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (!row) throw new DocumentError('not-found')
		return row
	}
	/** Append only safe submission identity to the audit-owned access ledger. */ auditDownload(
		id: string,
		requestId: string,
		phase: 'Authorized' | 'Completed' | 'Failed',
		relatedId?: string,
	) {
		return appendDocumentDownloadAudit(
			this.scope,
			'document-request-submission',
			id,
			requestId,
			phase,
			relatedId,
		)
	}
}
export class KyselyDocumentRequestUnit extends DocumentRequestUnit {
	/** Share current authorization and actor-bound terminal cleanup without duplicating storage logic. */ constructor(
		private readonly database: HcmAccessDatabase | null,
		private readonly reservations: TemplateFileUnitOfWork,
	) {
		super()
	}
	/** Derive self scope from the endpoint's required permission inside a verified tenant transaction. */ execute<
		T,
	>(
		context: AuthenticatedHcmContext,
		permission: string,
		write: boolean,
		work: (repo: DocumentRequestRepository) => Promise<T>,
	): Promise<T> {
		if (!this.database) throw new DocumentError('storage-unavailable')
		return this.database.execute(
			context,
			{ permission: 'hcm.documents.' + permission, entitlement: 'hcm.documents' },
			write,
			/** Compose request-owned persistence with the current scope. */ (scope) =>
				work(new RequestRepository(scope, permission.startsWith('requests.self.'))),
		)
	}
	/** Terminate an invalidated reserved attempt without finalizing any business result. */ fail(
		context: AuthenticatedHcmContext,
		id: string,
	) {
		return this.reservations.fail(context, id)
	}
}
