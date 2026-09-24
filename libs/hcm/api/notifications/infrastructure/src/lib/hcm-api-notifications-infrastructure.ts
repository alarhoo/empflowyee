import { createHash } from 'node:crypto'
import { sql } from 'kysely'
import {
	NotificationError,
	type NotificationTemplate,
	type NotificationRule,
	NOTIFICATION_EVENTS,
	type InboxQuery,
	type NotificationItem,
	type NotificationPage,
	type NotificationEvent,
	type NotificationPreference,
	type NotificationPreferences,
} from '@empflowyee/hcm-notifications-contract'
import {
	NotificationUnitOfWork,
	type NotificationRepository,
	type NotificationReceipt,
	type NotificationWork,
} from '@empflowyee/hcm-api-notifications-application'
import {
	HcmAccessDatabase,
	type AuthorizedAccessWork,
} from '@empflowyee/hcm-api-access-control-infrastructure'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
const columns = sql`n.id,n.event_type AS "eventType",n.title,n.body,n.source_request_id AS "requestId",to_char(n.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",to_char(n.read_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "readAt",n.revision`
/** Bind every cursor to the verified recipient, tenant and all active query controls. */
function fingerprint(scope: AuthorizedAccessWork, query: InboxQuery): string {
	return createHash('sha256')
		.update(
			JSON.stringify([
				scope.actor.tenantId,
				scope.actor.accountId,
				query.q,
				query.unread ?? null,
				query.eventType ?? null,
				query.sort,
				query.limit,
			]),
		)
		.digest('hex')
}
/** Validate exact bounded UTC sort evidence before it reaches PostgreSQL. */
function position(
	cursor: string | undefined,
	binding: string,
): { time: string; id: string } | null {
	if (!cursor) return null
	try {
		if (cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('cursor')
		const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
		if (
			Object.keys(value).sort().join(',') !== 'binding,id,time,version' ||
			value.version !== 1 ||
			value.binding !== binding ||
			typeof value.id !== 'string' ||
			!value.id ||
			value.id.length > 200 ||
			typeof value.time !== 'string' ||
			!/^\d{4}-\d{2}-\d{2}T[0-2]\d:[0-5]\d:[0-5]\d\.\d{6}Z$/.test(value.time) ||
			value.time.startsWith('0000-') ||
			!Number.isFinite(Date.parse(value.time)) ||
			new Date(value.time).toISOString().slice(0, 10) !== value.time.slice(0, 10)
		)
			throw new Error('cursor')
		return { time: value.time, id: value.id }
	} catch {
		throw new NotificationError('invalid-request')
	}
}
/** Escape LIKE wildcards so search remains literal substring matching. */
function search(value: string): string {
	return '%' + value.replace(/[\\%_]/g, '\\$&') + '%'
}
export class KyselyNotifications implements NotificationRepository {
	/** Bind every query to the already verified tenant and own-account transaction. */
	constructor(private readonly scope: AuthorizedAccessWork) {}
	/** Query actual recipient rows with stable microsecond time/ID continuation. */
	async inbox(query: InboxQuery): Promise<NotificationPage> {
		const binding = fingerprint(this.scope, query),
			after = position(query.cursor, binding),
			asc = query.sort === 'createdAt:asc',
			order = asc ? sql`ASC` : sql`DESC`,
			compare = asc ? sql`>` : sql`<`
		const rows = (
			await sql<NotificationItem>`SELECT ${columns} FROM hcm.notification n WHERE n.tenant_id=${this.scope.actor.tenantId} AND n.recipient_account_id=${this.scope.actor.accountId}
 ${query.q ? sql`AND (n.title ILIKE ${search(query.q)} OR n.body ILIKE ${search(query.q)})` : sql``}
 ${query.unread === undefined ? sql`` : sql`AND (n.read_at IS NULL)=${query.unread}`}
 ${query.eventType ? sql`AND n.event_type=${query.eventType}` : sql``}
 ${after ? sql`AND (n.created_at,n.id) ${compare} (${after.time}::timestamptz,${after.id})` : sql``}
 ORDER BY n.created_at ${order},n.id ${order} LIMIT ${query.limit + 1}`.execute(
				this.scope.transaction,
			)
		).rows
		const items = rows.slice(0, query.limit),
			last = items.at(-1)
		let nextCursor: string | null = null
		if (rows.length > query.limit && last)
			nextCursor = Buffer.from(
				JSON.stringify({ version: 1, binding, time: last.createdAt, id: last.id }),
			).toString('base64url')
		return { items, nextCursor }
	}
	/** Conceal an existing different-account notification exactly like a missing one. */
	async get(id: string): Promise<NotificationItem> {
		const row = (
			await sql<NotificationItem>`SELECT ${columns} FROM hcm.notification n WHERE n.tenant_id=${this.scope.actor.tenantId} AND n.recipient_account_id=${this.scope.actor.accountId} AND n.id=${id}`.execute(
				this.scope.transaction,
			)
		).rows[0]
		if (!row) throw new NotificationError('not-found')
		return row
	}
	/** Preserve the first read timestamp and prohibit inbox-body mutation. */
	async read(item: NotificationItem): Promise<NotificationItem> {
		const result =
			await sql`UPDATE hcm.notification SET read_at=now(),revision=revision+1 WHERE tenant_id=${this.scope.actor.tenantId} AND recipient_account_id=${this.scope.actor.accountId} AND id=${item.id} AND revision=${item.revision} AND read_at IS NULL`.execute(
				this.scope.transaction,
			)
		if (result.numAffectedRows !== 1n) throw new NotificationError('revision-conflict')
		return this.get(item.id)
	}
	/** Project exactly three server-defined categories, with absent preferences explicitly enabled. */
	async preferences(): Promise<NotificationPreferences> {
		const rows = (
			await sql<NotificationPreference>`SELECT event_type AS "eventType",enabled,revision FROM hcm.notification_preference WHERE tenant_id=${this.scope.actor.tenantId} AND account_id=${this.scope.actor.accountId}`.execute(
				this.scope.transaction,
			)
		).rows
		return {
			items: NOTIFICATION_EVENTS.map(
				/** Merge only the documented persisted override. */ (eventType) =>
					rows.find(
						/** Match this registered category. */ (row) => row.eventType === eventType,
					) ?? { eventType, enabled: true, revision: 0 },
			),
		}
	}
	/** Read one own override without creating storage during a read. */
	async preference(event: NotificationEvent): Promise<NotificationPreference> {
		return (
			(
				await sql<NotificationPreference>`SELECT event_type AS "eventType",enabled,revision FROM hcm.notification_preference WHERE tenant_id=${this.scope.actor.tenantId} AND account_id=${this.scope.actor.accountId} AND event_type=${event}`.execute(
					this.scope.transaction,
				)
			).rows[0] ?? { eventType: event, enabled: true, revision: 0 }
		)
	}
	/** Insert an explicit first choice or update exactly the current revision. */
	async savePreference(value: NotificationPreference): Promise<NotificationPreference> {
		if (value.revision === 0) {
			const inserted =
				await sql`INSERT INTO hcm.notification_preference(tenant_id,account_id,event_type,enabled) VALUES(${this.scope.actor.tenantId},${this.scope.actor.accountId},${value.eventType},${value.enabled}) ON CONFLICT DO NOTHING`.execute(
					this.scope.transaction,
				)
			if (inserted.numAffectedRows !== 1n) throw new NotificationError('revision-conflict')
		} else {
			const updated =
				await sql`UPDATE hcm.notification_preference SET enabled=${value.enabled},revision=revision+1,updated_at=now() WHERE tenant_id=${this.scope.actor.tenantId} AND account_id=${this.scope.actor.accountId} AND event_type=${value.eventType} AND revision=${value.revision}`.execute(
					this.scope.transaction,
				)
			if (updated.numAffectedRows !== 1n) throw new NotificationError('revision-conflict')
		}
		return this.preference(value.eventType)
	}
	/** Read explicit seed-provisioned configuration; no runtime creation fallback. */
	async templates(): Promise<{ items: NotificationTemplate[] }> {
		const result =
			await sql<NotificationTemplate>`SELECT event_type AS "eventType",title,body,revision FROM hcm.notification_template WHERE tenant_id=${this.scope.actor.tenantId} ORDER BY event_type`.execute(
				this.scope.transaction,
			)
		return { items: result.rows }
	}
	/** Read only the fixed event switch projection. */
	async rules(): Promise<{ items: NotificationRule[] }> {
		const result =
			await sql<NotificationRule>`SELECT event_type AS "eventType",enabled,revision FROM hcm.notification_rule WHERE tenant_id=${this.scope.actor.tenantId} ORDER BY event_type`.execute(
				this.scope.transaction,
			)
		return { items: result.rows }
	}
	/** Update approved text columns only, deriving tenant and updater from verified context. */
	async saveTemplate(
		event: NotificationEvent,
		value: NotificationTemplate,
	): Promise<NotificationTemplate> {
		const result =
			await sql<NotificationTemplate>`UPDATE hcm.notification_template SET title=${value.title},body=${value.body},revision=revision+1,updated_by=${this.scope.actor.accountId},updated_at=now() WHERE tenant_id=${this.scope.actor.tenantId} AND event_type=${event} AND revision=${value.revision} RETURNING event_type AS "eventType",title,body,revision`.execute(
				this.scope.transaction,
			)
		if (!result.rows[0]) throw new NotificationError('revision-conflict')
		return result.rows[0]
	}
	/** Change only a supported tenant rule switch under optimistic concurrency. */
	async saveRule(event: NotificationEvent, value: NotificationRule): Promise<NotificationRule> {
		const result =
			await sql<NotificationRule>`UPDATE hcm.notification_rule SET enabled=${value.enabled},revision=revision+1,updated_by=${this.scope.actor.accountId},updated_at=now() WHERE tenant_id=${this.scope.actor.tenantId} AND event_type=${event} AND revision=${value.revision} RETURNING event_type AS "eventType",enabled,revision`.execute(
				this.scope.transaction,
			)
		if (!result.rows[0]) throw new NotificationError('revision-conflict')
		return result.rows[0]
	}

	/** Read exact actor/operation receipt evidence only after current authorization. */
	async receipt(operation: string, key: string): Promise<NotificationReceipt | null> {
		return (
			(
				await sql<NotificationReceipt>`SELECT request_hash AS "requestHash",response FROM hcm.notification_command_receipt WHERE tenant_id=${this.scope.actor.tenantId} AND actor_account_id=${this.scope.actor.accountId} AND operation=${operation} AND idempotency_key=${key}::uuid`.execute(
					this.scope.transaction,
				)
			).rows[0] ?? null
		)
	}
	/** Store the response atomically with the preference/read-state and audit changes. */
	async saveReceipt(operation: string, key: string, value: NotificationReceipt): Promise<void> {
		await sql`INSERT INTO hcm.notification_command_receipt(tenant_id,actor_account_id,operation,idempotency_key,request_hash,response) VALUES(${this.scope.actor.tenantId},${this.scope.actor.accountId},${operation},${key}::uuid,${value.requestHash},${JSON.stringify(value.response)}::jsonb)`.execute(
			this.scope.transaction,
		)
	}
}
export class KyselyNotificationUnitOfWork extends NotificationUnitOfWork {
	/** Reuse verified tenant transactions and the existing persisted authorization policy. */
	constructor(private readonly database: HcmAccessDatabase | null) {
		super()
	}
	/** Serialize local notification writes with authority changes before reauthorization and receipt replay. */
	async execute<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		write: boolean,
		work: (scope: NotificationWork) => Promise<T>,
	): Promise<T> {
		if (!this.database) throw new Error('Business runtime unavailable')
		return this.database.execute(
			context,
			{ permission: 'hcm.notifications.' + permission, entitlement: 'hcm.notifications' },
			write,
			/** Compose repositories and audit on the identical authorized executor. */ (scope) => {
				const repository = new KyselyNotifications(scope)
				return work({
					repository,
					audit: scope.audit,
					receipts: {
						get: repository.receipt.bind(repository),
						save: repository.saveReceipt.bind(repository),
					},
				})
			},
		)
	}
}
