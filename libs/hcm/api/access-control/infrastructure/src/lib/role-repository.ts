import { createHash } from 'node:crypto'
import { sql } from 'kysely'
import {
	RoleError,
	type RoleDetail,
	type RoleSummary,
	type RoleQuery,
	type Page,
	type CreateRole,
	type UpdateRole,
	type PermissionKind,
	type PermissionOption,
} from '@empflowyee/hcm-access-control-contract'
import { HCM_CATALOGUE } from '@empflowyee/hcm-runtime-contract/catalogue'
import {
	RoleUnitOfWork,
	type RoleWork,
	type RoleRepository,
	type RoleReceipt,
} from '@empflowyee/hcm-api-access-control-application'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	HcmAccessDatabase,
	type AuthorizedAccessWork,
} from './hcm-api-access-control-infrastructure'

// Approved operation-to-entitlement policy, not user or business-record fixtures.
const BUSINESS_ENTITLEMENTS: Readonly<Record<string, string>> = {
	'hcm.access-control.assignments.read': 'hcm.access-control',
	'hcm.access-control.assignments.manage': 'hcm.access-control',
	'hcm.access-control.catalogue.read': 'hcm.access-control',
	'hcm.audit.events.read': 'hcm.audit',
	'hcm.audit.exports.read': 'hcm.audit',
	'hcm.documents.requests.read': 'hcm.documents',
	'hcm.documents.requests.manage': 'hcm.documents',
	'hcm.documents.requests.self.read': 'hcm.documents',
	'hcm.documents.requests.self.submit': 'hcm.documents',
	'hcm.documents.requests.download': 'hcm.documents',
	'hcm.documents.requests.self.download': 'hcm.documents',
	'hcm.documents.templates.read': 'hcm.documents',
	'hcm.documents.templates.manage': 'hcm.documents',
	'hcm.documents.templates.download': 'hcm.documents',
	'hcm.documents.types.read': 'hcm.documents',
	'hcm.documents.types.manage': 'hcm.documents',
	'hcm.identity-access.domains.read': 'hcm.identity-access',
	'hcm.documents.worker.read': 'hcm.documents',
	'hcm.documents.worker.manage': 'hcm.documents',
	'hcm.documents.worker.download': 'hcm.documents',
	'hcm.identity-access.accounts.read': 'hcm.identity-access',
	'hcm.identity-access.accounts.manage': 'hcm.identity-access',
	'hcm.audit.activity.self.read': 'hcm.audit',
	'hcm.documents.self.read': 'hcm.documents',
	'hcm.documents.self.download': 'hcm.documents',
	'hcm.notifications.inbox.self.read': 'hcm.notifications',
	'hcm.notifications.inbox.self.manage': 'hcm.notifications',
	'hcm.notifications.preferences.self.read': 'hcm.notifications',
	'hcm.notifications.preferences.self.manage': 'hcm.notifications',
	'hcm.identity-access.security.self.read': 'hcm.identity-access',
	'hcm.notifications.rules.read': 'hcm.notifications',
	'hcm.notifications.rules.manage': 'hcm.notifications',
	'hcm.notifications.templates.read': 'hcm.notifications',
	'hcm.notifications.templates.manage': 'hcm.notifications',
	'hcm.access-control.roles.read': 'hcm.access-control',
	'hcm.access-control.roles.manage': 'hcm.access-control',
	'hcm.audit.sensitive-access.read': 'hcm.audit',
	'hcm.access-control.reviews.read': 'hcm.access-control',
	'hcm.access-control.reviews.manage': 'hcm.access-control',
}
const roleProjection = sql`r.id,r.label,r.system_role AS "systemRole",r.protected_admin AS "protectedAdmin",r.revision,
 (SELECT count(*)::int FROM hcm.role_permission p WHERE p.tenant_id=r.tenant_id AND p.role_id=r.id) AS "permissionCount",
 (SELECT count(*)::int FROM hcm.account_role a WHERE a.tenant_id=r.tenant_id AND a.role_id=r.id) AS "assigneeCount"`

export class KyselyRoleRepository implements RoleRepository {
	/** Bind this repository and receipts to the already authorized transaction and actor. */
	constructor(private readonly scope: AuthorizedAccessWork) {}
	/** Apply literal substring filtering and a stable label/id keyset without exposing persistence rows. */
	async list(query: RoleQuery): Promise<Page<RoleSummary>> {
		const fingerprint = createHash('sha256')
			.update(JSON.stringify([query.q, query.systemRole ?? null, query.sort, query.limit]))
			.digest('hex')
		let position = sql`true`
		if (query.cursor) {
			try {
				if (query.cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(query.cursor))
					throw new Error('cursor')
				const cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'))
				if (
					Object.keys(cursor).sort().join(',') !== 'fingerprint,id,label,version' ||
					cursor.version !== 1 ||
					cursor.fingerprint !== fingerprint ||
					typeof cursor.label !== 'string' ||
					cursor.label.length > 100 ||
					typeof cursor.id !== 'string' ||
					cursor.id.length > 200
				)
					throw new Error('cursor')
				position =
					query.sort === 'label:asc'
						? sql`(r.label,r.id)>(${cursor.label},${cursor.id})`
						: sql`(r.label,r.id)<(${cursor.label},${cursor.id})`
			} catch {
				throw new RoleError('invalid-request')
			}
		}
		const order = query.sort === 'label:asc' ? sql`ASC` : sql`DESC`
		const rows = (
			await sql<RoleSummary>`SELECT ${roleProjection} FROM hcm.access_role r
   WHERE r.tenant_id=${this.scope.actor.tenantId} AND strpos(lower(r.label),lower(${query.q}))>0
   AND (${query.systemRole ?? null}::boolean IS NULL OR r.system_role=${query.systemRole ?? null}) AND ${position}
   ORDER BY r.label ${order},r.id ${order} LIMIT ${query.limit + 1}`.execute(this.scope.transaction)
		).rows
		const items = rows.slice(0, query.limit),
			last = items.at(-1)
		let nextCursor: string | null = null
		if (rows.length > query.limit && last)
			nextCursor = Buffer.from(
				JSON.stringify({ version: 1, fingerprint, label: last.label, id: last.id }),
			).toString('base64url')
		return { items, nextCursor }
	}
	/** Lock the aggregate before revision checks, then map its complete registered permission set. */
	async get(id: string, lock = false): Promise<RoleDetail> {
		if (lock)
			await sql`SELECT id FROM hcm.access_role WHERE tenant_id=${this.scope.actor.tenantId} AND id=${id} FOR UPDATE`.execute(
				this.scope.transaction,
			)
		const role = (
			await sql<RoleSummary>`SELECT ${roleProjection} FROM hcm.access_role r WHERE r.tenant_id=${this.scope.actor.tenantId} AND r.id=${id}`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (!role) throw new RoleError('not-found')
		const codes = await this.scope.transaction
			.selectFrom('hcm.role_permission')
			.select('permission_code')
			.where('role_id', '=', id)
			.orderBy('permission_code')
			.execute()
		return {
			...role,
			permissionCodes: codes.map(
				/** Return only registered code strings. */ (row) => row.permission_code,
			),
		}
	}
	/** Join persisted definitions to explicit canonical entitlement policy without deriving authority from descriptions. */
	async permissions(kind?: PermissionKind): Promise<{ items: PermissionOption[] }> {
		let query = this.scope.transaction
			.selectFrom('hcm.access_permission')
			.select(['code', 'description', 'kind'])
			.orderBy('code')
			.limit(1001)
		if (kind) query = query.where('kind', '=', kind)
		const rows = await query.execute()
		if (rows.length > 1000) throw new Error('Permission inventory exceeds reviewed bound')
		return {
			items: rows.map(
				/** Resolve the policy-owned entitlement separately from the persisted label. */ (row) => {
					let entitlement: string | undefined
					if (row.kind === 'business-operation') entitlement = BUSINESS_ENTITLEMENTS[row.code]
					else
						entitlement = HCM_CATALOGUE.apps.find(
							/** Match the canonical discovery code exactly. */ (app) =>
								app.discoveryPolicy.permission === row.code,
						)?.discoveryPolicy.entitlement
					if (!entitlement) throw new Error('Unregistered permission policy')
					return {
						code: row.code,
						description: row.description,
						kind: row.kind as PermissionKind,
						entitlement,
					}
				},
			),
		}
	}
	/** Insert only mutable columns; protected flags come exclusively from SQL defaults. */
	async create(id: string, body: CreateRole): Promise<RoleDetail> {
		await this.scope.transaction
			.insertInto('hcm.access_role')
			.values({ tenant_id: this.scope.actor.tenantId, id, label: body.label, revision: 1 })
			.execute()
		await this.replacePermissions(id, body.permissionCodes)
		return this.get(id)
	}
	/** Compare the supplied revision in SQL as well as in the domain rule before incrementing it. */
	async update(id: string, body: UpdateRole): Promise<RoleDetail> {
		const result =
			await sql`UPDATE hcm.access_role SET label=${body.label},revision=revision+1,updated_at=now() WHERE tenant_id=${this.scope.actor.tenantId} AND id=${id} AND revision=${body.expectedRevision} AND NOT system_role`.execute(
				this.scope.transaction,
			)
		if (result.numAffectedRows !== 1n) throw new RoleError('revision-conflict')
		await this.replacePermissions(id, body.permissionCodes)
		return this.get(id)
	}
	/** Remove join rows and the unassigned aggregate atomically after domain validation. */
	async delete(id: string): Promise<void> {
		await this.scope.transaction
			.deleteFrom('hcm.role_permission')
			.where('role_id', '=', id)
			.execute()
		await this.scope.transaction
			.deleteFrom('hcm.access_role')
			.where('id', '=', id)
			.where('system_role', '=', false)
			.execute()
	}
	/** Replace only the validated bounded permission set in this tenant. */
	private async replacePermissions(id: string, codes: string[]): Promise<void> {
		await this.scope.transaction
			.deleteFrom('hcm.role_permission')
			.where('role_id', '=', id)
			.execute()
		if (codes.length)
			await this.scope.transaction
				.insertInto('hcm.role_permission')
				.values(
					codes.map(
						/** Derive all ownership keys from the verified unit of work. */ (code) => ({
							tenant_id: this.scope.actor.tenantId,
							role_id: id,
							permission_code: code,
						}),
					),
				)
				.execute()
	}
	/** Read an immutable successful receipt using all four ownership dimensions. */
	async receipt(operation: string, key: string): Promise<RoleReceipt | null> {
		return (
			(
				await sql<RoleReceipt>`SELECT request_hash AS "requestHash",response FROM hcm.access_command_receipt WHERE tenant_id=${this.scope.actor.tenantId} AND actor_account_id=${this.scope.actor.accountId} AND operation=${operation} AND idempotency_key=${key}::uuid`.execute(
					this.scope.transaction,
				)
			).rows[0] ?? null
		)
	}
	/** Write the safe response in the same transaction as its aggregate and audit evidence. */
	async save(operation: string, key: string, receipt: RoleReceipt): Promise<void> {
		await sql`INSERT INTO hcm.access_command_receipt (tenant_id,actor_account_id,operation,idempotency_key,request_hash,response) VALUES (${this.scope.actor.tenantId},${this.scope.actor.accountId},${operation},${key}::uuid,${receipt.requestHash},${JSON.stringify(receipt.response)}::jsonb)`.execute(
			this.scope.transaction,
		)
	}
}
export class KyselyRoleUnitOfWork extends RoleUnitOfWork {
	/** Reuse the shared tenant lock, authority reload and audit adapter for every role use case. */
	constructor(private readonly database: HcmAccessDatabase) {
		super()
	}
	/** Keep SQL failures within the adapter and expose only reviewed domain classifications. */
	async execute<T>(
		context: AuthenticatedHcmContext,
		write: boolean,
		work: (scope: RoleWork) => Promise<T>,
	): Promise<T> {
		try {
			return await this.database.execute(
				context,
				{
					permission: write ? 'hcm.access-control.roles.manage' : 'hcm.access-control.roles.read',
					entitlement: 'hcm.access-control',
				},
				write,
				/** Bind application ports without exposing the Kysely transaction. */ (scope) => {
					const roles = new KyselyRoleRepository(scope)
					return work({
						roles,
						audit: scope.audit,
						receipts: { get: roles.receipt.bind(roles), save: roles.save.bind(roles) },
					})
				},
			)
		} catch (error) {
			if (
				typeof error === 'object' &&
				error !== null &&
				'code' in error &&
				error.code === '23505' &&
				'constraint' in error &&
				error.constraint === 'access_role_label'
			)
				throw new RoleError('duplicate-label')
			throw error
		}
	}
}
