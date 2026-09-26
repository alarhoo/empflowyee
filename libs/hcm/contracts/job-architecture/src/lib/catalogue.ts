/**
 * Job architecture catalogue vocabulary and DTOs (job architecture TECHNICAL-DESIGN#contract).
 * Versions move Draft, InReview, Published, then Superseded or Retired; only drafts change.
 * No compensation value exists anywhere in this contract.
 */
export const ARCHITECTURE_STATUSES = [
	'Draft',
	'InReview',
	'Published',
	'Superseded',
	'Retired',
] as const
export type ArchitectureStatus = (typeof ARCHITECTURE_STATUSES)[number]

/** DEC-HCM2-005: the two supported career track kinds. */
export const TRACK_KINDS = ['IndividualContributor', 'Management'] as const
export type TrackKind = (typeof TRACK_KINDS)[number]

export const REQUIREMENT_TYPES = [
	'Education',
	'Experience',
	'Certification',
	'Licence',
	'Language',
	'Skill',
	'Competency',
	'Other',
] as const
export type RequirementType = (typeof REQUIREMENT_TYPES)[number]

export const QUANTITY_UNITS = ['Years', 'Months', 'Hours', 'Credits', 'Count'] as const
export type QuantityUnit = (typeof QUANTITY_UNITS)[number]

/** Catalogue elements a draft catalogue version maintains. */
export const CATALOGUE_ELEMENT_KINDS = ['families', 'tracks', 'levels', 'bands', 'grades'] as const
export type CatalogueElementKind = (typeof CATALOGUE_ELEMENT_KINDS)[number]

/** DEC-HCM2-005: families are at most two levels deep. */
export const MAX_FAMILY_DEPTH = 2
/** Bound on tracks, levels, bands and grades returned for one version. */
export const MAX_VERSION_ELEMENTS = 200

export interface CatalogueVersionSummaryDto {
	id: string
	versionNumber: number
	status: ArchitectureStatus
	effectiveFrom: string | null
	effectiveTo: string | null
	changeSummary: string
	/** True for the version the catalogue's current pointer references. */
	current: boolean
}

export interface CatalogueSummaryDto {
	id: string
	code: string
	name: string
	description: string
	currentVersionId: string | null
	versions: CatalogueVersionSummaryDto[]
}

export interface JobLevelDto {
	id: string
	trackId: string
	code: string
	name: string
	description: string
	sequence: number
	scopeSummary: string
	active: boolean
}

export interface CareerTrackDto {
	id: string
	code: string
	name: string
	description: string
	kind: TrackKind
	sortOrder: number
	active: boolean
	levels: JobLevelDto[]
}

export interface JobGradeDto {
	id: string
	bandId: string
	code: string
	name: string
	description: string
	sequence: number
	active: boolean
}

export interface JobBandDto {
	id: string
	code: string
	name: string
	description: string
	sequence: number
	active: boolean
	grades: JobGradeDto[]
}

export interface JobFamilyNodeDto {
	id: string
	parentId: string | null
	code: string
	name: string
	description: string
	depth: number
	/** Codes from the root, separated by `/`. */
	path: string
	sortOrder: number
	active: boolean
	childCount: number
}

/** One catalogue version with its bounded children; families are read by parent. */
export interface CatalogueVersionDto extends CatalogueVersionSummaryDto {
	catalogueId: string
	/** Element commands and submission quote this revision. */
	revision: number
	publishedAt: string | null
	tracks: CareerTrackDto[]
	bands: JobBandDto[]
	familyCount: number
}

export interface JobFamilyPage {
	items: JobFamilyNodeDto[]
	nextCursor: string | null
}

export interface ReferenceDto {
	id: string
	code: string
	name: string
}

export interface JobProfileSummaryDto {
	id: string
	code: string
	name: string
	family: ReferenceDto | null
	track: (ReferenceDto & { kind: TrackKind }) | null
	level: ReferenceDto | null
	defaultGrade: ReferenceDto | null
	/** Status of the latest version. */
	status: ArchitectureStatus
	currentVersionId: string | null
	latestVersionId: string
}

export interface JobProfilePage {
	items: JobProfileSummaryDto[]
	nextCursor: string | null
}

export interface ResponsibilityDto {
	code: string
	statement: string
	essential: boolean
	sortOrder: number
}

export interface RequirementDto {
	code: string
	type: RequirementType
	name: string
	description: string
	proficiency: string
	minimumQuantity: number | null
	unit: QuantityUnit | null
	mandatory: boolean
	sortOrder: number
}

export interface AllowedGradeDto {
	gradeId: string
	code: string
	name: string
	isDefault: boolean
}

export interface ProfileVersionSummaryDto {
	id: string
	versionNumber: number
	status: ArchitectureStatus
	effectiveFrom: string | null
	effectiveTo: string | null
	current: boolean
}

export interface JobProfileVersionDto extends ProfileVersionSummaryDto {
	profileId: string
	profileCode: string
	profileName: string
	catalogueVersionId: string
	catalogueVersionNumber: number
	family: ReferenceDto
	track: ReferenceDto & { kind: TrackKind }
	level: ReferenceDto
	summary: string
	purpose: string
	scopeOfImpact: string
	autonomyLevel: string
	publishedAt: string | null
	revision: number
	responsibilities: ResponsibilityDto[]
	requirements: RequirementDto[]
	allowedGrades: AllowedGradeDto[]
	versions: ProfileVersionSummaryDto[]
}
