export interface HcmFeatureDefinition {
	id: string
	title: string
	description: string
	route: string
	domain: string
	order?: number
	available?: boolean
	requiredPermissions?: readonly string[]
	requiredEntitlements?: readonly string[]
	requiredFeatureFlags?: readonly string[]
	plannedPhase?: string
}
export interface HcmFeatureGroupDefinition {
	id: string
	title: string
	featureIds: readonly string[]
}
export interface HcmPageDefinition {
	description?: string
	id: string
	title: string
	groups: readonly HcmFeatureGroupDefinition[]
}
export interface HcmSpaceDefinition {
	roleIds?: readonly string[]
	id: string
	title: string
	description: string
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
