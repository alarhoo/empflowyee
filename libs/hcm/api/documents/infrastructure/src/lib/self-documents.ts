import { sql } from 'kysely'
import {
	DocumentError,
	type SelfDocument,
	type DocumentVersion,
	type TemplateQuery,
	type VersionQuery,
} from '@empflowyee/hcm-documents-contract'
import {
	SelfDocumentUnit,
	type SelfDocumentRepository,
	type DocumentFile,
} from '@empflowyee/hcm-api-documents-application'
import {
	HcmAccessDatabase,
	type AuthorizedAccessWork,
} from '@empflowyee/hcm-api-access-control-infrastructure'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import { KyselyDocumentWorkforce } from './workforce-reader'
import { queryKey, after, page } from './document-pages'
import { appendDocumentDownloadAudit } from './document-download-audit'
const fields = sql`d.id,d.type_id AS "typeId",d.label`
const versionFields = sql`v.id,v.version_number AS "versionNumber",b.safe_filename AS filename,b.media_type AS "mediaType",b.byte_length AS "byteLength",to_char(v.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"`
class SelfRepository implements SelfDocumentRepository {
	/** Keep subject derivation and every query in the current authorized transaction. */ constructor(
		private readonly scope: AuthorizedAccessWork,
	) {}
	/** Filter both aggregates and pagination by visible Ready versions before returning metadata. */
	async list(query: TemplateQuery) {
		const own = await new KyselyDocumentWorkforce(this.scope).resolveOwnWorker(),
			binding = queryKey(this.scope, query, 'self-documents:' + own?.workerId),
			position = after(query.cursor, binding),
			ascending = query.sort === 'label:asc',
			order = ascending ? sql`ASC` : sql`DESC`,
			compare = ascending ? sql`>` : sql`<`,
			search = '%' + query.q.replace(/[\\%_]/g, '\\$&') + '%'
		if (position && typeof position.position !== 'string')
			throw new DocumentError('invalid-request')
		if (!own) return { items: [], nextCursor: null }
		const rows = (
			await sql<SelfDocument>`SELECT ${fields} FROM hcm.employee_document d WHERE d.tenant_id=${this.scope.actor.tenantId} AND d.worker_id=${own.workerId} AND EXISTS(SELECT 1 FROM hcm.employee_document_version v JOIN hcm.document_blob b ON b.tenant_id=v.tenant_id AND b.id=v.blob_id WHERE v.tenant_id=d.tenant_id AND v.document_id=d.id AND v.employee_visible AND b.state='Ready') ${query.q ? sql`AND d.label ILIKE ${search}` : sql``} ${query.typeId ? sql`AND d.type_id=${query.typeId}` : sql``} ${position ? sql`AND (d.label COLLATE "C",d.id COLLATE "C") ${compare} (${position.position} COLLATE "C",${position.id} COLLATE "C")` : sql``} ORDER BY d.label COLLATE "C" ${order},d.id COLLATE "C" ${order} LIMIT ${query.limit + 1}`.execute(
				this.scope.transaction,
			)
		).rows
		return page(
			rows,
			query.limit,
			binding,
			/** Continue from an authorized visible label. */ (row) => row.label,
		)
	}
	/** A hidden-only aggregate is indistinguishable from an absent or foreign object. */
	async get(id: string) {
		const own = await new KyselyDocumentWorkforce(this.scope).resolveOwnWorker()
		if (!own) throw new DocumentError('not-found')
		const row = (
			await sql<SelfDocument>`SELECT ${fields} FROM hcm.employee_document d WHERE d.tenant_id=${this.scope.actor.tenantId} AND d.id=${id} AND d.worker_id=${own.workerId} AND EXISTS(SELECT 1 FROM hcm.employee_document_version v JOIN hcm.document_blob b ON b.tenant_id=v.tenant_id AND b.id=v.blob_id WHERE v.tenant_id=d.tenant_id AND v.document_id=d.id AND v.employee_visible AND b.state='Ready')`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (!row) throw new DocumentError('not-found')
		return row
	}
	/** Read only visible children; do not serialize sharing revisions, aggregate revisions or hidden counts. */
	async versions(id: string, query: VersionQuery) {
		await this.get(id)
		const binding = queryKey(this.scope, query, 'self-versions:' + id),
			position = after(query.cursor, binding)
		if (position && typeof position.position !== 'number')
			throw new DocumentError('invalid-request')
		const rows = (
			await sql<DocumentVersion>`SELECT ${versionFields} FROM hcm.employee_document_version v JOIN hcm.document_blob b ON b.tenant_id=v.tenant_id AND b.id=v.blob_id WHERE v.tenant_id=${this.scope.actor.tenantId} AND v.document_id=${id} AND v.employee_visible AND b.state='Ready' ${position ? sql`AND (v.version_number,v.id)<(${position.position},${position.id})` : sql``} ORDER BY v.version_number DESC,v.id DESC LIMIT ${query.limit + 1}`.execute(
				this.scope.transaction,
			)
		).rows
		return page(
			rows,
			query.limit,
			binding,
			/** Continue only from an actually visible version. */ (row) => row.versionNumber,
		)
	}
	/** Recheck the exact version's sharing and own-worker relationship at every download start. */
	async download(id: string, versionId: string): Promise<DocumentFile> {
		const own = await new KyselyDocumentWorkforce(this.scope).resolveOwnWorker()
		if (!own) throw new DocumentError('not-found')
		const row = (
			await sql<DocumentFile>`SELECT b.storage_key AS key,b.sha256,b.byte_length AS "byteLength",b.media_type AS "mediaType",b.safe_filename AS filename FROM hcm.employee_document_version v JOIN hcm.employee_document d ON d.tenant_id=v.tenant_id AND d.id=v.document_id JOIN hcm.document_blob b ON b.tenant_id=v.tenant_id AND b.id=v.blob_id WHERE v.tenant_id=${this.scope.actor.tenantId} AND v.document_id=${id} AND v.id=${versionId} AND d.worker_id=${own.workerId} AND v.employee_visible AND b.state='Ready'`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (!row) throw new DocumentError('not-found')
		return row
	}
	/** Append evidence through audit ownership without disclosing filenames or content. */
	auditDownload(
		id: string,
		requestId: string,
		phase: 'Authorized' | 'Completed' | 'Failed',
		relatedId?: string,
	) {
		return appendDocumentDownloadAudit(
			this.scope,
			'employee-document-version',
			id,
			requestId,
			phase,
			relatedId,
		)
	}
}
export class KyselySelfDocumentUnit extends SelfDocumentUnit {
	/** Reuse persisted authority without adding database write privileges. */ constructor(
		private readonly database: HcmAccessDatabase | null,
	) {
		super()
	}
	/** Serialize sensitive access audit with current sharing and permission changes. */ execute<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		write: boolean,
		work: (repo: SelfDocumentRepository) => Promise<T>,
	): Promise<T> {
		if (!this.database) throw new DocumentError('storage-unavailable')
		return this.database.execute(
			context,
			{ permission: 'hcm.documents.' + permission, entitlement: 'hcm.documents' },
			write,
			/** Compose only the self-scoped read adapter. */ (scope) => work(new SelfRepository(scope)),
		)
	}
}
