import { createHash } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import {
	AuditReader,
	validateAccessAudit,
	type AccessAuditEvent,
} from '@empflowyee/hcm-api-audit-application'
import {
	AUDIT_ACTIONS,
	EXPORT_ACTIONS,
	type ExportQuery,
	type ExportItem,
	type ExportPage,
	AuditQueryError,
	isAuditInstant,
	type AuditItem,
	type AuditPage,
	type AuditQuery,
	type MyActivityQuery,
	type MyActivityPage,
} from '@empflowyee/hcm-audit-contract'
import {
	requireAuthenticatedAccount,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import type { AuditTables } from './hcm-api-audit-infrastructure'

/** The composition root supplies the existing authorized executor without reversing audit dependencies. */
export type AuditReadExecutor<Result = AuditPage> = (
	context: AuthenticatedHcmContext,
	work: (database: Kysely<AuditTables>, tenantId: string) => Promise<Result>,
) => Promise<Result>

/** Bind a continuation to every control and tenant without treating it as an authorization token. */
function binding(query: AuditQuery, tenantId: string, projection = 'tenant'): string {
	return createHash('sha256')
		.update(
			JSON.stringify([
				projection,
				tenantId,
				query.from ?? null,
				query.to ?? null,
				query.action ?? null,
				query.outcome ?? null,
				query.actorAccountId ?? null,
				query.sort,
				query.limit,
			]),
		)
		.digest('hex')
}
/** Retain PostgreSQL microsecond precision and reject malformed or cross-query continuations. */
function position(
	query: AuditQuery,
	tenantId: string,
	projection = 'tenant',
): { time: string; id: string } | undefined {
	if (!query.cursor) return undefined
	try {
		if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw new AuditQueryError()
		const value = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'))
		if (
			Object.keys(value).sort().join(',') !== 'binding,id,time,version' ||
			value.version !== 1 ||
			value.binding !== binding(query, tenantId, projection) ||
			typeof value.time !== 'string' ||
			!isAuditInstant(value.time) ||
			typeof value.id !== 'string' ||
			!value.id ||
			value.id.length > 200
		)
			throw new AuditQueryError()
		return { time: value.time, id: value.id }
	} catch {
		throw new AuditQueryError()
	}
}
/** Project only registered action fields and validate their shape before exposing any operator text. */
function safeSummary(row: AuditItem): AuditItem {
	const raw = row.summary
	let summary: AuditItem['summary']
	if (row.action.startsWith('account.')) summary = { reason: raw.reason, enabled: raw.enabled }
	else if (row.action === 'role.granted' || row.action === 'role.revoked')
		summary = { reason: raw.reason, roleId: raw.roleId, grantId: raw.grantId }
	else summary = { reason: raw.reason, changedFields: raw.changedFields }
	validateAccessAudit({
		action: row.action,
		targetId: row.targetId,
		requestId: row.requestId,
		summary,
	} as AccessAuditEvent)
	return { ...row, summary }
}
export class KyselyAuditReader extends AuditReader {
	/** Accept the existing authorized transaction callback, never a raw unscoped connection. */
	constructor(
		private readonly execute: AuditReadExecutor,
		private readonly executeSelf: AuditReadExecutor<MyActivityPage>,
		private readonly executeExports: AuditReadExecutor<ExportPage>,
	) {
		super()
	}
	/** Select actual allowlisted business events with stable tenant-scoped keyset pagination. */
	list(context: AuthenticatedHcmContext, query: AuditQuery): Promise<AuditPage> {
		return this.execute(
			context,
			/** Keep source ownership and exact timestamp precision in the audit adapter. */ async (
				database,
				tenantId,
			) => {
				return businessPage(database, tenantId, query)
			},
		)
	}

	/** Query persisted export evidence only from separately approved producers, never synthesize history. */
	exports(context: AuthenticatedHcmContext, query: ExportQuery): Promise<ExportPage> {
		return this.executeExports(
			context,
			/** Apply tenant ownership and the closed producer registry in SQL. */ async (
				database,
				tenantId,
			) => {
				const after = position(query, tenantId, 'export'),
					asc = query.sort === 'occurredAt:asc',
					order = asc ? sql`ASC` : sql`DESC`,
					compare = asc ? sql`>` : sql`<`
				const rows = (
					await sql<ExportItem>`SELECT id,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "occurredAt",actor_account_id AS "actorAccountId",action,target_type AS "targetType",target_id AS "targetId",outcome FROM hcm.audit_event WHERE tenant_id=${tenantId} AND category='export' AND action=ANY(${[...EXPORT_ACTIONS]}::text[])
   ${query.from ? sql`AND occurred_at>=${query.from}::timestamptz` : sql``}
   ${query.to ? sql`AND occurred_at<=${query.to}::timestamptz` : sql``}
   ${query.actorAccountId ? sql`AND actor_account_id=${query.actorAccountId}` : sql``}
   ${after ? sql`AND (occurred_at,id) ${compare} (${after.time}::timestamptz,${after.id})` : sql``}
   ORDER BY occurred_at ${order},id ${order} LIMIT ${query.limit + 1}`.execute(database)
				).rows
				const items = rows.slice(0, query.limit),
					last = items.at(-1)
				let nextCursor: string | null = null
				if (rows.length > query.limit && last)
					nextCursor = Buffer.from(
						JSON.stringify({
							version: 1,
							binding: binding(query, tenantId, 'export'),
							time: last.occurredAt,
							id: last.id,
						}),
					).toString('base64url')
				return { items, nextCursor }
			},
		)
	}

	/** Resolve self inside verified context and project only approved self-safe summary fields. */
	activity(context: AuthenticatedHcmContext, query: MyActivityQuery): Promise<MyActivityPage> {
		return this.executeSelf(
			context,
			/** Force actor scope independently of transport and UI visibility. */ async (
				database,
				tenantId,
			) => {
				const page = await businessPage(
					database,
					tenantId,
					{ ...query, actorAccountId: requireAuthenticatedAccount(context) },
					'self',
				)
				return {
					nextCursor: page.nextCursor,
					items: page.items.map(
						/** Explicitly omit diagnostics and operator text from the public self contract. */ (
							item,
						) => ({
							id: item.id,
							occurredAt: item.occurredAt,
							action: item.action,
							targetType: item.targetType,
							targetId: item.targetId,
							outcome: item.outcome,
							summary: item.summary.changedFields
								? { changedFields: item.summary.changedFields }
								: {},
						}),
					),
				}
			},
		)
	}
}
/** Share stable business-event paging while binding cursors to their exact projection and actor scope. */
async function businessPage(
	database: Kysely<AuditTables>,
	tenantId: string,
	query: AuditQuery,
	projection = 'tenant',
): Promise<AuditPage> {
	const after = position(query, tenantId, projection),
		asc = query.sort === 'occurredAt:asc',
		order = asc ? sql`ASC` : sql`DESC`,
		compare = asc ? sql`>` : sql`<`
	const rows = (
		await sql<AuditItem>`SELECT id,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "occurredAt",actor_account_id AS "actorAccountId",action,target_type AS "targetType",target_id AS "targetId",outcome,request_id AS "requestId",safe_summary AS summary FROM hcm.audit_event WHERE tenant_id=${tenantId} AND category='business' AND outcome='Succeeded' AND action IN (${sql.join([...AUDIT_ACTIONS])})
 ${query.from ? sql`AND occurred_at>=${query.from}::timestamptz` : sql``}
 ${query.to ? sql`AND occurred_at<=${query.to}::timestamptz` : sql``}
 ${query.action ? sql`AND action=${query.action}` : sql``}
 ${query.actorAccountId ? sql`AND actor_account_id=${query.actorAccountId}` : sql``}
 ${after ? sql`AND (occurred_at,id) ${compare} (${after.time}::timestamptz,${after.id})` : sql``}
 ORDER BY occurred_at ${order},id ${order} LIMIT ${query.limit + 1}`.execute(database)
	).rows
	const items = rows.slice(0, query.limit).map(safeSummary),
		last = items.at(-1)
	let nextCursor: string | null = null
	if (rows.length > query.limit && last) {
		const position = {
			version: 1,
			binding: binding(query, tenantId, projection),
			time: last.occurredAt,
			id: last.id,
		}
		nextCursor = Buffer.from(JSON.stringify(position)).toString('base64url')
	}
	return { items, nextCursor }
}
