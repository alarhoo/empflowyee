import type { HcmEntitlement, HcmRole } from '@empflowyee/hcm-web-runtime-context'

export interface HcmFeatureDefinition {
	id: string
	title: string
	description: string
	route: string
	domain: string
	requiredRoles?: readonly HcmRole[]
	requiredEntitlements?: readonly HcmEntitlement[]
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
	requiredRoles?: readonly HcmRole[]
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
