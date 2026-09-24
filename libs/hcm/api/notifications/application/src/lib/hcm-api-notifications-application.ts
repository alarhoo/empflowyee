import { createHash } from 'node:crypto'
import {
	NotificationError,
	parseTemplateSave,
	parseRuleSave,
	type NotificationTemplate,
	type NotificationRule,
	notificationEvent,
	notificationId,
	parseNotificationRead,
	parsePreferenceSave,
	type NotificationEvent,
	type NotificationItem,
	type NotificationPage,
	type NotificationPreference,
	type NotificationPreferences,
	type InboxQuery,
} from '@empflowyee/hcm-notifications-contract'
import { requireNotificationRevision } from '@empflowyee/hcm-api-notifications-domain'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type { AppendAudit } from '@empflowyee/hcm-api-audit-application'
export interface NotificationRepository {
	/** Read the actual bounded tenant template configuration. */
	templates(): Promise<{ items: NotificationTemplate[] }>
	/** Read actual tenant event switches. */
	rules(): Promise<{ items: NotificationRule[] }>
	/** Update one configured template at its exact revision. */
	saveTemplate(event: NotificationEvent, value: NotificationTemplate): Promise<NotificationTemplate>
	/** Update one configured rule at its exact revision. */
	saveRule(event: NotificationEvent, value: NotificationRule): Promise<NotificationRule>

	/** Query only the verified account's bounded inbox. */
	inbox(query: InboxQuery): Promise<NotificationPage>
	/** Load one own notification, concealing other recipients and tenants. */
	get(id: string): Promise<NotificationItem>
	/** Set first-read evidence and advance exactly the expected revision. */
	read(item: NotificationItem): Promise<NotificationItem>
	/** Resolve all registered category choices with documented absent-row defaults. */
	preferences(): Promise<NotificationPreferences>
	/** Read one own stored preference or its revision-zero default. */
	preference(event: NotificationEvent): Promise<NotificationPreference>
	/** Persist one explicit revisioned own-category choice. */
	savePreference(value: NotificationPreference): Promise<NotificationPreference>
}
export type NotificationResponse =
	NotificationItem | NotificationPreference | NotificationTemplate | NotificationRule
export interface NotificationReceipt {
	requestHash: string
	response: NotificationResponse
}
export interface NotificationWork {
	repository: NotificationRepository
	audit: AppendAudit
	receipts: {
		/** Load only this actor's successful receipt. */
		get(operation: string, key: string): Promise<NotificationReceipt | null>
		/** Persist the safe response within the business transaction. */
		save(operation: string, key: string, value: NotificationReceipt): Promise<void>
	}
}
export abstract class NotificationUnitOfWork {
	/** Reauthorize the exact operation and bind own-account repositories to one transaction. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		write: boolean,
		work: (scope: NotificationWork) => Promise<T>,
	): Promise<T>
}
/** Validate receipt identity before hashing the exact normalized command target and payload. */
function key(value: string): void {
	if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))
		throw new NotificationError('invalid-request')
}
export class Notifications {
	/** Receive owning persistence ports without importing transport or SQL. */
	constructor(private readonly unit: NotificationUnitOfWork) {}
	/** Read own inbox only; the query has no account selector. */
	inbox(context: AuthenticatedHcmContext, query: InboxQuery): Promise<NotificationPage> {
		return this.unit.execute(
			context,
			'inbox.self.read',
			false,
			/** Scope subjects inside the repository. */ (scope) => scope.repository.inbox(query),
		)
	}
	/** Expose exactly the registered category choices for the authenticated account. */
	preferences(context: AuthenticatedHcmContext): Promise<NotificationPreferences> {
		return this.unit.execute(
			context,
			'preferences.self.read',
			false,
			/** Resolve persisted overrides and explicit defaults. */ (scope) =>
				scope.repository.preferences(),
		)
	}
	/** Mark one notification read once without silently replacing a concurrent revision. */
	read(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		receiptKey: string,
		requestId: string,
	): Promise<NotificationItem> {
		notificationId(id)
		const payload = parseNotificationRead(body)
		return this.command(
			context,
			'inbox.self.manage',
			'notification.read',
			id,
			payload,
			receiptKey,
			/** Audit only the first actual read transition. */ async (scope) => {
				const current = await scope.repository.get(id)
				requireNotificationRevision(current.revision, payload.expectedRevision)
				if (current.readAt) return current
				const result = await scope.repository.read(current)
				await scope.audit.append({
					action: 'notification.read',
					targetId: id,
					requestId,
					summary: { changedFields: ['readAt'] },
				})
				return result
			},
		) as Promise<NotificationItem>
	}
	/** Save one own category; revision zero is valid only until its first explicit stored preference. */
	savePreference(
		context: AuthenticatedHcmContext,
		eventValue: string,
		body: unknown,
		receiptKey: string,
		requestId: string,
	): Promise<NotificationPreference> {
		const event = notificationEvent(eventValue),
			payload = parsePreferenceSave(body)
		return this.command(
			context,
			'preferences.self.manage',
			'notification.preference',
			event,
			payload,
			receiptKey,
			/** Commit a scoped override and safe audit together. */ async (scope) => {
				const current = await scope.repository.preference(event)
				requireNotificationRevision(current.revision, payload.expectedRevision)
				const result = await scope.repository.savePreference({
					...current,
					enabled: payload.enabled,
				})
				await scope.audit.append({
					action: 'notification.preference-changed',
					targetId: event,
					requestId,
					summary: { changedFields: ['enabled'] },
				})
				return result
			},
		) as Promise<NotificationPreference>
	}
	/** Read only configured registered templates with tenant-wide administration permission. */
	templates(context: AuthenticatedHcmContext): Promise<{ items: NotificationTemplate[] }> {
		return this.unit.execute(
			context,
			'templates.read',
			false,
			/** Project bounded safe configuration. */ (scope) => scope.repository.templates(),
		)
	}
	/** Read the fixed supported event switches. */
	rules(context: AuthenticatedHcmContext): Promise<{ items: NotificationRule[] }> {
		return this.unit.execute(
			context,
			'rules.read',
			false,
			/** Keep configuration reads side-effect free. */ (scope) => scope.repository.rules(),
		)
	}
	/** Save plain-text configuration without rewriting previous inbox evidence. */
	saveTemplate(
		context: AuthenticatedHcmContext,
		eventValue: string,
		body: unknown,
		receiptKey: string,
		requestId: string,
	): Promise<NotificationTemplate> {
		const event = notificationEvent(eventValue),
			payload = parseTemplateSave(body)
		return this.command(
			context,
			'templates.manage',
			'notification.template',
			event,
			payload,
			receiptKey,
			/** Commit changed fields, safe audit and receipt together. */ async (scope) => {
				const current = (await scope.repository.templates()).items.find(
					/** Select the one registered event. */ (item) => item.eventType === event,
				)
				if (!current) throw new NotificationError('not-found')
				requireNotificationRevision(current.revision, payload.expectedRevision)
				const result = await scope.repository.saveTemplate(event, {
					...current,
					title: payload.title,
					body: payload.body,
				})
				const changedFields: ('title' | 'body')[] = []
				if (current.title !== payload.title) changedFields.push('title')
				if (current.body !== payload.body) changedFields.push('body')
				await scope.audit.append({
					action: 'notification.template-changed',
					targetId: event,
					requestId,
					summary: { reason: payload.reason, changedFields },
				})
				return result
			},
		) as Promise<NotificationTemplate>
	}
	/** Toggle a registered event; recipients and event expressions are immutable policy. */
	saveRule(
		context: AuthenticatedHcmContext,
		eventValue: string,
		body: unknown,
		receiptKey: string,
		requestId: string,
	): Promise<NotificationRule> {
		const event = notificationEvent(eventValue),
			payload = parseRuleSave(body)
		return this.command(
			context,
			'rules.manage',
			'notification.rule',
			event,
			payload,
			receiptKey,
			/** Persist only the switch and safe evidence. */ async (scope) => {
				const current = (await scope.repository.rules()).items.find(
					/** Select one configured event. */ (item) => item.eventType === event,
				)
				if (!current) throw new NotificationError('not-found')
				requireNotificationRevision(current.revision, payload.expectedRevision)
				const result = await scope.repository.saveRule(event, {
					...current,
					enabled: payload.enabled,
				})
				await scope.audit.append({
					action: 'notification.rule-changed',
					targetId: event,
					requestId,
					summary: {
						reason: payload.reason,
						changedFields: current.enabled === payload.enabled ? [] : ['enabled'],
					},
				})
				return result
			},
		) as Promise<NotificationRule>
	}

	/** Serialize successful receipts with their business write and reauthorize before replay. */
	private command(
		context: AuthenticatedHcmContext,
		permission: string,
		operation: string,
		target: string,
		payload: unknown,
		receiptKey: string,
		work: (scope: NotificationWork) => Promise<NotificationResponse>,
	): Promise<NotificationResponse> {
		key(receiptKey)
		const requestHash = createHash('sha256')
			.update(JSON.stringify([target, payload]))
			.digest('hex')
		return this.unit.execute(
			context,
			permission,
			true,
			/** A failed command cannot leave a successful receipt. */ async (scope) => {
				const prior = await scope.receipts.get(operation, receiptKey)
				if (prior) {
					if (prior.requestHash !== requestHash) throw new NotificationError('idempotency-conflict')
					return prior.response
				}
				const response = await work(scope)
				await scope.receipts.save(operation, receiptKey, { requestHash, response })
				return response
			},
		)
	}
}
