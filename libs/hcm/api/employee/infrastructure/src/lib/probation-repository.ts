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
	ProbationAccountRef,
	ProbationAssessmentDto,
	ProbationDecisionDto,
	ProbationOptionDto,
	ProbationView,
	ReviewStatus,
	ReviewType,
} from '@empflowyee/hcm-employee-contract'
import type {
	NewProbationAssessment,
	NewProbationDecision,
	NewProbationReview,
	ProbationCaseRow,
	ProbationEmploymentRow,
	ProbationRepository,
	ProbationReviewPatch,
	ProbationReviewRow,
} from '@empflowyee/hcm-api-employee-application'

interface Scope {
	executor: Kysely<unknown>
	tenantId: string
	accountId: string
}

const REVIEW_PERMISSION = 'hcm.employee.probation.review'
/** Sort key of a case without an open review, after every due date. */
const NO_REVIEW = '9999-12-31'

/** A date column as an ISO date. */
const day = (column: string) => sql`to_char(${sql.ref(column)},'YYYY-MM-DD')`
/** A timestamp column as an ISO string. */
const stamp = (column: string) =>
	sql`to_char(${sql.ref(column)} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
/** An account reference as JSON, or null. */
const account = (column: string) =>
	sql`(SELECT jsonb_build_object('accountId',u.id,'name',p.display_name) FROM hcm.user_account u
		JOIN hcm.person p ON p.tenant_id=u.tenant_id AND p.id=u.person_id
		WHERE u.tenant_id=r.tenant_id AND u.id=${sql.ref(column)})`

/** Employee-owned probation reviews, assessments and decisions in the caller's transaction. */
export class KyselyProbationRepository implements ProbationRepository {
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

	/** Employment, worker and primary assignment context. */
	private employmentSelect(): RawBuilder<unknown> {
		const t = this.scope.tenantId
		return sql`SELECT e.id AS "employmentId",e.worker_id AS "workerId",p.display_name AS "workerName",w.worker_code AS "workerNumber",
				(SELECT d.name FROM hcm.designation d WHERE d.tenant_id=a.tenant_id AND d.id=a.designation_id) AS designation,
				(SELECT o.name FROM hcm.organisation o WHERE o.tenant_id=a.tenant_id AND o.id=a.organisation_id) AS unit,
				${day('e.hire_date')} AS "hireDate",${day('e.probation_end_date')} AS "probationEndDate",
				coalesce(e.probation_status,'NotApplicable') AS "probationStatus",e.employment_status AS "employmentStatus",e.revision,
				a.organisation_id AS "unitId"
			FROM hcm.employment e
			JOIN hcm.worker w ON w.tenant_id=e.tenant_id AND w.id=e.worker_id
			JOIN hcm.person p ON p.tenant_id=w.tenant_id AND p.id=w.person_id
			LEFT JOIN LATERAL (SELECT a.* FROM hcm.assignment a WHERE a.tenant_id=e.tenant_id AND a.employment_id=e.id
				AND a.superseded_by_id IS NULL ORDER BY coalesce(a.is_primary_assignment,false) DESC,a.effective_from DESC NULLS LAST,a.id LIMIT 1) a ON true
			WHERE e.tenant_id=${t}`
	}

	/** Drop helper columns from an employment row. */
	private employmentRow(raw: Record<string, unknown>): ProbationEmploymentRow {
		const { unitId, ...row } = raw
		void unitId
		return row as unknown as ProbationEmploymentRow
	}

	/** Employments in probation with their next open review. */
	async cases(
		query: { limit: number; cursor?: string; q: string; view: ProbationView; unitId?: string },
		today: string,
		dueSoonUntil: string,
	): Promise<HcmPage<ProbationCaseRow>> {
		const filters = Object.fromEntries(
			Object.entries(query).filter(
				/** Not part of the binding. */ ([key]) => key !== 'cursor' && key !== 'limit',
			),
		)
		const key = cursorBinding([this.scope.tenantId, 'probation-cases', filters, today])
		const after = decodeCursor(query.cursor, key, 2)
		const where: RawBuilder<unknown>[] = [sql`x."probationStatus" IN ('InProgress','Extended')`]
		if (query.view === 'overdue') where.push(sql`x."sortDue" < ${today}`)
		if (query.view === 'due-soon') where.push(sql`x."sortDue" <= ${dueSoonUntil}`)
		if (query.unitId) where.push(sql`x."unitId"=${query.unitId}`)
		if (query.q)
			where.push(
				sql`(lower(x."workerName") LIKE ${likePattern(query.q.toLowerCase())} OR lower(x."workerNumber") LIKE ${likePattern(query.q.toLowerCase())})`,
			)
		if (after)
			where.push(
				sql`(x."sortDue",x."employmentId" COLLATE "C") > (${after[0]},${after[1]} COLLATE "C")`,
			)
		const inner = sql`SELECT c.*,
				(SELECT jsonb_build_object('id',r.id,'reviewType',r.review_type,'dueDate',to_char(r.due_date,'YYYY-MM-DD'),'status',r.status)
					FROM hcm.probation_review r WHERE r.tenant_id=${this.scope.tenantId} AND r.employment_id=c."employmentId"
					AND r.status IN ('Scheduled','AssessmentSubmitted') ORDER BY r.due_date,r.id LIMIT 1) AS "nextReview",
				coalesce((SELECT to_char(min(r.due_date),'YYYY-MM-DD') FROM hcm.probation_review r WHERE r.tenant_id=${this.scope.tenantId}
					AND r.employment_id=c."employmentId" AND r.status IN ('Scheduled','AssessmentSubmitted')),${NO_REVIEW}) AS "sortDue"
			FROM (${this.employmentSelect()}) c`
		const rows = await this.exec(
			sql<Record<string, unknown>>`SELECT x.* FROM (${inner}) x WHERE ${sql.join(where, sql` AND `)}
				ORDER BY x."sortDue",x."employmentId" COLLATE "C" LIMIT ${query.limit + 1}`,
		)
		const page = keysetPage(
			rows,
			query.limit,
			key,
			/** Continue after the last case. */ (row) => [
				row['sortDue'] as string,
				row['employmentId'] as string,
			],
		)
		return {
			items: page.items.map(
				/** Case. */ (raw) => {
					const { sortDue, nextReview, ...rest } = raw
					void sortDue
					return {
						...this.employmentRow(rest),
						nextReview: (nextReview as ProbationCaseRow['nextReview']) ?? null,
					}
				},
			),
			nextCursor: page.nextCursor,
		}
	}

	/** Review columns with worker, reviewer and owner. */
	private reviewSelect(): RawBuilder<unknown> {
		return sql`SELECT r.id,r.employment_id AS "employmentId",p.display_name AS "workerName",w.worker_code AS "workerNumber",
				r.sequence_number AS "sequenceNumber",r.review_type AS "reviewType",${day('r.period_start')} AS "periodStart",
				${day('r.period_end')} AS "periodEnd",${day('r.probation_end_date')} AS "probationEndDate",${day('r.due_date')} AS "dueDate",
				r.status,${account('r.primary_reviewer_account_id')} AS reviewer,${account('r.owner_account_id')} AS owner,
				r.schedule_reason AS "scheduleReason",r.cancel_reason AS "cancelReason",r.revision
			FROM hcm.probation_review r
			JOIN hcm.employment e ON e.tenant_id=r.tenant_id AND e.id=r.employment_id
			JOIN hcm.worker w ON w.tenant_id=e.tenant_id AND w.id=e.worker_id
			JOIN hcm.person p ON p.tenant_id=w.tenant_id AND p.id=w.person_id`
	}

	/** Reviews, due first. */
	async reviews(query: {
		limit: number
		cursor?: string
		status?: ReviewStatus
		reviewType?: ReviewType
		reviewerAccountId?: string
	}): Promise<HcmPage<ProbationReviewRow>> {
		const filters = Object.fromEntries(
			Object.entries(query).filter(
				/** Not part of the binding. */ ([key]) => key !== 'cursor' && key !== 'limit',
			),
		)
		const key = cursorBinding([this.scope.tenantId, 'probation-reviews', filters])
		const after = decodeCursor(query.cursor, key, 2)
		const where: RawBuilder<unknown>[] = [sql`r.tenant_id=${this.scope.tenantId}`]
		if (query.status) where.push(sql`r.status=${query.status}`)
		if (query.reviewType) where.push(sql`r.review_type=${query.reviewType}`)
		if (query.reviewerAccountId)
			where.push(sql`r.primary_reviewer_account_id=${query.reviewerAccountId}`)
		if (after)
			where.push(sql`(r.due_date,r.id COLLATE "C") > (${after[0]}::date,${after[1]} COLLATE "C")`)
		const rows = await this.exec(
			sql<ProbationReviewRow>`${this.reviewSelect()} WHERE ${sql.join(where, sql` AND `)}
				ORDER BY r.due_date,r.id COLLATE "C" LIMIT ${query.limit + 1}`,
		)
		return keysetPage(
			rows,
			query.limit,
			key,
			/** Continue after the last review. */ (row) => [row.dueDate, row.id],
		)
	}

	/** One review, optionally locked and restricted to a reviewer. */
	async review(
		id: string,
		options: { lock?: boolean; reviewerAccountId?: string } = {},
	): Promise<ProbationReviewRow | undefined> {
		if (options.lock)
			await this.exec(
				sql`SELECT 1 FROM hcm.probation_review WHERE tenant_id=${this.scope.tenantId} AND id=${id} FOR UPDATE`,
			)
		const reviewer = options.reviewerAccountId
			? sql`AND r.primary_reviewer_account_id=${options.reviewerAccountId}`
			: sql``
		const [row] = await this.exec(
			sql<ProbationReviewRow>`${this.reviewSelect()} WHERE r.tenant_id=${this.scope.tenantId} AND r.id=${id} ${reviewer}`,
		)
		return row
	}

	/** Every review of an employment, in sequence. */
	employmentReviews(employmentId: string): Promise<ProbationReviewRow[]> {
		return this.exec(
			sql<ProbationReviewRow>`${this.reviewSelect()} WHERE r.tenant_id=${this.scope.tenantId} AND r.employment_id=${employmentId}
				ORDER BY r.sequence_number`,
		)
	}

	/** The open Final review of an employment. */
	async openFinalReview(employmentId: string): Promise<ProbationReviewRow | undefined> {
		const [row] = await this.exec(
			sql<ProbationReviewRow>`${this.reviewSelect()} WHERE r.tenant_id=${this.scope.tenantId} AND r.employment_id=${employmentId}
				AND r.review_type='Final' AND r.status IN ('Scheduled','AssessmentSubmitted')`,
		)
		return row
	}

	/** An employment's probation facts and context. */
	async employment(employmentId: string): Promise<ProbationEmploymentRow | undefined> {
		const [row] = await this.exec(
			sql<
				Record<string, unknown>
			>`SELECT c.* FROM (${this.employmentSelect()}) c WHERE c."employmentId"=${employmentId}`,
		)
		return row ? this.employmentRow(row) : undefined
	}

	/** Insert a review with the next sequence number of its employment. */
	async insertReview(review: NewProbationReview): Promise<string> {
		const id = randomUUID()
		const { tenantId, accountId } = this.scope
		await this.exec(
			sql`INSERT INTO hcm.probation_review (tenant_id,id,employment_id,sequence_number,review_type,period_start,period_end,
				probation_end_date,due_date,primary_reviewer_account_id,owner_account_id,schedule_reason,created_by_account_id)
				SELECT ${tenantId},${id},${review.employmentId},coalesce(max(sequence_number),0)+1,${review.reviewType},
				${review.periodStart}::date,${review.periodEnd}::date,${review.probationEndDate}::date,${review.dueDate}::date,
				${review.reviewerAccountId},${accountId},${review.reason},${accountId}
				FROM hcm.probation_review WHERE tenant_id=${tenantId} AND employment_id=${review.employmentId}`,
		)
		return id
	}

	/** Apply review changes and bump its revision. */
	async updateReview(id: string, patch: ProbationReviewPatch): Promise<void> {
		const sets: RawBuilder<unknown>[] = [sql`revision=revision+1`, sql`updated_at=now()`]
		if (patch.status) sets.push(sql`status=${patch.status}`)
		if (patch.reviewerAccountId !== undefined)
			sets.push(sql`primary_reviewer_account_id=${patch.reviewerAccountId}`)
		if (patch.cancelReason)
			sets.push(sql`cancel_reason=${patch.cancelReason}`, sql`cancelled_at=now()`)
		if (patch.decided) sets.push(sql`decided_at=now()`)
		if (patch.periodEnd) sets.push(sql`period_end=${patch.periodEnd}::date`)
		if (patch.probationEndDate) sets.push(sql`probation_end_date=${patch.probationEndDate}::date`)
		if (patch.dueDate) sets.push(sql`due_date=${patch.dueDate}::date`)
		await this.exec(
			sql`UPDATE hcm.probation_review SET ${sql.join(sets)} WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** Assessments of a review, newest first. */
	assessments(reviewId: string): Promise<ProbationAssessmentDto[]> {
		return this.exec(
			sql<ProbationAssessmentDto>`SELECT r.id,r.version_number AS "versionNumber",${account('r.reviewer_account_id')} AS reviewer,
				r.recommendation,r.overall_rating AS "overallRating",r.strengths,r.concerns,r.recommendation_reason AS "recommendationReason",
				(r.superseded_by_assessment_id IS NULL) AS current,${stamp('r.submitted_at')} AS "submittedAt"
				FROM hcm.probation_assessment r WHERE r.tenant_id=${this.scope.tenantId} AND r.review_id=${reviewId}
				ORDER BY r.version_number DESC`,
		)
	}

	/** Add the actor's assessment and supersede the current one. */
	async insertAssessment(a: NewProbationAssessment): Promise<string> {
		const id = randomUUID()
		const { tenantId, accountId } = this.scope
		const [current] = await this.exec(
			sql<{
				id: string
				version: number
			}>`SELECT id,version_number AS version FROM hcm.probation_assessment
				WHERE tenant_id=${tenantId} AND review_id=${a.reviewId} AND superseded_by_assessment_id IS NULL FOR UPDATE`,
		)
		// The superseded version must leave the one-current index before the new version joins it.
		if (current)
			await this.exec(
				sql`UPDATE hcm.probation_assessment SET superseded_by_assessment_id=id WHERE tenant_id=${tenantId} AND id=${current.id}`,
			)
		await this.exec(
			sql`INSERT INTO hcm.probation_assessment (tenant_id,id,review_id,version_number,reviewer_account_id,recommendation,
				overall_rating,strengths,concerns,recommendation_reason) VALUES (${tenantId},${id},${a.reviewId},${(current?.version ?? 0) + 1},
				${accountId},${a.recommendation},${a.overallRating},${a.strengths},${a.concerns},${a.recommendationReason})`,
		)
		if (current)
			await this.exec(
				sql`UPDATE hcm.probation_assessment SET superseded_by_assessment_id=${id} WHERE tenant_id=${tenantId} AND id=${current.id}`,
			)
		return id
	}

	/** Decisions of an employment, oldest first. */
	decisions(employmentId: string): Promise<ProbationDecisionDto[]> {
		return this.exec(
			sql<ProbationDecisionDto>`SELECT r.id,r.review_id AS "reviewId",r.outcome,${day('r.effective_date')} AS "effectiveDate",
				${day('r.previous_probation_end_date')} AS "previousProbationEndDate",${day('r.extended_probation_end_date')} AS "extendedProbationEndDate",
				r.reason,r.evidence_reference AS "evidenceReference",
				(SELECT p.display_name FROM hcm.user_account u JOIN hcm.person p ON p.tenant_id=u.tenant_id AND p.id=u.person_id
					WHERE u.tenant_id=r.tenant_id AND u.id=r.decided_by_account_id) AS "decidedBy",${stamp('r.decided_at')} AS "decidedAt"
				FROM hcm.probation_decision r WHERE r.tenant_id=${this.scope.tenantId} AND r.employment_id=${employmentId}
				ORDER BY r.decided_at,r.id`,
		)
	}

	/** Record an HR decision. */
	async insertDecision(d: NewProbationDecision): Promise<string> {
		const id = randomUUID()
		const { tenantId, accountId } = this.scope
		await this.exec(
			sql`INSERT INTO hcm.probation_decision (tenant_id,id,review_id,employment_id,outcome,effective_date,previous_probation_end_date,
				extended_probation_end_date,assessment_id,reason,evidence_reference,decided_by_account_id)
				VALUES (${tenantId},${id},${d.reviewId},${d.employmentId},${d.outcome},${d.effectiveDate}::date,${d.previousProbationEndDate}::date,
				${d.extendedProbationEndDate}::date,${d.assessmentId},${d.reason},${d.evidenceReference},${accountId})`,
		)
		return id
	}

	/** Accounts that are enabled and hold the reviewer grant, under the same rules as authorization. */
	private reviewers(): RawBuilder<unknown> {
		return sql`SELECT u.id,p.display_name AS name,u.email AS detail FROM hcm.user_account u
			JOIN hcm.person p ON p.tenant_id=u.tenant_id AND p.id=u.person_id
			WHERE u.tenant_id=${this.scope.tenantId} AND u.enabled AND EXISTS (SELECT 1 FROM hcm.account_role a
				JOIN hcm.role_permission rp ON rp.tenant_id=a.tenant_id AND rp.role_id=a.role_id
				WHERE a.tenant_id=u.tenant_id AND a.account_id=u.id AND rp.permission_code=${REVIEW_PERMISSION})`
	}

	/** Whether an enabled account holds the reviewer grant. */
	async canReview(accountId: string): Promise<boolean> {
		const rows = await this.exec(sql`SELECT 1 FROM (${this.reviewers()}) x WHERE x.id=${accountId}`)
		return rows.length > 0
	}

	/** The current primary manager's account, when it can review. */
	async managerReviewer(employmentId: string, today: string): Promise<ProbationAccountRef | null> {
		const t = this.scope.tenantId
		const [row] = await this.exec(
			sql<ProbationAccountRef>`SELECT x.id AS "accountId",x.name FROM hcm.assignment a
				JOIN hcm.reporting_line l ON l.tenant_id=a.tenant_id AND l.assignment_id=a.id AND l.is_primary AND l.effective_period @> ${today}::date
				JOIN hcm.assignment ma ON ma.tenant_id=l.tenant_id AND ma.id=l.manager_assignment_id
				JOIN hcm.employment me ON me.tenant_id=ma.tenant_id AND me.id=ma.employment_id
				JOIN hcm.worker mw ON mw.tenant_id=me.tenant_id AND mw.id=me.worker_id
				JOIN hcm.user_account mu ON mu.tenant_id=mw.tenant_id AND mu.person_id=mw.person_id
				JOIN (${this.reviewers()}) x ON x.id=mu.id
				WHERE a.tenant_id=${t} AND a.employment_id=${employmentId} AND a.superseded_by_id IS NULL
				ORDER BY coalesce(a.is_primary_assignment,false) DESC LIMIT 1`,
		)
		return row ?? null
	}

	/** Reviewer accounts or employments in probation, by name. */
	async options(
		kind: 'employments' | 'reviewers',
		query: { q: string; limit: number; cursor?: string },
	): Promise<HcmPage<ProbationOptionDto>> {
		const key = cursorBinding([this.scope.tenantId, 'probation-options', kind, query.q])
		const after = decodeCursor(query.cursor, key, 2)
		const source =
			kind === 'reviewers'
				? this.reviewers()
				: sql`SELECT c."employmentId" AS id,c."workerName" AS name,c."workerNumber" AS detail
					FROM (${this.employmentSelect()}) c WHERE c."probationStatus" IN ('InProgress','Extended')`
		const where: RawBuilder<unknown>[] = [sql`true`]
		if (query.q)
			where.push(
				sql`(lower(x.name) LIKE ${likePattern(query.q.toLowerCase())} OR lower(x.detail) LIKE ${likePattern(query.q.toLowerCase())})`,
			)
		if (after) where.push(sql`(x.name,x.id COLLATE "C") > (${after[0]},${after[1]} COLLATE "C")`)
		const rows = await this.exec(
			sql<ProbationOptionDto>`SELECT x.id,x.name,x.detail FROM (${source}) x WHERE ${sql.join(where, sql` AND `)}
				ORDER BY x.name,x.id COLLATE "C" LIMIT ${query.limit + 1}`,
		)
		return keysetPage(
			rows,
			query.limit,
			key,
			/** Continue after the last option. */ (row) => [row.name, row.id],
		)
	}
}
