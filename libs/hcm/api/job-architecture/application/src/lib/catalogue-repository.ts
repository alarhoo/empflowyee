import type {
	ArchitectureStatus,
	CatalogueSummaryDto,
	CatalogueVersionDto,
	JobFamilyPage,
	JobProfilePage,
	JobProfileVersionDto,
} from '@empflowyee/hcm-job-architecture-contract'

export interface FamilyPageQuery {
	parentId: string | null
	limit: number
	cursor?: string
}

export interface ProfilePageQuery {
	q: string
	familyId?: string
	status?: ArchitectureStatus
	limit: number
	cursor?: string
}

/** Catalogue and job profile reads bound to one authorized tenant transaction. */
export interface CatalogueReader {
	/** The tenant's one catalogue with its bounded version list, or undefined before one exists. */
	catalogue(): Promise<CatalogueSummaryDto | undefined>
	/** One catalogue version with tracks, levels, bands and grades. */
	version(id: string): Promise<CatalogueVersionDto | undefined>
	/** Families of a version under one parent (roots when null), by sort order then code. */
	families(versionId: string, query: FamilyPageQuery): Promise<JobFamilyPage>
	/** Job profiles by name then id, with their latest version's placement and status. */
	profiles(query: ProfilePageQuery): Promise<JobProfilePage>
	/** One profile version with its children and the profile's version list. */
	profileVersion(id: string): Promise<JobProfileVersionDto | undefined>
}
