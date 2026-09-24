import type { DocumentDownloadAuditEvent } from '@empflowyee/hcm-api-audit-application'
import { createHash, randomUUID } from 'node:crypto'
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

/** Scope continuations to actor, tenant, endpoint target and every query control. */
function queryKey(
	scope: AuthorizedAccessWork,
	query: TemplateQuery | VersionQuery,
	target = 'list',
): string {
	const filters = { ...query, cursor: undefined }
	return createHash('sha256')
		.update(JSON.stringify([scope.actor.tenantId, scope.actor.accountId, target, filters]))
		.digest('hex')
}
/** Decode only bounded exact tuple cursors; never trust a cursor as authority. */
function after(
	value: string | undefined,
	binding: string,
): { position: string | number; id: string } | null {
	if (!value) return null
	try {
		if (value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('cursor')
		const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
		if (
			Object.keys(parsed).sort().join(',') !== 'binding,id,position' ||
			parsed.binding !== binding ||
			typeof parsed.id !== 'string' ||
			!parsed.id ||
			parsed.id.length > 200 ||
			!(
				(typeof parsed.position === 'string' && parsed.position.length <= 100) ||
				(Number.isSafeInteger(parsed.position) && parsed.position > 0)
			)
		)
			throw new Error('cursor')
		return parsed
	} catch {
		throw new DocumentError('invalid-request')
	}
}
/** Build a continuation only when an extra server row proves another page exists. */
function page<T extends { id: string }>(
	rows: T[],
	limit: number,
	binding: string,
	position: (row: T) => string | number,
): DocumentPage<T> {
	const items = rows.slice(0, limit),
		last = items.at(-1)
	let nextCursor: string | null = null
	if (rows.length > limit && last)
		nextCursor = Buffer.from(
			JSON.stringify({ binding, id: last.id, position: position(last) }),
		).toString('base64url')
	return { items, nextCursor }
}
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
	/** Read reserved evidence and a completed response only for the original actor and command key. */
	async find(operation: string, key: string): Promise<UploadReservation | null> {
		const row = (
			await sql<UploadReservation>`SELECT a.id,a.aggregate_id AS "aggregateId",a.state,a.payload_hash AS "payloadHash",jsonb_build_object('key',b.storage_key,'sha256',b.sha256,'byteLength',b.byte_length,'mediaType',b.media_type,'filename',b.safe_filename) AS file,r.response AS result FROM hcm.document_upload_attempt a JOIN hcm.document_blob b ON b.tenant_id=a.tenant_id AND b.id=a.blob_id LEFT JOIN hcm.document_command_receipt r ON r.tenant_id=a.tenant_id AND r.actor_account_id=a.actor_account_id AND r.operation=a.operation AND r.idempotency_key=a.idempotency_key WHERE a.tenant_id=${this.scope.actor.tenantId} AND a.actor_account_id=${this.scope.actor.accountId} AND a.operation=${operation} AND a.idempotency_key=${key}::uuid`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (row?.state === 'Ready' && !row.result) throw new DocumentError('storage-unavailable')
		return row ?? null
	}
	/** Reserve immutable file evidence without exposing any template or version yet. */
	async reserve(
		intent: TemplateIntent,
		key: string,
		hash: string,
		file: DocumentFile,
	): Promise<UploadReservation> {
		const id = randomUUID(),
			blobId = randomUUID(),
			tenant = this.scope.actor.tenantId,
			actor = this.scope.actor.accountId
		await sql`INSERT INTO hcm.document_blob(tenant_id,id,storage_key,sha256,byte_length,media_type,safe_filename,state,created_by_account_id) VALUES(${tenant},${blobId}::uuid,${file.key}::uuid,${file.sha256},${file.byteLength},${file.mediaType},${file.filename},'Staged',${actor})`.execute(
			this.scope.transaction,
		)
		await sql`INSERT INTO hcm.document_upload_attempt(tenant_id,id,actor_account_id,operation,idempotency_key,payload_hash,blob_id,aggregate_id,expected_revision,safe_intent,state) VALUES(${tenant},${id}::uuid,${actor},${intent.kind},${key}::uuid,${hash},${blobId}::uuid,${intent.targetId},${intent.kind === 'template-append' ? intent.value.expectedRevision : null},${JSON.stringify(intent)}::jsonb,'Staged')`.execute(
			this.scope.transaction,
		)
		return {
			id,
			aggregateId: intent.targetId,
			state: 'Staged',
			payloadHash: hash,
			file,
			result: null,
		}
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
