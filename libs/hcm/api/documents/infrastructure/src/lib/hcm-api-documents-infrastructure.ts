import { createHash } from 'node:crypto'
import { sql } from 'kysely'
import {
	DocumentError,
	type DocumentType,
	type DocumentTypePage,
	type DocumentTypeQuery,
	type DocumentTypeCreate,
} from '@empflowyee/hcm-documents-contract'
import {
	DocumentUnitOfWork,
	type DocumentWork,
	type DocumentTypeRepository,
	type DocumentReceipt,
} from '@empflowyee/hcm-api-documents-application'
import {
	HcmAccessDatabase,
	type AuthorizedAccessWork,
} from '@empflowyee/hcm-api-access-control-infrastructure'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
const columns = sql`id,code,label,description,enabled,revision`
/** Bind cursor tuples to exact query and verified tenant/account context. */
function binding(scope: AuthorizedAccessWork, query: DocumentTypeQuery): string {
	return createHash('sha256')
		.update(
			JSON.stringify([
				scope.actor.tenantId,
				scope.actor.accountId,
				query.q,
				query.enabled ?? null,
				query.sort,
				query.limit,
			]),
		)
		.digest('hex')
}
/** Validate opaque cursor shape before applying stable SQL tuple predicates. */
function cursor(value: string | undefined, key: string): { label: string; id: string } | null {
	if (value === undefined) return null
	try {
		if (!value || value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value))
			throw new Error('Invalid cursor')
		const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
		if (
			!decoded ||
			Object.keys(decoded).sort().join(',') !== 'binding,id,label,version' ||
			decoded.version !== 1 ||
			decoded.binding !== key ||
			typeof decoded.label !== 'string' ||
			!decoded.label ||
			decoded.label.length > 100 ||
			typeof decoded.id !== 'string' ||
			!decoded.id ||
			decoded.id.length > 200
		)
			throw new Error('Invalid cursor')
		return { label: decoded.label, id: decoded.id }
	} catch {
		throw new DocumentError('invalid-request')
	}
}
export class KyselyDocumentTypes implements DocumentTypeRepository {
	/** Bind all projections and commands to the authorized tenant transaction. */
	constructor(private readonly scope: AuthorizedAccessWork) {}
	/** Use literal substring search and stable label/id keyset pagination. */
	async list(query: DocumentTypeQuery): Promise<DocumentTypePage> {
		const key = binding(this.scope, query),
			after = cursor(query.cursor, key),
			asc = query.sort === 'label:asc',
			order = asc ? sql`ASC` : sql`DESC`,
			compare = asc ? sql`>` : sql`<`,
			search = '%' + query.q.replace(/[\\%_]/g, '\\$&') + '%'
		const rows = (
			await sql<DocumentType>`SELECT ${columns} FROM hcm.document_type WHERE tenant_id=${this.scope.actor.tenantId} ${query.q ? sql`AND (code ILIKE ${search} OR label ILIKE ${search})` : sql``} ${query.enabled === undefined ? sql`` : sql`AND enabled=${query.enabled}`} ${after ? sql`AND (label COLLATE "C",id COLLATE "C") ${compare} (${after.label} COLLATE "C",${after.id} COLLATE "C")` : sql``} ORDER BY label COLLATE "C" ${order},id COLLATE "C" ${order} LIMIT ${query.limit + 1}`.execute(
				this.scope.transaction,
			)
		).rows
		const items = rows.slice(0, query.limit),
			last = items.at(-1)
		let nextCursor: string | null = null
		if (rows.length > query.limit && last)
			nextCursor = Buffer.from(
				JSON.stringify({ version: 1, binding: key, label: last.label, id: last.id }),
			).toString('base64url')
		return { items, nextCursor }
	}
	/** Conceal foreign IDs using an explicit tenant predicate independent of RLS. */
	async get(id: string): Promise<DocumentType> {
		const row = (
			await sql<DocumentType>`SELECT ${columns} FROM hcm.document_type WHERE tenant_id=${this.scope.actor.tenantId} AND id=${id}`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (!row) throw new DocumentError('not-found')
		return row
	}
	/** Insert an enabled classification and report only the expected unique-code conflict. */
	async create(id: string, value: DocumentTypeCreate): Promise<DocumentType> {
		const result =
			await sql<DocumentType>`INSERT INTO hcm.document_type(tenant_id,id,code,label,description,created_by,updated_by) VALUES(${this.scope.actor.tenantId},${id},${value.code},${value.label},${value.description ?? ''},${this.scope.actor.accountId},${this.scope.actor.accountId}) ON CONFLICT(tenant_id,code) DO NOTHING RETURNING ${columns}`.execute(
				this.scope.transaction,
			)
		if (!result.rows[0]) throw new DocumentError('duplicate-code')
		return result.rows[0]
	}
	/** Preserve immutable ownership/code while updating exact mutable revision fields. */
	async update(value: DocumentType): Promise<DocumentType> {
		const result =
			await sql<DocumentType>`UPDATE hcm.document_type SET label=${value.label},description=${value.description},enabled=${value.enabled},revision=revision+1,updated_by=${this.scope.actor.accountId},updated_at=now() WHERE tenant_id=${this.scope.actor.tenantId} AND id=${value.id} AND revision=${value.revision} RETURNING ${columns}`.execute(
				this.scope.transaction,
			)
		if (!result.rows[0]) throw new DocumentError('revision-conflict')
		return result.rows[0]
	}
	/** Load only the current actor's exact successful command receipt. */
	async receipt(operation: string, key: string): Promise<DocumentReceipt | null> {
		return (
			(
				await sql<DocumentReceipt>`SELECT request_hash AS "requestHash",response FROM hcm.document_command_receipt WHERE tenant_id=${this.scope.actor.tenantId} AND actor_account_id=${this.scope.actor.accountId} AND operation=${operation} AND idempotency_key=${key}::uuid`.execute(
					this.scope.transaction,
				)
			).rows[0] ?? null
		)
	}
	/** Persist success evidence atomically with the type and audit. */
	async saveReceipt(operation: string, key: string, value: DocumentReceipt): Promise<void> {
		await sql`INSERT INTO hcm.document_command_receipt(tenant_id,actor_account_id,operation,idempotency_key,request_hash,response) VALUES(${this.scope.actor.tenantId},${this.scope.actor.accountId},${operation},${key}::uuid,${value.requestHash},${JSON.stringify(value.response)}::jsonb)`.execute(
			this.scope.transaction,
		)
	}
}
export class KyselyDocumentUnitOfWork extends DocumentUnitOfWork {
	/** Reuse persisted authority and tenant transactions without introducing a new trust boundary. */
	constructor(private readonly database: HcmAccessDatabase | null) {
		super()
	}
	/** Reauthorize after serializing document changes with current authority updates. */
	async execute<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		write: boolean,
		work: (scope: DocumentWork) => Promise<T>,
	): Promise<T> {
		if (!this.database) throw new Error('Business runtime unavailable')
		return this.database.execute(
			context,
			{ permission: 'hcm.documents.' + permission, entitlement: 'hcm.documents' },
			write,
			/** Compose owning repositories and shared audit on one executor. */ (scope) => {
				const types = new KyselyDocumentTypes(scope)
				return work({
					types,
					audit: scope.audit,
					receipts: { get: types.receipt.bind(types), save: types.saveReceipt.bind(types) },
				})
			},
		)
	}
}
