import { randomUUID } from 'node:crypto'
import { sql, type RawBuilder } from 'kysely'
import {
	classifyConstraint,
	cursorBinding,
	decodeCursor,
	keysetPage,
	likePattern,
} from '@empflowyee/hcm-api-database-kysely'
import { HcmDomainError, invalidField, type HcmPage } from '@empflowyee/hcm-runtime-contract'
import type { SealedValue } from '@empflowyee/hcm-api-runtime-application'
import {
	OPEN_REQUEST_STATUSES,
	type ChangeItemDto,
	type PositionChangeRequestSummaryDto,
	type PositionLifecycle,
	type PositionOptionDto,
	type PositionProposal,
	type PositionQuery,
	type PositionRequirementQuery,
	type PositionRequirementSummaryDto,
	type RequirementDto,
	type PositionRelationshipDto,
	type PositionRequestStatus,
	type PositionRequestType,
	type VarianceDraft,
} from '@empflowyee/hcm-job-architecture-contract'
import type {
	ApprovalRow,
	ChangeItemInput,
	PositionLock,
	PositionRepository,
	PositionRow,
	PositionVersionRow,
	PreviewRow,
	RequestQuery,
	RequestRow,
} from '@empflowyee/hcm-api-job-architecture-application'
import type { JobArchitectureScope } from './catalogue-reader'

/** An ISO date column. */
const date = (column: string) => sql`to_char(${sql.ref(column)},'YYYY-MM-DD')`
/** An ISO UTC instant column. */
const instant = (column: string) =>
	sql`to_char(${sql.ref(column)} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')`
/** The most relationships returned for one position. */
const MAX_RELATIONSHIPS = 200
/** The deepest solid-line chain followed. */
const MAX_DEPTH = 50
const OPEN = sql.join(OPEN_REQUEST_STATUSES.map(/** Literal. */ (status) => sql.lit(status)))

/** Version columns with own-domain labels; structure ids are labelled by the application. */
const VERSION_COLUMNS = sql`v.id,v.position_id AS "positionId",v.version_number AS "versionNumber",v.status,
	v.job_profile_version_id AS "profileVersionId",pv.version_number AS "profileVersionNumber",
	jsonb_build_object('id',jp.id,'code',jp.code,'name',jp.name) AS profile,
	jsonb_build_object('id',g.id,'code',g.code,'name',g.name) AS grade,v.job_grade_id AS "gradeId",
	v.designation_id AS "designationId",v.legal_entity_id AS "legalEntityId",v.organisation_id AS "unitId",
	v.department_id AS "departmentId",v.location_id AS "locationId",v.position_type AS "positionType",
	v.headcount_capacity AS "headcountCapacity",v.fte_capacity::float8 AS "fteCapacity",v.is_key_position AS "keyPosition",
	v.cost_center_code AS "costCenterCode",${date('v.effective_from')} AS "effectiveFrom",${date('v.effective_to')} AS "effectiveTo",
	v.change_summary AS "changeSummary",${instant('v.published_at')} AS "publishedAt",
	v.id IS NOT DISTINCT FROM vp.current_published_version_id AS current,v.revision`

/** Request columns, with sealed reasons split into ciphertext and key version. */
const REQUEST_COLUMNS = sql`r.id,r.position_id AS "positionId",p.code AS "positionCode",p.name AS "positionName",
	r.request_type AS "requestType",r.status,r.base_position_version_id AS "baseVersionId",
	r.proposed_position_version_id AS "proposedVersionId",r.proposed_name AS "proposedName",
	r.proposed_reports_to_position_id AS "reportsToPositionId",
	r.encrypted_reason AS "reasonCipher",r.reason_key_version AS "reasonKey",
	r.encrypted_withdrawal_reason AS "withdrawalCipher",r.withdrawal_reason_key_version AS "withdrawalKey",
	r.requested_by_account_id AS "requestedById",coalesce(pe.display_name,ua.email) AS "requestedBy",
	${instant('r.requested_at')} AS "requestedAt",${instant('r.submitted_at')} AS "submittedAt",
	${instant('r.applied_at')} AS "appliedAt",r.revision`

interface RawRequest extends Omit<RequestRow, 'reason' | 'withdrawalReason'> {
	reasonCipher: Buffer
	reasonKey: number
	withdrawalCipher: Buffer | null
	withdrawalKey: number | null
}

type RawDecision = Omit<NonNullable<ApprovalRow['decision']>, 'comment'> & {
	cipher: string | null
	keyVersion: number | null
}
type RawApproval = Omit<ApprovalRow, 'decision'> & { decision: RawDecision | null }

/** A sealed value from its two columns. */
function sealed(ciphertext: Buffer | null, keyVersion: number | null): SealedValue | null {
	return ciphertext && keyVersion ? { ciphertext, keyVersion } : null
}

/** Positions persistence in the caller's authorized transaction. */
export class KyselyPositionRepository implements PositionRepository {
	/** Bind to the authorized transaction. */
	constructor(private readonly scope: JobArchitectureScope) {}

	/** Execute one query and classify integrity failures safely. */
	private async run<T>(query: RawBuilder<T>): Promise<T[]> {
		try {
			return (await query.execute(this.scope.executor)).rows
		} catch (error) {
			return classifyConstraint(error)
		}
	}

	/** Versions matching a condition, with their labels. */
	private versionRows(where: RawBuilder<unknown>, tail: RawBuilder<unknown> = sql``) {
		const t = this.scope.tenantId
		return sql<PositionVersionRow>`SELECT ${VERSION_COLUMNS} FROM hcm.position_version v
			JOIN hcm.position vp ON vp.tenant_id=v.tenant_id AND vp.id=v.position_id
			JOIN hcm.job_profile_version pv ON pv.tenant_id=v.tenant_id AND pv.id=v.job_profile_version_id
			JOIN hcm.job_profile jp ON jp.tenant_id=pv.tenant_id AND jp.id=pv.job_profile_id
			JOIN hcm.job_grade g ON g.tenant_id=v.tenant_id AND g.id=v.job_grade_id
			WHERE v.tenant_id=${t} AND ${where} ${tail}`
	}

	/** Positions with the version shown on a date and any request in flight. */
	private positionRows(asOf: string) {
		const t = this.scope.tenantId
		return sql`SELECT p.id,p.code,p.name,p.lifecycle_status AS "lifecycleStatus",p.revision,
			(SELECT to_jsonb(x) FROM (${this.versionRows(
				sql`v.position_id=p.id AND v.status IN ('Published','Superseded')`,
				sql`ORDER BY (v.effective_period @> ${asOf}::date) DESC,(v.id=p.current_published_version_id) DESC,v.version_number DESC LIMIT 1`,
			)}) x) AS version,
			(SELECT jsonb_build_object('id',r.id,'requestType',r.request_type,'status',r.status) FROM hcm.position_change_request r
				WHERE r.tenant_id=p.tenant_id AND r.position_id=p.id AND r.status IN (${OPEN}) LIMIT 1) AS "openRequest"
			FROM hcm.position p WHERE p.tenant_id=${t}`
	}

	/** Positions by code or name then id. */
	async positions(
		query: Omit<PositionQuery, 'hasVacancy'>,
		asOf: string,
	): Promise<HcmPage<PositionRow>> {
		// Bound to the filters, not the page size: a vacancy scan varies the size between pages.
		const filterSet = Object.fromEntries(
			Object.entries(query).filter(
				/** Not paging. */ ([name]) => name !== 'cursor' && name !== 'limit',
			),
		)
		const key = cursorBinding([this.scope.tenantId, asOf, filterSet])
		const after = decodeCursor(query.cursor, key, 2)
		const order = query.sort === 'name:asc' ? sql.ref('s.name') : sql.ref('s.code')
		const filters: RawBuilder<unknown>[] = [sql`true`]
		if (query.q) {
			const pattern = likePattern(query.q)
			filters.push(sql`(s.code ILIKE ${pattern} OR s.name ILIKE ${pattern})`)
		}
		if (query.status) filters.push(sql`s."lifecycleStatus"=${query.status}`)
		if (query.unitId) filters.push(sql`s.version->>'unitId'=${query.unitId}`)
		if (query.departmentId) filters.push(sql`s.version->>'departmentId'=${query.departmentId}`)
		if (query.locationId) filters.push(sql`s.version->>'locationId'=${query.locationId}`)
		if (query.profileId) filters.push(sql`s.version->'profile'->>'id'=${query.profileId}`)
		if (after)
			filters.push(
				sql`(${order} COLLATE "C",s.id COLLATE "C") > (${after[0]} COLLATE "C",${after[1]} COLLATE "C")`,
			)
		const rows = await this.run(
			sql<PositionRow>`SELECT * FROM (${this.positionRows(asOf)}) s WHERE ${sql.join(filters, sql` AND `)}
				ORDER BY ${order} COLLATE "C",s.id COLLATE "C" LIMIT ${query.limit + 1}`,
		)
		return keysetPage(
			rows,
			query.limit,
			key,
			/** Continue after the last position. */ (row) => [
				query.sort === 'name:asc' ? row.name : row.code,
				row.id,
			],
		)
	}

	/** One position. */
	async position(id: string, asOf: string): Promise<PositionRow | undefined> {
		return (
			await this.run(
				sql<PositionRow>`SELECT * FROM (${this.positionRows(asOf)}) s WHERE s.id=${id}`,
			)
		)[0]
	}

	/** Published and superseded versions, newest first. */
	async versions(
		positionId: string,
		page: { limit: number; cursor?: string },
	): Promise<HcmPage<PositionVersionRow>> {
		const key = cursorBinding([this.scope.tenantId, positionId, 'versions', page.limit])
		const after = decodeCursor(page.cursor, key, 1)
		const rows = await this.run(
			this.versionRows(
				sql`v.position_id=${positionId} AND v.status IN ('Published','Superseded') ${after ? sql`AND v.version_number < ${Number(after[0])}` : sql``}`,
				sql`ORDER BY v.version_number DESC LIMIT ${page.limit + 1}`,
			),
		)
		return keysetPage(
			rows,
			page.limit,
			key,
			/** Continue after the last version. */ (row) => [String(row.versionNumber)],
		)
	}

	/** One version of any status. */
	async version(id: string): Promise<PositionVersionRow | undefined> {
		return (await this.run(this.versionRows(sql`v.id=${id}`)))[0]
	}

	/** Relationships of a position on a date. */
	relationships(positionId: string, asOf: string): Promise<PositionRelationshipDto[]> {
		return this.run(
			sql<PositionRelationshipDto>`SELECT r.id,CASE WHEN r.source_position_id=${positionId} THEN 'Outgoing' ELSE 'Incoming' END AS direction,
				r.relationship_type AS type,jsonb_build_object('id',o.id,'code',o.code,'name',o.name) AS position,
				${date('r.effective_from')} AS "effectiveFrom",${date('r.effective_to')} AS "effectiveTo"
				FROM hcm.position_relationship r JOIN hcm.position o ON o.tenant_id=r.tenant_id
					AND o.id=CASE WHEN r.source_position_id=${positionId} THEN r.target_position_id ELSE r.source_position_id END
				WHERE r.tenant_id=${this.scope.tenantId} AND (r.source_position_id=${positionId} OR r.target_position_id=${positionId})
					AND r.effective_period @> ${asOf}::date
				ORDER BY direction DESC,o.code LIMIT ${MAX_RELATIONSHIPS}`,
		)
	}

	/** The solid-line chain above a position, nearest first. */
	async ancestors(positionId: string, asOf: string): Promise<string[]> {
		const t = this.scope.tenantId
		const rows = await this.run(
			sql<{ id: string }>`WITH RECURSIVE up(id,depth) AS (
				SELECT r.target_position_id,1 FROM hcm.position_relationship r
					WHERE r.tenant_id=${t} AND r.source_position_id=${positionId} AND r.relationship_type='SolidLine' AND r.effective_period @> ${asOf}::date
				UNION ALL
				SELECT r.target_position_id,up.depth+1 FROM up JOIN hcm.position_relationship r ON r.tenant_id=${t} AND r.source_position_id=up.id
					AND r.relationship_type='SolidLine' AND r.effective_period @> ${asOf}::date WHERE up.depth < ${MAX_DEPTH}
			) CYCLE id SET looped USING path SELECT id FROM up WHERE NOT looped ORDER BY depth`,
		)
		return rows.map(/** Id. */ (row) => row.id)
	}

	/** Solid-line children and other relationships referencing a position. */
	async references(
		positionId: string,
		asOf: string,
	): Promise<{ children: number; others: number }> {
		const [row] = await this.run(
			sql<{ children: number; others: number }>`SELECT
				count(*) FILTER (WHERE target_position_id=${positionId} AND relationship_type='SolidLine')::int AS children,
				count(*) FILTER (WHERE relationship_type<>'SolidLine')::int AS others
				FROM hcm.position_relationship WHERE tenant_id=${this.scope.tenantId}
					AND (source_position_id=${positionId} OR target_position_id=${positionId}) AND effective_period @> ${asOf}::date`,
		)
		return row ?? { children: 0, others: 0 }
	}

	/** Requests newest first. */
	async requests(query: RequestQuery): Promise<HcmPage<PositionChangeRequestSummaryDto>> {
		const t = this.scope.tenantId
		const filterSet = Object.fromEntries(
			Object.entries(query).filter(/** Not paging. */ ([name]) => name !== 'cursor'),
		)
		const key = cursorBinding([t, this.scope.accountId, 'requests', filterSet])
		const after = decodeCursor(query.cursor, key, 2)
		const filters: RawBuilder<unknown>[] = [sql`r.tenant_id=${t}`]
		if (query.status) filters.push(sql`r.status=${query.status}`)
		if (query.positionId) filters.push(sql`r.position_id=${query.positionId}`)
		if (query.requestedBy) filters.push(sql`r.requested_by_account_id=${query.requestedBy}`)
		const awaiting = query.awaitingDecisionBy
		if (awaiting) {
			filters.push(
				sql`r.status='PendingApproval' AND r.requested_by_account_id<>${awaiting.accountId}`,
			)
			if (!awaiting.waive)
				filters.push(sql`NOT EXISTS (SELECT 1 FROM hcm.position_approval_case c WHERE c.tenant_id=r.tenant_id
					AND c.position_change_request_id=r.id AND c.status='Pending' AND c.requires_waive_authority)`)
		}
		if (after) filters.push(sql`(r.requested_at,r.id) < (${after[0]}::timestamptz,${after[1]})`)
		const rows = await this.run(
			sql<
				PositionChangeRequestSummaryDto & { at: string }
			>`SELECT r.id,r.position_id AS "positionId",p.code AS "positionCode",coalesce(r.proposed_name,p.name) AS "positionName",
				r.request_type AS "requestType",r.status,coalesce(pe.display_name,ua.email) AS "requestedBy",
				r.requested_by_account_id=${this.scope.accountId} AS "requestedByMe",${instant('r.requested_at')} AS "requestedAt",
				r.requested_at::text AS at,r.revision
				FROM hcm.position_change_request r JOIN hcm.position p ON p.tenant_id=r.tenant_id AND p.id=r.position_id
				JOIN hcm.user_account ua ON ua.tenant_id=r.tenant_id AND ua.id=r.requested_by_account_id
				LEFT JOIN hcm.person pe ON pe.tenant_id=ua.tenant_id AND pe.id=ua.person_id
				WHERE ${sql.join(filters, sql` AND `)} ORDER BY r.requested_at DESC,r.id DESC LIMIT ${query.limit + 1}`,
		)
		const page = keysetPage(
			rows,
			query.limit,
			key,
			/** Continue after the last request. */ (row) => [row.at, row.id],
		)
		return {
			items: page.items.map(/** Drop the cursor column. */ ({ at: _at, ...row }) => row),
			nextCursor: page.nextCursor,
		}
	}

	/** Requests matching a condition. */
	private async requestRows(where: RawBuilder<unknown>, lock: boolean): Promise<RequestRow[]> {
		const rows = await this.run(
			sql<RawRequest>`SELECT ${REQUEST_COLUMNS} FROM hcm.position_change_request r
				JOIN hcm.position p ON p.tenant_id=r.tenant_id AND p.id=r.position_id
				JOIN hcm.user_account ua ON ua.tenant_id=r.tenant_id AND ua.id=r.requested_by_account_id
				LEFT JOIN hcm.person pe ON pe.tenant_id=ua.tenant_id AND pe.id=ua.person_id
				WHERE r.tenant_id=${this.scope.tenantId} AND ${where} ${lock ? sql`FOR UPDATE OF r` : sql``}`,
		)
		return rows.map(
			/** Seal reasons. */ ({
				reasonCipher,
				reasonKey,
				withdrawalCipher,
				withdrawalKey,
				...row
			}) => ({
				...row,
				reason: { ciphertext: reasonCipher, keyVersion: reasonKey },
				withdrawalReason: sealed(withdrawalCipher, withdrawalKey),
			}),
		)
	}

	/** One request. */
	async request(id: string): Promise<RequestRow | undefined> {
		return (await this.requestRows(sql`r.id=${id}`, false))[0]
	}

	/** Lock one request. */
	async lockRequest(id: string): Promise<RequestRow | undefined> {
		return (await this.requestRows(sql`r.id=${id}`, true))[0]
	}

	/** Stored change items in proposal order. */
	items(requestId: string): Promise<ChangeItemDto[]> {
		return this.run(
			sql<ChangeItemDto>`SELECT field_code AS field,change_type AS "changeType",safe_summary AS summary FROM hcm.position_change_item
				WHERE tenant_id=${this.scope.tenantId} AND position_change_request_id=${requestId} ORDER BY id`,
		)
	}

	/** The newest preview. */
	async preview(requestId: string): Promise<PreviewRow | undefined> {
		return (
			await this.run(
				sql<PreviewRow>`SELECT id,status,active_assignment_count AS "activeAssignmentCount",assigned_full_time_equivalent::float8 AS "assignedFte",
					occupancy_complete AS "occupancyComplete",child_position_count AS "childPositionCount",
					downstream_reference_count AS "downstreamReferenceCount",source_version_digest AS "sourceDigest",
					${instant('calculated_at')} AS "calculatedAt",to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "expiresAt"
					FROM hcm.position_impact_preview WHERE tenant_id=${this.scope.tenantId} AND position_change_request_id=${requestId}
					ORDER BY preview_revision DESC,calculated_at DESC LIMIT 1`,
			)
		)[0]
	}

	/** The newest approval case with its decision. */
	async approval(requestId: string): Promise<ApprovalRow | undefined> {
		const [row] = await this.run(
			sql<RawApproval>`SELECT c.id,c.status,c.requires_waive_authority AS "requiresWaiveAuthority",c.preview_id AS "previewId",
				c.subject_version AS "subjectVersion",
				(SELECT jsonb_build_object('id',d.id,'decision',d.decision,'decidedBy',coalesce(pe.display_name,ua.email),
					'decidedAt',${instant('d.decided_at')},'cipher',encode(d.encrypted_comment,'base64'),'keyVersion',d.comment_key_version)
					FROM hcm.position_decision d JOIN hcm.user_account ua ON ua.tenant_id=d.tenant_id AND ua.id=d.decided_by_account_id
					LEFT JOIN hcm.person pe ON pe.tenant_id=ua.tenant_id AND pe.id=ua.person_id
					WHERE d.tenant_id=c.tenant_id AND d.position_approval_case_id=c.id) AS decision
				FROM hcm.position_approval_case c WHERE c.tenant_id=${this.scope.tenantId} AND c.position_change_request_id=${requestId}
				ORDER BY c.created_at DESC,c.id DESC LIMIT 1`,
		)
		if (!row) return undefined
		const { decision, ...approval } = row
		if (!decision) return { ...approval, decision: null }
		const { cipher, keyVersion, ...fields } = decision
		const ciphertext = cipher === null ? null : Buffer.from(cipher, 'base64')
		return { ...approval, decision: { ...fields, comment: sealed(ciphertext, keyVersion) } }
	}

	/** Variances of a version with sealed justifications. */
	async variances(
		versionId: string,
	): Promise<
		(Omit<VarianceDraft, 'justification'> & { id: string; justification: SealedValue | null })[]
	> {
		const t = this.scope.tenantId
		const rows = await this.run(
			sql<
				Omit<VarianceDraft, 'justification'> & {
					id: string
					cipher: Buffer | null
					keyVersion: number | null
				}
			>`SELECT r.id,r.requirement_code AS code,r.variance_type AS "varianceType",s.requirement_code AS "sourceCode",
				r.requirement_type AS type,r.name,r.description,r.proficiency_level AS proficiency,r.minimum_quantity::float8 AS "minimumQuantity",
				r.quantity_unit AS unit,r.is_mandatory AS mandatory,r.encrypted_justification AS cipher,r.justification_key_version AS "keyVersion"
				FROM hcm.position_requirement r LEFT JOIN hcm.job_profile_requirement s ON s.tenant_id=r.tenant_id AND s.id=r.source_job_profile_requirement_id
				WHERE r.tenant_id=${t} AND r.position_version_id=${versionId} ORDER BY r.sort_order,r.requirement_code`,
		)
		return rows.map(
			/** Seal the justification. */ ({ cipher, keyVersion, ...row }) => ({
				...row,
				justification: sealed(cipher, keyVersion),
			}),
		)
	}

	/** Requirements of a profile version with their ids. */
	profileRequirements(profileVersionId: string): Promise<(RequirementDto & { id: string })[]> {
		return this.run(
			sql<
				RequirementDto & { id: string }
			>`SELECT id,requirement_code AS code,requirement_type AS type,name,description,
				proficiency_level AS proficiency,minimum_quantity::float8 AS "minimumQuantity",quantity_unit AS unit,is_mandatory AS mandatory,
				sort_order AS "sortOrder" FROM hcm.job_profile_requirement
				WHERE tenant_id=${this.scope.tenantId} AND job_profile_version_id=${profileVersionId} ORDER BY sort_order,requirement_code`,
		)
	}

	/** Positions with the variance count of their version on a date. */
	async requirementPositions(
		query: PositionRequirementQuery,
		asOf: string,
	): Promise<HcmPage<PositionRequirementSummaryDto>> {
		const filterSet = Object.fromEntries(
			Object.entries(query).filter(
				/** Not paging. */ ([name]) => name !== 'cursor' && name !== 'limit',
			),
		)
		const key = cursorBinding([this.scope.tenantId, asOf, 'requirements', filterSet])
		const after = decodeCursor(query.cursor, key, 2)
		const filters: RawBuilder<unknown>[] = [sql`true`]
		if (query.q) {
			const pattern = likePattern(query.q)
			filters.push(sql`(s.code ILIKE ${pattern} OR s.name ILIKE ${pattern})`)
		}
		if (query.hasVariances !== undefined)
			filters.push(query.hasVariances ? sql`s."varianceCount" > 0` : sql`s."varianceCount" = 0`)
		if (after)
			filters.push(
				sql`(s.code COLLATE "C",s.id COLLATE "C") > (${after[0]} COLLATE "C",${after[1]} COLLATE "C")`,
			)
		const page = await this.run(
			sql<PositionRequirementSummaryDto>`SELECT * FROM (SELECT s.id,s.code,s.name,s."lifecycleStatus",s.version->'profile' AS profile,
					s."openRequest",(SELECT count(*)::int FROM hcm.position_requirement r WHERE r.tenant_id=${this.scope.tenantId}
						AND r.position_version_id=s.version->>'id') AS "varianceCount"
				FROM (${this.positionRows(asOf)}) s) s WHERE ${sql.join(filters, sql` AND `)}
				ORDER BY s.code COLLATE "C",s.id COLLATE "C" LIMIT ${query.limit + 1}`,
		)
		return keysetPage(
			page,
			query.limit,
			key,
			/** Continue after the last position. */ (row) => [row.code, row.id],
		)
	}

	/** Current published profile versions with allowed grades. */
	async profileOptions(
		q: string,
		page: { limit: number; cursor?: string },
	): Promise<HcmPage<PositionOptionDto>> {
		const t = this.scope.tenantId
		const key = cursorBinding([t, 'profile-options', q, page.limit])
		const after = decodeCursor(page.cursor, key, 2)
		const pattern = likePattern(q)
		const rows = await this.run(
			sql<PositionOptionDto>`SELECT pv.id,jp.code,jp.name,
				coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'code',g.code,'name',g.name,'isDefault',pg.is_default) ORDER BY g.sequence_number)
					FROM hcm.job_profile_grade pg JOIN hcm.job_grade g ON g.tenant_id=pg.tenant_id AND g.id=pg.job_grade_id
					WHERE pg.tenant_id=pv.tenant_id AND pg.job_profile_version_id=pv.id),'[]'::jsonb) AS grades
				FROM hcm.job_profile jp JOIN hcm.job_profile_version pv ON pv.tenant_id=jp.tenant_id AND pv.id=jp.current_published_version_id
				WHERE jp.tenant_id=${t} AND jp.status='Active' ${q ? sql`AND (jp.name ILIKE ${pattern} OR jp.code ILIKE ${pattern})` : sql``}
				${after ? sql`AND (jp.name COLLATE "C",pv.id COLLATE "C") > (${after[0]} COLLATE "C",${after[1]} COLLATE "C")` : sql``}
				ORDER BY jp.name COLLATE "C",pv.id COLLATE "C" LIMIT ${page.limit + 1}`,
		)
		return keysetPage(
			rows,
			page.limit,
			key,
			/** Continue after the last profile. */ (row) => [row.name, row.id],
		)
	}

	/** Positions that may be reported to. */
	async positionOptions(
		q: string,
		page: { limit: number; cursor?: string },
	): Promise<HcmPage<PositionOptionDto>> {
		const t = this.scope.tenantId
		const key = cursorBinding([t, 'position-options', q, page.limit])
		const after = decodeCursor(page.cursor, key, 2)
		const pattern = likePattern(q)
		const rows = await this.run(
			sql<PositionOptionDto>`SELECT p.id,p.code,p.name,'[]'::jsonb AS grades FROM hcm.position p
				WHERE p.tenant_id=${t} AND p.lifecycle_status IN ('Open','Frozen')
				${q ? sql`AND (p.name ILIKE ${pattern} OR p.code ILIKE ${pattern})` : sql``}
				${after ? sql`AND (p.name COLLATE "C",p.id COLLATE "C") > (${after[0]} COLLATE "C",${after[1]} COLLATE "C")` : sql``}
				ORDER BY p.name COLLATE "C",p.id COLLATE "C" LIMIT ${page.limit + 1}`,
		)
		return keysetPage(
			rows,
			page.limit,
			key,
			/** Continue after the last position. */ (row) => [row.name, row.id],
		)
	}

	/** Lock one position. */
	async lockPosition(id: string): Promise<PositionLock | undefined> {
		return (
			await this.run(
				sql<PositionLock>`SELECT p.id,p.code,p.name,p.lifecycle_status AS "lifecycleStatus",p.current_published_version_id AS "currentVersionId",
					coalesce((SELECT max(v.version_number) FROM hcm.position_version v WHERE v.tenant_id=p.tenant_id AND v.position_id=p.id),0) AS "latestVersionNumber",
					p.revision FROM hcm.position p WHERE p.tenant_id=${this.scope.tenantId} AND p.id=${id} FOR UPDATE`,
			)
		)[0]
	}

	/** Insert a planned position; a taken code is reported against the code field. */
	async insertPosition(id: string, code: string, name: string): Promise<void> {
		const { tenantId: t, accountId: a } = this.scope
		try {
			await sql`INSERT INTO hcm.position(tenant_id,id,code,name,created_by_account_id,updated_by_account_id)
				VALUES (${t},${id},${code},${name},${a},${a})`.execute(this.scope.executor)
		} catch (error) {
			if ((error as { code?: string }).code === '23505')
				throw new HcmDomainError('duplicate-code', [{ field: 'code', code: 'duplicate' }])
			classifyConstraint(error)
		}
	}

	/** Change a position and advance its revision. */
	async updatePosition(
		id: string,
		fields: { name?: string; lifecycleStatus?: PositionLifecycle; currentVersionId?: string },
	): Promise<void> {
		const sets: RawBuilder<unknown>[] = [
			sql`revision=revision+1`,
			sql`updated_at=now()`,
			sql`updated_by_account_id=${this.scope.accountId}`,
		]
		if (fields.name !== undefined) sets.push(sql`name=${fields.name}`)
		if (fields.lifecycleStatus) sets.push(sql`lifecycle_status=${fields.lifecycleStatus}`)
		if (fields.currentVersionId)
			sets.push(sql`current_published_version_id=${fields.currentVersionId}`)
		await this.run(
			sql`UPDATE hcm.position SET ${sql.join(sets)} WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** Insert a draft version. */
	async insertVersion(input: {
		id: string
		positionId: string
		versionNumber: number
		supersedesId: string | null
		proposal: PositionProposal
		changeSummary: string
	}): Promise<void> {
		const { tenantId: t, accountId: a } = this.scope
		const p = input.proposal
		await this.run(
			sql`INSERT INTO hcm.position_version(tenant_id,id,position_id,version_number,job_profile_version_id,job_grade_id,designation_id,
				legal_entity_id,organisation_id,department_id,location_id,position_type,headcount_capacity,fte_capacity,is_key_position,
				cost_center_code,effective_from,supersedes_version_id,change_summary,created_by_account_id,updated_by_account_id)
				VALUES (${t},${input.id},${input.positionId},${input.versionNumber},${p.profileVersionId},${p.gradeId},${p.designationId},
				${p.legalEntityId},${p.unitId},${p.departmentId},${p.locationId},${p.positionType},${p.headcountCapacity},${p.fteCapacity},
				${p.keyPosition},${p.costCenterCode},${p.effectiveFrom},${input.supersedesId},${input.changeSummary},${a},${a})`,
		)
	}

	/** Insert variances into a draft version in order. */
	async insertVariances(
		versionId: string,
		variances: readonly (Omit<VarianceDraft, 'justification' | 'sourceCode'> & {
			id: string
			sourceRequirementId: string | null
			justification: SealedValue | null
		})[],
	): Promise<void> {
		if (!variances.length) return
		const { tenantId: t, accountId: a } = this.scope
		await this.run(
			sql`INSERT INTO hcm.position_requirement(tenant_id,id,position_version_id,source_job_profile_requirement_id,requirement_code,
				variance_type,requirement_type,name,description,proficiency_level,minimum_quantity,quantity_unit,is_mandatory,
				encrypted_justification,justification_key_version,sort_order,created_by_account_id)
				VALUES ${sql.join(
					variances.map(
						/** One variance. */ (v, index) =>
							sql`(${t},${v.id},${versionId},${v.sourceRequirementId},${v.code},${v.varianceType},${v.type},${v.name},
								${v.description},${v.proficiency},${v.minimumQuantity},${v.unit},${v.mandatory},
								${v.justification?.ciphertext ?? null},${v.justification?.keyVersion ?? null},${(index + 1) * 10},${a})`,
					),
				)}`,
		)
	}

	/** Remove every variance of a draft version. */
	async deleteVariances(versionId: string): Promise<void> {
		await this.run(
			sql`DELETE FROM hcm.position_requirement WHERE tenant_id=${this.scope.tenantId} AND position_version_id=${versionId}`,
		)
	}

	/** Replace a draft version's content. */
	async replaceVersion(id: string, p: PositionProposal): Promise<void> {
		await this.run(
			sql`UPDATE hcm.position_version SET job_profile_version_id=${p.profileVersionId},job_grade_id=${p.gradeId},designation_id=${p.designationId},
				legal_entity_id=${p.legalEntityId},organisation_id=${p.unitId},department_id=${p.departmentId},location_id=${p.locationId},
				position_type=${p.positionType},headcount_capacity=${p.headcountCapacity},fte_capacity=${p.fteCapacity},is_key_position=${p.keyPosition},
				cost_center_code=${p.costCenterCode},effective_from=${p.effectiveFrom},revision=revision+1,updated_at=now(),
				updated_by_account_id=${this.scope.accountId} WHERE tenant_id=${this.scope.tenantId} AND id=${id} AND status='Draft'`,
		)
	}

	/** Move a version to review or cancel it. */
	async setVersionStatus(id: string, status: 'InReview' | 'Cancelled'): Promise<void> {
		await this.run(
			sql`UPDATE hcm.position_version SET status=${status},revision=revision+1,updated_at=now(),updated_by_account_id=${this.scope.accountId}
				WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** Close the replaced version, then publish. */
	async publishVersion(input: {
		id: string
		positionId: string
		digest: string
		previous: { id: string; effectiveTo: string } | null
	}): Promise<void> {
		const { tenantId: t, accountId: a } = this.scope
		if (input.previous)
			await this.run(
				sql`UPDATE hcm.position_version SET status='Superseded',effective_to=${input.previous.effectiveTo},revision=revision+1,
					updated_at=now(),updated_by_account_id=${a} WHERE tenant_id=${t} AND id=${input.previous.id}`,
			)
		await this.run(
			sql`UPDATE hcm.position_version SET status='Published',published_at=now(),published_by_account_id=${a},source_digest=${input.digest},
				revision=revision+1,updated_at=now(),updated_by_account_id=${a} WHERE tenant_id=${t} AND id=${input.id} AND position_id=${input.positionId}`,
		)
	}

	/** Replace the solid line from a position from a date. */
	async setSolidLine(
		positionId: string,
		targetId: string | null,
		effectiveFrom: string,
	): Promise<void> {
		const { tenantId: t, accountId: a } = this.scope
		const [current] = await this.run(
			sql<{
				id: string
				targetId: string
				from: string
			}>`SELECT id,target_position_id AS "targetId",${date('effective_from')} AS "from" FROM hcm.position_relationship
				WHERE tenant_id=${t} AND source_position_id=${positionId} AND relationship_type='SolidLine'
					AND (effective_to IS NULL OR effective_to >= ${effectiveFrom}::date) FOR UPDATE`,
		)
		if (current?.targetId === targetId && current.from <= effectiveFrom) return
		if (current) {
			if (current.from >= effectiveFrom) invalidField('effectiveFrom', 'not-after-current')
			await this.run(
				sql`UPDATE hcm.position_relationship SET effective_to=${effectiveFrom}::date - 1 WHERE tenant_id=${t} AND id=${current.id}`,
			)
		}
		if (targetId)
			await this.run(
				sql`INSERT INTO hcm.position_relationship(tenant_id,id,source_position_id,target_position_id,relationship_type,effective_from,created_by_account_id)
					VALUES (${t},${`${positionId}/relationship/${randomUUID()}`},${positionId},${targetId},'SolidLine',${effectiveFrom},${a})`,
			)
	}

	/** Insert a draft request. */
	async insertRequest(input: {
		id: string
		positionId: string
		requestType: PositionRequestType
		baseVersionId: string | null
		proposedVersionId: string | null
		proposedName: string | null
		reportsToPositionId: string | null
		reason: SealedValue
	}): Promise<void> {
		await this.run(
			sql`INSERT INTO hcm.position_change_request(tenant_id,id,position_id,request_type,base_position_version_id,proposed_position_version_id,
				proposed_name,proposed_reports_to_position_id,encrypted_reason,reason_key_version,requested_by_account_id)
				VALUES (${this.scope.tenantId},${input.id},${input.positionId},${input.requestType},${input.baseVersionId},${input.proposedVersionId},
				${input.proposedName},${input.reportsToPositionId},${input.reason.ciphertext},${input.reason.keyVersion},${this.scope.accountId})`,
		)
	}

	/** Change a request and advance its revision. */
	async updateRequest(
		id: string,
		fields: {
			status?: PositionRequestStatus
			reason?: SealedValue
			withdrawalReason?: SealedValue
			proposedName?: string
			reportsToPositionId?: string | null
			submitted?: boolean
			applied?: boolean
		},
	): Promise<void> {
		const sets: RawBuilder<unknown>[] = [sql`revision=revision+1`, sql`updated_at=now()`]
		if (fields.status) sets.push(sql`status=${fields.status}`)
		if (fields.reason)
			sets.push(
				sql`encrypted_reason=${fields.reason.ciphertext},reason_key_version=${fields.reason.keyVersion}`,
			)
		if (fields.withdrawalReason)
			sets.push(
				sql`encrypted_withdrawal_reason=${fields.withdrawalReason.ciphertext},withdrawal_reason_key_version=${fields.withdrawalReason.keyVersion}`,
			)
		if (fields.proposedName !== undefined) sets.push(sql`proposed_name=${fields.proposedName}`)
		if (fields.reportsToPositionId !== undefined)
			sets.push(sql`proposed_reports_to_position_id=${fields.reportsToPositionId}`)
		if (fields.submitted) sets.push(sql`submitted_at=now()`)
		if (fields.applied) sets.push(sql`applied_at=now()`)
		await this.run(
			sql`UPDATE hcm.position_change_request SET ${sql.join(sets)} WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** Replace the change items of a request, keeping their order in the ids. */
	async replaceItems(requestId: string, items: readonly ChangeItemInput[]): Promise<void> {
		const t = this.scope.tenantId
		await this.run(
			sql`DELETE FROM hcm.position_change_item WHERE tenant_id=${t} AND position_change_request_id=${requestId}`,
		)
		if (!items.length) return
		await this.run(
			sql`INSERT INTO hcm.position_change_item(tenant_id,id,position_change_request_id,field_code,change_type,old_value_digest,new_value_digest,safe_summary)
				VALUES ${sql.join(
					items.map(
						/** One item. */ (item, index) =>
							sql`(${t},${`${requestId}/item/${String(index).padStart(3, '0')}`},${requestId},${item.field},${item.changeType},
								${item.oldDigest},${item.newDigest},${item.summary})`,
					),
				)}`,
		)
	}

	/** Mark live previews stale. */
	async stalePreviews(requestId: string): Promise<void> {
		await this.run(
			sql`UPDATE hcm.position_impact_preview SET status='Stale' WHERE tenant_id=${this.scope.tenantId}
				AND position_change_request_id=${requestId} AND status IN ('Building','Ready')`,
		)
	}

	/** Insert a ready preview that expires after the given minutes. */
	async insertPreview(
		input: Omit<PreviewRow, 'status' | 'calculatedAt' | 'expiresAt'> & {
			requestId: string
			previewRevision: number
			ttlMinutes: number
		},
	): Promise<void> {
		await this.run(
			sql`INSERT INTO hcm.position_impact_preview(tenant_id,id,position_change_request_id,preview_revision,status,active_assignment_count,
				assigned_full_time_equivalent,occupancy_complete,child_position_count,downstream_reference_count,source_version_digest,expires_at)
				VALUES (${this.scope.tenantId},${input.id},${input.requestId},${input.previewRevision},'Ready',${input.activeAssignmentCount},
				${input.assignedFte},${input.occupancyComplete},${input.childPositionCount},${input.downstreamReferenceCount},${input.sourceDigest},
				now() + make_interval(mins => ${input.ttlMinutes}))`,
		)
	}

	/** Open an approval case. */
	async insertApprovalCase(input: {
		id: string
		requestId: string
		subjectVersion: number
		previewId: string
		requiresWaiveAuthority: boolean
		policyDigest: string
	}): Promise<void> {
		await this.run(
			sql`INSERT INTO hcm.position_approval_case(tenant_id,id,position_change_request_id,subject_version,requires_waive_authority,preview_id,policy_snapshot_digest)
				VALUES (${this.scope.tenantId},${input.id},${input.requestId},${input.subjectVersion},${input.requiresWaiveAuthority},${input.previewId},${input.policyDigest})`,
		)
	}

	/** Close an approval case. */
	async completeApprovalCase(
		id: string,
		status: 'Approved' | 'Rejected' | 'Cancelled',
	): Promise<void> {
		await this.run(
			sql`UPDATE hcm.position_approval_case SET status=${status},completed_at=now() WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** Record the decision; the database refuses a second one and one by the requester. */
	async insertDecision(input: {
		id: string
		caseId: string
		decision: 'Approved' | 'Rejected'
		subjectVersion: number
		comment: SealedValue | null
		idempotencyKey: string
		applied: boolean
	}): Promise<void> {
		await this.run(
			sql`INSERT INTO hcm.position_decision(tenant_id,id,position_approval_case_id,decision,subject_version,decided_by_account_id,
				encrypted_comment,comment_key_version,idempotency_key,applied_at)
				VALUES (${this.scope.tenantId},${input.id},${input.caseId},${input.decision},${input.subjectVersion},${this.scope.accountId},
				${input.comment?.ciphertext ?? null},${input.comment?.keyVersion ?? null},${input.idempotencyKey}::uuid,
				${input.applied ? sql`now()` : null})`,
		)
	}
}
