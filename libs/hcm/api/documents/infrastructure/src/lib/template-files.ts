import { queryKey, after, page } from './document-pages'
import { DocumentReservations } from './document-reservations'
import type { DocumentDownloadAuditEvent } from '@empflowyee/hcm-api-audit-application'
import { randomUUID } from 'node:crypto'
import { sql } from 'kysely'
import {
	DocumentError,
	type DocumentTemplate,
	type DocumentVersion,
	type TemplateQuery,
	type VersionQuery,
	type DocumentPage,
	type TemplateUploadResult,
	type DocumentTypeQuery,
} from '@empflowyee/hcm-documents-contract'
import {
	TemplateFileUnitOfWork,
	type TemplateFileRepository,
	type TemplateIntent,
	type UploadReservation,
	type DocumentFile,
} from '@empflowyee/hcm-api-documents-application'
import {
	requireDocumentRevision,
	requireEnabledDocumentType,
} from '@empflowyee/hcm-api-documents-domain'
import {
	HcmAccessDatabase,
	type AuthorizedAccessWork,
} from '@empflowyee/hcm-api-access-control-infrastructure'
import { HcmTenantDatabase } from '@empflowyee/hcm-api-database-kysely'
import {
	requireAuthenticatedAccount,
	requireAuthenticatedTenant,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import { KyselyDocumentTypes } from './hcm-api-documents-infrastructure'

const templateColumns = sql`id,type_id AS "typeId",label,revision`
const versionColumns = sql`v.id,v.version_number AS "versionNumber",b.safe_filename AS filename,b.media_type AS "mediaType",b.byte_length AS "byteLength",to_char(v.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"`
class TemplateRepository implements TemplateFileRepository {
	/** Bind documents, audit and all SQL to the same verified transaction. */
	constructor(private readonly scope: AuthorizedAccessWork) {}
	/** Query a stable label/id page with literal search and explicit tenant ownership. */
	async list(query: TemplateQuery): Promise<DocumentPage<DocumentTemplate>> {
		const binding = queryKey(this.scope, query),
			position = after(query.cursor, binding),
			ascending = query.sort === 'label:asc',
			order = ascending ? sql`ASC` : sql`DESC`,
			compare = ascending ? sql`>` : sql`<`
		if (position && typeof position.position !== 'string')
			throw new DocumentError('invalid-request')
		const search = '%' + query.q.replace(/[\\%_]/g, '\\$&') + '%'
		const rows = (
			await sql<DocumentTemplate>`SELECT ${templateColumns} FROM hcm.document_template WHERE tenant_id=${this.scope.actor.tenantId} ${query.q ? sql`AND label ILIKE ${search}` : sql``} ${query.typeId ? sql`AND type_id=${query.typeId}` : sql``} ${position ? sql`AND (label COLLATE "C",id COLLATE "C") ${compare} (${position.position} COLLATE "C",${position.id} COLLATE "C")` : sql``} ORDER BY label COLLATE "C" ${order},id COLLATE "C" ${order} LIMIT ${query.limit + 1}`.execute(
				this.scope.transaction,
			)
		).rows
		return page(
			rows,
			query.limit,
			binding,
			/** Continue from the final visible label/id tuple. */ (row) => row.label,
		)
	}
	/** Conceal foreign aggregates independently of row-level security. */
	async get(id: string): Promise<DocumentTemplate> {
		const row = (
			await sql<DocumentTemplate>`SELECT ${templateColumns} FROM hcm.document_template WHERE tenant_id=${this.scope.actor.tenantId} AND id=${id}`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (!row) throw new DocumentError('not-found')
		return row
	}
	/** Return only committed versions, keeping storage identities private. */
	async versions(id: string, query: VersionQuery): Promise<DocumentPage<DocumentVersion>> {
		await this.get(id)
		const binding = queryKey(this.scope, query, id),
			position = after(query.cursor, binding)
		if (position && typeof position.position !== 'number')
			throw new DocumentError('invalid-request')
		const rows = (
			await sql<DocumentVersion>`SELECT ${versionColumns} FROM hcm.document_template_version v JOIN hcm.document_blob b ON b.tenant_id=v.tenant_id AND b.id=v.blob_id WHERE v.tenant_id=${this.scope.actor.tenantId} AND v.template_id=${id} AND b.state='Ready' ${position ? sql`AND (v.version_number,v.id)<(${position.position},${position.id})` : sql``} ORDER BY v.version_number DESC,v.id DESC LIMIT ${query.limit + 1}`.execute(
				this.scope.transaction,
			)
		).rows
		return page(
			rows,
			query.limit,
			binding,
			/** Continue in immutable version order. */ (row) => row.versionNumber,
		)
	}
	/** Reuse classification queries while projecting only approved picker metadata. */
	async types(query: DocumentTypeQuery) {
		const result = await new KyselyDocumentTypes(this.scope).list({ ...query, enabled: true })
		return {
			...result,
			items: result.items.map(
				/** Omit classification internals from picker responses. */ (row) => ({
					id: row.id,
					code: row.code,
					label: row.label,
				}),
			),
		}
	}
	/** Allow append on an existing template even if its type was subsequently disabled. */
	async validate(intent: TemplateIntent): Promise<void> {
		if (intent.kind === 'template-create')
			requireEnabledDocumentType(await new KyselyDocumentTypes(this.scope).get(intent.value.typeId))
		else
			requireDocumentRevision(
				(await this.get(intent.targetId)).revision,
				intent.value.expectedRevision,
			)
	}
	/** Read actor-bound upload evidence through the shared reservation adapter. */
	find(operation: string, key: string) {
		return new DocumentReservations<TemplateIntent, TemplateUploadResult>(this.scope).find(
			operation,
			key,
		)
	}
	/** Reserve bytes through the shared storage metadata writer. */
	reserve(intent: TemplateIntent, key: string, hash: string, file: DocumentFile) {
		return new DocumentReservations<TemplateIntent, TemplateUploadResult>(this.scope).reserve(
			intent,
			key,
			hash,
			file,
		)
	}
	/** Finalize immutable bytes and a version exactly once with attributed audit and receipt. */
	async finish(
		intent: TemplateIntent,
		key: string,
		reservation: UploadReservation,
		requestId: string,
	): Promise<TemplateUploadResult> {
		const tenant = this.scope.actor.tenantId,
			actor = this.scope.actor.accountId,
			id = reservation.aggregateId
		let template: DocumentTemplate
		if (intent.kind === 'template-create') {
			template = (
				await sql<DocumentTemplate>`INSERT INTO hcm.document_template(tenant_id,id,type_id,label,revision,created_by_account_id) VALUES(${tenant},${id},${intent.value.typeId},${intent.value.label},1,${actor}) RETURNING ${templateColumns}`.execute(
					this.scope.transaction,
				)
			).rows[0]
		} else {
			template = (
				await sql<DocumentTemplate>`UPDATE hcm.document_template SET revision=revision+1 WHERE tenant_id=${tenant} AND id=${id} AND revision=${intent.value.expectedRevision} RETURNING ${templateColumns}`.execute(
					this.scope.transaction,
				)
			).rows[0]
			if (!template) throw new DocumentError('revision-conflict')
		}
		const blob = (
			await sql<{
				id: string
			}>`UPDATE hcm.document_blob SET state='Ready' WHERE tenant_id=${tenant} AND storage_key=${reservation.file.key}::uuid AND state='Staged' RETURNING id`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (!blob) throw new DocumentError('upload-failed')
		const versionId = randomUUID()
		await sql`INSERT INTO hcm.document_template_version(tenant_id,id,template_id,version_number,blob_id,created_by_account_id) VALUES(${tenant},${versionId},${id},${template.revision},${blob.id}::uuid,${actor})`.execute(
			this.scope.transaction,
		)
		const version = (
			await sql<DocumentVersion>`SELECT ${versionColumns} FROM hcm.document_template_version v JOIN hcm.document_blob b ON b.tenant_id=v.tenant_id AND b.id=v.blob_id WHERE v.tenant_id=${tenant} AND v.id=${versionId}`.execute(
				this.scope.transaction,
			)
		).rows[0]
		await this.scope.audit.append({
			action: 'document.template-version-added',
			targetId: id,
			requestId,
			summary: { reason: intent.value.reason, changedFields: ['version'] },
		})
		const result = { template, version }
		await sql`INSERT INTO hcm.document_command_receipt(tenant_id,actor_account_id,operation,idempotency_key,request_hash,response) VALUES(${tenant},${actor},${intent.kind},${key}::uuid,${reservation.payloadHash},${JSON.stringify(result)}::jsonb)`.execute(
			this.scope.transaction,
		)
		await sql`UPDATE hcm.document_upload_attempt SET state='Ready' WHERE tenant_id=${tenant} AND id=${reservation.id}::uuid AND state='Staged'`.execute(
			this.scope.transaction,
		)
		return result
	}
	/** Resolve a Ready attachment through its exact parent and tenant; no storage-key endpoint exists. */
	async download(id: string, versionId: string): Promise<DocumentFile> {
		const file = (
			await sql<DocumentFile>`SELECT b.storage_key AS key,b.sha256,b.byte_length AS "byteLength",b.media_type AS "mediaType",b.safe_filename AS filename FROM hcm.document_template_version v JOIN hcm.document_blob b ON b.tenant_id=v.tenant_id AND b.id=v.blob_id WHERE v.tenant_id=${this.scope.actor.tenantId} AND v.template_id=${id} AND v.id=${versionId} AND b.state='Ready'`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (!file) throw new DocumentError('not-found')
		return file
	}
	/** Use the audit-owned append port for both authorization and observed outcome. */
	auditDownload(
		id: string,
		requestId: string,
		phase: 'Authorized' | 'Completed' | 'Failed',
		relatedId?: string,
	): Promise<string> {
		let action: DocumentDownloadAuditEvent['action'] = 'document.download-authorized'
		if (phase === 'Completed') action = 'document.download-completed'
		if (phase === 'Failed') action = 'document.download-failed'
		return this.scope.audit.append({
			action,
			targetId: id,
			targetType: 'document-template-version',
			requestId,
			relatedEventId: relatedId ?? null,
			summary: {},
		})
	}
}
export class KyselyTemplateFileUnit extends TemplateFileUnitOfWork {
	private readonly failures: HcmTenantDatabase<Record<string, never>> | null
	/** Reuse authority transactions; a restricted pool only records terminal reservation failure. */
	constructor(
		private readonly database: HcmAccessDatabase | null,
		connectionString: string | null,
	) {
		super()
		this.failures = connectionString
			? new HcmTenantDatabase({ connectionString, maxConnections: 2 })
			: null
	}
	/** Bind template persistence to current business permission and entitlement. */
	execute<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		write: boolean,
		work: (repo: TemplateFileRepository) => Promise<T>,
	): Promise<T> {
		if (!this.database) throw new DocumentError('storage-unavailable')
		return this.database.execute(
			context,
			{ permission: 'hcm.documents.' + permission, entitlement: 'hcm.documents' },
			write,
			/** Compose metadata and audit on one executor. */ (scope) =>
				work(new TemplateRepository(scope)),
		)
	}
	/** Mark the already authenticated actor's reservation failed after a revoked grant or stale revision. */
	async fail(context: AuthenticatedHcmContext, id: string): Promise<void> {
		if (!this.failures) throw new DocumentError('storage-unavailable')
		const tenant = requireAuthenticatedTenant(context),
			actor = requireAuthenticatedAccount(context)
		await this.failures.transaction(
			context,
			/** This terminal cleanup cannot publish a version, audit or notification. */ async (
				transaction,
			) => {
				await sql`SELECT pg_advisory_xact_lock(hashtextextended(${tenant},0))`.execute(transaction)
				const row = (
					await sql<{
						blobId: string
					}>`UPDATE hcm.document_upload_attempt SET state='Failed' WHERE tenant_id=${tenant} AND id=${id}::uuid AND actor_account_id=${actor} AND state='Staged' RETURNING blob_id AS "blobId"`.execute(
						transaction,
					)
				).rows[0]
				if (row)
					await sql`UPDATE hcm.document_blob SET state='Failed' WHERE tenant_id=${tenant} AND id=${row.blobId}::uuid AND state='Staged'`.execute(
						transaction,
					)
			},
		)
	}
	/** Release the small cleanup pool on runtime shutdown. */
	async onApplicationShutdown(): Promise<void> {
		await this.failures?.destroy()
	}
}
