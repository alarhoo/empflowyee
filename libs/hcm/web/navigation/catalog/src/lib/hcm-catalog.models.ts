// Catalog requirements are stable identifiers, independent of any runtime store.
// The shell supplies effective roles/entitlements; backend authorization remains authoritative.

export interface HcmFeatureDefinition {
	id: string
	title: string
	description: string
	route: string
	domain: string
	requiredRoles?: readonly string[]
	requiredEntitlements?: readonly string[]
	plannedPhase?: string
}

export interface HcmFeatureGroupDefinition {
	id: string
	title: string
	featureIds: readonly string[]
}

export interface HcmPageDefinition {
	id: string
	title: string
	groups: readonly HcmFeatureGroupDefinition[]
}

export interface HcmSpaceDefinition {
	id: string
	title: string
	description: string
	requiredRoles?: readonly string[]
	pages: readonly HcmPageDefinition[]
}

export interface VisibleHcmFeature extends HcmFeatureDefinition {
	visible: true
}

export interface VisibleHcmGroup extends Omit<HcmFeatureGroupDefinition, 'featureIds'> {
	features: readonly VisibleHcmFeature[]
}

export interface VisibleHcmPage extends Omit<HcmPageDefinition, 'groups'> {
	groups: readonly VisibleHcmGroup[]
}

export interface VisibleHcmSpace extends Omit<HcmSpaceDefinition, 'pages'> {
	pages: readonly VisibleHcmPage[]
}
