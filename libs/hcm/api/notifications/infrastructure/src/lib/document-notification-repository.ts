import { randomUUID } from 'node:crypto'
import { sql } from 'kysely'
import type { AuthorizedAccessWork } from '@empflowyee/hcm-api-access-control-infrastructure'
import {
	RecordDocumentNotification,
	type DocumentNotificationRepository,
	type DocumentNotificationEvent,
	type NotificationOutcome,
	type NotificationRecipient,
} from '@empflowyee/hcm-api-notifications-application'
import type {
	NotificationEvent,
	NotificationRule,
	NotificationTemplate,
} from '@empflowyee/hcm-notifications-contract'
export class KyselyDocumentNotificationRepository implements DocumentNotificationRepository {
	/** Bind delivery to the exact serialized producer transaction; never create a background identity. */
	constructor(private readonly scope: AuthorizedAccessWork) {}
	/** Keep retries bound to the original recipient snapshot, even if account links later change. */
	async existing(event: DocumentNotificationEvent): Promise<NotificationOutcome[] | null> {
		const rows = (
			await sql<
				NotificationOutcome & { eventType: string; requestId: string }
			>`SELECT i.recipient_account_id AS "recipientId",i.outcome,i.reason_code AS reason,i.event_type AS "eventType",i.source_request_id AS "requestId",n.title,n.body FROM hcm.notification_intent i LEFT JOIN hcm.notification n ON n.tenant_id=i.tenant_id AND n.intent_id=i.id WHERE i.tenant_id=${this.scope.actor.tenantId} AND i.event_id=${event.eventId} ORDER BY i.recipient_key`.execute(
				this.scope.transaction,
			)
		).rows
		if (!rows.length) return null
		if (
			rows.some(
				/** Reject reused occurrence identities with a different document target. */ (row) =>
					row.eventType !== event.eventType || row.requestId !== event.requestId,
			)
		)
			throw new Error('Notification occurrence identity conflict')
		return rows.map(
			/** Return only operational outcome fields, excluding SQL projection helpers. */ (row) => ({
				recipientId: row.recipientId,
				outcome: row.outcome,
				reason: row.reason,
				...(row.outcome === 'Delivered' ? { title: row.title, body: row.body } : {}),
			}),
		)
	}
	/** Resolve requested/replacement to worker-linked accounts and submitted to its requesting account only. */
	async recipients(event: DocumentNotificationEvent): Promise<NotificationRecipient[]> {
		const target =
			event.eventType === 'document.submitted'
				? sql`a.id=${event.requesterAccountId}`
				: sql`a.person_id=${event.workerPersonId}`
		return (
			await sql<NotificationRecipient>`SELECT a.id,a.enabled,p.enabled AS preference FROM hcm.user_account a LEFT JOIN hcm.notification_preference p ON p.tenant_id=a.tenant_id AND p.account_id=a.id AND p.event_type=${event.eventType} WHERE a.tenant_id=${this.scope.actor.tenantId} AND ${target} ORDER BY a.id`.execute(
				this.scope.transaction,
			)
		).rows
	}
	/** Require explicitly provisioned safe configuration; no runtime seed fallback. */
	async configuration(
		event: NotificationEvent,
	): Promise<{ template: NotificationTemplate; rule: NotificationRule }> {
		const template = (
			await sql<NotificationTemplate>`SELECT event_type AS "eventType",title,body,revision FROM hcm.notification_template WHERE tenant_id=${this.scope.actor.tenantId} AND event_type=${event}`.execute(
				this.scope.transaction,
			)
		).rows[0]
		const rule = (
			await sql<NotificationRule>`SELECT event_type AS "eventType",enabled,revision FROM hcm.notification_rule WHERE tenant_id=${this.scope.actor.tenantId} AND event_type=${event}`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (!template || !rule) throw new Error('Notification event configuration unavailable')
		return { template, rule }
	}
	/** Commit intents and inbox rows inside the producer's transaction with immutable generated IDs. */
	async record(event: DocumentNotificationEvent, outcomes: NotificationOutcome[]): Promise<void> {
		for (const item of outcomes) {
			const id = randomUUID()
			await sql`INSERT INTO hcm.notification_intent(tenant_id,id,event_id,event_type,source_request_id,recipient_account_id,recipient_key,outcome,reason_code) VALUES(${this.scope.actor.tenantId},${id},${event.eventId},${event.eventType},${event.requestId},${item.recipientId},${item.recipientId ?? 'no-recipient'},${item.outcome},${item.reason})`.execute(
				this.scope.transaction,
			)
			if (item.outcome === 'Delivered')
				await sql`INSERT INTO hcm.notification(tenant_id,id,intent_id,recipient_account_id,event_type,title,body,source_request_id) VALUES(${this.scope.actor.tenantId},${randomUUID()},${id},${item.recipientId},${event.eventType},${item.title ?? ''},${item.body ?? ''},${event.requestId})`.execute(
					this.scope.transaction,
				)
		}
	}
}
/** Compose the notifications-owned writer for an authorized serialized document transaction. */
export function documentNotificationWriter(
	scope: AuthorizedAccessWork,
): RecordDocumentNotification {
	return new RecordDocumentNotification(new KyselyDocumentNotificationRepository(scope))
}
