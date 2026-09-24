import { randomUUID } from 'node:crypto'
import type { Generated, Kysely } from 'kysely'
import {
	validateAccessAudit,
	type AppendAudit,
	type AccessAuditEvent,
} from '@empflowyee/hcm-api-audit-application'
import {
	requireAuthenticatedTenant,
	requireAuthenticatedAccount,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'

export interface AuditTables {
	'hcm.audit_event': {
		tenant_id: string
		id: string
		occurred_at: Generated<Date>
		actor_account_id: string
		action: string
		target_type: string
		target_id: string
		outcome: string
		request_id: string
		category: string
		safe_summary: AccessAuditEvent['summary']
		related_event_id: string | null
	}
}
export class TransactionalAudit implements AppendAudit {
	/** Bind to the caller's existing transaction; this adapter never opens or commits its own transaction. */
	constructor(
		private readonly transaction: Kysely<AuditTables>,
		private readonly context: AuthenticatedHcmContext,
	) {}
	/** Validate the action-specific safe schema and append exactly one authoritative actor event. */
	async append(event: AccessAuditEvent): Promise<string> {
		validateAccessAudit(event)
		const id = randomUUID()
		let targetType = 'access-role'
		if (event.action === 'notification.template-changed') targetType = 'notification-template'
		if (event.action === 'notification.rule-changed') targetType = 'notification-rule'
		if (event.action === 'notification.read') targetType = 'notification'
		if (event.action === 'notification.preference-changed') targetType = 'notification-preference'
		if (
			event.action.startsWith('account.') ||
			['role.granted', 'role.revoked'].includes(event.action)
		)
			targetType = 'user-account'
		if (['review.started', 'review.closed'].includes(event.action)) targetType = 'access-review'
		if (['review.decided', 'review.refreshed'].includes(event.action))
			targetType = 'access-review-item'
		await this.transaction
			.insertInto('hcm.audit_event')
			.values({
				tenant_id: requireAuthenticatedTenant(this.context),
				id,
				actor_account_id: requireAuthenticatedAccount(this.context),
				action: event.action,
				target_type: targetType,
				target_id: event.targetId,
				outcome: 'Succeeded',
				request_id: event.requestId,
				category: 'business',
				safe_summary: event.summary,
				related_event_id: null,
			})
			.execute()
		return id
	}
}
