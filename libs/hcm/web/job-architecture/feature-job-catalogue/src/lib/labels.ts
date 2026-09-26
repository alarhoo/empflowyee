import type {
	ArchitectureStatus,
	CatalogueElementKind,
	TrackKind,
} from '@empflowyee/hcm-job-architecture-contract'

export const MANAGE_PERMISSION = 'hcm.job-architecture.catalogue.manage'
export const PUBLISH_PERMISSION = 'hcm.job-architecture.catalogue.publish'
export const BASE_ROUTE = '/job-architecture/job-catalogue'

type Semantic = 'positive' | 'critical' | 'negative' | 'informative' | 'neutral'

const STATUS: Record<ArchitectureStatus, { label: string; status: Semantic }> = {
	Draft: { label: 'Draft', status: 'informative' },
	InReview: { label: 'In review', status: 'critical' },
	Published: { label: 'Published', status: 'positive' },
	Superseded: { label: 'Superseded', status: 'neutral' },
	Retired: { label: 'Retired', status: 'neutral' },
}

/** Semantic presentation of a version status; the label carries the meaning. */
export function versionStatus(value: ArchitectureStatus): { label: string; status: Semantic } {
	return STATUS[value]
}

export const TRACK_KIND_LABELS: Record<TrackKind, string> = {
	IndividualContributor: 'Individual Contributor',
	Management: 'Management',
}

/** Singular names of catalogue elements for titles and messages. */
export const ELEMENT_LABELS: Record<CatalogueElementKind, string> = {
	families: 'job family',
	tracks: 'career track',
	levels: 'level',
	bands: 'band',
	grades: 'grade',
}

/** The ISO date of today in the viewer's calendar, for date defaults. */
export function isoToday(): string {
	const now = new Date()
	return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
