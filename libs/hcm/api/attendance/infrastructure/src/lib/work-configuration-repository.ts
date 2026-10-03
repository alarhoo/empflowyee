import { randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { HcmDomainError, type HcmPage } from '@empflowyee/hcm-runtime-contract'
import {
	parseAttendancePolicyDraft,
	parseShiftDraft,
	type ScheduleListQuery,
} from '@empflowyee/hcm-attendance-contract'
import type {
	WorkConfigurationRepository,
	WorkConfigurationFamily,
	WorkConfigurationDraft,
	WorkConfigurationView,
	WorkConfigurationInsert,
} from '@empflowyee/hcm-api-attendance-application'
import { commandHash } from '@empflowyee/hcm-api-runtime-application'
import { likePattern } from '@empflowyee/hcm-api-database-kysely'
import {
	KyselyAttendanceConfigurationReader,
	shiftVersionProjection,
	policyVersionProjection,
} from './configuration-readers'
import { AttendanceQueryCursors } from './query-cursors'

/** Reuse the existing SQL-owned Shift/Policy families with a closed internal table map. */
export class KyselyWorkConfigurationRepository implements WorkConfigurationRepository {
	/** Advance the exact Draft after source review; SQL independently checks the immutable lifecycle. */
	async publish(
		ownerId: string,
		versionId: string,
		revision: number,
		digest: string,
	): Promise<void> {
		const result = await sql<{
			id: string
		}>`UPDATE ${this.versions} SET state='Published',revision=revision+1,publication_digest=${digest},published_at=clock_timestamp(),published_by_account_id=${this.accountId},updated_at=clock_timestamp() WHERE tenant_id=${this.tenantId} AND ${this.ownerColumn}=${ownerId} AND id=${versionId} AND revision=${revision} AND state='Draft' RETURNING id`.execute(
			this.transaction,
		)
		if (!result.rows.length) throw new HcmDomainError('revision-conflict')
	}
	/** Preserve historical payload and attribution while retiring future use of this version. */
	async retire(ownerId: string, versionId: string, revision: number): Promise<void> {
		const result = await sql<{
			id: string
		}>`UPDATE ${this.versions} SET state='Retired',revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=${this.tenantId} AND ${this.ownerColumn}=${ownerId} AND id=${versionId} AND revision=${revision} AND state='Published' RETURNING id`.execute(
			this.transaction,
		)
		if (!result.rows.length) throw new HcmDomainError('revision-conflict')
	}
	private readonly root
	private readonly versions
	private readonly ownerColumn
	private readonly reader: KyselyAttendanceConfigurationReader
	/** Require the owning transaction's verified tenant, actor and current read-grant identity. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenantId: string,
		private readonly accountId: string,
		private readonly grantId: string,
		private readonly family: WorkConfigurationFamily,
	) {
		this.root = sql.table(family === 'Shift' ? 'hcm.shift' : 'hcm.attendance_policy')
		this.versions = sql.table(
			family === 'Shift' ? 'hcm.shift_version' : 'hcm.attendance_policy_version',
		)
		this.ownerColumn = sql.ref(family === 'Shift' ? 'shift_id' : 'policy_id')
		this.reader = new KyselyAttendanceConfigurationReader(transaction, tenantId)
	}
	/** Return a purpose-built DTO without publication actors or persistence internals. */
	read(ownerId: string, versionId: string): Promise<WorkConfigurationView | null> {
		return this.family === 'Shift'
			? this.reader.shift(ownerId, versionId)
			: this.reader.policy(ownerId, versionId)
	}
	/** Lock the exact tenant/root/version tuple before a source mutation. */
	async lock(ownerId: string, versionId: string): Promise<WorkConfigurationView | null> {
		await sql`SELECT id FROM ${this.versions} WHERE tenant_id=${this.tenantId} AND ${this.ownerColumn}=${ownerId} AND id=${versionId} FOR UPDATE`.execute(
			this.transaction,
		)
		return this.read(ownerId, versionId)
	}
	/** Insert immutable root identity under the unit's tenant mutation lock. */
	async createOwner(id: string, code: string): Promise<void> {
		await sql`INSERT INTO ${this.root}(tenant_id,id,code,created_by_account_id) VALUES(${this.tenantId},${id},${code},${this.accountId})`.execute(
			this.transaction,
		)
	}
	/** Allocate the next version ordinal while the command holds the tenant write lock. */
	async nextVersionNumber(ownerId: string): Promise<number> {
		return (
			await sql<{
				next: number
			}>`SELECT coalesce(max(version_number),0)+1 AS next FROM ${this.versions} WHERE tenant_id=${this.tenantId} AND ${this.ownerColumn}=${ownerId}`.execute(
				this.transaction,
			)
		).rows[0].next
	}
	/** Store explicit policy rules or shift segments; SQL retains authority over constraints and immutable lifecycle. */
	async insertVersion(input: WorkConfigurationInsert): Promise<void> {
		if (this.family === 'Shift') {
			const d = parseShiftDraft(input.draft)
			await sql`INSERT INTO hcm.shift_version(tenant_id,id,shift_id,version_number,name,description,effective_from,effective_to,timezone_mode,fixed_zone,minimum_rest_minutes,minimum_rest_mode,supersedes_id,created_by_account_id)
VALUES(${this.tenantId},${input.id},${input.ownerId},${input.versionNumber},${d.name},${d.description ?? ''},${d.effectiveFrom}::date,${d.effectiveTo ?? null}::date,${d.timezoneMode},${d.fixedZone ?? null},${d.minimumRestMinutes ?? null},${d.minimumRestMode ?? null},${input.supersedesId},${this.accountId})`.execute(
	this.transaction,
)
		} else {
			const d = parseAttendancePolicyDraft(input.draft),
				overtime = d.overtime
			await sql`INSERT INTO hcm.attendance_policy_version(tenant_id,id,policy_id,version_number,name,effective_from,effective_to,grace_in_minutes,grace_out_minutes,rounding,rounding_increment_minutes,rounding_direction,minimum_rest_minutes,minimum_rest_mode,overtime_enabled,overtime_qualification,overtime_cap_minutes,overtime_preapproval_required,supersedes_id,created_by_account_id)
VALUES(${this.tenantId},${input.id},${input.ownerId},${input.versionNumber},${d.name},${d.effectiveFrom}::date,${d.effectiveTo ?? null}::date,${d.graceInMinutes},${d.graceOutMinutes},${d.rounding},${d.roundingIncrementMinutes ?? null},${d.roundingDirection ?? null},${d.minimumRestMinutes ?? null},${d.minimumRestMode ?? null},${overtime.enabled},${overtime.enabled ? overtime.qualification : null},${overtime.enabled ? overtime.capMinutes : null},${overtime.enabled ? overtime.preapprovalRequired : null},${input.supersedesId},${this.accountId})`.execute(
	this.transaction,
)
		}
		await this.insertChildren(input.id, input.draft)
	}
	/** Replace the exact Draft and its owned children; stale or immutable versions have no partial effects. */
	async replace(
		ownerId: string,
		versionId: string,
		revision: number,
		draft: WorkConfigurationDraft,
	): Promise<void> {
		let fields
		if (this.family === 'Shift') {
			const d = parseShiftDraft(draft)
			fields = sql`name=${d.name},description=${d.description ?? ''},effective_from=${d.effectiveFrom}::date,effective_to=${d.effectiveTo ?? null}::date,timezone_mode=${d.timezoneMode},fixed_zone=${d.fixedZone ?? null},minimum_rest_minutes=${d.minimumRestMinutes ?? null},minimum_rest_mode=${d.minimumRestMode ?? null}`
		} else {
			const d = parseAttendancePolicyDraft(draft),
				overtime = d.overtime
			fields = sql`name=${d.name},effective_from=${d.effectiveFrom}::date,effective_to=${d.effectiveTo ?? null}::date,grace_in_minutes=${d.graceInMinutes},grace_out_minutes=${d.graceOutMinutes},rounding=${d.rounding},rounding_increment_minutes=${d.roundingIncrementMinutes ?? null},rounding_direction=${d.roundingDirection ?? null},minimum_rest_minutes=${d.minimumRestMinutes ?? null},minimum_rest_mode=${d.minimumRestMode ?? null},overtime_enabled=${overtime.enabled},overtime_qualification=${overtime.enabled ? overtime.qualification : null},overtime_cap_minutes=${overtime.enabled ? overtime.capMinutes : null},overtime_preapproval_required=${overtime.enabled ? overtime.preapprovalRequired : null}`
		}
		const result = await sql<{
			id: string
		}>`UPDATE ${this.versions} SET ${fields},revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=${this.tenantId} AND ${this.ownerColumn}=${ownerId} AND id=${versionId} AND revision=${revision} AND state='Draft' RETURNING id`.execute(
			this.transaction,
		)
		if (!result.rows.length) throw new HcmDomainError('revision-conflict')
		const children = sql.table(
			this.family === 'Shift' ? 'hcm.shift_segment' : 'hcm.attendance_approval_rule',
		)
		await sql`DELETE FROM ${children} WHERE tenant_id=${this.tenantId} AND version_id=${versionId}`.execute(
			this.transaction,
		)
		await this.insertChildren(versionId, draft)
	}
	/** Persist all source children with typed references and exact wall-clock precision. */
	private async insertChildren(versionId: string, draft: WorkConfigurationDraft): Promise<void> {
		if (this.family === 'Shift') {
			const d = parseShiftDraft(draft)
			let startDayOffset = 0
			for (const [index, s] of d.segments.entries()) {
				await sql`INSERT INTO hcm.shift_segment(tenant_id,id,version_id,ordinal,kind,start_time,end_time,start_day_offset,end_day_offset,start_overlap_choice,end_overlap_choice)
VALUES(${this.tenantId},${randomUUID()},${versionId},${index + 1},${s.kind},${s.startTime}::time,${s.endTime}::time,${startDayOffset},${s.endDayOffset},${s.overlapOffset?.start ?? null},${s.overlapOffset?.end ?? null})`.execute(
	this.transaction,
)
				startDayOffset = s.endDayOffset
			}
		} else {
			const d = parseAttendancePolicyDraft(draft)
			for (const [index, r] of d.approvalRules.entries()) {
				const c = r.candidateRule
				await sql`INSERT INTO hcm.attendance_approval_rule(tenant_id,id,version_id,ordinal,subject_type,stage,independent,candidate_source,manager_level,function_code,account_id)
VALUES(${this.tenantId},${randomUUID()},${versionId},${index + 1},${r.subjectType},${r.stage},${r.independent},${c.source},${c.source === 'ManagerLevel' ? c.managerLevel : null},${c.source === 'Function' ? c.functionCode : null},${c.source === 'NamedUser' ? c.accountId : null})`.execute(
	this.transaction,
)
			}
		}
	}
	/** Select latest versions before filtering and bind opaque continuation to actor, grant, filters and current source revisions. */
	async list(query: ScheduleListQuery): Promise<HcmPage<WorkConfigurationView>> {
		const generation = (
			await sql<{
				revision: string
			}>`SELECT coalesce(sum(revision),0)::text AS revision FROM ${this.versions} WHERE tenant_id=${this.tenantId}`.execute(
				this.transaction,
			)
		).rows[0].revision
		const { cursor, ...parameters } = query
		const binding = commandHash(this.family + 'List', {
			tenant: this.tenantId,
			actor: this.accountId,
			grant: this.grantId,
			permission: 'hcm.attendance.work-schedules.read',
			scope: 'Tenant',
			parameters,
			generation,
		})
		const cursors = new AttendanceQueryCursors(this.transaction, this.tenantId, this.accountId)
		const app = this.family === 'Shift' ? 'SHIFTS' : 'ATTENDANCE_POLICIES'
		const after = cursor === undefined ? null : await cursors.read(app, cursor, binding)
		const fields = { code: sql`r.code`, name: sql`v.name`, state: sql`v.state`, id: sql`r.id` }
		const sort = fields[query.sort],
			direction = query.direction === 'asc' ? sql`ASC` : sql`DESC`,
			compare = query.direction === 'asc' ? sql`>` : sql`<`
		const clauses = [sql`r.tenant_id=${this.tenantId}`]
		if (query.id) clauses.push(sql`r.id=${query.id}`)
		if (query.code) clauses.push(sql`r.code ILIKE ${likePattern(query.code)}`)
		if (query.name) clauses.push(sql`v.name ILIKE ${likePattern(query.name)}`)
		if (query.state) clauses.push(sql`v.state=${query.state}`)
		if (after)
			clauses.push(
				sql`(${sort} COLLATE "C",r.id COLLATE "C") ${compare} (${after.value},${after.id})`,
			)
		const versionOwner = sql.ref(this.family === 'Shift' ? 'v1.shift_id' : 'v1.policy_id')
		const projection = this.family === 'Shift' ? shiftVersionProjection : policyVersionProjection
		const rows = (
			await sql<{
				view: WorkConfigurationView
				sortValue: string
			}>`SELECT ${projection} AS view, ${sort} AS "sortValue" FROM ${this.root} r
JOIN LATERAL (SELECT v1.* FROM ${this.versions} v1 WHERE v1.tenant_id=r.tenant_id AND ${versionOwner}=r.id ORDER BY v1.version_number DESC LIMIT 1) v ON TRUE
WHERE ${sql.join(clauses, sql` AND `)} ORDER BY ${sort} COLLATE "C" ${direction},r.id COLLATE "C" ${direction} LIMIT ${query.limit + 1}`.execute(
				this.transaction,
			)
		).rows
		const page = rows.slice(0, query.limit),
			last = page.at(-1)
		const nextCursor =
			rows.length > query.limit && last
				? await cursors.store(app, binding, { value: last.sortValue, id: last.view.id })
				: null
		return {
			items: page.map(
				/** Return business projections without cursor internals. */ (row) => row.view,
			),
			nextCursor,
		}
	}
}
