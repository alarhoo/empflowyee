import { sql } from 'kysely'
import type {
	ElementCreate,
	ElementUpdate,
	JobFamilyNodeDto,
	JobProfileVersionDraft,
} from '@empflowyee/hcm-job-architecture-contract'
import type {
	OwnerLock,
	Publication,
	VersionLock,
} from '@empflowyee/hcm-api-job-architecture-application'
import { KyselyCatalogueReader } from './catalogue-reader'

/** Catalogue and job profile persistence inside the caller's transaction. */
/** Checked structurally against `CatalogueRepository` where the unit of work binds it. */
export class KyselyCatalogueRepository extends KyselyCatalogueReader {
	/** The acting account, recorded on every write. */
	private get actor(): string {
		return this.scope.accountId
	}

	/** Lock the tenant's catalogue. */
	async lockCatalogue(): Promise<OwnerLock | undefined> {
		return (
			await this.run(
				sql<OwnerLock>`SELECT c.id,c.current_published_version_id AS "currentVersionId",
					(SELECT coalesce(max(v.version_number),0)::int FROM hcm.job_catalogue_version v WHERE v.tenant_id=c.tenant_id AND v.job_catalogue_id=c.id) AS "latestVersionNumber"
					FROM hcm.job_catalogue c WHERE c.tenant_id=${this.scope.tenantId} FOR UPDATE`,
			)
		)[0]
	}

	/** Lock one catalogue version. */
	async lockVersion(id: string): Promise<VersionLock | undefined> {
		return (
			await this.run(
				sql<VersionLock>`SELECT id,job_catalogue_id AS "ownerId",status,revision,version_number AS "versionNumber",to_char(effective_from,'YYYY-MM-DD') AS "effectiveFrom"
					FROM hcm.job_catalogue_version WHERE tenant_id=${this.scope.tenantId} AND id=${id} FOR UPDATE`,
			)
		)[0]
	}

	/** Create a draft successor and copy every child; child ids derive from the new version and code. */
	async createSuccessor(input: {
		id: string
		catalogueId: string
		versionNumber: number
		basedOnId: string
		changeSummary: string
	}): Promise<void> {
		const t = this.scope.tenantId
		const a = this.actor
		const v = input.id
		const b = input.basedOnId
		await this.run(
			sql`INSERT INTO hcm.job_catalogue_version(tenant_id,id,job_catalogue_id,version_number,supersedes_version_id,change_summary,created_by_account_id,updated_by_account_id)
				VALUES (${t},${v},${input.catalogueId},${input.versionNumber},${b},${input.changeSummary},${a},${a})`,
		)
		for (const depth of [1, 2])
			await this.run(
				sql`INSERT INTO hcm.job_family(tenant_id,id,job_catalogue_version_id,parent_job_family_id,code,name,description,depth,materialized_path,sort_order,is_active,created_by_account_id,updated_by_account_id)
					SELECT f.tenant_id,${v} || '/families/' || f.code,${v},CASE WHEN p.code IS NULL THEN NULL ELSE ${v} || '/families/' || p.code END,
						f.code,f.name,f.description,f.depth,f.materialized_path,f.sort_order,f.is_active,${a},${a}
					FROM hcm.job_family f LEFT JOIN hcm.job_family p ON p.tenant_id=f.tenant_id AND p.id=f.parent_job_family_id
					WHERE f.tenant_id=${t} AND f.job_catalogue_version_id=${b} AND f.depth=${depth}`,
			)
		await this.run(
			sql`INSERT INTO hcm.career_track(tenant_id,id,job_catalogue_version_id,code,name,description,kind,sort_order,is_active,created_by_account_id,updated_by_account_id)
				SELECT tenant_id,${v} || '/tracks/' || code,${v},code,name,description,kind,sort_order,is_active,${a},${a}
				FROM hcm.career_track WHERE tenant_id=${t} AND job_catalogue_version_id=${b}`,
		)
		await this.run(
			sql`INSERT INTO hcm.job_level(tenant_id,id,job_catalogue_version_id,career_track_id,code,name,description,sequence_number,scope_summary,is_active,created_by_account_id,updated_by_account_id)
				SELECT l.tenant_id,${v} || '/levels/' || l.code,${v},${v} || '/tracks/' || k.code,l.code,l.name,l.description,l.sequence_number,l.scope_summary,l.is_active,${a},${a}
				FROM hcm.job_level l JOIN hcm.career_track k ON k.tenant_id=l.tenant_id AND k.id=l.career_track_id
				WHERE l.tenant_id=${t} AND l.job_catalogue_version_id=${b}`,
		)
		await this.run(
			sql`INSERT INTO hcm.job_band(tenant_id,id,job_catalogue_version_id,code,name,description,sequence_number,is_active,created_by_account_id,updated_by_account_id)
				SELECT tenant_id,${v} || '/bands/' || code,${v},code,name,description,sequence_number,is_active,${a},${a}
				FROM hcm.job_band WHERE tenant_id=${t} AND job_catalogue_version_id=${b}`,
		)
		await this.run(
			sql`INSERT INTO hcm.job_grade(tenant_id,id,job_catalogue_version_id,job_band_id,code,name,description,sequence_number,is_active,created_by_account_id,updated_by_account_id)
				SELECT g.tenant_id,${v} || '/grades/' || g.code,${v},${v} || '/bands/' || n.code,g.code,g.name,g.description,g.sequence_number,g.is_active,${a},${a}
				FROM hcm.job_grade g JOIN hcm.job_band n ON n.tenant_id=g.tenant_id AND n.id=g.job_band_id
				WHERE g.tenant_id=${t} AND g.job_catalogue_version_id=${b}`,
		)
	}

	/** Every family of a version. */
	async allFamilies(versionId: string): Promise<JobFamilyNodeDto[]> {
		return this.run(
			sql<JobFamilyNodeDto>`SELECT f.id,f.parent_job_family_id AS "parentId",f.code,f.name,f.description,f.depth::int AS depth,
				f.materialized_path AS path,f.sort_order AS "sortOrder",f.is_active AS active,
				(SELECT count(*)::int FROM hcm.job_family c WHERE c.tenant_id=f.tenant_id AND c.parent_job_family_id=f.id) AS "childCount"
				FROM hcm.job_family f WHERE f.tenant_id=${this.scope.tenantId} AND f.job_catalogue_version_id=${versionId}
				ORDER BY f.materialized_path COLLATE "C"`,
		)
	}

	/** Add one element to a draft version. */
	async addElement(versionId: string, id: string, e: ElementCreate): Promise<void> {
		const t = this.scope.tenantId
		const a = this.actor
		switch (e.kind) {
			case 'families':
				await this.run(
					sql`INSERT INTO hcm.job_family(tenant_id,id,job_catalogue_version_id,parent_job_family_id,code,name,description,depth,materialized_path,sort_order,created_by_account_id,updated_by_account_id)
						VALUES (${t},${id},${versionId},${e.parentId},${e.code},${e.name},${e.description},1,${e.code},${e.sortOrder},${a},${a})`,
				)
				return
			case 'tracks':
				await this.run(
					sql`INSERT INTO hcm.career_track(tenant_id,id,job_catalogue_version_id,code,name,description,kind,sort_order,created_by_account_id,updated_by_account_id)
						VALUES (${t},${id},${versionId},${e.code},${e.name},${e.description},${e.trackKind},${e.sortOrder},${a},${a})`,
				)
				return
			case 'levels':
				await this.run(
					sql`INSERT INTO hcm.job_level(tenant_id,id,job_catalogue_version_id,career_track_id,code,name,description,sequence_number,scope_summary,created_by_account_id,updated_by_account_id)
						VALUES (${t},${id},${versionId},${e.trackId},${e.code},${e.name},${e.description},${e.sequence},${e.scopeSummary},${a},${a})`,
				)
				return
			case 'bands':
				await this.run(
					sql`INSERT INTO hcm.job_band(tenant_id,id,job_catalogue_version_id,code,name,description,sequence_number,created_by_account_id,updated_by_account_id)
						VALUES (${t},${id},${versionId},${e.code},${e.name},${e.description},${e.sequence},${a},${a})`,
				)
				return
			default:
				await this.run(
					sql`INSERT INTO hcm.job_grade(tenant_id,id,job_catalogue_version_id,job_band_id,code,name,description,sequence_number,created_by_account_id,updated_by_account_id)
						VALUES (${t},${id},${versionId},${e.bandId},${e.code},${e.name},${e.description},${e.sequence},${a},${a})`,
				)
		}
	}

	/** Update one element of a draft version. */
	async updateElement(versionId: string, id: string, u: ElementUpdate): Promise<boolean> {
		const tables = {
			families: 'job_family',
			tracks: 'career_track',
			levels: 'job_level',
			bands: 'job_band',
			grades: 'job_grade',
		} as const
		const ordering =
			u.sortOrder !== undefined
				? sql`sort_order=${u.sortOrder}`
				: sql`sequence_number=${u.sequence ?? 1}`
		const scope = u.scopeSummary !== undefined ? sql`,scope_summary=${u.scopeSummary}` : sql``
		const rows = await this.run(
			sql<{
				id: string
			}>`UPDATE ${sql.table('hcm.' + tables[u.kind])} SET name=${u.name},description=${u.description},is_active=${u.active},${ordering}${scope},
				revision=revision+1,updated_at=now(),updated_by_account_id=${this.actor}
				WHERE tenant_id=${this.scope.tenantId} AND job_catalogue_version_id=${versionId} AND id=${id} RETURNING id`,
		)
		return rows.length === 1
	}

	/** Advance a version's revision, optionally submitting it. */
	async touchVersion(id: string, fields: { status?: 'InReview' } = {}): Promise<void> {
		await this.run(
			sql`UPDATE hcm.job_catalogue_version SET status=coalesce(${fields.status ?? null},status),revision=revision+1,updated_at=now(),updated_by_account_id=${this.actor}
				WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** Close the predecessor, publish the version and move the pointer. */
	async publishVersion(p: Publication): Promise<void> {
		await this.publish('job_catalogue_version', 'job_catalogue', p)
	}

	/** Shared publication for catalogue and profile versions. */
	private async publish(
		versions: 'job_catalogue_version' | 'job_profile_version',
		owners: 'job_catalogue' | 'job_profile',
		p: Publication,
	): Promise<void> {
		const t = this.scope.tenantId
		const a = this.actor
		if (p.previous)
			await this.run(
				sql`UPDATE ${sql.table('hcm.' + versions)} SET status='Superseded',effective_to=${p.previous.effectiveTo}::date,revision=revision+1,updated_at=now(),updated_by_account_id=${a}
					WHERE tenant_id=${t} AND id=${p.previous.id}`,
			)
		await this.run(
			sql`UPDATE ${sql.table('hcm.' + versions)} SET status='Published',effective_from=${p.effectiveFrom}::date,published_at=now(),published_by_account_id=${a},
				source_digest=${p.digest},revision=revision+1,updated_at=now(),updated_by_account_id=${a}
				WHERE tenant_id=${t} AND id=${p.id}`,
		)
		await this.run(
			sql`UPDATE ${sql.table('hcm.' + owners)} SET current_published_version_id=${p.id},revision=revision+1,updated_at=now(),updated_by_account_id=${a}
				WHERE tenant_id=${t} AND id=${p.ownerId}`,
		)
	}

	/** Lock one job profile. */
	async lockProfile(id: string): Promise<OwnerLock | undefined> {
		return (
			await this.run(
				sql<OwnerLock>`SELECT p.id,p.current_published_version_id AS "currentVersionId",
					(SELECT coalesce(max(v.version_number),0)::int FROM hcm.job_profile_version v WHERE v.tenant_id=p.tenant_id AND v.job_profile_id=p.id) AS "latestVersionNumber"
					FROM hcm.job_profile p WHERE p.tenant_id=${this.scope.tenantId} AND p.id=${id} FOR UPDATE`,
			)
		)[0]
	}

	/** Create a job profile. */
	async createProfile(id: string, code: string, name: string): Promise<void> {
		const a = this.actor
		await this.run(
			sql`INSERT INTO hcm.job_profile(tenant_id,id,code,name,created_by_account_id,updated_by_account_id) VALUES (${this.scope.tenantId},${id},${code},${name},${a},${a})`,
		)
	}

	/** Lock one job profile version. */
	async lockProfileVersion(id: string): Promise<VersionLock | undefined> {
		return (
			await this.run(
				sql<VersionLock>`SELECT id,job_profile_id AS "ownerId",status,revision,version_number AS "versionNumber",to_char(effective_from,'YYYY-MM-DD') AS "effectiveFrom",
					job_catalogue_version_id AS "catalogueVersionId"
					FROM hcm.job_profile_version WHERE tenant_id=${this.scope.tenantId} AND id=${id} FOR UPDATE`,
			)
		)[0]
	}

	/** Insert a draft profile version with its children. */
	async insertProfileVersion(input: {
		id: string
		profileId: string
		versionNumber: number
		supersedesId: string | null
		draft: JobProfileVersionDraft
	}): Promise<void> {
		const d = input.draft
		const a = this.actor
		await this.run(
			sql`INSERT INTO hcm.job_profile_version(tenant_id,id,job_profile_id,job_catalogue_version_id,job_family_id,career_track_id,job_level_id,version_number,summary,purpose,scope_of_impact,autonomy_level,supersedes_version_id,created_by_account_id,updated_by_account_id)
				VALUES (${this.scope.tenantId},${input.id},${input.profileId},${d.catalogueVersionId},${d.familyId},${d.trackId},${d.levelId},${input.versionNumber},${d.summary},${d.purpose},${d.scopeOfImpact},${d.autonomyLevel},${input.supersedesId},${a},${a})`,
		)
		await this.insertChildren(input.id, d)
	}

	/** Insert responsibilities, requirements and allowed grades of a draft. */
	private async insertChildren(id: string, d: JobProfileVersionDraft): Promise<void> {
		const t = this.scope.tenantId
		const a = this.actor
		for (const r of d.responsibilities)
			await this.run(
				sql`INSERT INTO hcm.job_profile_responsibility(tenant_id,id,job_profile_version_id,responsibility_code,statement,is_essential,sort_order,created_by_account_id)
					VALUES (${t},${id + '/r/' + r.code},${id},${r.code},${r.statement},${r.essential},${r.sortOrder},${a})`,
			)
		for (const q of d.requirements)
			await this.run(
				sql`INSERT INTO hcm.job_profile_requirement(tenant_id,id,job_profile_version_id,requirement_code,requirement_type,name,description,proficiency_level,minimum_quantity,quantity_unit,is_mandatory,sort_order,created_by_account_id)
					VALUES (${t},${id + '/q/' + q.code},${id},${q.code},${q.type},${q.name},${q.description},${q.proficiency},${q.minimumQuantity},${q.unit},${q.mandatory},${q.sortOrder},${a})`,
			)
		for (const [index, g] of d.allowedGrades.entries())
			await this.run(
				sql`INSERT INTO hcm.job_profile_grade(tenant_id,id,job_profile_version_id,job_catalogue_version_id,job_grade_id,is_default,created_by_account_id)
					VALUES (${t},${id + '/g/' + index},${id},${d.catalogueVersionId},${g.gradeId},${g.isDefault},${a})`,
			)
	}

	/** Replace a draft's content: children first, so the catalogue version can change. */
	async replaceProfileDraft(id: string, d: JobProfileVersionDraft): Promise<void> {
		const t = this.scope.tenantId
		for (const table of [
			'job_profile_grade',
			'job_profile_requirement',
			'job_profile_responsibility',
		])
			await this.run(
				sql`DELETE FROM ${sql.table('hcm.' + table)} WHERE tenant_id=${t} AND job_profile_version_id=${id}`,
			)
		await this.run(
			sql`UPDATE hcm.job_profile_version SET job_catalogue_version_id=${d.catalogueVersionId},job_family_id=${d.familyId},career_track_id=${d.trackId},job_level_id=${d.levelId},
				summary=${d.summary},purpose=${d.purpose},scope_of_impact=${d.scopeOfImpact},autonomy_level=${d.autonomyLevel},revision=revision+1,updated_at=now(),updated_by_account_id=${this.actor}
				WHERE tenant_id=${t} AND id=${id}`,
		)
		await this.insertChildren(id, d)
	}

	/** Advance a profile version's revision, optionally submitting it. */
	async touchProfileVersion(id: string, fields: { status?: 'InReview' } = {}): Promise<void> {
		await this.run(
			sql`UPDATE hcm.job_profile_version SET status=coalesce(${fields.status ?? null},status),revision=revision+1,updated_at=now(),updated_by_account_id=${this.actor}
				WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** Close the predecessor, publish the profile version and move the pointer. */
	async publishProfileVersion(p: Publication): Promise<void> {
		await this.publish('job_profile_version', 'job_profile', p)
	}
}
