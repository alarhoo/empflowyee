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
				let after: { time: string; id: string } | undefined
				if (query.cursor) {
					try {
						const cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'))
						if (
							cursor.roleId !== roleId ||
							cursor.limit !== query.limit ||
							typeof cursor.time !== 'string' ||
							!Number.isFinite(Date.parse(cursor.time)) ||
							typeof cursor.id !== 'string' ||
							cursor.id.length > 200
						)
							throw new Error('cursor')
						after = cursor
					} catch {
						throw new RoleError('invalid-request')
					}
				}
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
					nextCursor = Buffer.from(
						JSON.stringify({ roleId, limit: query.limit, time: last.occurredAt, id: last.id }),
					).toString('base64url')
				return { items, nextCursor }
			},
		)
	}
}
