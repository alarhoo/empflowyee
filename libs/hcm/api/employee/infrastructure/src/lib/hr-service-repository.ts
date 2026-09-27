import { randomUUID } from 'node:crypto'
import { sql, type Kysely, type RawBuilder } from 'kysely'
import {
	classifyConstraint,
	cursorBinding,
	decodeCursor,
	keysetPage,
	likePattern,
} from '@empflowyee/hcm-api-database-kysely'
import type { HcmPage } from '@empflowyee/hcm-runtime-contract'
import type {
	HrConfigKind,
	HrOptionDto,
	HrPriority,
	HrQueueView,
	HrServiceLevelPolicyDto,
	HrStatus,
	HrVisibility,
	MembershipCommand,
	PriorityTargets,
	RequestTypeCommand,
	SlaState,
	TargetKind,
	TeamCommand,
} from '@empflowyee/hcm-employee-contract'
import { DUE_SOON_MINUTES } from '@empflowyee/hcm-employee-contract'
import type { TargetFacts } from '@empflowyee/hcm-api-employee-domain'
import type {
	HrAssignmentRow,
	HrAttachmentRow,
	HrConfigItem,
	HrMessageRow,
	HrQueueRow,
	HrRequestPatch,
	HrRequestRow,
	HrServiceRepository,
	HrTargetPatch,
	HrTypeRow,
	NewHrRequest,
} from '@empflowyee/hcm-api-employee-application'

interface Scope {
	executor: Kysely<unknown>
	tenantId: string
	accountId: string
}

const HANDLE_PERMISSION = 'hcm.employee.hr-service.handle'

/** A timestamp column as an ISO string. */
const stamp = (column: string) =>
	sql`to_char(${sql.ref(column)} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
/** A person's display name for an account column, or null. */
const accountName = (column: string) =>
	sql`(SELECT p.display_name FROM hcm.user_account u JOIN hcm.person p ON p.tenant_id=u.tenant_id AND p.id=u.person_id
		WHERE u.tenant_id=r.tenant_id AND u.id=${sql.ref(column)})`

/** Employee-owned HR service persistence in the caller's transaction. */
export class KyselyHrServiceRepository implements HrServiceRepository {
	/** Bind to the authorized tenant transaction. */
	constructor(private readonly scope: Scope) {}

	/** Execute one query and classify integrity failures safely. */
	private async exec<T>(query: RawBuilder<T>): Promise<T[]> {
		try {
			return (await query.execute(this.scope.executor)).rows
		} catch (error) {
			return classifyConstraint(error)
		}
	}

	/** The transaction clock. */
	async now(): Promise<string> {
		const [row] = await this.exec(
			sql<{
				now: string
			}>`SELECT ${sql`to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`} AS now`,
		)
		return row?.now ?? new Date().toISOString()
	}

	/** Request columns with type, requester, team, agent and policy. */
	private requestSelect(): RawBuilder<unknown> {
		return sql`SELECT r.id,r.request_number AS "requestNumber",r.subject,
				jsonb_build_object('id',t.id,'name',t.name) AS type,t.code AS "typeCode",t.classification,
				jsonb_build_object('workerId',r.requester_worker_id,'name',rp.display_name) AS requester,
				r.requester_account_id AS "requesterAccountId",r.priority,r.status,
				jsonb_build_object('id',tm.id,'name',tm.name) AS team,
				CASE WHEN r.assignee_account_id IS NULL THEN NULL ELSE jsonb_build_object('accountId',r.assignee_account_id,'name',${accountName('r.assignee_account_id')}) END AS assignee,
				jsonb_build_object('id',sl.id,'code',sl.code,'versionNumber',sl.version_number,'pauseWhileWaiting',sl.pause_while_waiting,'reopenWindowDays',sl.reopen_window_days) AS policy,
				r.resolution_code AS "resolutionCode",r.resolution_summary AS "resolutionSummary",${stamp('r.resolved_at')} AS "resolvedAt",
				${stamp('r.closed_at')} AS "closedAt",r.cancel_reason AS "cancelReason",${stamp('r.first_responded_at')} AS "firstRespondedAt",
				${stamp('r.created_at')} AS "createdAt",${accountName('r.created_by_account_id')} AS "createdBy",${stamp('r.updated_at')} AS "updatedAt",r.revision
			FROM hcm.hr_service_request r
			JOIN hcm.hr_service_request_type t ON t.tenant_id=r.tenant_id AND t.id=r.type_id
			JOIN hcm.hr_service_team tm ON tm.tenant_id=r.tenant_id AND tm.id=r.team_id
			JOIN hcm.hr_service_level_policy sl ON sl.tenant_id=r.tenant_id AND sl.id=r.service_level_policy_id
			JOIN hcm.worker w ON w.tenant_id=r.tenant_id AND w.id=r.requester_worker_id
			JOIN hcm.person rp ON rp.tenant_id=w.tenant_id AND rp.id=w.person_id`
	}

	/** The queue: requests with next due time and service level state computed as the domain rules do. */
	async queue(
		query: {
			limit: number
			cursor?: string
			q: string
			view: HrQueueView
			status?: HrStatus
			priority?: HrPriority
			typeId?: string
			slaState?: SlaState
		},
		actorAccountId: string,
		now: string,
	): Promise<HcmPage<HrQueueRow>> {
		const t = this.scope.tenantId
		const filters = Object.fromEntries(
			Object.entries(query).filter(
				/** Not part of the binding. */ ([key]) => key !== 'cursor' && key !== 'limit',
			),
		)
		const key = cursorBinding([t, actorAccountId, 'hr-queue', filters])
		const after = decodeCursor(query.cursor, key, 2)
		const clock = sql`${now}::timestamptz`
		const open = sql`FROM hcm.hr_service_level_target g WHERE g.tenant_id=r.tenant_id AND g.request_id=r.id AND g.met_at IS NULL`
		const inner = sql`SELECT x.*,
				(SELECT ${stamp('g.due_at')} ${open} AND g.paused_at IS NULL ORDER BY g.due_at LIMIT 1) AS "nextDueAt",
				CASE
					WHEN x.status='Cancelled' OR NOT EXISTS (SELECT 1 FROM hcm.hr_service_level_target g WHERE g.tenant_id=r.tenant_id AND g.request_id=r.id) THEN 'None'
					WHEN NOT EXISTS (SELECT 1 ${open}) THEN 'Met'
					WHEN EXISTS (SELECT 1 ${open} AND (g.breached_at IS NOT NULL OR coalesce(g.paused_at,${clock}) > g.due_at)) THEN 'Breached'
					WHEN EXISTS (SELECT 1 ${open} AND g.paused_at IS NULL AND g.due_at <= ${clock} + make_interval(mins => ${DUE_SOON_MINUTES})) THEN 'DueSoon'
					WHEN EXISTS (SELECT 1 ${open} AND g.paused_at IS NULL) THEN 'OnTrack'
					ELSE 'Paused' END AS "slaState",
				coalesce((SELECT to_char(g.due_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US') ${open} AND g.paused_at IS NULL ORDER BY g.due_at LIMIT 1),'9999-12-31') AS "sortDue",
				r.team_id AS "teamId",r.assignee_account_id AS "assigneeAccountId",r.type_id AS "typeId"
			FROM (${this.requestSelect()} WHERE r.tenant_id=${t}) x
			JOIN hcm.hr_service_request r ON r.tenant_id=${t} AND r.id=x.id`
		const where: RawBuilder<unknown>[] = [sql`true`]
		if (query.view === 'assigned') where.push(sql`q."assigneeAccountId"=${actorAccountId}`)
		if (query.view === 'teams')
			where.push(
				sql`q."teamId" IN (SELECT m.team_id FROM hcm.hr_service_team_membership m WHERE m.tenant_id=${t} AND m.account_id=${actorAccountId} AND m.is_active)`,
			)
		if (query.status) where.push(sql`q.status=${query.status}`)
		if (query.priority) where.push(sql`q.priority=${query.priority}`)
		if (query.typeId) where.push(sql`q."typeId"=${query.typeId}`)
		if (query.slaState) where.push(sql`q."slaState"=${query.slaState}`)
		if (query.q)
			where.push(
				sql`(lower(q."requestNumber") LIKE ${likePattern(query.q.toLowerCase())} OR lower(q.subject) LIKE ${likePattern(query.q.toLowerCase())})`,
			)
		if (after)
			where.push(sql`(q."sortDue",q.id COLLATE "C") > (${after[0]},${after[1]} COLLATE "C")`)
		const rows = await this.exec(
			sql<Record<string, unknown>>`SELECT q.* FROM (${inner}) q WHERE ${sql.join(where, sql` AND `)}
				ORDER BY q."sortDue",q.id COLLATE "C" LIMIT ${query.limit + 1}`,
		)
		const page = keysetPage(
			rows,
			query.limit,
			key,
			/** Continue after the last request. */ (row) => [
				row['sortDue'] as string,
				row['id'] as string,
			],
		)
		return {
			items: page.items.map(
				/** Drop helper columns. */ (raw) => {
					const { sortDue, teamId, assigneeAccountId, typeId, ...row } = raw
					void sortDue
					void teamId
					void assigneeAccountId
					void typeId
					return row as unknown as HrQueueRow
				},
			),
			nextCursor: page.nextCursor,
		}
	}

	/** One request, optionally locked and restricted to a requester. */
	async request(
		id: string,
		options: { lock?: boolean; requesterWorkerId?: string } = {},
	): Promise<HrRequestRow | undefined> {
		const t = this.scope.tenantId
		if (options.lock)
			await this.exec(
				sql`SELECT 1 FROM hcm.hr_service_request WHERE tenant_id=${t} AND id=${id} FOR UPDATE`,
			)
		const requester = options.requesterWorkerId
			? sql`AND r.requester_worker_id=${options.requesterWorkerId}`
			: sql``
		const [row] = await this.exec(
			sql<HrRequestRow>`${this.requestSelect()} WHERE r.tenant_id=${t} AND r.id=${id} ${requester}`,
		)
		return row
	}

	/** A requester's own requests, newest first. */
	async selfRequests(
		requesterWorkerId: string,
		query: { limit: number; cursor?: string; view: 'open' | 'closed' | 'all' },
	): Promise<HcmPage<HrRequestRow>> {
		const t = this.scope.tenantId
		const key = cursorBinding([t, requesterWorkerId, 'hr-self', query.view])
		const after = decodeCursor(query.cursor, key, 2)
		const where: RawBuilder<unknown>[] = [
			sql`r.tenant_id=${t}`,
			sql`r.requester_worker_id=${requesterWorkerId}`,
		]
		if (query.view === 'open') where.push(sql`r.status NOT IN ('Closed','Cancelled')`)
		if (query.view === 'closed') where.push(sql`r.status IN ('Closed','Cancelled')`)
		if (after)
			where.push(
				sql`(to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US'),r.id COLLATE "C") < (${after[0]},${after[1]} COLLATE "C")`,
			)
		const rows = await this.exec(
			sql<
				Record<string, unknown>
			>`SELECT x.*,to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US') AS "sortKey"
				FROM (${this.requestSelect()} WHERE ${sql.join(where, sql` AND `)}) x
				JOIN hcm.hr_service_request r ON r.tenant_id=${t} AND r.id=x.id
				ORDER BY "sortKey" DESC,x.id COLLATE "C" DESC LIMIT ${query.limit + 1}`,
		)
		const page = keysetPage(
			rows,
			query.limit,
			key,
			/** Continue. */ (row) => [row['sortKey'] as string, row['id'] as string],
		)
		return {
			items: page.items.map(
				/** Drop the cursor key. */ (raw) => {
					const { sortKey, ...row } = raw
					void sortKey
					return row as unknown as HrRequestRow
				},
			),
			nextCursor: page.nextCursor,
		}
	}

	/** A request's messages, oldest first; employee views see only employee-visible ones. */
	async messages(
		requestId: string,
		query: { limit: number; cursor?: string },
		employeeVisibleOnly: boolean,
	): Promise<HcmPage<HrMessageRow>> {
		const t = this.scope.tenantId
		const key = cursorBinding([t, requestId, 'hr-messages', employeeVisibleOnly])
		const after = decodeCursor(query.cursor, key, 1)
		const visible = employeeVisibleOnly ? sql`AND r.visibility='EmployeeVisible'` : sql``
		const rest = after ? sql`AND r.sequence_number > ${Number(after[0])}` : sql``
		const rows = await this.exec(
			sql<HrMessageRow>`SELECT r.id,r.sequence_number AS "sequenceNumber",r.visibility,r.kind,${accountName('r.author_account_id')} AS author,
				r.author_account_id AS "authorAccountId",r.from_requester AS "fromRequester",r.body,${stamp('r.created_at')} AS "createdAt"
				FROM hcm.hr_service_request_message r WHERE r.tenant_id=${t} AND r.request_id=${requestId} ${visible} ${rest}
				ORDER BY r.sequence_number LIMIT ${query.limit + 1}`,
		)
		return keysetPage(rows, query.limit, key, /** Continue. */ (row) => [row.sequenceNumber])
	}

	/** A request's attachments; employee views see only employee-visible ones. */
	attachments(requestId: string, employeeVisibleOnly: boolean): Promise<HrAttachmentRow[]> {
		const visible = employeeVisibleOnly ? sql`AND a.visibility='EmployeeVisible'` : sql``
		return this.exec(
			sql<HrAttachmentRow>`SELECT a.id,a.message_id AS "messageId",a.blob_id::text AS "blobId",b.safe_filename AS "fileName",
				b.media_type AS "mediaType",b.byte_length AS "sizeBytes",a.visibility,
				to_char(a.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
				FROM hcm.hr_service_request_attachment a JOIN hcm.document_blob b ON b.tenant_id=a.tenant_id AND b.id=a.blob_id
				WHERE a.tenant_id=${this.scope.tenantId} AND a.request_id=${requestId} ${visible} ORDER BY a.created_at,a.id`,
		)
	}

	/** A request's service level targets. */
	targets(requestId: string): Promise<TargetFacts[]> {
		return this.exec(
			sql<TargetFacts>`SELECT r.target_kind AS kind,r.target_minutes AS "targetMinutes",${stamp('r.started_at')} AS "startedAt",
				${stamp('r.due_at')} AS "dueAt",${stamp('r.paused_at')} AS "pausedAt",${stamp('r.met_at')} AS "metAt",${stamp('r.breached_at')} AS "breachedAt"
				FROM hcm.hr_service_level_target r WHERE r.tenant_id=${this.scope.tenantId} AND r.request_id=${requestId}
				ORDER BY r.target_kind`,
		)
	}

	/** A request's assignment history, newest first. */
	assignments(requestId: string): Promise<HrAssignmentRow[]> {
		return this.exec(
			sql<HrAssignmentRow>`SELECT tm.name AS team,${accountName('r.assignee_account_id')} AS assignee,${accountName('r.assigned_by_account_id')} AS "assignedBy",
				r.reason,${stamp('r.assigned_at')} AS "assignedAt",${stamp('r.ended_at')} AS "endedAt"
				FROM hcm.hr_service_request_assignee r JOIN hcm.hr_service_team tm ON tm.tenant_id=r.tenant_id AND tm.id=r.team_id
				WHERE r.tenant_id=${this.scope.tenantId} AND r.request_id=${requestId} ORDER BY r.assigned_at DESC,r.id`,
		)
	}

	/** Insert a New request with the tenant's next request number. */
	async insertRequest(request: NewHrRequest): Promise<{ id: string; requestNumber: string }> {
		const { tenantId, accountId } = this.scope
		const [sequence] = await this.exec(
			sql<{
				value: number
			}>`INSERT INTO hcm.hr_service_request_sequence (tenant_id,last_value) VALUES (${tenantId},1)
				ON CONFLICT (tenant_id) DO UPDATE SET last_value=hcm.hr_service_request_sequence.last_value+1 RETURNING last_value::int AS value`,
		)
		const requestNumber = `HR-${String(sequence?.value ?? 1).padStart(6, '0')}`
		const id = randomUUID()
		await this.exec(
			sql`INSERT INTO hcm.hr_service_request (tenant_id,id,request_number,requester_worker_id,requester_account_id,created_by_account_id,
				type_id,service_level_policy_id,priority,subject,team_id) VALUES (${tenantId},${id},${requestNumber},${request.requesterWorkerId},
				${request.requesterAccountId},${accountId},${request.typeId},${request.policyId},${request.priority},${request.subject},${request.teamId})`,
		)
		return { id, requestNumber }
	}

	/** Apply request changes and bump its revision. */
	async updateRequest(id: string, patch: HrRequestPatch): Promise<void> {
		const sets: RawBuilder<unknown>[] = [sql`revision=revision+1`, sql`updated_at=now()`]
		if (patch.status) sets.push(sql`status=${patch.status}`)
		if (patch.priority) sets.push(sql`priority=${patch.priority}`)
		if (patch.resolutionCode !== undefined) sets.push(sql`resolution_code=${patch.resolutionCode}`)
		if (patch.resolutionSummary !== undefined)
			sets.push(sql`resolution_summary=${patch.resolutionSummary}`)
		if (patch.resolved === true) sets.push(sql`resolved_at=now()`)
		if (patch.resolved === null) sets.push(sql`resolved_at=NULL`)
		if (patch.closed) sets.push(sql`closed_at=now()`)
		if (patch.cancelReason)
			sets.push(sql`cancel_reason=${patch.cancelReason}`, sql`cancelled_at=now()`)
		if (patch.firstResponded) sets.push(sql`first_responded_at=coalesce(first_responded_at,now())`)
		await this.exec(
			sql`UPDATE hcm.hr_service_request SET ${sql.join(sets)} WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** Append a message with the next sequence number. */
	async insertMessage(
		requestId: string,
		message: {
			visibility: HrVisibility
			kind: 'Message' | 'StatusUpdate'
			body: string
			fromRequester: boolean
		},
	): Promise<string> {
		const { tenantId, accountId } = this.scope
		const id = randomUUID()
		await this.exec(
			sql`INSERT INTO hcm.hr_service_request_message (tenant_id,id,request_id,sequence_number,visibility,kind,author_account_id,from_requester,body)
				SELECT ${tenantId},${id},${requestId},coalesce(max(sequence_number),0)+1,${message.visibility},${message.kind},${accountId},
				${message.fromRequester},${message.body} FROM hcm.hr_service_request_message WHERE tenant_id=${tenantId} AND request_id=${requestId}`,
		)
		return id
	}

	/** Link a staged service attachment to a message. */
	async insertAttachment(
		requestId: string,
		messageId: string,
		blobId: string,
		visibility: HrVisibility,
	): Promise<string> {
		const id = randomUUID()
		await this.exec(
			sql`INSERT INTO hcm.hr_service_request_attachment (tenant_id,id,request_id,message_id,blob_id,visibility,created_by_account_id)
				VALUES (${this.scope.tenantId},${id},${requestId},${messageId},${blobId}::uuid,${visibility},${this.scope.accountId})`,
		)
		return id
	}

	/** Start the service level targets of a request. */
	async insertTargets(
		requestId: string,
		targets: { kind: TargetKind; minutes: number; startedAt: string }[],
	): Promise<void> {
		for (const target of targets)
			await this.exec(
				sql`INSERT INTO hcm.hr_service_level_target (tenant_id,id,request_id,target_kind,target_minutes,started_at,due_at)
					VALUES (${this.scope.tenantId},${randomUUID()},${requestId},${target.kind},${target.minutes},${target.startedAt}::timestamptz,
					${target.startedAt}::timestamptz + make_interval(mins => ${target.minutes}))`,
			)
	}

	/** Apply target changes. */
	async updateTarget(requestId: string, kind: TargetKind, patch: HrTargetPatch): Promise<void> {
		const sets: RawBuilder<unknown>[] = [sql`revision=revision+1`]
		if (patch.dueAt) sets.push(sql`due_at=${patch.dueAt}::timestamptz`)
		if (patch.pausedAt !== undefined) sets.push(sql`paused_at=${patch.pausedAt}::timestamptz`)
		if (patch.addPausedMinutes)
			sets.push(sql`paused_minutes=paused_minutes+${patch.addPausedMinutes}`)
		if (patch.metAt !== undefined) sets.push(sql`met_at=${patch.metAt}::timestamptz`)
		if (patch.breachedAt) sets.push(sql`breached_at=${patch.breachedAt}::timestamptz`)
		await this.exec(
			sql`UPDATE hcm.hr_service_level_target SET ${sql.join(sets)} WHERE tenant_id=${this.scope.tenantId} AND request_id=${requestId} AND target_kind=${kind}`,
		)
	}

	/** End the current assignment, record the new one and route the request. */
	async assign(
		requestId: string,
		teamId: string,
		assigneeAccountId: string | null,
		reason: string,
	): Promise<void> {
		const { tenantId, accountId } = this.scope
		await this.exec(
			sql`UPDATE hcm.hr_service_request_assignee SET ended_at=now() WHERE tenant_id=${tenantId} AND request_id=${requestId} AND ended_at IS NULL`,
		)
		await this.exec(
			sql`INSERT INTO hcm.hr_service_request_assignee (tenant_id,id,request_id,team_id,assignee_account_id,assigned_by_account_id,reason)
				VALUES (${tenantId},${randomUUID()},${requestId},${teamId},${assigneeAccountId},${accountId},${reason})`,
		)
		await this.exec(
			sql`UPDATE hcm.hr_service_request SET team_id=${teamId},assignee_account_id=${assigneeAccountId},revision=revision+1,updated_at=now()
				WHERE tenant_id=${tenantId} AND id=${requestId}`,
		)
	}

	/** Request type columns. */
	private typeSelect(): RawBuilder<unknown> {
		return sql`SELECT r.id,r.code,r.name,r.description,r.category,r.audience,r.classification,
				jsonb_build_object('id',tm.id,'name',tm.name) AS "defaultTeam",r.default_team_id AS "defaultTeamId",
				r.service_level_code AS "serviceLevelCode",r.default_priority AS "defaultPriority",r.is_active AS "isActive",
				r.sort_order AS "sortOrder",r.revision
			FROM hcm.hr_service_request_type r JOIN hcm.hr_service_team tm ON tm.tenant_id=r.tenant_id AND tm.id=r.default_team_id`
	}

	/** Active request types, optionally of one audience. */
	types(audience?: 'Employee'): Promise<HrTypeRow[]> {
		const filter = audience ? sql`AND r.audience=${audience}` : sql``
		return this.exec(
			sql<HrTypeRow>`${this.typeSelect()} WHERE r.tenant_id=${this.scope.tenantId} AND r.is_active ${filter} ORDER BY r.sort_order,r.name`,
		)
	}

	/** One request type. */
	async type(id: string): Promise<HrTypeRow | undefined> {
		const [row] = await this.exec(
			sql<HrTypeRow>`${this.typeSelect()} WHERE r.tenant_id=${this.scope.tenantId} AND r.id=${id}`,
		)
		return row
	}

	/** Policy columns. */
	private policySelect(): RawBuilder<unknown> {
		return sql`SELECT r.id,r.code,r.version_number AS "versionNumber",r.name,r.status,r.targets,r.pause_while_waiting AS "pauseWhileWaiting",
				r.reopen_window_days AS "reopenWindowDays",${stamp('r.published_at')} AS "publishedAt",r.revision
			FROM hcm.hr_service_level_policy r`
	}

	/** The published version of a policy code. */
	async publishedPolicy(
		code: string,
	): Promise<(HrServiceLevelPolicyDto & { targets: PriorityTargets }) | undefined> {
		const [row] = await this.exec(
			sql<HrServiceLevelPolicyDto>`${this.policySelect()} WHERE r.tenant_id=${this.scope.tenantId} AND r.code=${code} AND r.status='Published'`,
		)
		return row
	}

	/** Enabled accounts holding the handle grant. */
	private agents(): RawBuilder<unknown> {
		return sql`SELECT u.id,p.display_name AS name,u.email AS detail FROM hcm.user_account u
			JOIN hcm.person p ON p.tenant_id=u.tenant_id AND p.id=u.person_id
			WHERE u.tenant_id=${this.scope.tenantId} AND u.enabled AND EXISTS (SELECT 1 FROM hcm.account_role a
				JOIN hcm.role_permission rp ON rp.tenant_id=a.tenant_id AND rp.role_id=a.role_id
				WHERE a.tenant_id=u.tenant_id AND a.account_id=u.id AND rp.permission_code=${HANDLE_PERMISSION})`
	}

	/** Whether an enabled account holds the handle grant. */
	async isAgent(accountId: string): Promise<boolean> {
		return (
			(await this.exec(sql`SELECT 1 FROM (${this.agents()}) x WHERE x.id=${accountId}`)).length > 0
		)
	}

	/** Workers, teams, agents or active types by name. */
	async options(
		kind: 'workers' | 'teams' | 'agents' | 'types',
		query: { q: string; limit: number; cursor?: string },
	): Promise<HcmPage<HrOptionDto>> {
		const t = this.scope.tenantId
		const key = cursorBinding([t, 'hr-options', kind, query.q])
		const after = decodeCursor(query.cursor, key, 2)
		const sources: Record<typeof kind, RawBuilder<unknown>> = {
			workers: sql`SELECT w.id,p.display_name AS name,w.worker_code AS detail FROM hcm.worker w
				JOIN hcm.person p ON p.tenant_id=w.tenant_id AND p.id=w.person_id WHERE w.tenant_id=${t} AND p.is_active`,
			teams: sql`SELECT id,name,code AS detail FROM hcm.hr_service_team WHERE tenant_id=${t} AND is_active`,
			agents: this.agents(),
			types: sql`SELECT id,name,category AS detail FROM hcm.hr_service_request_type WHERE tenant_id=${t} AND is_active`,
		}
		const where: RawBuilder<unknown>[] = [sql`true`]
		if (query.q)
			where.push(
				sql`(lower(x.name) LIKE ${likePattern(query.q.toLowerCase())} OR lower(x.detail) LIKE ${likePattern(query.q.toLowerCase())})`,
			)
		if (after) where.push(sql`(x.name,x.id COLLATE "C") > (${after[0]},${after[1]} COLLATE "C")`)
		const rows = await this.exec(
			sql<HrOptionDto>`SELECT x.id,x.name,x.detail FROM (${sources[kind]}) x WHERE ${sql.join(where, sql` AND `)}
				ORDER BY x.name,x.id COLLATE "C" LIMIT ${query.limit + 1}`,
		)
		return keysetPage(rows, query.limit, key, /** Continue. */ (row) => [row.name, row.id])
	}

	/** A worker's enabled account. */
	async workerAccount(workerId: string): Promise<string | null> {
		const [row] = await this.exec(
			sql<{
				id: string
			}>`SELECT u.id FROM hcm.worker w JOIN hcm.user_account u ON u.tenant_id=w.tenant_id AND u.person_id=w.person_id
				WHERE w.tenant_id=${this.scope.tenantId} AND w.id=${workerId} AND u.enabled LIMIT 1`,
		)
		return row?.id ?? null
	}

	/** The select of one configuration kind. */
	private configSelect(kind: HrConfigKind): RawBuilder<unknown> {
		if (kind === 'teams')
			return sql`SELECT r.id,r.code,r.name,r.description,r.is_active AS "isActive",
				(SELECT count(*)::int FROM hcm.hr_service_team_membership m WHERE m.tenant_id=r.tenant_id AND m.team_id=r.id AND m.is_active) AS "memberCount",
				r.revision FROM hcm.hr_service_team r`
		if (kind === 'memberships')
			return sql`SELECT r.id,jsonb_build_object('id',tm.id,'name',tm.name) AS team,
				jsonb_build_object('accountId',r.account_id,'name',${accountName('r.account_id')}) AS account,r.member_role AS "memberRole",
				r.is_active AS "isActive",r.revision,tm.name || ' ' || ${accountName('r.account_id')} AS name
				FROM hcm.hr_service_team_membership r JOIN hcm.hr_service_team tm ON tm.tenant_id=r.tenant_id AND tm.id=r.team_id`
		if (kind === 'request-types') return this.typeSelect()
		return this.policySelect()
	}

	/** A page of one configuration kind, by name. */
	async configuration(
		kind: HrConfigKind,
		query: { q: string; limit: number; cursor?: string },
	): Promise<HcmPage<unknown>> {
		const t = this.scope.tenantId
		const key = cursorBinding([t, 'hr-config', kind, query.q])
		const after = decodeCursor(query.cursor, key, 2)
		const where: RawBuilder<unknown>[] = [sql`true`]
		if (query.q) where.push(sql`lower(x.name) LIKE ${likePattern(query.q.toLowerCase())}`)
		if (after) where.push(sql`(x.name,x.id COLLATE "C") > (${after[0]},${after[1]} COLLATE "C")`)
		const rows = await this.exec(
			sql<
				Record<string, unknown>
			>`SELECT x.* FROM (${this.configSelect(kind)} WHERE r.tenant_id=${t}) x
				WHERE ${sql.join(where, sql` AND `)} ORDER BY x.name,x.id COLLATE "C" LIMIT ${query.limit + 1}`,
		)
		const page = keysetPage(
			rows,
			query.limit,
			key,
			/** Continue. */ (row) => [row['name'] as string, row['id'] as string],
		)
		return {
			items: page.items.map(/** Item. */ (row) => this.configItem(kind, row)),
			nextCursor: page.nextCursor,
		}
	}

	/** Drop helper columns of a configuration row. */
	private configItem(kind: HrConfigKind, raw: Record<string, unknown>): HrConfigItem {
		if (kind === 'memberships') {
			const { name, ...row } = raw
			void name
			return row as unknown as HrConfigItem
		}
		if (kind === 'request-types') {
			const { defaultTeamId, ...row } = raw
			void defaultTeamId
			return row as unknown as HrConfigItem
		}
		return raw as unknown as HrConfigItem
	}

	/** One configuration item, optionally locked. */
	async configurationItem(
		kind: HrConfigKind,
		id: string,
		lock = false,
	): Promise<(HrConfigItem & { revision: number }) | undefined> {
		const t = this.scope.tenantId
		const tables: Record<HrConfigKind, string> = {
			teams: 'hr_service_team',
			memberships: 'hr_service_team_membership',
			'request-types': 'hr_service_request_type',
			'service-levels': 'hr_service_level_policy',
		}
		if (lock)
			await this.exec(
				sql`SELECT 1 FROM ${sql.table(`hcm.${tables[kind]}`)} WHERE tenant_id=${t} AND id=${id} FOR UPDATE`,
			)
		const [row] = await this.exec(
			sql<
				Record<string, unknown>
			>`${this.configSelect(kind)} WHERE r.tenant_id=${t} AND r.id=${id}`,
		)
		return row ? (this.configItem(kind, row) as HrConfigItem & { revision: number }) : undefined
	}

	/** Create a team. */
	async createTeam(command: TeamCommand): Promise<string> {
		const { tenantId, accountId } = this.scope
		const id = randomUUID()
		await this.exec(
			sql`INSERT INTO hcm.hr_service_team (tenant_id,id,code,name,description,is_active,created_by_account_id,updated_by_account_id)
				VALUES (${tenantId},${id},${command.code ?? ''},${command.name},${command.description},${command.isActive},${accountId},${accountId})`,
		)
		return id
	}

	/** Update a team. */
	async updateTeam(id: string, command: TeamCommand): Promise<void> {
		await this.exec(
			sql`UPDATE hcm.hr_service_team SET name=${command.name},description=${command.description},is_active=${command.isActive},
				revision=revision+1,updated_by_account_id=${this.scope.accountId},updated_at=now() WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** Create a membership. */
	async createMembership(command: MembershipCommand): Promise<string> {
		const { tenantId, accountId } = this.scope
		const id = randomUUID()
		await this.exec(
			sql`INSERT INTO hcm.hr_service_team_membership (tenant_id,id,team_id,account_id,member_role,is_active,created_by_account_id,updated_by_account_id)
				VALUES (${tenantId},${id},${command.teamId ?? ''},${command.accountId ?? ''},${command.memberRole},${command.isActive},${accountId},${accountId})`,
		)
		return id
	}

	/** Update a membership. */
	async updateMembership(id: string, command: MembershipCommand): Promise<void> {
		await this.exec(
			sql`UPDATE hcm.hr_service_team_membership SET member_role=${command.memberRole},is_active=${command.isActive},
				revision=revision+1,updated_by_account_id=${this.scope.accountId},updated_at=now() WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** Create a request type. */
	async createRequestType(command: RequestTypeCommand): Promise<string> {
		const { tenantId, accountId } = this.scope
		const id = randomUUID()
		await this.exec(
			sql`INSERT INTO hcm.hr_service_request_type (tenant_id,id,code,name,description,category,audience,classification,default_team_id,
				service_level_code,default_priority,is_active,sort_order,created_by_account_id,updated_by_account_id)
				VALUES (${tenantId},${id},${command.code ?? ''},${command.name},${command.description},${command.category},${command.audience},
				${command.classification},${command.defaultTeamId},${command.serviceLevelCode},${command.defaultPriority},${command.isActive},
				${command.sortOrder},${accountId},${accountId})`,
		)
		return id
	}

	/** Update a request type; open requests keep their snapshot policy. */
	async updateRequestType(id: string, command: RequestTypeCommand): Promise<void> {
		await this.exec(
			sql`UPDATE hcm.hr_service_request_type SET name=${command.name},description=${command.description},category=${command.category},
				audience=${command.audience},classification=${command.classification},default_team_id=${command.defaultTeamId},
				service_level_code=${command.serviceLevelCode},default_priority=${command.defaultPriority},is_active=${command.isActive},
				sort_order=${command.sortOrder},revision=revision+1,updated_by_account_id=${this.scope.accountId},updated_at=now()
				WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** The next version number of a policy code and whether a draft exists. */
	async policyVersions(code: string): Promise<{ next: number; draft: boolean }> {
		const [row] = await this.exec(
			sql<{
				next: number
				draft: boolean
			}>`SELECT coalesce(max(version_number),0)+1 AS next,bool_or(status='Draft') IS TRUE AS draft
				FROM hcm.hr_service_level_policy WHERE tenant_id=${this.scope.tenantId} AND code=${code}`,
		)
		return row ?? { next: 1, draft: false }
	}

	/** Create a draft policy version. */
	async createPolicy(input: {
		code: string
		versionNumber: number
		name: string
		targets: PriorityTargets
		pauseWhileWaiting: boolean
		reopenWindowDays: number
	}): Promise<string> {
		const { tenantId, accountId } = this.scope
		const id = randomUUID()
		await this.exec(
			sql`INSERT INTO hcm.hr_service_level_policy (tenant_id,id,code,version_number,name,targets,pause_while_waiting,reopen_window_days,
				created_by_account_id,updated_by_account_id) VALUES (${tenantId},${id},${input.code},${input.versionNumber},${input.name},
				${JSON.stringify(input.targets)}::jsonb,${input.pauseWhileWaiting},${input.reopenWindowDays},${accountId},${accountId})`,
		)
		return id
	}

	/** Edit a draft policy version. */
	async updatePolicy(
		id: string,
		patch: {
			name?: string
			targets?: PriorityTargets
			pauseWhileWaiting?: boolean
			reopenWindowDays?: number
		},
	): Promise<void> {
		const sets: RawBuilder<unknown>[] = [
			sql`revision=revision+1`,
			sql`updated_by_account_id=${this.scope.accountId}`,
			sql`updated_at=now()`,
		]
		if (patch.name) sets.push(sql`name=${patch.name}`)
		if (patch.targets) sets.push(sql`targets=${JSON.stringify(patch.targets)}::jsonb`)
		if (patch.pauseWhileWaiting !== undefined)
			sets.push(sql`pause_while_waiting=${patch.pauseWhileWaiting}`)
		if (patch.reopenWindowDays !== undefined)
			sets.push(sql`reopen_window_days=${patch.reopenWindowDays}`)
		await this.exec(
			sql`UPDATE hcm.hr_service_level_policy SET ${sql.join(sets)} WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** Retire the published version of the code and publish the draft. */
	async publishPolicy(id: string, code: string): Promise<void> {
		const { tenantId, accountId } = this.scope
		await this.exec(
			sql`UPDATE hcm.hr_service_level_policy SET status='Retired',revision=revision+1,updated_by_account_id=${accountId},updated_at=now()
				WHERE tenant_id=${tenantId} AND code=${code} AND status='Published'`,
		)
		await this.exec(
			sql`UPDATE hcm.hr_service_level_policy SET status='Published',published_at=now(),revision=revision+1,updated_by_account_id=${accountId},
				updated_at=now() WHERE tenant_id=${tenantId} AND id=${id}`,
		)
	}
}
