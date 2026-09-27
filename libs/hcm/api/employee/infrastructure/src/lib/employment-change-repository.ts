import { randomUUID } from 'node:crypto'
import { sql, type Kysely, type RawBuilder } from 'kysely'
import {
	classifyConstraint,
	cursorBinding,
	decodeCursor,
	keysetPage,
	likePattern,
	prefixPattern,
} from '@empflowyee/hcm-api-database-kysely'
import type { HcmPage } from '@empflowyee/hcm-runtime-contract'
import type { ChangeListQuery, TargetField } from '@empflowyee/hcm-employee-contract'
import type {
	ChangeApprovalRow,
	ChangeRequestInput,
	ChangeRequestRow,
	ChangeStepInput,
	ChangeStepRow,
	ChangeTransition,
	EmploymentChangeRepository,
} from '@empflowyee/hcm-api-employee-application'

interface Scope {
	executor: Kysely<unknown>
	tenantId: string
	accountId: string
}

/** Target columns by stored target key, with their SQL type. */
const TARGET_COLUMNS: [string, string, string][] = [
	['legalEntityId', 'target_legal_entity_id', 'text'],
	['workerTypeId', 'target_worker_type_id', 'text'],
	['employmentType', 'target_employment_type', 'text'],
	['continuousServiceStartDate', 'target_continuous_service_start_date', 'date'],
	['probationEndDate', 'target_probation_end_date', 'date'],
	['noticePeriodDays', 'target_notice_period_days', 'smallint'],
	['unitId', 'target_organisation_id', 'text'],
	['departmentId', 'target_department_id', 'text'],
	['designationId', 'target_designation_id', 'text'],
	['locationId', 'target_location_id', 'text'],
	['positionId', 'target_position_id', 'text'],
	['jobTitle', 'target_job_title', 'text'],
	['workMode', 'target_work_mode', 'text'],
	['fullTimeEquivalent', 'target_full_time_equivalent', 'numeric'],
	['standardHoursPerWeek', 'target_standard_hours_per_week', 'numeric'],
	['costCenterCode', 'target_cost_center_code', 'text'],
	['managerAssignmentId', 'target_manager_assignment_id', 'text'],
]

/** Cleared-field names by stored target key; the manager is cleared by worker in the contract. */
const CLEARED_NAME: Record<string, TargetField | 'managerAssignmentId'> = {
	managerAssignmentId: 'managerAssignmentId',
}

/** A timestamp column as an ISO string. */
const stamp = (column: string) =>
	sql`to_char(${sql.ref(column)} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

/** Employee-owned change requests, approvals and execution steps in the caller's transaction. */
export class KyselyEmploymentChangeRepository implements EmploymentChangeRepository {
	/** Bind to the authorized tenant transaction. */
	constructor(private readonly scope: Scope) {}

	/** Execute one query and classify integrity failures safely. */
	private async run<T>(query: RawBuilder<T>): Promise<T[]> {
		try {
			return (await query.execute(this.scope.executor)).rows
		} catch (error) {
			return classifyConstraint(error)
		}
	}

	/** One stored target column as JSON-ready SQL. */
	private targetColumn(column: string, type: string): RawBuilder<unknown> {
		const ref = sql.ref('r.' + column)
		if (type === 'date') return sql`to_char(${ref},'YYYY-MM-DD')`
		if (type === 'numeric') return sql`${ref}::float8`
		return sql`${ref}`
	}

	/** The request columns with worker and requester names. */
	private select(): RawBuilder<unknown> {
		const targets = sql.join(
			TARGET_COLUMNS.map(
				/** One target column as JSON. */ ([key, column, type]) =>
					sql`${key}::text,${this.targetColumn(column, type)}`,
			),
		)
		return sql`SELECT r.id,r.worker_id AS "workerId",p.display_name AS "workerName",w.worker_code AS "workerNumber",
				r.employment_id AS "employmentId",r.assignment_id AS "assignmentId",r.change_type AS "changeType",
				to_char(r.effective_date,'YYYY-MM-DD') AS "effectiveDate",r.expected_employment_revision AS "expectedEmploymentRevision",
				r.expected_assignment_revision AS "expectedAssignmentRevision",jsonb_build_object(${targets}) AS "rawTargets",
				r.cleared_fields AS cleared,r.reason_code AS "reasonCode",r.reason_detail AS "reasonDetail",r.evidence_reference AS "evidenceReference",
				r.status,r.approval_policy_code AS "approvalPolicyCode",r.approval_policy_version AS "approvalPolicyVersion",
				rp.display_name AS "requestedBy",r.requested_by_account_id AS "requestedByAccountId",
				${stamp('r.requested_at')} AS "requestedAt",${stamp('r.submitted_at')} AS "submittedAt",${stamp('r.approved_at')} AS "approvedAt",
				${stamp('r.completed_at')} AS "completedAt",${stamp('r.cancelled_at')} AS "cancelledAt",r.cancel_reason AS "cancelReason",
				r.failure_code AS "failureCode",r.result_employment_id AS "resultEmploymentId",r.result_assignment_id AS "resultAssignmentId",r.revision,
				to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US') AS "createdKey"
			FROM hcm.workforce_change_request r
			JOIN hcm.worker w ON w.tenant_id=r.tenant_id AND w.id=r.worker_id
			JOIN hcm.person p ON p.tenant_id=w.tenant_id AND p.id=w.person_id
			JOIN hcm.user_account ra ON ra.tenant_id=r.tenant_id AND ra.id=r.requested_by_account_id
			JOIN hcm.person rp ON rp.tenant_id=ra.tenant_id AND rp.id=ra.person_id`
	}

	/** Map a stored row: absent targets are omitted, cleared ones are null. */
	private row(raw: Record<string, unknown>): ChangeRequestRow {
		const { rawTargets, cleared, createdKey, ...rest } = raw
		void createdKey
		const clearedFields = (cleared as string[]) ?? []
		const targets: Record<string, unknown> = {}
		for (const [key, value] of Object.entries(rawTargets as Record<string, unknown>)) {
			if (value !== null) targets[key] = value
			else if (clearedFields.includes(CLEARED_NAME[key] ?? key)) targets[key] = null
		}
		return { ...(rest as unknown as ChangeRequestRow), targets }
	}

	/** A page of requests for a view; `approver` enables the awaiting view. */
	async list(
		query: ChangeListQuery,
		actorAccountId: string,
		approver: boolean,
	): Promise<HcmPage<ChangeRequestRow & { currentSlot: string | null }>> {
		const filters = Object.fromEntries(
			Object.entries(query).filter(
				/** Not part of the binding. */ ([key]) => key !== 'cursor' && key !== 'limit',
			),
		)
		const key = cursorBinding([this.scope.tenantId, actorAccountId, approver, 'changes', filters])
		const after = decodeCursor(query.cursor, key, 2)
		const byDate = query.sort === 'effectiveDate:desc'
		const order = byDate ? sql`x."effectiveDate"` : sql`x."createdKey"`
		const where: RawBuilder<unknown>[] = [sql`true`]
		if (query.view === 'mine') where.push(sql`x."requestedByAccountId"=${actorAccountId}`)
		if (query.view === 'awaiting-my-decision') {
			where.push(
				approver
					? sql`x.status='PendingApproval' AND x."requestedByAccountId"<>${actorAccountId}`
					: sql`false`,
			)
			where.push(
				sql`NOT EXISTS (SELECT 1 FROM hcm.workforce_change_approval a WHERE a.tenant_id=${this.scope.tenantId} AND a.request_id=x.id)`,
			)
		}
		if (query.changeType) where.push(sql`x."changeType"=${query.changeType}`)
		if (query.status) where.push(sql`x.status=${query.status}`)
		if (query.from) where.push(sql`x."effectiveDate">=${query.from}`)
		if (query.to) where.push(sql`x."effectiveDate"<=${query.to}`)
		if (query.q)
			where.push(
				sql`(lower(x."workerName") LIKE ${likePattern(query.q.toLowerCase())} OR lower(x."workerNumber") LIKE ${prefixPattern(query.q.toLowerCase())})`,
			)
		if (after) where.push(sql`(${order},x.id COLLATE "C") < (${after[0]},${after[1]} COLLATE "C")`)
		const rows = await this.run(
			sql<
				Record<string, unknown>
			>`SELECT x.* FROM (${this.select()} WHERE r.tenant_id=${this.scope.tenantId}) x
				WHERE ${sql.join(where, sql` AND `)} ORDER BY ${order} DESC,x.id COLLATE "C" DESC LIMIT ${query.limit + 1}`,
		)
		const page = keysetPage(
			rows,
			query.limit,
			key,
			/** Continue after the last request. */ (row) => [
				(byDate ? row['effectiveDate'] : row['createdKey']) as string,
				row['id'] as string,
			],
		)
		return {
			items: page.items.map(
				/** Row with its open slot. */ (raw) => {
					const row = this.row(raw)
					return { ...row, currentSlot: row.status === 'PendingApproval' ? 'hr-approver' : null }
				},
			),
			nextCursor: page.nextCursor,
		}
	}

	/** One request, optionally locked for a command. */
	async get(id: string, lock = false): Promise<ChangeRequestRow | undefined> {
		if (lock)
			await this.run(
				sql`SELECT 1 FROM hcm.workforce_change_request WHERE tenant_id=${this.scope.tenantId} AND id=${id} FOR UPDATE`,
			)
		const [row] = await this.run(
			sql<
				Record<string, unknown>
			>`${this.select()} WHERE r.tenant_id=${this.scope.tenantId} AND r.id=${id}`,
		)
		return row ? this.row(row) : undefined
	}

	/** Decisions of a request, oldest first. */
	approvals(id: string): Promise<ChangeApprovalRow[]> {
		return this.run(
			sql<ChangeApprovalRow>`SELECT a.approval_slot_code AS "slotCode",a.decision,p.display_name AS "decidedBy",
				a.decided_by_account_id AS "decidedByAccountId",a.reason,${stamp('a.decided_at')} AS "decidedAt"
				FROM hcm.workforce_change_approval a
				JOIN hcm.user_account u ON u.tenant_id=a.tenant_id AND u.id=a.decided_by_account_id
				JOIN hcm.person p ON p.tenant_id=u.tenant_id AND p.id=u.person_id
				WHERE a.tenant_id=${this.scope.tenantId} AND a.request_id=${id} ORDER BY a.decided_at,a.id`,
		)
	}

	/** Execution steps of every attempt, in order. */
	steps(id: string): Promise<ChangeStepRow[]> {
		return this.run(
			sql<ChangeStepRow>`SELECT step_code AS "stepCode",sequence_number AS sequence,attempt_count AS attempt,status,
				${stamp('completed_at')} AS "completedAt",failure_code AS "failureCode"
				FROM hcm.workforce_change_execution_step WHERE tenant_id=${this.scope.tenantId} AND request_id=${id}
				ORDER BY attempt_count,sequence_number`,
		)
	}

	/** The typed target assignments of an input. */
	private targetSets(input: Pick<ChangeRequestInput, 'targets'>): RawBuilder<unknown>[] {
		const targets = input.targets as Record<string, unknown>
		return TARGET_COLUMNS.map(
			/** One target column. */ ([key, column, type]) =>
				sql`${sql.ref(column)}=${targets[key] ?? null}::${sql.raw(type)}`,
		)
	}

	/** Store a new draft. */
	async insert(input: ChangeRequestInput): Promise<string> {
		const id = randomUUID()
		const t = this.scope.tenantId
		await this.run(
			sql`INSERT INTO hcm.workforce_change_request(tenant_id,id,worker_id,employment_id,assignment_id,change_type,effective_date,reason_code,requested_by_account_id,idempotency_key)
				VALUES (${t},${id},${input.workerId},${input.employmentId},${input.assignmentId},${input.changeType},${input.effectiveDate}::date,${input.reasonCode},${this.scope.accountId},${input.idempotencyKey}::uuid)`,
		)
		await this.write(id, input, false)
		return id
	}

	/** Replace a draft's facts. */
	async update(
		id: string,
		input: Omit<
			ChangeRequestInput,
			'workerId' | 'employmentId' | 'assignmentId' | 'changeType' | 'idempotencyKey'
		>,
	): Promise<void> {
		await this.write(id, input, true)
	}

	/** Write the mutable facts of a request. */
	private async write(
		id: string,
		input: Omit<
			ChangeRequestInput,
			'workerId' | 'employmentId' | 'assignmentId' | 'changeType' | 'idempotencyKey'
		>,
		bump: boolean,
	): Promise<void> {
		const cleared = input.cleared.map(
			/** Stored name. */ (field) => (field === 'managerWorkerId' ? 'managerAssignmentId' : field),
		)
		await this.run(
			sql`UPDATE hcm.workforce_change_request SET ${sql.join([
				...this.targetSets(input),
				sql`effective_date=${input.effectiveDate}::date`,
				sql`expected_employment_revision=${input.expectedEmploymentRevision}`,
				sql`expected_assignment_revision=${input.expectedAssignmentRevision}`,
				sql`cleared_fields=${cleared}::text[]`,
				sql`reason_code=${input.reasonCode}`,
				sql`reason_detail=${input.reasonDetail}`,
				sql`evidence_reference=${input.evidenceReference}`,
				bump ? sql`revision=revision+1` : sql`revision=revision`,
				sql`updated_at=now()`,
			])} WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** Move a request to a status and bump its revision. */
	async transition(id: string, change: ChangeTransition): Promise<void> {
		const sets: RawBuilder<unknown>[] = [
			sql`status=${change.status}`,
			sql`revision=revision+1`,
			sql`updated_at=now()`,
		]
		if (change.approvalPolicy)
			sets.push(
				sql`approval_policy_code=${change.approvalPolicy.code}`,
				sql`approval_policy_version=${change.approvalPolicy.version}`,
			)
		if (change.submitted) sets.push(sql`submitted_at=now()`)
		if (change.approved) sets.push(sql`approved_at=coalesce(approved_at,now())`)
		if (change.completed) sets.push(sql`completed_at=now()`)
		if (change.cancelReason)
			sets.push(sql`cancelled_at=now()`, sql`cancel_reason=${change.cancelReason}`)
		if (change.failureCode !== undefined) sets.push(sql`failure_code=${change.failureCode}`)
		if (change.resultEmploymentId) sets.push(sql`result_employment_id=${change.resultEmploymentId}`)
		if (change.resultAssignmentId) sets.push(sql`result_assignment_id=${change.resultAssignmentId}`)
		await this.run(
			sql`UPDATE hcm.workforce_change_request SET ${sql.join(sets)} WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** Record one approval decision; the database refuses the requester. */
	async insertApproval(
		id: string,
		approval: {
			slotCode: string
			decision: 'Approved' | 'Rejected'
			authorityCode: string
			reason: string
		},
	): Promise<void> {
		await this.run(
			sql`INSERT INTO hcm.workforce_change_approval(tenant_id,id,request_id,approval_slot_code,decided_by_account_id,decision,authority_code,reason)
				VALUES (${this.scope.tenantId},${randomUUID()},${id},${approval.slotCode},${this.scope.accountId},${approval.decision},${approval.authorityCode},${approval.reason})`,
		)
		// The independence trigger is deferred; check now so the command fails before it commits.
		await this.run(sql`SET CONSTRAINTS hcm.workforce_change_approval_independent IMMEDIATE`)
	}

	/** Record the steps of one execution attempt and return the attempt number. */
	async insertSteps(id: string, steps: ChangeStepInput[]): Promise<number> {
		const t = this.scope.tenantId
		const [row] = await this.run(
			sql<{
				next: number
			}>`SELECT coalesce(max(attempt_count),0)::int + 1 AS next FROM hcm.workforce_change_execution_step WHERE tenant_id=${t} AND request_id=${id}`,
		)
		const attempt = row?.next ?? 1
		let sequence = 0
		for (const step of steps) {
			sequence++
			await this.run(
				sql`INSERT INTO hcm.workforce_change_execution_step(tenant_id,id,request_id,step_code,sequence_number,status,idempotency_key,input_hash,attempt_count,completed_at,result_entity_type,result_entity_id,failure_code)
					VALUES (${t},${randomUUID()},${id},${step.stepCode},${sequence},${step.status},${`${id}:${attempt}:${sequence}`},${step.inputHash},${attempt},now(),${step.resultEntityType},${step.resultEntityId},${step.failureCode})`,
			)
		}
		return attempt
	}

	/** The worker of a manager assignment and their name. */
	async managerOf(assignmentId: string): Promise<{ workerId: string; name: string } | undefined> {
		const [row] = await this.run(
			sql<{
				workerId: string
				name: string
			}>`SELECT w.id AS "workerId",p.display_name AS name FROM hcm.assignment a
				JOIN hcm.employment e ON e.tenant_id=a.tenant_id AND e.id=a.employment_id
				JOIN hcm.worker w ON w.tenant_id=e.tenant_id AND w.id=e.worker_id
				JOIN hcm.person p ON p.tenant_id=w.tenant_id AND p.id=w.person_id
				WHERE a.tenant_id=${this.scope.tenantId} AND a.id=${assignmentId}`,
		)
		return row
	}

	/** Display names of positions and worker types. */
	async names(refs: { table: string; id: string }[]): Promise<Map<string, string>> {
		const names = new Map<string, string>()
		for (const ref of refs) {
			if (ref.table !== 'position' && ref.table !== 'worker_type') continue
			const [row] = await this.run(
				sql<{
					name: string
				}>`SELECT name FROM ${sql.table('hcm.' + ref.table)} WHERE tenant_id=${this.scope.tenantId} AND id=${ref.id}`,
			)
			if (row) names.set(ref.id, row.name)
		}
		return names
	}

	/** Workers for the request wizard, by name or number; merged-away people are hidden. */
	async workers(
		q: string,
		page: { limit: number; cursor?: string },
	): Promise<HcmPage<{ id: string; code: string; name: string }>> {
		const key = cursorBinding([this.scope.tenantId, 'change-workers', q])
		const after = decodeCursor(page.cursor, key, 2)
		const rows = await this.run(
			sql<{
				id: string
				code: string
				name: string
			}>`SELECT w.id,w.worker_code AS code,p.display_name AS name FROM hcm.worker w
				JOIN hcm.person p ON p.tenant_id=w.tenant_id AND p.id=w.person_id
				WHERE w.tenant_id=${this.scope.tenantId} AND p.merged_into_person_id IS NULL
					AND (${q}='' OR lower(p.display_name) LIKE ${likePattern(q.toLowerCase())} OR lower(w.worker_code) LIKE ${prefixPattern(q.toLowerCase())})
					AND (${after === null} OR (p.display_name COLLATE "C",w.id COLLATE "C") > (${after?.[0] ?? ''} COLLATE "C",${after?.[1] ?? ''} COLLATE "C"))
				ORDER BY p.display_name COLLATE "C",w.id COLLATE "C" LIMIT ${page.limit + 1}`,
		)
		return keysetPage(
			rows,
			page.limit,
			key,
			/** Continue after the last worker. */ (row) => [row.name, row.id],
		)
	}

	/** Positions that are Open with a version effective on a date, by code or name. */
	async positions(
		q: string,
		asOf: string,
		page: { limit: number; cursor?: string },
	): Promise<HcmPage<{ id: string; code: string; name: string }>> {
		const key = cursorBinding([this.scope.tenantId, 'change-positions', q, asOf])
		const after = decodeCursor(page.cursor, key, 2)
		const rows = await this.run(
			sql<{
				id: string
				code: string
				name: string
			}>`SELECT x.id,x.code,x.name FROM hcm.position x
				WHERE x.tenant_id=${this.scope.tenantId} AND x.lifecycle_status='Open'
					AND EXISTS (SELECT 1 FROM hcm.position_version v WHERE v.tenant_id=x.tenant_id AND v.position_id=x.id AND v.status='Published' AND v.effective_period @> ${asOf}::date)
					AND (${q}='' OR lower(x.name) LIKE ${likePattern(q.toLowerCase())} OR lower(x.code) LIKE ${prefixPattern(q.toLowerCase())})
					AND (${after === null} OR (x.code COLLATE "C",x.id COLLATE "C") > (${after?.[0] ?? ''} COLLATE "C",${after?.[1] ?? ''} COLLATE "C"))
				ORDER BY x.code COLLATE "C",x.id COLLATE "C" LIMIT ${page.limit + 1}`,
		)
		return keysetPage(
			rows,
			page.limit,
			key,
			/** Continue after the last position. */ (row) => [row.code, row.id],
		)
	}
}
