import { contextCursor, readContextCursor } from './context-cursor'
import type { Kysely } from 'kysely'
import { RoleError, type ContextQuery } from '@empflowyee/hcm-access-control-contract'
import { RoleContext } from '@empflowyee/hcm-api-access-control-application'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import { readRoleHistory, type AuditTables } from '@empflowyee/hcm-api-audit-infrastructure'
import {
	HcmAccessDatabase,
	TransactionalAccessPolicy,
} from './hcm-api-access-control-infrastructure'
import { KyselyRoleRepository } from './role-repository'
import { KyselyAssignmentQueries } from './assignment-queries'

export class KyselyRoleContext extends RoleContext {
	/** Share the existing runtime transaction boundary without creating a second role/assignment writer. */
	constructor(private readonly database: HcmAccessDatabase | null) {
		super()
	}
	/** Require both role visibility and assignment read authority before exposing people. */
	async assignees(context: AuthenticatedHcmContext, roleId: string, query: ContextQuery) {
		if (!this.database) throw new Error('Runtime unavailable')
		return this.database.execute(
			context,
			{ permission: 'hcm.access-control.assignments.read', entitlement: 'hcm.access-control' },
			false,
			/** Resolve the role and its current grants in the same tenant snapshot. */ async (scope) => {
				await new TransactionalAccessPolicy(scope.transaction, context).require({
					permission: 'hcm.access-control.roles.read',
					entitlement: 'hcm.access-control',
				})
				await new KyselyRoleRepository(scope).get(roleId)
				return new KyselyAssignmentQueries(scope).assignees(roleId, query)
			},
		)
	}
	/** Require audit authority and delegate safe history projection to its owning domain. */
	async history(context: AuthenticatedHcmContext, roleId: string, query: ContextQuery) {
		if (!this.database) throw new Error('Runtime unavailable')
		return this.database.execute(
			context,
			{ permission: 'hcm.audit.events.read', entitlement: 'hcm.audit' },
			false,
			/** Authorize role existence separately from permission to inspect audit metadata. */ async (
				scope,
			) => {
				await new TransactionalAccessPolicy(scope.transaction, context).require({
					permission: 'hcm.access-control.roles.read',
					entitlement: 'hcm.access-control',
				})
				await new KyselyRoleRepository(scope).get(roleId)
				const position = readContextCursor(query.cursor, 'occurredAt:desc', roleId, query.limit, 2)
				if (
					position &&
					(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(position[0]) ||
						!Number.isFinite(Date.parse(position[0])))
				)
					throw new RoleError('invalid-request')
				const after = position ? { time: position[0], id: position[1] } : undefined
				const rows = await readRoleHistory(
					scope.transaction as unknown as Kysely<AuditTables>,
					scope.actor.tenantId,
					roleId,
					query.limit + 1,
					after,
				)
				const items = rows.slice(0, query.limit),
					last = items.at(-1)
				let nextCursor: string | null = null
				if (rows.length > query.limit && last)
					nextCursor = contextCursor('occurredAt:desc', roleId, query.limit, [
						last.occurredAt,
						last.id,
					])
				return { items, nextCursor }
			},
		)
	}
}
