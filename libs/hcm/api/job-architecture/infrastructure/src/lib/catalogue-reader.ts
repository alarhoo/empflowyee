import { sql, type Kysely, type RawBuilder } from 'kysely'
import {
	classifyConstraint,
	cursorBinding,
	decodeCursor,
	keysetPage,
	likePattern,
} from '@empflowyee/hcm-api-database-kysely'
import {
	MAX_VERSION_ELEMENTS,
	type CatalogueSummaryDto,
	type CatalogueVersionDto,
	type JobFamilyNodeDto,
	type JobFamilyPage,
	type JobProfilePage,
	type JobProfileSummaryDto,
	type JobProfileVersionDto,
} from '@empflowyee/hcm-job-architecture-contract'
import type {
	CatalogueReader,
	FamilyPageQuery,
	ProfilePageQuery,
} from '@empflowyee/hcm-api-job-architecture-application'

/** Verified tenant, actor and transaction of a job architecture unit of work. */
export interface JobArchitectureScope {
	executor: Kysely<unknown>
	tenantId: string
	accountId: string
}

/** An ISO date column. */
const date = (column: string) => sql`to_char(${sql.ref(column)},'YYYY-MM-DD')`

/** Reads catalogue versions and job profiles in the caller's transaction. */
export class KyselyCatalogueReader implements CatalogueReader {
	/** Bind to the authorized transaction. */
	constructor(protected readonly scope: JobArchitectureScope) {}

	/** Execute one query and classify integrity failures safely. */
	protected async run<T>(query: RawBuilder<T>): Promise<T[]> {
		try {
			return (await query.execute(this.scope.executor)).rows
		} catch (error) {
			return classifyConstraint(error)
		}
	}

	/** The tenant's catalogue with its versions, newest first. */
	async catalogue(): Promise<CatalogueSummaryDto | undefined> {
		const t = this.scope.tenantId
		return (
			await this.run(
				sql<CatalogueSummaryDto>`SELECT c.id,c.code,c.name,c.description,c.current_published_version_id AS "currentVersionId",
					coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'versionNumber',v.version_number,'status',v.status,
						'effectiveFrom',${date('v.effective_from')},'effectiveTo',${date('v.effective_to')},'changeSummary',v.change_summary,
						'current',v.id IS NOT DISTINCT FROM c.current_published_version_id) ORDER BY v.version_number DESC)
						FROM hcm.job_catalogue_version v WHERE v.tenant_id=c.tenant_id AND v.job_catalogue_id=c.id),'[]'::jsonb) AS versions
				FROM hcm.job_catalogue c WHERE c.tenant_id=${t}`,
			)
		)[0]
	}

	/** One catalogue version with bounded tracks, levels, bands and grades. */
	async version(id: string): Promise<CatalogueVersionDto | undefined> {
		const t = this.scope.tenantId
		const limit = MAX_VERSION_ELEMENTS
		return (
			await this.run(
				sql<CatalogueVersionDto>`SELECT v.id,v.job_catalogue_id AS "catalogueId",v.version_number AS "versionNumber",v.status,
					${date('v.effective_from')} AS "effectiveFrom",${date('v.effective_to')} AS "effectiveTo",v.change_summary AS "changeSummary",
					v.id IS NOT DISTINCT FROM c.current_published_version_id AS current,v.revision,
					to_char(v.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "publishedAt",
					coalesce((SELECT jsonb_agg(jsonb_build_object('id',k.id,'code',k.code,'name',k.name,'description',k.description,'kind',k.kind,
						'sortOrder',k.sort_order,'active',k.is_active,'levels',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'trackId',l.career_track_id,
						'code',l.code,'name',l.name,'description',l.description,'sequence',l.sequence_number,'scopeSummary',l.scope_summary,'active',l.is_active)
						ORDER BY l.sequence_number) FROM (SELECT * FROM hcm.job_level l WHERE l.tenant_id=k.tenant_id AND l.career_track_id=k.id ORDER BY l.sequence_number LIMIT ${limit}) l),'[]'::jsonb))
						ORDER BY k.sort_order,k.code) FROM (SELECT * FROM hcm.career_track k WHERE k.tenant_id=v.tenant_id AND k.job_catalogue_version_id=v.id ORDER BY k.sort_order,k.code LIMIT ${limit}) k),'[]'::jsonb) AS tracks,
					coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'code',b.code,'name',b.name,'description',b.description,'sequence',b.sequence_number,
						'active',b.is_active,'grades',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'bandId',g.job_band_id,'code',g.code,'name',g.name,
						'description',g.description,'sequence',g.sequence_number,'active',g.is_active) ORDER BY g.sequence_number)
						FROM (SELECT * FROM hcm.job_grade g WHERE g.tenant_id=b.tenant_id AND g.job_band_id=b.id ORDER BY g.sequence_number LIMIT ${limit}) g),'[]'::jsonb))
						ORDER BY b.sequence_number) FROM (SELECT * FROM hcm.job_band b WHERE b.tenant_id=v.tenant_id AND b.job_catalogue_version_id=v.id ORDER BY b.sequence_number LIMIT ${limit}) b),'[]'::jsonb) AS bands,
					(SELECT count(*)::int FROM hcm.job_family f WHERE f.tenant_id=v.tenant_id AND f.job_catalogue_version_id=v.id) AS "familyCount"
				FROM hcm.job_catalogue_version v JOIN hcm.job_catalogue c ON c.tenant_id=v.tenant_id AND c.id=v.job_catalogue_id
				WHERE v.tenant_id=${t} AND v.id=${id}`,
			)
		)[0]
	}

	/** Families under one parent, by sort order then code. */
	async families(versionId: string, query: FamilyPageQuery): Promise<JobFamilyPage> {
		const t = this.scope.tenantId
		const key = cursorBinding([t, versionId, query.parentId, query.limit])
		const after = decodeCursor(query.cursor, key, 2)
		const rows = await this.run(
			sql<JobFamilyNodeDto>`SELECT f.id,f.parent_job_family_id AS "parentId",f.code,f.name,f.description,f.depth::int AS depth,
				f.materialized_path AS path,f.sort_order AS "sortOrder",f.is_active AS active,
				(SELECT count(*)::int FROM hcm.job_family c WHERE c.tenant_id=f.tenant_id AND c.parent_job_family_id=f.id) AS "childCount"
				FROM hcm.job_family f WHERE f.tenant_id=${t} AND f.job_catalogue_version_id=${versionId}
				AND f.parent_job_family_id IS NOT DISTINCT FROM ${query.parentId}
				${after ? sql`AND (f.sort_order,f.code COLLATE "C") > (${after[0]}::int,${after[1]} COLLATE "C")` : sql``}
				ORDER BY f.sort_order,f.code COLLATE "C" LIMIT ${query.limit + 1}`,
		)
		return keysetPage(
			rows,
			query.limit,
			key,
			/** Continue after the last family. */ (row) => [row.sortOrder, row.code],
		)
	}

	/** Profiles with their latest version, filtered by name or code, family subtree and status. */
	async profiles(query: ProfilePageQuery): Promise<JobProfilePage> {
		const t = this.scope.tenantId
		const key = cursorBinding([t, query.q, query.familyId, query.status, query.limit])
		const after = decodeCursor(query.cursor, key, 2)
		/** A reference object of a joined row. */
		const ref = (alias: string) =>
			sql`CASE WHEN ${sql.ref(alias + '.id')} IS NULL THEN NULL ELSE jsonb_build_object('id',${sql.ref(alias + '.id')},'code',${sql.ref(alias + '.code')},'name',${sql.ref(alias + '.name')}) END`
		const conditions = [sql`true`]
		if (query.q)
			conditions.push(
				sql`(p.name ILIKE ${likePattern(query.q)} OR p.code ILIKE ${likePattern(query.q)})`,
			)
		if (query.status) conditions.push(sql`p.status=${query.status}`)
		if (query.familyId)
			conditions.push(
				sql`EXISTS (SELECT 1 FROM hcm.job_family sf WHERE sf.tenant_id=${t} AND sf.id=${query.familyId} AND (p."familyPath"=sf.materialized_path OR p."familyPath" LIKE sf.materialized_path || '/%'))`,
			)
		const rows = await this.run(
			sql<JobProfileSummaryDto>`SELECT * FROM (SELECT jp.id,jp.code,jp.name,${ref('f')} AS family,
					CASE WHEN k.id IS NULL THEN NULL ELSE jsonb_build_object('id',k.id,'code',k.code,'name',k.name,'kind',k.kind) END AS track,
					${ref('l')} AS level,${ref('g')} AS "defaultGrade",v.status,jp.current_published_version_id AS "currentVersionId",v.id AS "latestVersionId",
					f.materialized_path AS "familyPath"
				FROM hcm.job_profile jp
				JOIN LATERAL (SELECT * FROM hcm.job_profile_version x WHERE x.tenant_id=jp.tenant_id AND x.job_profile_id=jp.id ORDER BY x.version_number DESC LIMIT 1) v ON true
				LEFT JOIN hcm.job_family f ON f.tenant_id=v.tenant_id AND f.id=v.job_family_id
				LEFT JOIN hcm.career_track k ON k.tenant_id=v.tenant_id AND k.id=v.career_track_id
				LEFT JOIN hcm.job_level l ON l.tenant_id=v.tenant_id AND l.id=v.job_level_id
				LEFT JOIN hcm.job_profile_grade pg ON pg.tenant_id=v.tenant_id AND pg.job_profile_version_id=v.id AND pg.is_default
				LEFT JOIN hcm.job_grade g ON g.tenant_id=pg.tenant_id AND g.id=pg.job_grade_id
				WHERE jp.tenant_id=${t}) p
				WHERE ${sql.join(conditions, sql` AND `)}
				${after ? sql`AND (p.name COLLATE "C",p.id COLLATE "C") > (${after[0]} COLLATE "C",${after[1]} COLLATE "C")` : sql``}
				ORDER BY p.name COLLATE "C",p.id COLLATE "C" LIMIT ${query.limit + 1}`,
		)
		const page = keysetPage(
			rows,
			query.limit,
			key,
			/** Continue after the last profile. */ (row) => [row.name, row.id],
		)
		return {
			items: page.items.map(
				/** Drop the internal family path. */ (row) =>
					Object.fromEntries(
						Object.entries(row).filter(/** Public field. */ ([name]) => name !== 'familyPath'),
					) as unknown as JobProfileSummaryDto,
			),
			nextCursor: page.nextCursor,
		}
	}

	/** One profile version with responsibilities, requirements, allowed grades and sibling versions. */
	async profileVersion(id: string): Promise<JobProfileVersionDto | undefined> {
		const t = this.scope.tenantId
		return (
			await this.run(
				sql<JobProfileVersionDto>`SELECT v.id,v.job_profile_id AS "profileId",jp.code AS "profileCode",jp.name AS "profileName",v.version_number AS "versionNumber",
					v.status,${date('v.effective_from')} AS "effectiveFrom",${date('v.effective_to')} AS "effectiveTo",
					v.id IS NOT DISTINCT FROM jp.current_published_version_id AS current,
					v.job_catalogue_version_id AS "catalogueVersionId",cv.version_number AS "catalogueVersionNumber",
					jsonb_build_object('id',f.id,'code',f.code,'name',f.name) AS family,
					jsonb_build_object('id',k.id,'code',k.code,'name',k.name,'kind',k.kind) AS track,
					jsonb_build_object('id',l.id,'code',l.code,'name',l.name) AS level,
					v.summary,v.purpose,v.scope_of_impact AS "scopeOfImpact",v.autonomy_level AS "autonomyLevel",
					to_char(v.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "publishedAt",v.revision,
					coalesce((SELECT jsonb_agg(jsonb_build_object('code',r.responsibility_code,'statement',r.statement,'essential',r.is_essential,'sortOrder',r.sort_order)
						ORDER BY r.sort_order,r.responsibility_code) FROM hcm.job_profile_responsibility r WHERE r.tenant_id=v.tenant_id AND r.job_profile_version_id=v.id),'[]'::jsonb) AS responsibilities,
					coalesce((SELECT jsonb_agg(jsonb_build_object('code',q.requirement_code,'type',q.requirement_type,'name',q.name,'description',q.description,
						'proficiency',q.proficiency_level,'minimumQuantity',q.minimum_quantity::float8,'unit',q.quantity_unit,'mandatory',q.is_mandatory,'sortOrder',q.sort_order)
						ORDER BY q.sort_order,q.requirement_code) FROM hcm.job_profile_requirement q WHERE q.tenant_id=v.tenant_id AND q.job_profile_version_id=v.id),'[]'::jsonb) AS requirements,
					coalesce((SELECT jsonb_agg(jsonb_build_object('gradeId',g.id,'code',g.code,'name',g.name,'isDefault',pg.is_default)
						ORDER BY b.sequence_number,g.sequence_number) FROM hcm.job_profile_grade pg
						JOIN hcm.job_grade g ON g.tenant_id=pg.tenant_id AND g.id=pg.job_grade_id
						JOIN hcm.job_band b ON b.tenant_id=g.tenant_id AND b.id=g.job_band_id
						WHERE pg.tenant_id=v.tenant_id AND pg.job_profile_version_id=v.id),'[]'::jsonb) AS "allowedGrades",
					coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'versionNumber',s.version_number,'status',s.status,
						'effectiveFrom',${date('s.effective_from')},'effectiveTo',${date('s.effective_to')},'current',s.id IS NOT DISTINCT FROM jp.current_published_version_id)
						ORDER BY s.version_number DESC) FROM hcm.job_profile_version s WHERE s.tenant_id=v.tenant_id AND s.job_profile_id=v.job_profile_id),'[]'::jsonb) AS versions
				FROM hcm.job_profile_version v
				JOIN hcm.job_profile jp ON jp.tenant_id=v.tenant_id AND jp.id=v.job_profile_id
				JOIN hcm.job_catalogue_version cv ON cv.tenant_id=v.tenant_id AND cv.id=v.job_catalogue_version_id
				JOIN hcm.job_family f ON f.tenant_id=v.tenant_id AND f.id=v.job_family_id
				JOIN hcm.career_track k ON k.tenant_id=v.tenant_id AND k.id=v.career_track_id
				JOIN hcm.job_level l ON l.tenant_id=v.tenant_id AND l.id=v.job_level_id
				WHERE v.tenant_id=${t} AND v.id=${id}`,
			)
		)[0]
	}
}
