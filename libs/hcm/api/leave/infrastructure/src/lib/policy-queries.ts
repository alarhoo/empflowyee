import { createHash, randomBytes } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { invalidField, type HcmPage } from '@empflowyee/hcm-runtime-contract'
import type {
	LeavePolicyListQuery,
	LeavePolicyVersionView,
	LeavePolicyOptions,
	LeavePolicyOptionsQuery,
	LeaveTypeOption,
} from '@empflowyee/hcm-leave-contract'
import { commandHash } from '@empflowyee/hcm-api-runtime-application'
import { likePattern } from '@empflowyee/hcm-api-database-kysely'
import { KyselyLeavePolicyRepository } from './hcm-api-leave-infrastructure'

interface Position {
	value: string
	id: string
}
/** Keep Leave continuations bound to current source authority without trusting browser cursor payloads. */
export class LeaveQueryCursors {
	/** Receive the owning query's already authorized tenant transaction. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenantId: string,
		private readonly accountId: string,
	) {}
	/** Resolve only a live token with the exact actor and current query binding. */
	async read(kind: 'Policies' | 'Types', token: string, binding: string): Promise<Position> {
		const digest = createHash('sha256').update(token).digest('hex')
		const found =
			await sql<Position>`SELECT last_sort_value AS value,last_id AS id FROM hcm.leave_query_cursor WHERE tenant_id=${this.tenantId} AND token_digest=${digest} AND actor_account_id=${this.accountId} AND query_kind=${kind} AND binding_digest=${binding} AND expires_at>clock_timestamp()`.execute(
				this.transaction,
			)
		if (!found.rows[0]) invalidField('cursor', 'stale-or-invalid')
		return found.rows[0]
	}
	/** Store a hash-only fifteen-minute continuation and prune bounded expired cache entries. */
	async store(kind: 'Policies' | 'Types', binding: string, position: Position): Promise<string> {
		const token = randomBytes(32).toString('base64url'),
			digest = createHash('sha256').update(token).digest('hex')
		await sql`DELETE FROM hcm.leave_query_cursor WHERE tenant_id=${this.tenantId} AND token_digest IN(SELECT token_digest FROM hcm.leave_query_cursor WHERE tenant_id=${this.tenantId} AND expires_at<=clock_timestamp() ORDER BY expires_at,token_digest LIMIT 100)`.execute(
			this.transaction,
		)
		await sql`INSERT INTO hcm.leave_query_cursor(tenant_id,token_digest,actor_account_id,query_kind,binding_digest,last_sort_value,last_id,created_at,expires_at) VALUES(${this.tenantId},${digest},${this.accountId},${kind},${binding},${position.value},${position.id},statement_timestamp(),statement_timestamp()+interval '15 minutes')`.execute(
			this.transaction,
		)
		return token
	}
}

/** Query latest policy versions on the server under one current tenant-wide grant. */
export class KyselyLeavePolicyQueries {
	/** Bind cursor identity to the actual authorizing grant rather than a role label. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenantId: string,
		private readonly accountId: string,
		private readonly grantId: string,
	) {}

	/** Page safe type references by name and identity, preserving exact picker selection on reload. */
	async options(query: LeavePolicyOptionsQuery): Promise<LeavePolicyOptions> {
		const generation = (
			await sql<{
				revision: string
			}>`SELECT coalesce(sum(revision),0)::text AS revision FROM hcm.leave_type WHERE tenant_id=${this.tenantId}`.execute(
				this.transaction,
			)
		).rows[0].revision
		const { cursor, ...parameters } = query
		const binding = commandHash('LeaveTypeOptions', {
			tenant: this.tenantId,
			actor: this.accountId,
			grant: this.grantId,
			permission: 'hcm.leave.leave-policies.read',
			generation,
			parameters,
		})
		const cursors = new LeaveQueryCursors(this.transaction, this.tenantId, this.accountId),
			after = cursor ? await cursors.read('Types', cursor, binding) : null
		const clauses = [sql`tenant_id=${this.tenantId}`]
		if (query.id) clauses.push(sql`id=${query.id}`)
		if (query.q)
			clauses.push(sql`(name ILIKE ${likePattern(query.q)} OR code ILIKE ${likePattern(query.q)})`)
		if (after) clauses.push(sql`(name COLLATE "C",id COLLATE "C")>(${after.value},${after.id})`)
		const rows = (
			await sql<LeaveTypeOption>`SELECT id,name AS label,code,unit,category,revision,CASE WHEN is_active THEN 'Active' ELSE 'Inactive' END AS state FROM hcm.leave_type WHERE ${sql.join(clauses, sql` AND `)} ORDER BY name COLLATE "C",id COLLATE "C" LIMIT ${query.limit + 1}`.execute(
				this.transaction,
			)
		).rows
		const page = rows.slice(0, query.limit),
			last = page.at(-1)
		return {
			leaveTypes: page,
			nextCursor:
				rows.length > query.limit && last
					? await cursors.store('Types', binding, { value: last.label, id: last.id })
					: null,
		}
	}

	/** Apply filters after selecting each root's latest version, with stable collation and an ID tie-break. */
	async list(query: LeavePolicyListQuery): Promise<HcmPage<LeavePolicyVersionView>> {
		const generation = (
			await sql<{
				revision: string
			}>`SELECT coalesce(sum(revision),0)::text AS revision FROM hcm.leave_policy_version WHERE tenant_id=${this.tenantId}`.execute(
				this.transaction,
			)
		).rows[0].revision
		const { cursor, ...parameters } = query
		const binding = commandHash('LeavePolicyList', {
			tenant: this.tenantId,
			actor: this.accountId,
			grant: this.grantId,
			permission: 'hcm.leave.leave-policies.read',
			scope: 'Tenant',
			generation,
			parameters,
		})
		const cursors = new LeaveQueryCursors(this.transaction, this.tenantId, this.accountId)
		const after = cursor ? await cursors.read('Policies', cursor, binding) : null
		const fields = { code: sql`p.code`, name: sql`v.name`, state: sql`v.state`, id: sql`p.id` },
			sort = fields[query.sort]
		const direction = query.direction === 'asc' ? sql`ASC` : sql`DESC`,
			comparison = query.direction === 'asc' ? sql`>` : sql`<`
		const clauses = [sql`p.tenant_id=${this.tenantId}`]
		if (query.id) clauses.push(sql`p.id=${query.id}`)
		if (query.code) clauses.push(sql`p.code ILIKE ${likePattern(query.code)}`)
		if (query.name) clauses.push(sql`v.name ILIKE ${likePattern(query.name)}`)
		if (query.state) clauses.push(sql`v.state=${query.state}`)
		if (after)
			clauses.push(
				sql`(${sort} COLLATE "C",p.id COLLATE "C") ${comparison} (${after.value},${after.id})`,
			)
		const rows = (
			await sql<{
				id: string
				versionId: string
				value: string
			}>`SELECT p.id,v.id AS "versionId",${sort} AS value FROM hcm.leave_policy p JOIN LATERAL(SELECT id,name,state FROM hcm.leave_policy_version WHERE tenant_id=p.tenant_id AND policy_id=p.id ORDER BY version_number DESC LIMIT 1) v ON true WHERE ${sql.join(clauses, sql` AND `)} ORDER BY ${sort} COLLATE "C" ${direction},p.id COLLATE "C" ${direction} LIMIT ${query.limit + 1}`.execute(
				this.transaction,
			)
		).rows
		const page = rows.slice(0, query.limit),
			items: LeavePolicyVersionView[] = []
		const repository = new KyselyLeavePolicyRepository(
			this.transaction,
			this.tenantId,
			this.accountId,
		)
		for (const row of page) {
			const view = await repository.read(row.id, row.versionId)
			if (!view) throw new Error('Policy changed inside authorized read transaction')
			items.push(view)
		}
		const last = page.at(-1)
		return {
			items,
			nextCursor:
				rows.length > query.limit && last
					? await cursors.store('Policies', binding, { value: last.value, id: last.id })
					: null,
		}
	}
}
