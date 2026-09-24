import { createHash, randomUUID } from 'node:crypto'
import {
	RoleError,
	parseRoleCommand,
	type RoleDetail,
	type RoleSummary,
	type Page,
	type RoleQuery,
	type PermissionOption,
	type PermissionKind,
	type CreateRole,
	type UpdateRole,
	type DeleteRole,
	type RoleCommandResult,
} from '@empflowyee/hcm-access-control-contract'
import { requireMutableRole } from '@empflowyee/hcm-api-access-control-domain'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type { AppendAudit } from '@empflowyee/hcm-api-audit-application'

export interface RoleRepository {
	/** Read one bounded tenant page using the approved filters. */
	list(query: RoleQuery): Promise<Page<RoleSummary>>
	/** Load an explicit safe role projection, optionally locking it for a command. */
	get(id: string, lock?: boolean): Promise<RoleDetail>
	/** Read the bounded registered permission inventory, never client descriptions. */
	permissions(kind?: PermissionKind): Promise<{ items: PermissionOption[] }>
	/** Persist a new custom role and its registered permission joins. */
	create(id: string, body: CreateRole): Promise<RoleDetail>
	/** Replace mutable fields and increment the loaded revision. */
	update(id: string, body: UpdateRole): Promise<RoleDetail>
	/** Delete only a role whose mutable/unassigned state was checked in this unit of work. */
	delete(id: string): Promise<void>
}
export interface RoleReceipt {
	requestHash: string
	response: RoleCommandResult
}
export interface RoleReceipts {
	/** Look up a receipt under the verified tenant, actor, operation and key. */
	get(operation: string, key: string): Promise<RoleReceipt | null>
	/** Commit the result with the mutation and its audit append. */
	save(operation: string, key: string, receipt: RoleReceipt): Promise<void>
}
export interface RoleWork {
	roles: RoleRepository
	receipts: RoleReceipts
	audit: AppendAudit
}
export abstract class RoleUnitOfWork {
	/** Authorize reads or administrative commands and bind all ports to one database transaction. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		write: boolean,
		work: (scope: RoleWork) => Promise<T>,
	): Promise<T>
}
export class RoleManagement {
	/** Receive transaction ports through module composition, without database or HTTP dependencies. */
	constructor(private readonly unit: RoleUnitOfWork) {}
	/** List safe role projections with server-owned filters and cursors. */
	list(context: AuthenticatedHcmContext, query: RoleQuery): Promise<Page<RoleSummary>> {
		return this.unit.execute(
			context,
			false,
			/** Delegate queries to the tenant-bound repository. */ (scope) => scope.roles.list(query),
		)
	}
	/** Read a tenant role without exposing foreign existence. */
	get(context: AuthenticatedHcmContext, id: string): Promise<RoleDetail> {
		return this.unit.execute(
			context,
			false,
			/** Use only the authorized repository. */ (scope) => scope.roles.get(id),
		)
	}
	/** Return only persisted registered permission choices. */
	permissions(
		context: AuthenticatedHcmContext,
		kind?: PermissionKind,
	): Promise<{ items: PermissionOption[] }> {
		return this.unit.execute(
			context,
			false,
			/** Keep definitions within the same authorization boundary. */ (scope) =>
				scope.roles.permissions(kind),
		)
	}
	/** Reauthorize, replay safely or atomically execute one revisioned custom-role command. */
	command(
		context: AuthenticatedHcmContext,
		operation: 'create' | 'update' | 'delete',
		id: string | undefined,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<RoleCommandResult> {
		if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key))
			throw new RoleError('invalid-request')
		const payload = parseRoleCommand(body, operation)
		const command = `roles.${operation}:${id ?? ''}`
		const requestHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
		return this.unit.execute(
			context,
			true,
			/** The tenant administration lock serializes receipt replay and aggregate writes together. */ async (
				scope,
			) => {
				const existing = await scope.receipts.get(command, key)
				if (existing) {
					if (existing.requestHash !== requestHash) throw new RoleError('idempotency-conflict')
					return existing.response
				}
				if (operation !== 'create') {
					if (!id) throw new RoleError('invalid-request')
					requireMutableRole(
						await scope.roles.get(id, true),
						(payload as UpdateRole | DeleteRole).expectedRevision,
						operation === 'delete',
					)
				}
				if (operation !== 'delete') {
					const registered = new Set(
						(await scope.roles.permissions()).items.map(
							/** Compare codes only, never caller metadata. */ (item) => item.code,
						),
					)
					const selected = (payload as CreateRole).permissionCodes
					if (
						selected.length > registered.size ||
						selected.some(
							/** Unknown codes cannot establish new capabilities. */ (code) =>
								!registered.has(code),
						)
					)
						throw new RoleError('invalid-request')
				}
				const target = id ?? randomUUID()
				let response: RoleCommandResult
				if (operation === 'create')
					response = await scope.roles.create(target, payload as CreateRole)
				else if (operation === 'update')
					response = await scope.roles.update(target, payload as UpdateRole)
				else {
					await scope.roles.delete(target)
					response = { id: target, deleted: true }
				}
				await scope.audit.append({
					action: (
						{ create: 'role.created', update: 'role.updated', delete: 'role.deleted' } as const
					)[operation],
					targetId: target,
					requestId,
					summary: {
						reason: payload.reason,
						changedFields: operation === 'delete' ? [] : ['label', 'permissionCodes'],
					},
				})
				await scope.receipts.save(command, key, { requestHash, response })
				return response
			},
		)
	}
}
