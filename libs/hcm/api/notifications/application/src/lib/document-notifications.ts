import {
	notificationEvent,
	notificationId,
	notificationText,
	renderNotificationText,
	type NotificationEvent,
	type NotificationTemplate,
	type NotificationRule,
} from '@empflowyee/hcm-notifications-contract'
import { notificationDelivery } from '@empflowyee/hcm-api-notifications-domain'
/** Facts supplied by the document command after its own tenant/subject authorization. */
export interface DocumentNotificationEvent {
	eventId: string
	eventType: NotificationEvent
	requestId: string
	dueDate: string | null
	workerPersonId: string
	requesterAccountId: string
}
export interface NotificationRecipient {
	id: string
	enabled: boolean
	preference: boolean | undefined
}
export interface NotificationOutcome {
	recipientId: string | null
	outcome: 'Delivered' | 'Suppressed' | 'Undeliverable'
	reason: string
	title?: string
	body?: string
}
export interface DocumentNotificationRepository {
	/** Return prior committed occurrence outcomes or reject an identity/target mismatch. */
	existing(event: DocumentNotificationEvent): Promise<NotificationOutcome[] | null>
	/** Resolve only the event contract's tenant-scoped identity links. */
	recipients(event: DocumentNotificationEvent): Promise<NotificationRecipient[]>
	/** Read the exact persisted event configuration. */
	configuration(
		event: NotificationEvent,
	): Promise<{ template: NotificationTemplate; rule: NotificationRule }>
	/** Persist immutable outcomes and delivered inbox messages on the document transaction. */
	record(event: DocumentNotificationEvent, outcomes: NotificationOutcome[]): Promise<void>
}
export class RecordDocumentNotification {
	/** Receive an adapter already bound to the authenticated document write transaction. */
	constructor(private readonly repository: DocumentNotificationRepository) {}
	/** Evaluate a document occurrence once; persistence failures roll back the producer command. */
	async execute(event: DocumentNotificationEvent): Promise<NotificationOutcome[]> {
		notificationEvent(event.eventType)
		notificationId(event.requestId)
		notificationId(event.workerPersonId)
		notificationId(event.requesterAccountId)
		if (
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
				event.eventId,
			) ||
			(event.dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(event.dueDate))
		)
			throw new Error('Invalid internal notification event')
		const prior = await this.repository.existing(event)
		if (prior) return prior
		const { template, rule } = await this.repository.configuration(event.eventType)
		const title = renderNotificationText(
				notificationText(template.title, 120),
				event.requestId,
				event.dueDate,
			),
			body = renderNotificationText(
				notificationText(template.body, 1000),
				event.requestId,
				event.dueDate,
			)
		const recipients = await this.repository.recipients(event)
		const outcomes: NotificationOutcome[] = recipients.map(
			/** Freeze the configured outcome for this event and recipient. */ (recipient) => {
				const outcome = notificationDelivery(rule.enabled, recipient.preference, recipient.enabled)
				let reason = 'delivered'
				if (recipient.preference === false) reason = 'disabled-preference'
				if (!rule.enabled) reason = 'disabled-rule'
				if (!recipient.enabled) reason = 'disabled-account'
				return {
					recipientId: recipient.id,
					outcome,
					reason,
					...(outcome === 'Delivered' ? { title, body } : {}),
				}
			},
		)
		if (!outcomes.length)
			outcomes.push({ recipientId: null, outcome: 'Undeliverable', reason: 'missing-account' })
		await this.repository.record(event, outcomes)
		return outcomes
	}
}
